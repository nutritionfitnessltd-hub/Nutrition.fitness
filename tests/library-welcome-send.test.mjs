import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHmac,createHash} from 'node:crypto';
import {handleLibraryWork} from '../server/library-work.mjs';
import {sendWelcome} from '../server/library-welcome.mjs';
import {welcomeGeneration,openWelcomeMessage} from '../server/studio-mail-private.mjs';
import {changeNotifications,sendExchange} from '../server/studio-notifications.mjs';
import {ndaDocument} from './nda-fixture.mjs';
const env={NUFI_LIBRARY_CATALOGUE_KEY:'fixture-key',EXCHANGE_TENANT_ID:'fixture',EXCHANGE_CLIENT_ID:'fixture',EXCHANGE_CLIENT_SECRET:'fixture-secret'};
function fixture(){
 const actor={role:'admin',id:randomUUID()},person={id:randomUUID(),name:'Colleague',email:'colleague@example.test',code_hash:createHash('sha256').update('fixture-password').digest('hex')};
 const rows=new Map(),sends=[];let outcome=202;
 const api=async(endpoint,options={})=>{
  if(endpoint.includes('nufi_library_nda_agreements'))return [ndaDocument];
  if(endpoint.includes('nufi_library_nda_acceptances'))return [{id:'fixture'}];
  if(endpoint.includes('nufi_members'))return [{user_id:actor.id,role:'admin',status:'active'}];
  if(endpoint.includes('nufi_library_staff'))return endpoint.includes(person.id)?[person]:[];
  if(endpoint.includes('rpc/nufi_studio_save')){
   const {item,document,expected}=options.payload;if((rows.get(item)?.revision||0)!==expected)return [];
   const row={id:item,payload:structuredClone(document),revision:expected+1};rows.set(item,row);return [row];
  }
  if(endpoint.includes('nufi_studio_items')){
   const id=new URL(endpoint,'https://fixture').searchParams.get('id')?.slice(3);return rows.has(id)?[rows.get(id)]:[];
  }
  throw Error(endpoint);
 };
 const fetcher=async(url,options)=>{
  if(url.includes('/token'))return new Response(JSON.stringify({access_token:'fixture-token'}));
  sends.push(JSON.parse(options.body));if(outcome==='timeout')throw Error('fixture timeout');
  return new Response(outcome===403?JSON.stringify({error:{code:'ErrorAccessDenied',message:'never expose upstream details'}}):null,{status:outcome});
 };
 const fields={action:'send-welcome',staff:person.id,requestId:randomUUID(),generation:welcomeGeneration(env,person),subject:'Welcome',message:'Your password: fixture-sensitive-password\nWelcome <name>'};
 const context={api,actor,env,origin:'https://team.example.test',fetcher};
 const claims=Buffer.from(JSON.stringify({...actor,expires:Date.now()/1000+3600})).toString('base64url');
 const cookie='__Host-nufi-library-work='+claims+'.'+createHmac('sha256',env.NUFI_LIBRARY_CATALOGUE_KEY).update('library-work:v1:'+claims).digest('base64url');
 async function request(body=fields,options={}){
  let result;const headers={};const res={setHeader:(k,v)=>headers[k]=v,end:v=>result=v};
  await handleLibraryWork({method:'POST',headers:{host:'team.example.test',origin:'https://team.example.test',accept:'application/json',cookie,...options},body},res,{env,load:async()=>({records:[],files:{}}),params:new URLSearchParams({studio:'team'}),apiFactory:()=>api,fetcher});
  return {status:res.statusCode,body:JSON.parse(result),headers};
 }
 return {person,rows,sends,fields,context,request,setOutcome:v=>outcome=v};
}
test('administrator sends directly, recipient is server-verified, and repeats do not send twice',async()=>{
 const f=fixture();const [a,b]=await Promise.all([f.request({...f.fields,recipient:'injected@example.test'}),f.request()]);
 assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(f.sends.length,1);
 assert.equal(f.sends[0].message.toRecipients[0].emailAddress.address,f.person.email);
 assert.match(f.sends[0].message.body.content,/fixture-sensitive-password/);assert.match(f.sends[0].message.body.content,/Welcome &lt;name&gt;/);
 assert.equal((await f.request()).body.state,'accepted');assert.equal(f.sends.length,1);
 assert.match(a.headers['Cache-Control'],/no-store/);
 assert.doesNotMatch(JSON.stringify([...f.rows.values()]),/fixture-sensitive-password|fixture-token|fixture-secret/);
 assert.equal([...f.rows.values()][0].payload.fields.encryptedMessage,undefined);
});
test('a known failure retains encrypted content and an explicit retry sends the edited message',async()=>{
 const f=fixture();f.setOutcome(403);const failed=await f.request();
 assert.equal(failed.body.state,'failed');assert.match(failed.body.detail,/ErrorAccessDenied/);assert.doesNotMatch(failed.body.detail,/upstream/);
 const stored=[...f.rows.values()][0].payload.fields;
 assert.match(JSON.parse(openWelcomeMessage(env,stored)).message,/fixture-sensitive-password/);assert.doesNotMatch(JSON.stringify(stored),/fixture-sensitive-password/);
 assert.throws(()=>openWelcomeMessage(env,{...stored,recipient:'other@example.test'}),{status:409});
 f.setOutcome(202);assert.equal((await f.request({...f.fields,message:'Corrected welcome message'})).body.state,'accepted');
 assert.equal(f.sends.length,2);assert.match(f.sends[1].message.body.content,/Corrected welcome message/);
});
test('expired access, other origins, invalid input and disabled or changed accounts cannot send',async()=>{
 const f=fixture();
 assert.equal((await f.request(f.fields,{cookie:''})).status,401);
 assert.equal((await f.request(f.fields,{origin:'https://evil.example'})).status,403);
 assert.equal((await f.request({...f.fields,subject:'Bad\nheader'})).status,400);
 await assert.rejects(sendWelcome(f.fields,{...f.context,actor:{role:'staff',id:f.person.id}}),{status:403});
 f.person.code_hash='b'.repeat(64);assert.equal((await f.request()).status,409);
 f.person.code_hash=null;assert.equal((await f.request()).status,409);
 assert.equal(f.sends.length,0);assert.equal(f.rows.size,0);
});
test('Connections cannot retry a welcome email after a password change',async()=>{
 const f=fixture();f.setOutcome(403);await f.request();f.person.code_hash='b'.repeat(64);
 const result=await changeNotifications({action:'notifications-retry',notification:[...f.rows.keys()][0]},{actor:f.context.actor},f.context.api,env,f.context.fetcher);
 assert.equal(result.mail,'cancelled');assert.equal(f.sends.length,1);
 assert.equal([...f.rows.values()][0].payload.fields.encryptedMessage,undefined);
});
test('uncertain sends cannot be retried automatically or by repeat submission',async()=>{
 const f=fixture();f.setOutcome('timeout');assert.equal((await f.request()).body.state,'unknown');
 assert.equal((await f.request()).body.state,'unknown');assert.equal(f.sends.length,1);
});
test('Graph diagnostics do not disclose arbitrary upstream response text',async()=>{
 let calls=0;
 const result=await sendExchange(env,{id:'fixture',title:'Test',message:'Test',recipient:'a@example.test',link:'https://example.test'},async()=>++calls===1?new Response(JSON.stringify({access_token:'fixture'})):new Response(JSON.stringify({error:{code:'<secret>',message:'token-value'}}),{status:403}));
 assert.match(result.detail,/not authorised/);assert.doesNotMatch(result.detail,/secret|token-value/);
});
