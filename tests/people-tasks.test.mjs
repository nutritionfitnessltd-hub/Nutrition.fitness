import test from 'node:test';import assert from 'node:assert/strict';
import {nextDelivery,workStart,londonDay,occurrenceId,peopleTaskAction,generateRoleOccurrence,runRoleTasks,peopleTaskModal,roleTasksPanel,linkedPeopleTasks} from '../server/people-tasks.mjs';
import {createRoleTaskSyncHandler} from '../api/role-task-sync.js';
import {handleStudio} from '../server/studio.mjs';
import {workspaceDashboard} from '../server/studio-dashboard.mjs';
const owner='11111111-1111-4111-a111-111111111111',person='22222222-2222-4222-a222-222222222222',id='33333333-3333-4333-a333-333333333333',project='44444444-4444-4444-a444-444444444444';
function fixture(){
 const data={actor:{id:owner,role:'admin'},people:[{id:person,name:'Kasia'},{id:owner,name:'James'}],projects:[{id:project,name:'Social launch',status:'In progress',entries:[],creator_id:owner}],items:[],tasks:[],byId:new Map(),assigned:new Set()};let writes=0;
 const api=async(path,opts={})=>{
  if(path.startsWith('/rest/v1/rpc/nufi_studio_save')){const p=opts.payload,old=data.byId.get(p.item);if((old?.revision||0)!==p.expected)return [];const r={...structuredClone(p.document),revision:p.expected+1};data.byId.set(r.id,r);data.items=data.items.filter(t=>t.id!==r.id).concat(r);writes++;return [{revision:r.revision}];}
  if(path.startsWith('/rest/v1/nufi_library_tasks')){
   if(opts.method==='POST'){if(!data.tasks.some(t=>t.id===opts.payload.id)){data.tasks.push({...opts.payload,status:'To do',revision:1});writes++;}return [];}
   if(opts.method==='PATCH'){const p=new URL('https://test'+path).searchParams,t=data.tasks.find(t=>'eq.'+t.id===p.get('id')&&'eq.'+t.revision===p.get('revision'));if(!t)return [];Object.assign(t,opts.payload);writes++;return [t];}
   return data.tasks;
  }
  if(path.startsWith('/rest/v1/nufi_studio_items'))return data.items.map(t=>({id:t.id,payload:t,revision:t.revision}));
  if(path.startsWith('/rest/v1/nufi_library_staff'))return data.people;
  if(path.startsWith('/rest/v1/nufi_library_projects'))return data.projects;
  if(path.includes('nufi_studio_releases'))return [];
  throw Error('Unexpected '+path);
 };
 return {data,api,get writes(){return writes;}};
}
const fields=(extra={})=>({action:'people-task-create',id,staff:person,title:'Create social posts',instructions:'Write and schedule posts',checklist:'Copy checked\nImage checked',project,due:'2026-11-27',repeat:'weekly',day5:'yes',weekends:'yes',leadDays:'2',...extra});
test('London dates, working-day lead time and weekly weekends are deterministic',()=>{
 assert.equal(londonDay(new Date('2026-06-30T23:30:00Z')),'2026-07-01');assert.equal(workStart('2026-11-30',2),'2026-11-26');
 const r={firstDue:'2026-11-24',repeat:'weekly',days:[1,5],weekends:true};assert.deepEqual(nextDelivery(r,r.firstDue),{scheduled:'2026-11-27',due:'2026-11-27'});
 assert.equal(nextDelivery({...r,repeat:'daily'},'2026-11-28').due,'2026-11-30');
});
test('monthly anchors clamp February and recover March, with inclusive end dates',()=>{
 const r={firstDue:'2027-01-31',repeat:'monthly',weekends:false};assert.equal(nextDelivery(r,'2027-02-01').due,'2027-02-28');assert.equal(nextDelivery(r,'2027-03-01').due,'2027-03-31');
 assert.equal(nextDelivery({...r,end:'2027-02-28'},'2027-03-01'),null);
 assert.equal(nextDelivery({...r,weekends:true},'2027-02-01').due,'2027-03-01');
 const c={firstDue:'2026-11-24',repeat:'custom',interval:3,weekends:true};assert.equal(nextDelivery(c,'2026-11-25').due,'2026-11-27');
});
test('one-off assignment uses existing tasks and is safe to retry',async()=>{
 const f=fixture();await peopleTaskAction(fields({repeat:'none'}),f.data,f.api);await peopleTaskAction(fields({repeat:'none'}),f.data,f.api);
 assert.equal(f.data.tasks.length,1);assert.equal(f.data.tasks[0].staff_id,person);assert.equal(f.data.tasks[0].record_id,'project:'+project);assert.match(f.data.tasks[0].instructions,/Completion checklist/);
 assert.match(linkedPeopleTasks(f.data.projects[0],f.data),/Create social posts/);
});
test('recurrence creates first snapshot and overlapping runs do not duplicate it or erase overdue work',async()=>{
 const f=fixture();await peopleTaskAction(fields(),f.data,f.api);assert.equal(f.data.tasks.length,1);
 let template=f.data.items[0];assert.equal(f.data.tasks[0].id,occurrenceId(template.id,'2026-11-27'));
 await runRoleTasks({api:f.api,now:new Date('2026-12-03T10:00:00Z')});assert.equal(f.data.tasks.length,2);assert.equal(f.data.tasks[0].status,'To do');assert.equal(f.data.tasks[1].due_date,'2026-12-04');
 await runRoleTasks({api:f.api,now:new Date('2026-12-03T10:00:00Z')});assert.equal(f.data.tasks.length,2);
});
test('pause and resume stop new occurrences without changing existing assignments',async()=>{
 const f=fixture();await peopleTaskAction(fields(),f.data,f.api);let r=f.data.items[0];await peopleTaskAction({action:'role-task-toggle',id,revision:r.revision},f.data,f.api);
 await runRoleTasks({api:f.api,now:new Date('2026-12-10T10:00:00Z')});assert.equal(f.data.tasks.length,1);
 r=f.data.items[0];await peopleTaskAction({action:'role-task-toggle',id,revision:r.revision},f.data,f.api);assert.equal(f.data.items[0].fields.paused,false);assert.equal(f.data.tasks.length,1);
});
test('editing a template changes future assignee but retains saved occurrences and stale versions fail',async()=>{
 const f=fixture();await peopleTaskAction(fields(),f.data,f.api);f.data.people.push({id:owner,name:'James'});let r=f.data.items[0];
 await peopleTaskAction(fields({action:'role-task-save',revision:r.revision,title:'New brief',staff:owner}),f.data,f.api);
 await runRoleTasks({api:f.api,now:new Date('2026-12-03T10:00:00Z')});assert.equal(f.data.tasks[0].staff_id,person);assert.equal(f.data.tasks[0].title,'Create social posts');assert.equal(f.data.tasks[1].staff_id,owner);assert.equal(f.data.tasks[1].title,'New brief');
 await assert.rejects(peopleTaskAction(fields({action:'role-task-save',revision:r.revision}),f.data,f.api),e=>e.status===409);
});
test('changing one occurrence preserves other occurrences and their statuses',async()=>{
 const f=fixture();await peopleTaskAction(fields({repeat:'none'}),f.data,f.api);const t=f.data.tasks[0];t.status='In progress';await peopleTaskAction(fields({action:'people-task-edit',id:t.id,revision:1,repeat:'none',title:'Updated once'}),f.data,f.api);assert.equal(t.title,'Updated once');assert.equal(t.status,'In progress');
 await assert.rejects(peopleTaskAction(fields({action:'people-task-edit',id:t.id,revision:1}),f.data,f.api),e=>e.status===409);
});
test('people-only validation, permissions, dates and invalid schedules reject without writes',async()=>{
 for(const change of [{staff:'imogen'},{due:'2026-02-30'},{repeat:'weekly',day5:'no'},{end:'2026-11-01'},{leadDays:'-1'},{project:id},{asset:'secret'},{dependency:'missing'},{title:''}]){
  const f=fixture();await assert.rejects(peopleTaskAction(fields(change),f.data,f.api));assert.equal(f.writes,0);
 }
 const f=fixture();f.data.actor.role='staff';await assert.rejects(peopleTaskAction(fields(),f.data,f.api),e=>e.status===403);assert.equal(peopleTaskModal(f.data),'');assert.equal(roleTasksPanel(f.data),'');
});
test('modal is people-only, safely escaped and recurrence controls are optional',()=>{
 const f=fixture();f.data.people[0].name='<script>';const html=peopleTaskModal(f.data,new URLSearchParams({newTask:'1'}));assert.match(html,/data-open-on-load/);assert.match(html,/&lt;script&gt;/);assert.match(html,/Completion checklist/);assert.match(html,/data-repeat-options hidden/);assert.doesNotMatch(html,/value="imogen"/);assert.match(workspaceDashboard(f.data),/data-new-people-task/);
});
test('scheduler rejects missing credentials and browser origins',async()=>{
 const handler=createRoleTaskSyncHandler({env:{CRON_SECRET:'test-secret'},fetcher:()=>{throw Error('No network expected');}});
 for(const headers of [{},{authorization:'Bearer wrong'},{authorization:'Bearer test-secret',origin:'https://example.com'}]){const res={setHeader(){},status(n){this.statusCode=n;return this;},json(v){this.body=v;}};await handler({method:'GET',headers},res);assert.ok([401,403].includes(res.statusCode));}
});

test('the authenticated Home handler creates tasks and opens the modal, while staff cannot assign',async()=>{
 const f=fixture(),opts={params:new URLSearchParams({studio:'home'}),actor:f.data.actor,api:f.api,load:async()=>({records:[]}),env:{}},out=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.body=v;}});
 let res=out();await handleStudio({method:'POST',body:fields({repeat:'none'})},res,opts);assert.equal(res.statusCode,303);assert.equal(f.data.tasks.length,1);
 res=out();await handleStudio({method:'GET'},res,{...opts,params:new URLSearchParams({studio:'home',newTask:'1'})});assert.equal(res.statusCode,200);assert.match(res.body,/data-people-task-modal data-open-on-load/);
 res=out();await handleStudio({method:'POST',body:fields()},res,{...opts,actor:{role:'staff',id:person}});assert.equal(res.statusCode,403);assert.equal(f.data.tasks.length,1);
});
