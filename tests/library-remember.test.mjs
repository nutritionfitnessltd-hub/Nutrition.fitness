import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {handleLibraryWork,libraryActor,clearLibraryCookies} from '../server/library-work.mjs';
import {libraryLogin} from '../server/library-login.mjs';

test('remember me is an optional, labelled choice on the single login form',()=>{
 const html=libraryLogin();
 assert.match(html,/<label class="remember-me"><input type="checkbox" name="remember" value="1">Remember me for 30 days<\/label>/);
 assert.doesNotMatch(html,/type="checkbox"[^>]*checked/);
});
for(const role of ['admin','staff'])test(role+' remembered login lasts 30 days, expires and respects revoked access',async t=>{
 const env={NUFI_LIBRARY_CATALOGUE_KEY:'a'.repeat(64),SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'fixture',SUPABASE_SERVICE_ROLE_KEY:'fixture-only',SITE_URL:'https://example.test'},id=randomUUID();
 const password='fixture-password-for-remember-test',code_hash=createHash('sha256').update(password).digest('hex');
 let active=true;
 const api=async endpoint=>{
  if(endpoint.includes('consume_password_attempt'))return {allowed:true,retry_after:0};
  if(endpoint.includes('grant_type=password'))return {user:{id,email:'fixture@example.test',email_confirmed_at:'2026-01-01'},access_token:'fixture'};
  if(endpoint.includes('nufi_members'))return active?[{user_id:id,role:'admin',status:'active'}]:[];
  if(endpoint.includes('nufi_library_staff'))return active&&role==='staff'?[{id,name:'Fixture',code_hash}]:[];
  return [];
 };
 const login=async remember=>{
  const headers={},res={setHeader:(k,v)=>headers[k]=v,end(){}};
  await handleLibraryWork({method:'POST',headers:{host:'example.test',origin:'https://example.test'},body:{action:'sign-in',email:'fixture@example.test',password,...(remember?{remember:'1'}:{})}},res,{env,load:async()=>({records:[]}),params:new URLSearchParams(),apiFactory:()=>api});
  assert.equal(res.statusCode,303);return headers['Set-Cookie'];
 };
 const start=Date.now();t.mock.method(Date,'now',()=>start);
 const normal=await login(false),remembered=await login(true);
 assert.match(normal,/Max-Age=3600$/);assert.match(remembered,/Secure; HttpOnly; Path=\/; SameSite=Strict; Max-Age=2592000$/);
 assert.ok(!remembered.includes(password));
 const actor=cookie=>libraryActor({headers:{cookie:cookie.split(';')[0]}},{},env,()=>api);
 t.mock.method(Date,'now',()=>start+2*60*60*1000);
 assert.equal(await actor(normal),null);assert.equal((await actor(remembered)).role,role);
 active=false;assert.equal(await actor(remembered),null);active=true;
 assert.equal(await actor(remembered.replace(/\.[^.;]+;/,'.tampered;')),null);
 t.mock.method(Date,'now',()=>start+31*24*60*60*1000);assert.equal(await actor(remembered),null);
 const headers={};clearLibraryCookies({setHeader:(k,v)=>headers[k]=v});assert.ok(headers['Set-Cookie'].every(c=>c.endsWith('Max-Age=0')));
});
