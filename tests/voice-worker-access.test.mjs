import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createWorkspaceAssistant} from '../api/workspace-assistant.js';
function fixture(){
 const tasks=[],writes=[],calls=[],connection={id:'content-manager',namespace:'worker:content-manager:'};let enabled=true,paused=false;
 const api=async(path,opts)=>{assert.equal(opts.service,true);assert.match(path,/token_hash=eq\.[a-f0-9]{64}$/);assert.doesNotMatch(path,/a{64}/);return enabled?[connection]:[];};
 const fetcher=async(url,opts)=>{calls.push(url);assert.equal(opts.headers['OAI-Sites-Authorization'],'Bearer private-hq-test');
  if(url.endsWith('/api/worker')){if(opts.method==='GET')return Response.json({tasks,settings:{private:'not returned'},organisation:{members:[{workspace:'Other business',secret:'not returned'}]}});const body=JSON.parse(opts.body);writes.push(body);if(!tasks.some(t=>t.id===body.id))tasks.push({...body,status:'queued',result:'',createdAt:'2026-11-20'});return Response.json({ok:true});}
  const body=JSON.parse(opts.body);if(body.action==='status')return Response.json({queueEnabled:true,workers:{morgan:{employeeId:'morgan-real',name:'Morgan',role:'Project Manager',paused}}});
  if(body.action==='message'){writes.push(body);return Response.json({task:{id:'employee-chat:morgan',status:'queued'}});}
  return Response.json({task:{id:'employee-chat:morgan',status:'ready'},messages:[{role:'assistant',body:'A reviewed plan is ready',createdAt:'2026-11-20'}]});
 };
 const handler=createWorkspaceAssistant({env:{NUFI_HQ_SITE_TOKEN:'private-hq-test'},api,fetcher});
 const call=async(body,headers={})=>{const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(data){this.body=data;return this;}};await handler({method:'POST',headers:{'content-type':'application/json','x-nufi-worker-token':'a'.repeat(64),...headers},body},res);return res;};
 return {tasks,writes,calls,connection,call,setEnabled:value=>enabled=value,setPaused:value=>paused=value};
}
test('voice task dispatch uses the real HQ queue, confirms saved state and deduplicates retries',async()=>{
 const f=fixture(),requestId=randomUUID(),input={action:'worker-assign',worker:'morgan',requestId,title:'Scope the idea',brief:'Propose an outcome and tasks for James to review.'};
 let r=await f.call(input);assert.equal(r.statusCode,200);assert.equal(r.body.id,'studio-voice:'+requestId);assert.equal(r.body.status,'queued');assert.match(r.body.url,/worker=morgan/);assert.equal(f.writes[0].employeeId,'morgan-real');assert.equal(f.writes[0].area,'Nutrition.Fitness');
 r=await f.call(input);assert.equal(r.body.duplicate,true);assert.equal(f.writes.length,1);
 r=await f.call({...input,title:'Different work'});assert.equal(r.statusCode,409);assert.equal(f.writes.length,1);
 f.tasks[0].result='Scope ready';f.tasks[0].status='ready';r=await f.call({action:'worker-task',worker:'morgan',taskId:'studio-voice:'+requestId});assert.equal(r.body.result,'Scope ready');assert.equal(r.body.status,'ready');assert.doesNotMatch(JSON.stringify(r.body),/private-hq-test|Other business|not returned/);
});
test('existing identity, revocation, paused workers and namespace restrictions remain enforced',async()=>{
 const f=fixture();let r=await f.call({action:'worker-list'},{'x-nufi-worker-token':''});assert.equal(r.statusCode,401);assert.equal(f.calls.length,0);
 f.setEnabled(false);r=await f.call({action:'worker-list'});assert.equal(r.statusCode,401);f.setEnabled(true);f.connection.id='other';r=await f.call({action:'worker-list'});assert.equal(r.statusCode,403);f.connection.id='content-manager';
 f.setPaused(true);r=await f.call({action:'worker-assign',worker:'morgan',requestId:randomUUID(),title:'Test',brief:'Test'});assert.equal(r.statusCode,409);assert.equal(f.writes.length,0);
 r=await f.call({action:'worker-message',worker:'morgan',requestId:randomUUID(),message:'Test'});assert.equal(r.statusCode,409);assert.equal(f.writes.length,0);
 r=await f.call({action:'worker-list'});assert.equal(r.body.workers[0].paused,true);
});
test('conversation reads/messages use existing employee threads and return queue acknowledgement',async()=>{
 const f=fixture();let r=await f.call({action:'worker-get',worker:'morgan'});assert.equal(r.body.conversation.messages[0].body,'A reviewed plan is ready');assert.equal(f.writes.length,0);
 const requestId=randomUUID();r=await f.call({action:'worker-message',worker:'morgan',requestId,message:'What is blocking the plan?'});assert.equal(r.statusCode,200);assert.equal(r.body.status,'queued');assert.equal(f.writes[0].clientMessageId,requestId);assert.equal(f.writes[0].action,'message');
});
test('cross-origin, arbitrary HQ actions, unknown workers and foreign task IDs cannot write or leak data',async()=>{
 const f=fixture();for(const input of [{action:'release-codex'},{action:'worker-get',worker:'foreign'},{action:'worker-assign',worker:'morgan',requestId:randomUUID(),title:'x',brief:'x',area:'Other business'},{action:'worker-task',worker:'morgan',taskId:'other-task'}])assert.equal((await f.call(input)).statusCode,400);
 assert.equal((await f.call({action:'worker-list'},{origin:'https://evil.test'})).statusCode,403);
 const taskId='studio-voice:'+randomUUID();f.tasks.push({id:taskId,employeeId:'morgan-real',area:'Other business',result:'private'});assert.equal((await f.call({action:'worker-task',worker:'morgan',taskId})).statusCode,404);assert.equal(f.writes.length,0);
});
