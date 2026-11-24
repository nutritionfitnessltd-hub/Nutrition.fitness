import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {taskContext,taskPage,changeTaskPage,postTaskMessage} from '../server/task-messages.mjs';
import {taskStoragePrefix,taskUploadToken,attachTaskFile,sendTaskFile} from '../server/task-files.mjs';
import {taskFixture} from './task-messaging-fixture.mjs';
import {handleStudio} from '../server/studio.mjs';
import {PassThrough} from 'node:stream';
test('project task status and complete controls save and reload with revision protection',async()=>{
 const f=taskFixture(),params=f.params(),data=f.data(f.staff);
 const html=await taskPage(params,data,f.api);assert.match(html,/Mark complete|Save status/);assert.match(html,/Progress notes|Attachments/);
 await changeTaskPage(params,{action:'assignment-status',status:'Done',revision:1},data,f.api,{},f.fetcher);
 assert.equal(f.project.entries[0].status,'Done');assert.equal(f.project.revision,2);
 assert.match(await taskPage(params,f.data(f.staff),f.api),/This task is complete/);
 await assert.rejects(()=>changeTaskPage(params,{action:'assignment-status',status:'In progress',revision:1},f.data(f.staff),f.api,{},f.fetcher),e=>e.status===409);
 await changeTaskPage(params,{action:'assignment-status',status:'In progress',revision:2},f.data(f.owner),f.api,{},f.fetcher);
 assert.equal(f.project.entries[0].status,'In progress');
});
test('progress notes preserve the brief, messages and attachments and reject outsiders and stale saves',async()=>{
 const f=taskFixture(),p=f.params(),note={action:'task-note',noteId:randomUUID(),note:'Awaiting final packaging measurements.',threadRevision:0};
 await changeTaskPage(p,note,f.data(f.staff),f.api,{},f.fetcher);
 await changeTaskPage(p,note,f.data(f.staff),f.api,{},f.fetcher);
 const row=[...f.rows.values()].find(r=>r.payload.kind==='task-thread');assert.equal(row.payload.fields.notes.length,1);
 row.payload.fields.files=[{id:randomUUID(),name:'Specification.pdf',bytes:1000}];
 await postTaskMessage(p,{messageId:randomUUID(),body:'Please review',threadRevision:1},f.data(f.owner),f.api);
 assert.equal(f.rows.get(row.id).payload.fields.notes.length,1);assert.equal(f.rows.get(row.id).payload.fields.files.length,1);
 assert.equal(f.project.entries[0].notes,'Check prices and delivery.');
 assert.match(await taskPage(p,f.data(f.staff),f.api),/Awaiting final packaging measurements/);
 await assert.rejects(()=>changeTaskPage(p,{...note,noteId:randomUUID()},f.data(f.staff),f.api,{},f.fetcher),e=>e.status===409);
 await assert.rejects(()=>changeTaskPage(p,note,f.data(f.outsider),f.api,{},f.fetcher),e=>e.status===403);
 const readOnly={...f.staff,access:{work:true}};assert.doesNotMatch(await taskPage(p,f.data(readOnly),f.api),/Mark complete|Save note/);
 await assert.rejects(()=>changeTaskPage(p,note,f.data(readOnly),f.api,{},f.fetcher),e=>e.status===403);
});
test('private task uploads verify task-specific paths and preserve messages and notes',async()=>{
 const f=taskFixture(),p=f.params(),data=f.data(f.staff),env={BLOB_READ_WRITE_TOKEN:'fixture-only'},task=taskContext(p,data),pathname=taskStoragePrefix(task)+randomUUID()+'.pdf';
 let before;await taskUploadToken({body:{type:'blob.generate-client-token'}},p,data,f.api,env,async options=>{before=options.onBeforeGenerateToken;return {};});
 assert.deepEqual((await before(pathname)).allowedContentTypes,['application/pdf']);
 await assert.rejects(()=>before('other/'+randomUUID()+'.pdf'),e=>e.status===400);
 const inspect=async()=>({pathname,contentType:'application/pdf',size:2048,url:'https://fixture.private.blob.vercel-storage.com/'+pathname});
 await attachTaskFile(p,{pathname,name:'Packaging specification.pdf'},data,f.api,env,inspect);
 await attachTaskFile(p,{pathname,name:'Packaging specification.pdf'},data,f.api,env,inspect);
 const row=[...f.rows.values()].find(r=>r.payload.kind==='task-thread');assert.equal(row.payload.fields.files.length,1);
 await changeTaskPage(p,{action:'task-note',noteId:randomUUID(),note:'Artwork attached.',threadRevision:1},data,f.api,{},f.fetcher);
 assert.equal(f.rows.get(row.id).payload.fields.files.length,1);
 const html=await taskPage(p,{...data,taskUploadsReady:true},f.api);assert.match(html,/Packaging specification.pdf|data-upload-url|Upload files/);
 await assert.rejects(()=>attachTaskFile(p,{pathname,name:'Other.pdf'},f.data(f.outsider),f.api,env,inspect),e=>e.status===403);
 await assert.rejects(()=>sendTaskFile({method:'GET'},{},new URLSearchParams({...Object.fromEntries(p),file:row.payload.fields.files[0].id}),f.data(f.outsider),f.api,env),e=>e.status===403);
 const response=new PassThrough(),chunks=[];response.setHeader=()=>{};response.on('data',chunk=>chunks.push(chunk));
 await sendTaskFile({method:'GET'},response,new URLSearchParams({...Object.fromEntries(p),file:row.payload.fields.files[0].id}),data,f.api,env,async()=>({stream:new Blob(['private task attachment']).stream()}));
 assert.equal(Buffer.concat(chunks).toString(),'private task attachment');
});
test('task route renders uploads and saves project completion and notes with the correct return location',async()=>{
 const f=taskFixture(),params=f.params(),env={BLOB_READ_WRITE_TOKEN:'fixture-only'};
 async function request(body){const headers={},res={setHeader:(k,v)=>headers[k]=v,end(value){this.body=value;}};await handleStudio({method:body?'POST':'GET',body},res,{params,actor:f.staff,api:f.api,load:f.load,env,fetcher:f.fetcher});return {...res,headers};}
 let response=await request();assert.equal(response.statusCode,200);assert.match(response.body,/Mark complete|data-save-action="task-file-save"/);
 response=await request({action:'assignment-status',status:'Done',revision:1});assert.equal(response.statusCode,303);assert.match(response.headers.Location,/#task-update$/);assert.equal(f.project.entries[0].status,'Done');
 response=await request({action:'task-note',noteId:randomUUID(),note:'Final artwork checked.',threadRevision:0});assert.equal(response.statusCode,303);assert.match(response.headers.Location,/#task-notes$/);
 response=await request();assert.match(response.body,/Final artwork checked/);assert.match(response.body,/This task is complete/);
});

