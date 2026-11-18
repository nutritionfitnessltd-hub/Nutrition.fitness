import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { workspaceDashboard, dashboardWork } from '../server/studio-dashboard.mjs';
import { builderPage, workerPreview, workerRequestsPage } from '../server/studio-workers.mjs';
import { handleStudio } from '../server/studio.mjs';
import { studioNavigation } from '../server/studio-navigation.mjs';

function fixture(){
 const source={id:'source:challenge',title:'Archive challenge',kind:'Challenge guide',group:'Challenges',fields:{collection:'Archive challenge',body:'Source evidence'},files:[]};
 return {actor:{role:'admin',id:'owner'},index:{records:[source],files:{}},items:[],byId:new Map(),projects:[],tasks:[],people:[],assigned:new Set()};
}
function fields(){return {build:'newsletter',source:'source:challenge',requestId:randomUUID(),configured:'yes',output_newsletter:'yes',output_socials:'yes',worker_newsletter:'imogen',worker_socials:'rory',instructions:'Keep my brief <safe>',audience:'Existing members',sourceText:'My original text'};}
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}});

test('dashboard is the first navigation item and shows only the signed-in person’s open work',()=>{
 const d=fixture();d.projects=[{id:'mine',name:'My project',creator_id:'owner',status:'In progress',entries:[{title:'My open task',status:'To do',week:2},{title:'My finished task',status:'Done'}]},{id:'other',name:'Someone else',creator_id:'other',status:'In progress',entries:[{title:'Their task',status:'To do'}]}];
 d.tasks=[{staff_id:'owner',title:'My assignment',status:'Changes requested'},{staff_id:'other',title:'Other assignment',status:'To do'}];
 d.items=[{id:'review',title:'Ready for checking',status:'In review'}];
 assert.equal(dashboardWork(d).mine.length,2);
 const html=workspaceDashboard(d);assert.match(html,/<h1>Dashboard/);assert.match(html,/My open task|My assignment/);assert.doesNotMatch(html,/Their task|Other assignment|My finished task/);assert.match(html,/Ready for checking/);
 const nav=studioNavigation('home',d.actor);assert.equal(nav.label,'Home');assert.match(nav.html,/studio=home" aria-current="page"/);assert.ok(nav.html.indexOf('Home')<nav.html.indexOf('Assets'));
});

test('worker cards derive plans from saved assignments and never invent activity; staff cannot see private plans',()=>{
 const d=fixture();d.byId.set('request',{id:'request',kind:'worker-request',title:'Source <script>',fields:{state:'prepared',outputs:[{type:'newsletter',title:'Member newsletter',worker:'imogen',workerName:'Imogen',brief:'Read the source, then draft it.'}]}});
 const html=workspaceDashboard(d);
 assert.match(html,/1 planned · not started/);assert.match(html,/What Imogen will do/);assert.match(html,/Source &lt;script&gt;/);assert.match(html,/No work planned/);assert.doesNotMatch(html,/In progress|Completed today|<script>/);
 const nina=workerRequestsPage(new URLSearchParams({worker:'nina'}),d);assert.doesNotMatch(nina,/Source &lt;script&gt;/);
 d.actor.role='staff';assert.doesNotMatch(workspaceDashboard(d),/AI workers|Source &lt;script&gt;|Member newsletter/);
});
test('dashboard reviews and worker approvals open the reading window, with draft editing kept separate',()=>{
 const d=fixture(),review={id:'worker:review',title:'Review this article',kind:'article',status:'In review',workerId:'nina',fields:{}},draft={...review,id:'worker:draft',title:'Edit this draft',status:'Draft'};
 d.items=[review,draft];d.byId=new Map(d.items.map(r=>[r.id,r]));
 const html=workspaceDashboard(d),work=dashboardWork(d);
 assert.match(work.reviews[0].href,/studio=review-preview/);
 assert.equal((html.match(/data-review-preview target="_blank" rel="noopener"/g)||[]).length,2);
 assert.match(html,/studio=item&amp;id=worker%3Adraft&amp;tab=edit/);
 assert.doesNotMatch(html,/studio=item&amp;id=worker%3Areview/);
});

test('flow starts with the build choice even when entered from an original and selects only the requested output',()=>{
 const d=fixture();let html=builderPage(new URLSearchParams({source:'source:challenge'}),d);
 assert.match(html,/What do you want to build today/);assert.match(html,/Using: <strong>Archive challenge/);assert.match(html,/name="source" value="source:challenge"/);
 html=builderPage(new URLSearchParams({build:'newsletter'}),d);assert.match(html,/Choose your original material/);assert.match(html,/name="build" value="newsletter"/);
 html=builderPage(new URLSearchParams({build:'newsletter',source:'source:challenge'}),d);
 assert.match(html,/Suggested worker: Nina/);assert.match(html,/name="output_newsletter" value="yes"/);assert.doesNotMatch(html,/<input type="checkbox"[^>]+checked/);
});

test('moving backwards preserves brief, audience, pasted source, extra outputs and worker overrides',()=>{
 const d=fixture(),f=fields();
 const preview=workerPreview(f,d);assert.match(preview,/name="worker_newsletter"[^>]*>[\s\S]*?value="imogen" selected/);assert.match(preview,/flowBack=1/);
 const back=builderPage(new URLSearchParams(),d,{}, {...f,step:'brief'});
 for(const text of ['Keep my brief &lt;safe&gt;','Existing members','My original text','name="worker_newsletter" value="imogen"'])assert.ok(back.includes(text));
 assert.match(back,/name="output_socials"[^>]* checked/);
 const sources=builderPage(new URLSearchParams(),d,{}, {...f,step:'source'});assert.match(sources,/name="instructions" value="Keep my brief &lt;safe&gt;"/);
 const start=builderPage(new URLSearchParams(),d,{}, {...f,step:'build'});assert.match(start,/What do you want to build today/);assert.match(start,/name="sourceText" value="My original text"/);
});

test('source search and pagination keep the selected build and private brief in POST bodies',()=>{
 const d=fixture();d.index.records=Array.from({length:32},(_,i)=>({id:'original:'+i,title:'Original '+i.toString().padStart(2,'0'),group:'Challenges',kind:'Guide',fields:{},files:[]}));
 const html=builderPage(new URLSearchParams(),d,{}, {...fields(),source:'',step:'source',page:'2'});
 assert.match(html,/Page 2 of 2/);assert.match(html,/Original 31/);assert.doesNotMatch(html,/<strong>Original 00/);
 assert.match(html,/name="page" value="1"/);assert.match(html,/name="worker_newsletter" value="imogen"/);assert.doesNotMatch(html,/href="[^"]*Keep.my.brief/);
});

test('step navigation cannot save or start a worker; default home returns the dashboard',async()=>{
 const d=fixture();let writes=0,modelCalls=0;
 const options={actor:d.actor,load:async()=>d.index,api:async(_,o)=>{if(o?.method==='POST')writes++;return [];},env:{},fetcher:()=>{modelCalls++;throw Error('Unexpected model call');}};
 let res=response();await handleStudio({method:'GET'},res,{...options,params:new URLSearchParams()});assert.equal(res.statusCode,200);assert.match(res.body,/<h1>Dashboard/);
 res=response();await handleStudio({method:'POST',body:{...fields(),action:'worker-save',step:'brief'}},res,{...options,params:new URLSearchParams({studio:'builder',flowBack:'1'})});
 assert.equal(res.statusCode,200);assert.match(res.body,/Make it your own/);assert.equal(writes,0);assert.equal(modelCalls,0);
});
