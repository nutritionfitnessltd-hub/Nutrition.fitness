import {JSDOM} from 'jsdom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createHash,randomUUID} from 'node:crypto';
import {createLibraryReader} from '../server/library-reader.mjs';
import {messageFixture} from './team-messages-fixture.mjs';
import {ndaDocument,welcomeFixture} from './nda-fixture.mjs';

test('real HTTP login, create, send, reload and poll use the existing session; cross-origin writes fail',async()=>{
 const f=messageFixture(),env={NUFI_LIBRARY_CATALOGUE_KEY:'a'.repeat(64),NUFI_LIBRARY_PASSWORD_SHA256:createHash('sha256').update('fixture').digest('hex'),SUPABASE_SERVICE_ROLE_KEY:'fixture-only',SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'fixture',SITE_URL:'https://example.test'};
 const presence=new Map();
 const api=async(endpoint,options)=>{
  if(endpoint.startsWith('/rest/v1/nufi_team_presence')){if(options?.method==='POST'){presence.set(options.payload.actor_id,options.payload);return [];}return [...presence.values()];}
  const welcome=welcomeFixture(endpoint);if(welcome)return welcome;
  if(endpoint.includes('nufi_library_nda_agreements'))return [ndaDocument];
  if(endpoint.includes('nufi_library_nda_acceptances'))return [{id:'existing-test-acceptance'}];
  if(endpoint.includes('consume_password_attempt'))return {allowed:true,retry_after:0};
  if(endpoint.includes('grant_type=password'))return {user:{id:f.admin.id,email:'admin@example.test',email_confirmed_at:'2026-01-01'},access_token:'fixture-only'};
  if(endpoint.includes('nufi_members'))return [{user_id:f.admin.id,role:'admin',status:'active'}];
  return f.api(endpoint,options);
 };
 const reader=createLibraryReader({env,apiFactory:()=>api,load:async()=>({version:1,records:[],files:{}})});
 const server=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;req.body=req.headers['content-type']?.includes('application/json')?JSON.parse(raw||'{}'):raw;await reader(req,res);});
 server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port,origin=base.replace('http:','https:');
 const entry='/content-library/?work=1&studio=messages';let cookie='';
 const request=(path,body,otherOrigin=origin)=>fetch(base+path,{method:body?'POST':'GET',headers:{cookie,origin:otherOrigin,...(body?{'Content-Type':'application/json',Accept:'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'manual'});
 try{
  assert.equal((await request(entry)).status,401);
  const login=await request(entry,{action:'sign-in',email:'admin@example.test',password:'fixture-admin'});assert.equal(login.status,303,await login.text());cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
  let response=await request(entry);assert.equal(response.status,200);assert.match(await response.text(),/Choose someone to chat/);
  response=await request(entry+'&person='+f.other.id+'&panel=1');const first=await response.text();assert.match(first,/data-message-first/);assert.doesNotMatch(first,/Conversation type/);
  response=await request(entry+'&person='+f.other.id+'&panel=1',{action:'message-create',kind:'direct',person:f.other.id,messageId:randomUUID(),body:'Hello from one-click chat'});assert.equal(response.status,303);const direct=response.headers.get('location');assert.match(direct,/panel=1/);
  response=await request(direct);assert.match(await response.text(),/Hello from one-click chat/);
  const before=f.rows.size;response=await request(entry+'&person='+f.other.id);assert.match(await response.text(),/Hello from one-click chat/);assert.equal(f.rows.size,before);
  response=await request(entry+'&person='+f.staff.id,{action:'message-create',kind:'direct',person:f.staff.id,messageId:randomUUID(),body:'   '});assert.equal(response.status,400);assert.equal(f.rows.size,before);
  response=await request(entry,{action:'message-create',kind:'direct',members:JSON.stringify([f.staff.id])});assert.equal(response.status,303);const conversation=response.headers.get('location');
  response=await request(conversation,f.send('HTTP fixture message'));assert.equal(response.status,200);assert.equal((await response.json()).saved,true);
  response=await request(conversation);assert.equal(response.status,200);assert.match(await response.text(),/HTTP fixture message/);
  response=await request(conversation+'&panel=1');assert.equal(response.status,200);assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'self'/);const compact=await response.text();assert.match(compact,/data-messages-embedded/);assert.doesNotMatch(compact,/data-message-panel-toggle|class="shell"/);
  const dom=new JSDOM(compact,{url:base+conversation+'&panel=1'}),sendForm=dom.window.document.querySelector('[data-message-compose]');const action=sendForm.getAttribute('action').replaceAll('&amp;','&');assert.equal(new URL(action,base).searchParams.get('panel'),'1');
  for(const text of ['Native Enter send','Next Enter send']){const native=await fetch(base+action,{method:'POST',headers:{cookie,origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(f.send(text)),redirect:'manual'});assert.equal(native.status,303);assert.match(native.headers.get('location'),/panel=1/);const saved=await request(native.headers.get('location'));assert.equal(saved.status,200);assert.match(saved.headers.get('content-security-policy'),/frame-ancestors 'self'/);assert.match(await saved.text(),new RegExp(text));}dom.window.close();
  response=await request(entry+'&poll=1',{action:'message-presence',active:true,actor_id:f.other.id});assert.equal(response.status,200);assert.ok(presence.has(f.admin.id));assert.ok(!presence.has(f.other.id));response=await request(entry+'&poll=1');assert.equal((await response.json()).presence.find(p=>p.id===f.admin.id).status,'online');
  response=await request(conversation+'&panel=1',f.send('Panel HTTP message'));assert.equal(response.status,200);assert.equal((await response.json()).saved,true);
  response=await request(entry+'&panel=1',{action:'message-create',kind:'direct',members:JSON.stringify([f.staff.id])});assert.equal(response.status,303);assert.match(response.headers.get('location'),/panel=1/);
  response=await request(conversation);assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  response=await request(entry+'&poll=1');assert.equal(response.status,200);const poll=await response.json();assert.equal(poll.unread,0);assert.ok(poll.threads.length>=2);assert.doesNotMatch(JSON.stringify(poll),/HTTP fixture message/);
  const count=f.rows.size;response=await request(conversation,{action:'message-send',messageId:randomUUID(),body:'Denied cross-origin'},'https://other.example');assert.equal(response.status,403);assert.equal(f.rows.size,count);assert.ok(![...f.rows.values()].some(r=>r.payload.messages.some(m=>m.body==='Denied cross-origin')));
 }finally{server.close();await once(server,'close');}
});
