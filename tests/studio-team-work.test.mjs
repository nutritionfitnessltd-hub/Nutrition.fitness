import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {studioData} from '../server/studio-store.mjs';
import {handleStudio} from '../server/studio.mjs';
import {teamWorkRows,teamWorkPage,teamWorkDashboard} from '../server/studio-team-work.mjs';
import {accessFor,accessFromForm} from '../server/library-permissions.mjs';
const reviewer={role:'staff',id:'reviewer',name:'Article reviewer',access:{library:true,work:true,review_articles:true}};
test('current publication replaces review action and survives linked task status',async()=>{
 const d=await fixture().data({role:'admin',id:'admin'});
 d.publicationDestination={environment:'test',origin:'https://nutrition-fitness-website-2.vercel.app'};
 d.releases=[{item_id:'nina-draft',environment:'test',source_revision:1}];
 d.tasks=[{id:'linked',record_id:'nina-draft',status:'To do',staff_id:'admin'}];
 const row=teamWorkRows(d).find(r=>r.recordId==='nina-draft');
 assert.equal(row.status,'Published');assert.equal(row.action,'View published article');assert.equal(row.state,'completed');assert.equal(row.review,false);assert.match(row.href,/\/content\/nina-draft\/$/);
 d.releases[0].source_revision=0;assert.equal(teamWorkRows(d).find(r=>r.recordId==='nina-draft').action,'Review');
});
function fixture(){
 const record=(id,kind,status,extra={})=>({id,kind,status,title:id,revision:1,fields:{body:'Private body '+id,shortAnswer:'A short answer'},...extra});
 const records=[record('nina-submitted','article','In review',{workerId:'nina'}),record('nina-draft','article','Draft',{workerId:'nina'}),record('human-submitted','article','In review'),record('recipe-submitted','recipe','In review'),record('my-draft','article','Draft')];
 const stored=new Map(records.map(r=>[r.id,r])),versions=new Map();let writes=0;
 const api=async(path,options={})=>{
  const query=new URL(path,'https://fixture.test').searchParams;
  if(path.includes('/rpc/nufi_studio_save')){const p=options.payload,current=stored.get(p.item);if(current.revision!==p.expected)return [];const r={...p.document,revision:p.expected+1};stored.set(r.id,r);versions.set(r.id+':'+r.revision,structuredClone(r));writes++;return [{revision:r.revision}];}
  if(path.includes('nufi_studio_versions')){const r=versions.get(query.get('item_id').slice(3)+':'+query.get('revision').slice(3));return r?[{payload:r,revision:r.revision}]:[];}
  if(path.includes('nufi_studio_items'))return [...stored.values()].map(r=>({id:r.id,payload:r,revision:r.revision,updated_at:'2026-11-19T10:00:00Z'}));
  if(path.includes('nufi_library_tasks'))return query.get('staff_id')==='eq.reviewer'?[{id:'own',staff_id:'reviewer',record_id:'my-draft',title:'My assignment',status:'In progress'}]:[];
  return [];
 };
 const load=async()=>({records:[],files:{}});
 const data=(actor=reviewer)=>studioData(api,actor,load);
 const request=async(section,id,body=null,actor=reviewer,extra={})=>{
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}};
  await handleStudio({method:body?'POST':'GET',body},res,{params:new URLSearchParams({studio:section,id,...extra}),actor,api,load,env:{}});return res;
 };
 return {stored,versions,api,data,request,get writes(){return writes;}};
}
test('review responsibilities are opt-in, strict booleans, and retained by Team settings',()=>{
 assert.equal(accessFor({role:'staff'}).review_articles,false);
 assert.equal(accessFor({role:'staff',access:{review_articles:'true'}}).review_articles,false);
 assert.equal(accessFromForm({accessVersion:'1',access_library:'1',access_work:'1',access_review_articles:'1'}).review_articles,true);
 assert.throws(()=>accessFromForm({accessVersion:'1',access_review_everything:'1'}));
});
test('catalogue imports do not become team work just because they have a saved timestamp',async()=>{
 const f=fixture();
 for(const status of ['Draft','Approved'])f.stored.set('import-'+status,{id:'import-'+status,title:'Imported catalogue '+status,kind:'article',status,revision:1,fields:{body:'Reference content'}});
 const d=await f.data({role:'admin',id:'admin'}),rows=teamWorkRows(d);
 assert.ok(!rows.some(r=>r.title.startsWith('Imported catalogue')));
 assert.ok(rows.some(r=>r.recordId==='nina-draft'),'Attributed worker drafts remain visible');
 assert.ok(rows.some(r=>r.recordId==='human-submitted'),'Unassigned submissions still reach the administrator');
 d.tasks=[{id:'assigned-import',record_id:'import-Draft',staff_id:'creator',title:'Revise imported content',status:'To do'}];
 assert.ok(teamWorkRows(d).some(r=>r.title==='Revise imported content'),'An explicit assignment makes imported content work');
});
test('reviewer sees submitted articles and assigned work, never other drafts or categories',async()=>{
 const f=fixture(),d=await f.data();assert.deepEqual(d.items.map(r=>r.id).sort(),['human-submitted','my-draft','nina-submitted']);
 const html=teamWorkPage(new URLSearchParams(),d);assert.match(html,/nina-submitted|human-submitted|My assignment/);assert.doesNotMatch(html,/nina-draft|recipe-submitted/);
 for(const section of ['home','team-work','library']){const r=await f.request(section,'');assert.equal(r.statusCode,200);assert.doesNotMatch(r.body,/nina-draft|recipe-submitted/);}
 for(const id of ['nina-draft','recipe-submitted'])for(const section of ['review-preview','article-preview','history']){const r=await f.request(section,id);assert.equal(r.statusCode,403);assert.doesNotMatch(r.body,/Private body/);}
 const disabled=structuredClone(reviewer);disabled.access.review_articles=false;
 const r=await f.request('review-preview','nina-submitted',null,disabled);assert.equal(r.statusCode,403);
 assert.deepEqual((await f.data(disabled)).items.map(r=>r.id),['my-draft']);
});
test('reviewer can approve only a submitted saved version; extra content fields cannot change the draft',async()=>{
 const f=fixture(),reviewId=randomUUID();
 let r=await f.request('review-preview','nina-submitted');assert.match(r.body,/>Approve<|>Request changes</);assert.doesNotMatch(r.body,/>Edit<|>Schedule<|>Submit for review</);
 r=await f.request('review-preview','nina-submitted',{action:'review-decision',decision:'approve',revision:'1',reviewId,fields:'{"body":"hacked"}',publication:'published'});
 assert.equal(r.statusCode,200);assert.match(r.body,/Approved. Nothing has been published/);
 const saved=f.stored.get('nina-submitted');assert.equal(saved.status,'Approved');assert.equal(saved.fields.body,'Private body nina-submitted');assert.equal(saved.publication,undefined);assert.equal(saved.reviewFeedback[0].authorId,reviewer.id);assert.equal(f.writes,1);
 assert.equal((await f.request('review-preview','nina-submitted')).statusCode,403);
});
test('human change requests are saved and reviewers cannot schedule, edit, submit drafts or act outside category',async()=>{
 const f=fixture();
 for(const [id,body] of [['nina-draft',{action:'review-decision',decision:'approve'}],['recipe-submitted',{action:'review-decision',decision:'approve'}],['nina-submitted',{action:'review-schedule',scheduledDate:'2099-01-01'}],['nina-submitted',{action:'content-save',fields:'{}'}],['nina-submitted',{action:'review-decision',decision:'submit'}]]){
  const r=await f.request('review-preview',id,{...body,revision:'1',reviewId:randomUUID()});assert.equal(r.statusCode,403);
 }
 assert.equal(f.writes,0);
 let r=await f.request('review-preview','human-submitted',{action:'review-decision',decision:'changes',feedback:'Clarify the introduction',revision:'0',reviewId:randomUUID()});assert.equal(r.statusCode,409);assert.equal(f.writes,0);
 r=await f.request('review-preview','human-submitted',{action:'review-decision',decision:'changes',feedback:'Clarify the introduction',revision:'1',reviewId:randomUUID()});assert.equal(r.statusCode,200);assert.equal(f.stored.get('human-submitted').status,'Changes requested');assert.equal(f.stored.get('human-submitted').reviewFeedback[0].delivery,'not-required');
});
test('review history reads the decided version, not a later private draft, and cannot be guessed or retained after revocation',async()=>{
 const f=fixture(),reviewId=randomUUID();
 await f.request('review-preview','nina-submitted',{action:'review-decision',decision:'changes',feedback:'Make it clearer',revision:'1',reviewId});
 const r=f.stored.get('nina-submitted');r.fields={body:'SECRET new unsubmitted draft'};r.status='Draft';r.revision=3;
 let out=await f.request('review-history',r.id,null,reviewer,{review:reviewId});assert.equal(out.statusCode,200);assert.match(out.body,/Private body nina-submitted|Make it clearer/);assert.doesNotMatch(out.body,/SECRET/);
 assert.match(teamWorkPage(new URLSearchParams({state:'completed'}),await f.data()),/Read review/);
 for(const [actor,id] of [[reviewer,randomUUID()],[{...reviewer,id:'someone-else'},reviewId],[{...reviewer,access:{library:true,work:true}},reviewId]]){
  out=await f.request('review-history',r.id,null,actor,{review:id});assert.equal(out.statusCode,403);assert.doesNotMatch(out.body,/Private body|SECRET/);
 }
});
test('reviewers can read approved submission dependencies without gaining edit access or unrelated content',async()=>{
 const f=fixture(),actor={...reviewer,access:{library:true,work:true,review_training:true}};
 const exercise={id:'exercise-linked',title:'Linked squat',kind:'exercise',status:'Approved',revision:1,fields:{movement:'Squat',equipment:['Body weight'],instructions:['Sit down'],cues:['Stand tall'],media:{videoUrl:'https://example.test/squat.mp4'}}};
 f.stored.set(exercise.id,exercise);f.stored.set('exercise-private',{...exercise,id:'exercise-private',title:'Private exercise draft',status:'Draft'});f.stored.set('exercise-other',{...exercise,id:'exercise-other',title:'Unrelated approved exercise'});
 f.stored.set('workout',{id:'workout',title:'Submitted workout',kind:'session',status:'In review',revision:1,fields:{warmup:['Walk'],cooldown:['Walk'],blocks:[{type:'exercise',referenceId:exercise.id,sets:2,repMin:8}],privateId:'exercise-private'}});
 let data=await f.data(actor);assert.equal(data.byId.has(exercise.id),true);assert.equal(data.byId.has('exercise-private'),false);assert.equal(data.byId.has('exercise-other'),false);assert.equal(data.assigned.has(exercise.id),false);
 assert.ok(!teamWorkRows(data).some(r=>r.recordId===exercise.id));
 const denied=await f.request('item',exercise.id,{action:'content-save',revision:'1',fields:'{}'},actor);assert.equal(denied.statusCode,403);
 const approved=await f.request('review-preview','workout',{action:'review-decision',decision:'approve',revision:'1',reviewId:randomUUID()},actor);assert.equal(approved.statusCode,200);assert.equal(f.stored.get('workout').status,'Approved');
 data=await f.data(actor);assert.equal(data.byId.has(exercise.id),false,'Dependency access ends when the submission leaves review');
});
test('admin sees people, AI, saved requests and complete history while staff see only relevant work',async()=>{
 const f=fixture(),d=await f.data({role:'admin',id:'admin'});d.people=[{id:'other',name:'Other person'}];d.projects=[{id:'project',name:'Editorial',creator_id:'other',entries:[{id:'todo',title:'Requested human work',status:'To do'},{id:'done',title:'Completed human work',status:'Done',updatedAt:'2020-01-01'}]}];
 d.byId.set('request',{id:'request',kind:'worker-request',title:'Brief',fields:{outputs:[{title:'Planned work',worker:'imogen'}]}});
 const rows=teamWorkRows(d);assert.ok(rows.some(r=>r.title==='Requested human work'&&r.state==='requested'));assert.ok(rows.some(r=>r.title==='Completed human work'&&r.state==='completed'));assert.ok(rows.some(r=>r.title==='Planned work'&&r.note.startsWith('Not started')));
 const html=teamWorkPage(new URLSearchParams({state:'completed',type:'people'}),d);assert.match(html,/Completed human work/);assert.doesNotMatch(html,/nina-submitted/);
 assert.doesNotMatch(teamWorkDashboard(d),/Completed human work/);
 d.actor=reviewer;d.assigned=new Set(['my-draft']);const staffRows=teamWorkRows(d);assert.ok(!staffRows.some(r=>r.title==='Requested human work'||r.title==='Planned work'||r.title==='nina-draft'));
});
