import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthHandler} from '../api/auth.js';
import {createAccountHandler} from '../api/account.js';
import {session,requireAdmin} from '../server/platform.mjs';
const user={id:'11111111-1111-4111-a111-111111111111',email:'owner@example.com',email_confirmed_at:'2026-09-21T12:00:00Z',is_anonymous:false,user_metadata:{admin:true,role:'admin'}};
const member={user_id:user.id,first_name:'Owner',role:'admin',status:'active'};
const env={SITE_URL:'https://nutrition.fitness',SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'public-fixture-key',SUPABASE_SERVICE_ROLE_KEY:'server-fixture-key',NUFI_AUTH_MODE:'provisioned',NUFI_ACCOUNT_MANAGEMENT_READY:'true',NUFI_PASSWORD_AUTH_READY:'false',NUFI_EMAIL_OTP_READY:'false',NUFI_RECIPE_CONTENT_READY:'true',NUFI_RECIPE_ACCESS_MODE:'registered'};
const req=(method='GET',body,headers={})=>({method,body,headers:{origin:env.SITE_URL,'content-type':'application/json',...headers}});
const response=()=>({code:0,data:null,headers:{},setHeader(k,v){this.headers[k]=v;},getHeader(k){return this.headers[k];},status(n){this.code=n;return this;},json(data){this.data=data;return this;}});
const json=(value,status=200)=>new Response(JSON.stringify(value),{status});
function backend({identity=user,profile=member,budget={allowed:true,retry_after:0},override}={}){
 const calls=[];
 const fetcher=async(url,options={})=>{
  const path=new URL(url).pathname,payload=options.body?JSON.parse(options.body):null;calls.push({path,url,options,payload});
  const replacement=await override?.(path,options,payload);if(replacement)return replacement;
  if(path==='/rest/v1/nufi_login_limits')return json([]);
  if(path==='/rest/v1/rpc/nufi_consume_password_attempt')return json(budget);
  if(path==='/auth/v1/token')return json({user:identity,access_token:'fixture-session',refresh_token:'fixture-refresh',expires_in:3600});
  if(path==='/auth/v1/user')return json(identity);
  if(path==='/auth/v1/logout')return json({});
  if(path==='/rest/v1/nufi_members')return json(profile?[profile]:[]);
  if(path==='/rest/v1/nufi_workspaces')return json([]);
  throw new Error('Unexpected endpoint: '+path);
 };
 return {calls,fetcher};
}
async function auth(input,{store=backend(),config=env,method='POST',headers={}}={}){const res=response();await createAuthHandler({env:config,fetcher:store.fetcher})(req(method,input,headers),res);return {res,store};}
const login={action:'login-password',email:user.email,password:'Owner password fixture'};

