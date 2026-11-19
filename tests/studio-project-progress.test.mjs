import test from 'node:test';
import assert from 'node:assert/strict';
import {projectProduction,projectProductionPanel,loadProjectProductionDates} from '../server/studio-project-progress.mjs';
import {ideaProjectPage} from '../server/studio-shiny-things.mjs';
import {handleStudio} from '../server/studio.mjs';
import {startWorkerUpdates} from '../public/studio-worker-updates.mjs';

const now=new Date('2026-11-19T14:00:00Z');
function fixture(){
 const p={id:'project',name:'Content production',brief:'Keep the whole brief.',revision:2,weeks:4,status:'In progress',creator_id:'owner',studio:{ideaId:'idea',productionTracking:{worker:'imogen',scope:'library',course:'Course',lessonsPerDay:3,otherPerDay:3,pilotIds:['pilot']}},entries:[{id:'task',title:'Brand the content',notes:'Check every page',status:'In progress',week:0}]};
 const items=[{id:'pilot',kind:'lesson',title:'Pilot lesson',status:'Draft',sourceId:'catalogue:1',revision:2,fields:{production:{worker:'Imogen'}},updatedAt:'2026-11-19T13:00:00Z'}];
 const data={actor:{role:'admin',id:'admin'},items,byId:new Map(items.map(r=>[r.id,r])),productionFirstSaved:new Map([['pilot','2026-11-18T17:06:00Z']]),assigned:new Set(),projects:[p],people:[{id:'owner',name:'Owner'}]};
 const meta={courses:{Course:{order:'confirmed',sections:[{entries:[{id:'catalogue:1'},{id:'catalogue:2'},{id:'catalogue:3'}]}]}}};
 const add=(id,kind='recipe',status='Draft',extra={})=>{const r={id,title:id,kind,status,workerId:'imogen',fields:{},updatedAt:now.toISOString(),...extra};items.push(r);data.byId.set(id,r);data.productionFirstSaved.set(id,now.toISOString());return r;};
 return {p,data,meta,add};
}
test('saved work drives both streams; edits, pilots and approval are distinct',()=>{
 const {p,data,meta,add}=fixture();add('new-lesson','lesson','Draft',{sourceId:'catalogue:2'});add('recipe');add('article','article','In review');add('book','ebook','Approved');add('changes','asset','Changes requested');add('archived','recipe','Archived');add('nina','article','Draft',{workerId:'nina'});add('plan','settings');
 const m=projectProduction(p,data,meta,now);
 assert.equal(m.lessonsToday,1,'Editing the old pilot must not count as a new lesson');assert.equal(m.otherToday,4);assert.equal(m.drafts,3);assert.equal(m.review,1);assert.equal(m.changes,1);assert.equal(m.approved,1);assert.equal(m.pilots.length,1);
 assert.deepEqual(m.course,{total:3,saved:2,approved:0});assert.equal(m.items.length,6);
 const html=projectProductionPanel(p,data,meta,now);assert.match(html,/4 \/ 3/);assert.match(html,/value="3" max="3"/);assert.match(html,/0% approved/);assert.match(html,/1 saved pilot/);
});
test('duplicate source copies count once on their earliest saved day',()=>{
 const {p,data,meta,add}=fixture();add('copy','lesson','Draft',{sourceId:'catalogue:1',updatedAt:'2026-11-19T13:30:00Z'});
 const m=projectProduction(p,data,meta,now);assert.equal(m.items.length,1);assert.equal(m.lessonsToday,0);assert.equal(m.course.saved,1);
});
test('London midnight and DST determine the daily bucket',()=>{
 const {p,data,meta}=fixture();data.productionFirstSaved.set('pilot','2026-07-10T23:30:00Z');
 assert.equal(projectProduction(p,data,meta,new Date('2026-07-11T06:00:00Z')).lessonsToday,1);
 data.productionFirstSaved.set('pilot','2026-11-18T23:30:00Z');assert.equal(projectProduction(p,data,meta,now).lessonsToday,0);
});
test('unknown dates and unconfirmed inventory never masquerade as zero or a percentage',()=>{
 const {p,data,meta}=fixture();data.productionFirstSaved=new Map();meta.courses.Course.order='partial';
 const m=projectProduction(p,data,meta,now);assert.equal(m.lessonsToday,null);assert.equal(m.course.total,null);
 const html=projectProductionPanel(p,data,meta,now);assert.match(html,/Daily totals are unavailable/);assert.match(html,/Total unconfirmed/);assert.doesNotMatch(html,/% approved/);
});
test('staff counts, links and history queries stay inside existing read permissions',async()=>{
 const {p,data,meta,add}=fixture();add('private-recipe');data.actor={role:'staff',id:'owner',access:{work:true,library:true}};data.assigned.add('pilot');
 let called='';await loadProjectProductionDates(async path=>{called=decodeURIComponent(path);return [{item_id:'pilot',created_at:'2026-11-18T17:00:00Z'}];},p,data);
 assert.match(called,/"pilot"/);assert.doesNotMatch(called,/private-recipe|payload/);
 const html=projectProductionPanel(p,data,meta,now);assert.match(html,/Only content you can access/);assert.doesNotMatch(html,/private-recipe/);assert.equal(projectProduction(p,data,meta,now).items.length,1);
 data.actor.access.library=false;assert.equal(projectProductionPanel(p,data,meta,now),'');
});
test('history failures leave the project usable with unavailable daily totals',async()=>{
 const {p,data,meta}=fixture();await loadProjectProductionDates(async()=>{throw Error('unavailable');},p,data);
 assert.equal(projectProduction(p,data,meta,now).lessonsToday,null);assert.match(projectProductionPanel(p,data,meta,now),/Pilot lesson/);
});
test('explicit project scope excludes unrelated work by the same worker',()=>{
 const {p,data,meta,add}=fixture();p.studio.productionTracking.scope='project';p.studio.productionTracking.itemIds=['pilot'];add('elsewhere');add('linked','recipe','Draft',{fields:{projectId:p.id}});
 assert.deepEqual(projectProduction(p,data,meta,now).items.map(r=>r.id).sort(),['linked','pilot']);
});
test('compact task summaries preserve editing and read-only access without exposing forms by default',()=>{
 const {p,data,meta}=fixture();let html=ideaProjectPage(new URLSearchParams({project:p.id}),data,meta);
 assert.match(html,/<details class="project-task-row"><summary>/);assert.doesNotMatch(html,/<details[^>]* open/);assert.match(html,/name="projectRevision" value="2"/);assert.match(html,/Keep the whole brief/);
 assert.ok(html.indexOf('project-progress')<html.indexOf('Tasks &amp; milestones')||html.indexOf('project-progress')<html.indexOf('Tasks & milestones'));
 data.actor={role:'staff',id:'owner',access:{work:true,library:true}};data.assigned.add('pilot');html=ideaProjectPage(new URLSearchParams({project:p.id}),data,meta);
 assert.match(html,/Imogen’s progress/);assert.doesNotMatch(html,/Update task|task-save|project-save|Add work|Original idea/);
});
test('reports and titles are escaped; generic projects remain usable without production tracking',()=>{
 const {p,data}=fixture();p.studio.productionTracking.report={at:now.toISOString(),text:'<script>bad</script>'};data.items[0].title='<img onerror=bad>';
 const html=projectProductionPanel(p,data,{},now);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>|<img onerror/);
 delete p.studio.productionTracking;assert.equal(projectProductionPanel(p,data),'');assert.match(ideaProjectPage(new URLSearchParams({project:p.id}),data),/Brand the content/);
});
test('authenticated project route loads real version dates for automatic progress refresh',async()=>{
 const {p,data}=fixture(),calls=[];
 const api=async path=>{calls.push(path);if(path.includes('nufi_library_projects'))return [p];if(path.includes('nufi_studio_versions'))return [{item_id:'pilot',created_at:'2026-11-18T17:00:00Z'}];if(path.includes('nufi_studio_items'))return [{id:'pilot',payload:data.items[0],revision:2,updated_at:now.toISOString()}];return [];};
 const res={setHeader(){},end(body){this.body=body;}};
 await handleStudio({method:'GET'},res,{params:new URLSearchParams({studio:'project',project:p.id}),actor:data.actor,api,load:async()=>({records:[],files:{}}),env:{}});
 assert.equal(res.statusCode,200);assert.match(res.body,/data-worker-updates="project-progress"/);assert.ok(calls.some(x=>x.includes('revision=eq.1')));
});
test('project polling refreshes only marked progress without replacing task editors',async()=>{
 let url='',interval=0,replaced=false;
 const node={dataset:{workerUpdates:'project-progress'},innerHTML:'before',contains:()=>false,replaceWith(){replaced=true;}};
 const doc={querySelector:selector=>selector==='[data-worker-updates]'?node:null,querySelectorAll:()=>[node],visibilityState:'visible',activeElement:null,importNode:x=>x};
 const update=startWorkerUpdates({doc,win:{location:{href:'https://example.test/content-library/?studio=project'},setInterval(fn,ms){interval=ms;},addEventListener(){}},fetcher:async u=>{url=u;return {ok:true,text:async()=>''};},Parser:class{parseFromString(){return {querySelector:()=>({innerHTML:'after'})};}}});
 await update();assert.equal(interval,30000);assert.match(url,/studio=project/);assert.equal(replaced,true);
});
