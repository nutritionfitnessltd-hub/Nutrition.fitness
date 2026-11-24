import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {taskContext,taskPage,postTaskMessage,changeTaskPage} from '../server/task-messages.mjs';
import {notifyTask,projectTask,notifyProjectTasks} from '../server/task-notifications.mjs';
import {studioData} from '../server/studio-store.mjs';
import {handleStudio} from '../server/studio.mjs';
import {handleLibraryWork} from '../server/library-work.mjs';
import {taskFixture} from './task-messaging-fixture.mjs';
const message=(body='Please confirm delivery.')=>({action:'task-message',messageId:randomUUID(),threadRevision:'0',body});
test('assigned staff without library access can discuss both task types; outsiders cannot read or write',async()=>{
 const f=taskFixture();for(const standalone of [false,true]){
  const params=f.params(standalone),data=f.data(f.staff),m=message();
  await postTaskMessage(params,m,data,f.api);
  assert.match(await taskPage(params,data,f.api),/Please confirm delivery/);
  assert.throws(()=>taskContext(params,f.data(f.outsider)),e=>e.status===403);
  await assert.rejects(postTaskMessage(params,message(),f.data(f.outsider),f.api),e=>e.status===403);
 }
 assert.throws(()=>taskContext(f.params(),f.data({...f.staff,access:{}})),e=>e.status===403);
 assert.match(await taskPage(f.params(),f.data(f.owner),f.api),/Please confirm delivery/);
});
test('messages preserve identity, escape HTML, survive reload and reject stale writes',async()=>{
 const f=taskFixture(),data=f.data(f.staff),m=message('<script>alert(1)</script>');
 await postTaskMessage(f.params(),m,data,f.api);await postTaskMessage(f.params(),m,data,f.api);
 const record=[...f.rows.values()].find(r=>r.payload.kind==='task-thread');assert.equal(record.payload.fields.messages.length,1);assert.equal(record.payload.fields.messages[0].author,'Joyce');
 const html=await taskPage(f.params(),data,f.api);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>alert/);
 await assert.rejects(postTaskMessage(f.params(),message('Stale'),f.data(f.owner),f.api),e=>e.status===409);
 await assert.rejects(postTaskMessage(f.params(),{...m,body:'Changed duplicate'},data,f.api),e=>e.status===409);
 await postTaskMessage(f.params(),{...message('Reply'),threadRevision:'1'},f.data(f.owner),f.api);assert.equal(f.rows.get(record.id).payload.fields.messages.length,2);
});
test('message notifications go only to other participants and deduplicate repeats',async()=>{
 const f=taskFixture(),m=message();
 await changeTaskPage(f.params(),m,f.data(f.staff),f.api,f.env,f.fetcher);
 await changeTaskPage(f.params(),m,f.data(f.staff),f.api,f.env,f.fetcher);
 const sent=f.requests.filter(r=>r.url.endsWith('/sendMail')).map(r=>JSON.parse(r.options.body).message);
 assert.deepEqual(sent.map(m=>m.toRecipients[0].emailAddress.address).sort(),['james@example.com','kasia@example.com']);
 assert.ok(sent.every(m=>m.subject.startsWith('New task message:')));assert.match(sent[0].body.content,/studio=task/);
});
test('assignment and completion emails target actual assignee and owners; edits without transitions send nothing',async()=>{
 const f=taskFixture(),task=projectTask(f.project,f.project.entries[0]),context={api:f.api,actor:f.admin,env:f.env,fetcher:f.fetcher};
 await notifyTask({...context,task,reason:'assigned',version:1});assert.equal(f.requests.filter(r=>r.url.endsWith('/sendMail')).length,1);
 let before=f.data();await notifyProjectTasks(new URLSearchParams({project:f.project.id}),{action:'task-save'},before,{project:f.project.id},context);assert.equal(f.requests.length,2);
 f.project.entries[0].status='Done';f.project.revision=2;
 await notifyProjectTasks(new URLSearchParams({project:f.project.id}),{action:'task-save'},before,{project:f.project.id},context);
 assert.equal(f.requests.filter(r=>r.url.endsWith('/sendMail')).length,3);
 assert.ok(f.requests.filter(r=>r.url.endsWith('/sendMail')).slice(1).every(r=>JSON.parse(r.options.body).message.subject.startsWith('Task completed:')));
});
test('new and reassigned project tasks notify the new assignee, including inherited project ownership',async()=>{
 const f=taskFixture(),context={api:f.api,actor:f.admin,env:f.env,fetcher:f.fetcher};
 await notifyProjectTasks(f.params(),{action:'project-blank-create'},{projects:[]},{project:f.project.id},context);
 const before=f.data();f.project.entries[0].assignee=f.owner.id;f.project.revision++;
 await notifyProjectTasks(f.params(),{action:'task-save'},before,{project:f.project.id},context);
 const addresses=f.requests.filter(r=>r.url.endsWith('/sendMail')).map(r=>JSON.parse(r.options.body).message.toRecipients[0].emailAddress.address);
 assert.deepEqual(addresses,['joyce@example.com','kasia@example.com']);
});
test('disabled email and delivery failures never undo a saved message',async()=>{
 const f=taskFixture();f.rows.get('studio:notifications').payload.fields.tasksEnabled=false;
 await changeTaskPage(f.params(),message(),f.data(f.staff),f.api,f.env,f.fetcher);assert.equal(f.requests.length,0);
 f.rows.get('studio:notifications').payload.fields.tasksEnabled=true;
 const pending=await changeTaskPage(f.params(),{...message('Next message'),threadRevision:'1'},f.data(f.staff),f.api,{},f.fetcher);
 assert.equal(pending,true);assert.match(await taskPage(f.params(),f.data(),f.api),/Next message/);
 assert.ok([...f.rows.values()].some(r=>r.payload.kind==='notification'&&r.payload.fields.state==='failed'));
});
test('private thread rows never enter library or export data even for administrators',async()=>{
 const f=taskFixture();await postTaskMessage(f.params(),message(),f.data(),f.api);
 const data=await studioData(f.api,f.admin,f.load);assert.ok(data.items.every(r=>r.kind!=='task-thread'));
});
test('standalone completion respects revision, assignee and sends to the assigner',async()=>{
 const f=taskFixture(),data=f.data(f.staff);
 await changeTaskPage(f.params(true),{action:'assignment-status',status:'Done',revision:'1'},data,f.api,f.env,f.fetcher);
 assert.equal(f.assignment.status,'Done');assert.equal(f.requests.filter(r=>r.url.endsWith('/sendMail')).length,1);
 await assert.rejects(changeTaskPage(f.params(true),{action:'assignment-status',status:'To do',revision:'1'},f.data(f.staff),f.api,f.env,f.fetcher),e=>e.status===409);
});
test('route preserves unsent text on conflict and rejects denied requests before loading data',async()=>{
 const f=taskFixture();await postTaskMessage(f.params(),message(),f.data(),f.api);
 const response=()=>({statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}}),res=response();
 await handleStudio({method:'POST',body:message('Keep my reply')},res,{params:f.params(),actor:f.staff,api:f.api,load:f.load,env:f.env,fetcher:f.fetcher});
 assert.equal(res.statusCode,409);assert.match(res.body,/Keep my reply/);assert.match(res.body,/A new message arrived/);assert.equal(f.requests.length,0);
 const denied=response();await handleStudio({method:'GET'},denied,{params:f.params(),actor:{...f.staff,access:{}},api:()=>{throw Error('Should not load');},load:f.load,env:{}});assert.equal(denied.statusCode,403);
});
test('project route sends completion email only after a successful versioned task save',async()=>{
 const f=taskFixture(),entry=f.project.entries[0],res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}};
 const params=new URLSearchParams({studio:'project',project:f.project.id});
 const body={action:'task-save',projectRevision:'1',entry:entry.id,title:entry.title,notes:entry.notes,status:'Done',week:'0',due:''};
 await handleStudio({method:'POST',body},res,{params,actor:f.admin,api:f.api,load:f.load,env:f.env,fetcher:f.fetcher});
 assert.equal(res.statusCode,303);assert.equal(f.project.entries[0].status,'Done');assert.equal(f.requests.filter(r=>r.url.endsWith('/sendMail')).length,2);
 f.requests.length=0;await handleStudio({method:'POST',body},res,{params,actor:f.admin,api:f.api,load:f.load,env:f.env,fetcher:f.fetcher});
 assert.equal(res.statusCode,409);assert.equal(f.requests.length,0);
});
test('older assignment status form triggers the same completion email once',async()=>{
 const f=taskFixture(),res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}};
 const request={method:'POST',headers:{host:'example.test',origin:'https://example.test'},body:{action:'update',id:f.assignment.id,revision:'1',status:'Done'}};
 const context={params:new URLSearchParams({assignments:'1'}),env:{...f.env,NUFI_LIBRARY_CATALOGUE_KEY:'p'.repeat(64)},copyActor:f.staff,apiFactory:()=>f.api,load:f.load,fetcher:f.fetcher};
 await handleLibraryWork(request,res,context);assert.equal(res.statusCode,303);assert.equal(f.requests.filter(r=>r.url.endsWith('/sendMail')).length,1);
 await handleLibraryWork(request,res,context);assert.equal(res.statusCode,409);assert.equal(f.requests.filter(r=>r.url.endsWith('/sendMail')).length,1);
});
