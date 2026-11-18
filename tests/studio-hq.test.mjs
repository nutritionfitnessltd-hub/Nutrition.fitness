import test from 'node:test';
import assert from 'node:assert/strict';
import {workerChatPage,changeHq} from '../server/studio-hq.mjs';
import {workerIdeasPanel} from '../server/studio-ideas.mjs';
import {authorizeStudioRequest} from '../server/library-permissions.mjs';
const env={NUFI_HQ_SITE_TOKEN:'test-private-service-token'},data={actor:{role:'admin',id:'owner'}};
const reply=value=>({ok:true,status:200,json:async()=>value});
test('messages use the private HQ service and preserve actual conversation text',async()=>{
 const requests=[],fetcher=async(endpoint,init)=>{requests.push({endpoint,init,body:JSON.parse(init.body)});return reply({task:{status:'queued'},messages:[{role:'user',body:'My real message',createdAt:'2026-11-18'},{role:'assistant',body:'Actual HQ reply <script>',author:'Nina'}]});};
 const html=await workerChatPage(new URLSearchParams({worker:'nina'}),data,env,fetcher);
 assert.match(html,/My real message/);assert.match(html,/Actual HQ reply &lt;script&gt;/);assert.match(html,/name="clientMessageId"/);assert.match(html,/Message queued in James HQ/);
 assert.equal(requests[0].init.headers['OAI-Sites-Authorization'],'Bearer test-private-service-token');assert.equal(requests[0].init.redirect,'manual');assert.ok(!html.includes(env.NUFI_HQ_SITE_TOKEN));
 const target=await changeHq(new URLSearchParams(),{action:'hq-message',worker:'nina',message:'Please revise this',clientMessageId:'safe-id'},data,null,env,fetcher);assert.deepEqual(target,{section:'worker-chat',worker:'nina'});assert.equal(requests.at(-1).body.message,'Please revise this');
});
test('only administrators can open HQ pages or send messages and decisions',async()=>{
 assert.throws(()=>authorizeStudioRequest({role:'staff'},'worker-chat','GET'),e=>e.status===403);
 await assert.rejects(workerChatPage(new URLSearchParams({worker:'alex'}),{actor:{role:'staff'}},env),e=>e.status===403);
 await assert.rejects(changeHq(new URLSearchParams(),{action:'hq-idea'}, {actor:{role:'staff'}},null,env),e=>e.status===403);
 await assert.rejects(changeHq(new URLSearchParams(),{action:'hq-message',worker:'other',message:'x',clientMessageId:'id'},data,null,env),e=>e.status===400);
});
test('ideas expose scoped approval actions and escaped source evidence',async()=>{
 const fetcher=async()=>reply({version:4,ideas:[{id:'idea-1',title:'Test <b>',summary:'Draft proposal',rationale:'Reason',day:'2026-11-18',state:'pending',sources:[{title:'Official source',url:'https://www.acquisition.com/training'}]}]});
 const html=await workerIdeasPanel('alex',env,fetcher);assert.match(html,/Test &lt;b&gt;/);assert.match(html,/Approve idea &amp; request scope/);assert.match(html,/value="4"/);assert.doesNotMatch(html,/Approve scope &amp; start/);
 let called;await changeHq(new URLSearchParams(),{action:'hq-idea',decision:'approve-idea',worker:'alex',ideaId:'idea-1',expectedVersion:'4'},data,null,env,async(u,opts)=>{called=JSON.parse(opts.body);return reply({ok:true});});assert.equal(called.action,'approve-idea');assert.equal(called.expectedVersion,4);
});
test('connection failures retain the unsent message without claiming delivery',async()=>{
 const html=await workerChatPage(new URLSearchParams({worker:'nina'}),data,{},async()=>{throw Error('must not call')},{message:'Keep my draft',clientMessageId:'retry-id'});assert.match(html,/Keep my draft/);assert.match(html,/has not been sent/);assert.doesNotMatch(html,/Message queued/);
});

