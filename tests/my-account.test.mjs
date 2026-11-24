import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {handleLibraryWork} from '../server/library-work.mjs';
import {changeMyAccount,myAccountScreen} from '../server/my-account.mjs';
import {ndaDocument,welcomeFixture} from './nda-fixture.mjs';
import {verifyTeamPassword} from '../server/team-passwords.mjs';
const env={NUFI_LIBRARY_CATALOGUE_KEY:'x'.repeat(64),SUPABASE_SERVICE_ROLE_KEY:'fixture-service',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_ANON_KEY:'fixture-anon',SITE_URL:'https://fixture.test'};
const digest=s=>createHash('sha256').update(s).digest('hex');
function fixture(){
 const actor={role:'staff',id:randomUUID(),name:'Joyce',access:{}},person={...actor,email:'joyce@example.test',code_hash:digest('original-fixture-passphrase')};
 const calls=[],admin={role:'admin',id:randomUUID()},user={id:admin.id,email:'admin@example.test',email_confirmed_at:'2026-11-19T10:00:00Z',is_anonymous:false,user_metadata:{full_name:'Administrator'}};
 let reauthId=admin.id;
 const api=async(path,o={})=>{
 const welcome=welcomeFixture(path);if(welcome)return welcome;
  calls.push([path,structuredClone(o)]);
  if(path.includes('nufi_library_staff')){if(o.method==='PATCH'){Object.assign(person,o.payload);}return [structuredClone(person)];}
  if(path.includes('nufi_consume_password_attempt'))return {allowed:true,retry_after:0};
  if(path.includes('nufi_members'))return [{user_id:new URL(path,'https://fixture.test').searchParams.get('user_id').slice(3),role:'admin',status:'active'}];
  if(path.includes('nufi_library_nda_agreements'))return [ndaDocument];
  if(path.includes('nufi_library_nda_acceptances'))return [{id:randomUUID()}];
  if(path.includes('/auth/v1/admin/users/'))return user;
  if(path.includes('/auth/v1/token'))return {access_token:'fixture-token',user:{...user,id:reauthId}};
  if(path==='/auth/v1/user'||path.includes('/auth/v1/logout'))return user;
  throw Error('Unexpected fixture endpoint '+path);
 };
 const sign=s=>createHmac('sha256',env.NUFI_LIBRARY_CATALOGUE_KEY).update('library-work:v1:'+s).digest('base64url');
 function cookie(who=actor,hash=person.code_hash){const p=Buffer.from(JSON.stringify({role:who.role,id:who.id,expires:Date.now()/1000+3600,...(who.role==='staff'?{generation:sign(hash)}:{})})).toString('base64url');return '__Host-nufi-library-work='+p+'.'+sign(p);}
 async function request(body=null,who=actor,existing=cookie(who),origin='https://fixture.test'){
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}};
  await handleLibraryWork({method:body?'POST':'GET',body,headers:{cookie:existing,host:'fixture.test',origin}},res,{params:new URLSearchParams({studio:'account'}),env,apiFactory:()=>api,load:async()=>({records:[],files:{}})});return res;
 }
 return {actor,admin,person,user,api,calls,cookie,request,set reauthId(value){reauthId=value;}};
}
test('My account is available with no content permissions and agreements leave the footer',async()=>{
 const f=fixture(),res=await f.request();assert.equal(res.statusCode,200);
 for(const text of ['My account','Profile','Security','Read signed agreement','Download signed agreement'])assert.ok(res.body.includes(text));
 assert.match(res.body,/aria-label="My account"/);assert.doesNotMatch(res.body,/Your confidentiality agreement/);
 assert.doesNotMatch(res.body,/>Team<|name="access_/);assert.doesNotMatch(res.body,new RegExp(f.person.code_hash));
 const copy=await myAccountScreen(f.actor,f.api,new URLSearchParams(),env,{copy:true});assert.doesNotMatch(copy,/name="newPassword"|account-profile/);
});
test('own profile update ignores posted identity, email and permission changes',async()=>{
 const f=fixture(),res=await f.request({action:'account-profile',name:'Joyce Updated',staff:randomUUID(),email:'other@example.test',access_library:'1',role:'admin'});
 assert.equal(res.statusCode,303);assert.equal(f.person.name,'Joyce Updated');assert.equal(f.person.email,'joyce@example.test');assert.deepEqual(f.person.access,{});
 const [path,o]=f.calls.find(([,o])=>o.method==='PATCH');assert.ok(path.includes(f.actor.id));assert.deepEqual(o.payload,{name:'Joyce Updated'});
 assert.equal((await f.request({action:'account-profile',name:'Blocked'},f.actor,f.cookie(),'https://elsewhere.test')).statusCode,403);
});
test('staff password change checks current password, renews this cookie and revokes old staff cookies',async()=>{
 const f=fixture(),old=f.cookie(),next='replacement-fixture-passphrase';
 let res=await f.request({action:'account-password',currentPassword:'incorrect',newPassword:next,confirmPassword:next});assert.equal(res.statusCode,400);assert.equal(f.person.code_hash,digest('original-fixture-passphrase'));
 res=await f.request({action:'account-password',currentPassword:'original-fixture-passphrase',newPassword:next,confirmPassword:next});
 assert.equal(res.statusCode,303);assert.notEqual(f.person.code_hash,digest(next));assert.equal(await verifyTeamPassword(next,f.person),true);assert.ok(res.headers['Set-Cookie']);assert.equal((await f.request(null,f.actor,old)).statusCode,401);
 const fresh=res.headers['Set-Cookie'].split(';')[0];assert.equal((await f.request(null,f.actor,fresh)).statusCode,200);
});
test('password validation never writes and admin changes require a matching freshly verified identity',async()=>{
 const f=fixture();
 await assert.rejects(()=>changeMyAccount({action:'account-password',currentPassword:'original-fixture-passphrase',newPassword:'too short',confirmPassword:'too short'},{actor:f.actor,api:f.api,env,res:{setHeader(){}}}),e=>e.status===400);
 assert.ok(f.calls.every(([,o])=>!o.method));
 f.reauthId=randomUUID();await assert.rejects(()=>changeMyAccount({action:'account-password',currentPassword:'current-admin-password',newPassword:'replacement-admin-password',confirmPassword:'replacement-admin-password'},{actor:f.admin,api:f.api,env,res:{setHeader(){}}}),e=>e.status===403);
 assert.ok(!f.calls.some(([p,o])=>p==='/auth/v1/user'&&o.method==='PUT'));
 f.reauthId=f.admin.id;
 const res=await f.request({action:'account-password',currentPassword:'current-admin-password',newPassword:'replacement-admin-password',confirmPassword:'replacement-admin-password'},f.admin);
 assert.equal(res.statusCode,303);const [,o]=f.calls.find(([p,o])=>p==='/auth/v1/user'&&o.method==='PUT');assert.equal(o.access,'fixture-token');assert.equal(o.service,undefined);
});