test('provisioned readiness needs no email sender, recovery key or public CAPTCHA configuration',async()=>{
 const {res}=await auth(undefined,{method:'GET'});assert.equal(res.code,200);assert.equal(res.data.passwordConfigured,true);assert.equal(res.data.provisionedAccountsOnly,true);assert.equal(res.data.configured,false);assert.equal(res.data.signupConfigured,false);assert.equal(res.data.recoveryConfigured,false);assert.equal(res.data.passwordChangeConfigured,false);assert.equal(res.data.captchaRequired,false);assert.ok(!JSON.stringify(res.data).includes('fixture-key'));
});
test('provisioned readiness fails closed when limiter storage or credentials do not work',async()=>{
 const store=backend({override:path=>path==='/rest/v1/nufi_login_limits'?json({code:'PGRST205'},404):null});const {res}=await auth(undefined,{method:'GET',store});assert.equal(res.data.passwordConfigured,false);
});
for(const key of ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','SITE_URL','NUFI_ACCOUNT_MANAGEMENT_READY'])test('provisioned readiness requires '+key,async()=>{const {res}=await auth(undefined,{method:'GET',config:{...env,[key]:''}});assert.equal(res.data.passwordConfigured,false);});
test('pre-created active admin signs in using provider password and protected cookie session',async()=>{
 const {res,store}=await auth({...login,email:'  OWNER@EXAMPLE.COM '});assert.equal(res.code,200);assert.deepEqual(res.data,{status:'signed-in'});
 assert.equal(store.calls[0].path,'/rest/v1/rpc/nufi_consume_password_attempt');assert.match(store.calls[0].payload.account_bucket,/^[a-f0-9]{64}$/);assert.equal(store.calls[0].options.headers.Authorization,'Bearer server-fixture-key');
 const signIn=store.calls.find(c=>c.path==='/auth/v1/token');assert.equal(signIn.payload.email,user.email);assert.equal(signIn.payload.password,login.password);assert.equal(signIn.payload.gotrue_meta_security,undefined);assert.equal(signIn.options.headers.Authorization,'Bearer public-fixture-key');
 assert.ok(store.calls.every(c=>!['/auth/v1/signup','/auth/v1/recover','/auth/v1/otp'].includes(c.path)));
 assert.ok(!JSON.stringify(res.data).includes('fixture-session'));assert.equal(res.headers['Set-Cookie'].length,2);for(const c of res.headers['Set-Cookie'])assert.match(c,/HttpOnly; Secure; SameSite=Lax/);
});
for(const action of ['signup-password','send-code','verify-code','request-reset','verify-recovery','reset-password'])test('provisioned test blocks '+action+' even when unrelated public flags are true',async()=>{
 const {res,store}=await auth({...login,action},{config:{...env,NUFI_PASSWORD_AUTH_READY:'true',NUFI_EMAIL_OTP_READY:'true'}});assert.equal(res.code,503);assert.equal(store.calls.length,0);assert.equal(res.headers['Set-Cookie'],undefined);
});
test('wrong password returns generic rejection and no cookies',async()=>{const store=backend({override:path=>path==='/auth/v1/token'?json({code:'invalid_credentials'},400):null});const {res}=await auth(login,{store});assert.equal(res.code,400);assert.match(res.data.error,/email or password/);assert.equal(res.headers['Set-Cookie'],undefined);});
for(const [label,settings] of [['unprovisioned',{profile:null}],['suspended',{profile:{...member,status:'suspended'}}],['unconfirmed',{identity:{...user,email_confirmed_at:null}}],['anonymous',{identity:{...user,is_anonymous:true}}]])test(label+' identities cannot get a website session',async()=>{
 const store=backend(settings),{res}=await auth(login,{store});assert.equal(res.code,400);assert.equal(res.headers['Set-Cookie'],undefined);assert.ok(!store.calls.some(c=>c.path==='/rest/v1/nufi_members'&&c.options.method==='POST'));assert.ok(store.calls.some(c=>c.path==='/auth/v1/logout'));
});
test('provisioned membership never assigns an admin role from user-editable metadata',async()=>{
 const store=backend({profile:{...member,role:'member'}}),res=response();const current=await session(req('GET',null,{cookie:'__Host-nufi-access=fixture-session'}),res,env,store.fetcher);await assert.rejects(()=>requireAdmin(user,current.api,env),{status:403});assert.equal(current.member.role,'member');
});
test('shared session paths also fail closed when provisioned membership checking is disabled',async()=>{
 const store=backend();await assert.rejects(()=>session(req('GET',null,{cookie:'__Host-nufi-access=fixture-session'}),response(),{...env,NUFI_ACCOUNT_MANAGEMENT_READY:'false'},store.fetcher),{status:503});
});
test('exhausted login budget returns retry time without calling provider',async()=>{
 const store=backend({budget:{allowed:false,retry_after:500}}),{res}=await auth(login,{store});assert.equal(res.code,429);assert.equal(res.headers['Retry-After'],'500');assert.ok(!store.calls.some(c=>c.path==='/auth/v1/token'));assert.equal(res.headers['Set-Cookie'],undefined);
});
for(const budget of [null,{},true,{allowed:true,retry_after:-1},{allowed:true,retry_after:1.5},{allowed:'true',retry_after:0}])test('malformed limiter response is not permission to log in '+JSON.stringify(budget),async()=>{
 const store=backend({budget}),{res}=await auth(login,{store});assert.equal(res.code,503);assert.equal(store.calls.length,1);
});
test('limiter outage does not fall back to unthrottled login',async()=>{const store=backend({override:path=>path.includes('nufi_consume_password_attempt')?json({},503):null}),{res}=await auth(login,{store});assert.equal(res.code,503);assert.equal(store.calls.length,1);});
for(const origin of [undefined,'https://evil.invalid'])test('foreign or absent Origin is rejected before limiter and provider '+origin,async()=>{const {res,store}=await auth(login,{headers:{origin}});assert.equal(res.code,403);assert.equal(store.calls.length,0);});
test('missing password is rejected before provider and limiter',async()=>{const {res,store}=await auth({...login,password:''});assert.equal(res.code,400);assert.equal(store.calls.length,0);});
test('configured provider CAPTCHA still requires a real client token',async()=>{
 const config={...env,TURNSTILE_SITE_KEY:'real-site',TURNSTILE_SECRET_KEY:'real-secret',NUFI_AUTH_CAPTCHA_READY:'true'};const missing=await auth(login,{config});assert.equal(missing.res.code,400);assert.ok(!missing.store.calls.some(c=>c.path==='/auth/v1/token'));
 const present=await auth({...login,botToken:'fresh-token'},{config});assert.equal(present.res.code,200);assert.equal(present.store.calls.find(c=>c.path==='/auth/v1/token').payload.gotrue_meta_security.captcha_token,'fresh-token');
});
test('partially configured CAPTCHA never silently falls back to no CAPTCHA',async()=>{
 const config={...env,TURNSTILE_SITE_KEY:'real-site'},ready=await auth(null,{config,method:'GET'});assert.equal(ready.res.data.passwordConfigured,false);const {res}=await auth(login,{config});assert.equal(res.code,503);
});
test('account and private-recipe capability work without SMTP but password changes remain off',async()=>{
 const store=backend(),res=response();await createAccountHandler({env,fetcher:store.fetcher})(req('GET',null,{cookie:'__Host-nufi-access=fixture-session'}),res);assert.equal(res.code,200);assert.equal(res.data.user.admin,true);assert.equal(res.data.access.recipes,'account');
 const changed=response();await createAccountHandler({env,fetcher:store.fetcher})(req('POST',{action:'change-password',currentPassword:'fixture',password:'another fixture password'},{cookie:'__Host-nufi-access=fixture-session'}),changed);assert.equal(changed.code,503);
});
test('logout remains available without email capabilities',async()=>{
 const {res}=await auth({action:'logout'},{headers:{cookie:'__Host-nufi-access=fixture-session'}});assert.equal(res.code,200);assert.equal(res.data.status,'signed-out');assert.equal(res.headers['Set-Cookie'].length,3);assert.ok(res.headers['Set-Cookie'].every(c=>c.includes('Max-Age=0')));
});
