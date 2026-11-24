import {ndaDocument,welcomeFixture} from './nda-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID,createHash } from 'node:crypto';
import { handleLibraryWork } from '../server/library-work.mjs';
import { shelfView } from '../server/library-shelves.mjs';
const env={NUFI_LIBRARY_CATALOGUE_KEY:'a'.repeat(64),SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'fixture',SUPABASE_SERVICE_ROLE_KEY:'fixture',SITE_URL:'https://example.test'};
const record={id:'catalogue:fixture',title:'One bowl recipes',kind:'Recipe book',group:'Recipes',status:'ready',fields:{},files:[]};
const index={records:[record],files:{}};
test('recipe collection browses its files and distinguishes the recipe tabs',()=>{
  const meta={assets:{[record.id]:{shelf:'Bowl collection',sources:['Recipe packs'],preview:'ab'.repeat(16)}}};
  const list=shelfView(index,new URLSearchParams(),meta);
  assert.match(list,/Bowl collection/);assert.match(list,/preview=/);assert.match(list,/1 file/);
  assert.doesNotMatch(shelfView(index,new URLSearchParams({shelf:'Recipes',tab:'recipes'}),meta),/class="card"/);
  assert.match(shelfView(index,new URLSearchParams({shelf:'Recipes',folder:'Bowl collection'}),meta),/One bowl recipes/);
});
test('work queue separates guest, admin and personal staff codes and scopes task writes',async()=>{
  const owner=randomUUID(),staff=randomUUID(),task=randomUUID(),code='fixture-personal-work-code-only';
  const person={id:staff,name:'Colleague',email:'colleague@example.test',code_hash:createHash('sha256').update(code).digest('hex')};
  const user={id:owner,email:'owner@example.test',email_confirmed_at:'2026-01-01'};
  const calls=[];
  const api=async(endpoint,opts={})=>{
 const welcome=welcomeFixture(endpoint);if(welcome)return welcome;
    calls.push([endpoint,opts]);
    if(endpoint.includes('nufi_library_nda_agreements'))return [ndaDocument];
    if(endpoint.includes('nufi_library_nda_acceptances'))return [{id:'existing-test-acceptance'}];
    if(endpoint.includes('consume_password_attempt'))return {allowed:true,retry_after:0};
    if(endpoint.includes('grant_type=password'))return {user,access_token:'fixture'};
    if(endpoint.includes('nufi_members'))return [{user_id:owner,role:'admin',status:'active'}];
    if(endpoint.includes('nufi_library_staff'))return [person];
    if(endpoint.includes('nufi_library_tasks'))return opts.method==='PATCH'?[{id:task}]:[];
    throw new Error(endpoint);
  };
  async function request(fields,cookie='',origin='https://example.test'){
    const headers={};const res={setHeader:(k,v)=>headers[k]=v,end(value){this.value=value;}};
    await handleLibraryWork({method:fields?'POST':'GET',headers:{cookie,host:'example.test',origin},body:fields},res,{env,load:async()=>index,params:new URLSearchParams({assignments:'1'}),apiFactory:()=>api});
    return {status:res.statusCode,html:res.value,cookie:headers['Set-Cookie']?.split(';')[0]};
  }
  assert.equal((await request(null,'__Host-nufi-library=guest')).status,401);
  assert.equal((await request({action:'staff-login',email:person.email,code},'','https://other.example')).status,403);
  const login=await request({action:'admin-login',email:user.email,password:'fixture-password'});
  assert.equal(login.status,303);assert.match((await request(null,login.cookie)).html,/Assign work/);
  assert.equal((await request({action:'create',id:task,staff,item:record.id,title:'Check recipe',due:'2027-01-10',instructions:'Review the ingredients.'},login.cookie)).status,303);
  assert.equal(calls.find(([url])=>url.includes('on_conflict=id'))[1].payload.created_by,owner);
  const staffLogin=await request({action:'staff-login',email:person.email,code});
  assert.equal(staffLogin.status,303);
  assert.doesNotMatch((await request(null,staffLogin.cookie)).html,/Issue new work code/);
  assert.equal((await request({action:'issue-code',staff},staffLogin.cookie)).status,403);
  assert.equal((await request({action:'update',id:task,revision:'1',status:'Ready for review'},staffLogin.cookie)).status,303);
  assert.ok(calls.some(([url,opts])=>opts.method==='PATCH'&&url.includes('staff_id=eq.'+staff)&&url.includes('revision=eq.1')));
  person.code_hash='0'.repeat(64);
  assert.equal((await request(null,staffLogin.cookie)).status,401);
});
