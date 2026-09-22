import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthHandler} from '../api/auth.js';
import {createAccountHandler} from '../api/account.js';
import {session,requireAdmin,membership} from '../server/platform.mjs';

const user={id:'11111111-1111-4111-a111-111111111111',email:'person@example.com',email_confirmed_at:'2026-09-21T12:00:00Z',is_anonymous:false,user_metadata:{first_name:'Pat',admin:true,role:'admin'}};
const member={user_id:user.id,first_name:'Pat',role:'member',status:'active',created_at:'2026-09-21T12:00:00Z',updated_at:'2026-09-21T12:00:00Z'};
const env={SITE_URL:'https://nutrition.fitness',SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'test-public-key',SUPABASE_SERVICE_ROLE_KEY:'test-private-key',TURNSTILE_SITE_KEY:'test-site',TURNSTILE_SECRET_KEY:'test-secret',NUFI_EMAIL_OTP_READY:'true',NUFI_AUTH_CAPTCHA_READY:'true',NUFI_PASSWORD_AUTH_READY:'true',NUFI_PASSWORD_RECOVERY_READY:'true',NUFI_PUBLIC_SIGNUP_READY:'true',NUFI_RECIPE_CONTENT_READY:'true',NUFI_RECIPE_ACCESS_MODE:'registered',NUFI_ACCOUNT_MANAGEMENT_READY:'true',NUFI_RECOVERY_ENCRYPTION_KEY:Buffer.alloc(32,3).toString('base64')};
const credentials={email:user.email,password:'A memorable test password',firstName:'Pat',marketing:false,botToken:'test-captcha'};
const request=(method='GET',body,options={})=>({method,body,headers:{origin:env.SITE_URL,'content-type':'application/json',cookie:'__Host-nufi-access=test-access',...options}});
const response=()=>({code:0,data:null,headers:{},setHeader(k,v){this.headers[k]=v;},getHeader(k){return this.headers[k];},status(code){this.code=code;return this;},json(data){this.data=data;return this;}});
const json=(value,status=200)=>new Response(JSON.stringify(value),{status});
const cookieValue=(res,name)=>res.headers['Set-Cookie']?.find(c=>c.startsWith(`${name}=`))?.split(';')[0];
function backend({identity=user,profile={...member},override}={}){
 const calls=[],grants=new Map();let passwords=0;
 const fetcher=async(url,options={})=>{
  const u=new URL(url),payload=options.body?JSON.parse(options.body):undefined;calls.push({url,options,payload});
  const altered=await override?.(url,options,payload);if(altered)return altered;
  if(url.includes('siteverify'))return json({success:true,hostname:'nutrition.fitness',action:'nufi-account'});
  if(u.pathname==='/auth/v1/user'){if(options.method==='PUT')passwords++;return json(identity);}
  if(u.pathname==='/auth/v1/token')return json({user:identity,access_token:'fresh-password-access',refresh_token:'fresh-refresh',expires_in:3600});
  if(u.pathname==='/auth/v1/verify')return json({user:identity,access_token:payload.type==='recovery'?'reset-only-access':'verified-access',refresh_token:'verified-refresh',expires_in:3600});
  if(u.pathname==='/auth/v1/signup'||u.pathname==='/auth/v1/recover'||u.pathname==='/auth/v1/logout')return json({});
  if(u.pathname==='/rest/v1/nufi_members'){
   if(options.method==='POST'){if(!profile)profile={...payload,updated_at:new Date().toISOString()};return json(null);}
   if(options.method==='PATCH'){profile={...profile,...payload};return json([{first_name:profile.first_name}]);}
   return json(profile?[profile]:[]);
  }
  if(u.pathname==='/rest/v1/nufi_password_recoveries'){
   if(options.method==='POST'){grants.set(payload.token_hash,payload);return json(null);}
   const matches=[...grants.values()].filter(record=>{
    const hash=u.searchParams.get('token_hash'),id=u.searchParams.get('user_id'),expiry=u.searchParams.get('expires_at');
    if(hash&&record.token_hash!==hash.slice(3)||id&&record.user_id!==id.slice(3))return false;
    if(expiry?.startsWith('gt.')&&Date.parse(record.expires_at)<=Date.parse(expiry.slice(3)))return false;
    if(expiry?.startsWith('lte.')&&Date.parse(record.expires_at)>Date.parse(expiry.slice(4)))return false;
    return true;
   });
   if(options.method==='DELETE'){for(const record of matches)grants.delete(record.token_hash);return json(matches);}
  }
  if(u.pathname==='/rest/v1/nufi_workspaces')return json([{version:5,updated_at:'2026-09-21T13:00:00Z',onboarding:{targets:{protein:140}},course_progress:['core-1','core-2','build-1'],favourites:['recipe-a','recipe-b']}]);
  if(u.pathname==='/rest/v1/rpc/nufi_claim_crm')return json([]);
  throw new Error(`Unexpected upstream endpoint ${u.pathname}`);
 };
 return {fetcher,calls,grants,get passwords(){return passwords;}};
}
async function auth(input,store=backend(),options={}){const res=response();await createAuthHandler({env:options.env||env,fetcher:store.fetcher})(request('POST',input,options.headers),res);return res;}

for(const missing of ['NUFI_ACCOUNT_MANAGEMENT_READY','NUFI_PASSWORD_AUTH_READY'])test(`password readiness fails closed without ${missing}`,async()=>{
 const res=response();await createAuthHandler({env:{...env,[missing]:''}})(request(),res);assert.equal(res.data.passwordConfigured,false);
});
test('public password login can run without CAPTCHA or recovery email configuration',async()=>{
 const res=response();await createAuthHandler({env:{...env,TURNSTILE_SITE_KEY:'',TURNSTILE_SECRET_KEY:'',NUFI_AUTH_CAPTCHA_READY:'false',NUFI_RECOVERY_ENCRYPTION_KEY:'',NUFI_PASSWORD_RECOVERY_READY:'false'}})(request(),res);
 assert.equal(res.data.passwordConfigured,true);assert.equal(res.data.recoveryConfigured,false);assert.equal(res.data.captchaRequired,false);
});
test('password verification can be ready independently of legacy OTP sign-in',async()=>{const res=response();await createAuthHandler({env:{...env,NUFI_EMAIL_OTP_READY:'false'}})(request(),res);assert.equal(res.data.passwordConfigured,true);assert.equal(res.data.configured,false);});
test('free account registration is exposed only when explicitly enabled',async()=>{
 const open=response();await createAuthHandler({env:{...env,NUFI_AUTH_MODE:'public',NUFI_EMAIL_OTP_READY:'false',NUFI_PUBLIC_SIGNUP_READY:'true'}})(request(),open);assert.equal(open.data.signupConfigured,true);
 const closed=response();await createAuthHandler({env:{...env,NUFI_AUTH_MODE:'public',NUFI_EMAIL_OTP_READY:'false',NUFI_PUBLIC_SIGNUP_READY:'false'}})(request(),closed);assert.equal(closed.data.signupConfigured,false);
});
test('password login delegates CAPTCHA once and returns only secure cookies',async()=>{
 const store=backend(),res=await auth({action:'login-password',...credentials},store);assert.equal(res.code,200);assert.equal(res.data.status,'signed-in');
 assert.equal(store.calls.filter(c=>c.url.includes('siteverify')).length,0);
 const login=store.calls.find(c=>c.url.includes('grant_type=password'));assert.equal(login.payload.gotrue_meta_security.captcha_token,credentials.botToken);assert.equal(login.options.headers.Authorization,'Bearer test-public-key');
 assert.ok(!JSON.stringify(res.data).includes('fresh-password-access'));
 for(const cookie of res.headers['Set-Cookie']){assert.match(cookie,/HttpOnly; Secure; SameSite=Lax/);assert.ok(!cookie.includes('Domain='));}
});
test('wrong password is a generic rejection with no session',async()=>{const store=backend({override:url=>url.includes('grant_type=password')?json({code:'invalid_credentials'},400):null});const res=await auth({action:'login-password',...credentials},store);assert.equal(res.code,400);assert.match(res.data.error,/email or password/);assert.equal(res.headers['Set-Cookie'],undefined);});
test('missing CAPTCHA blocks password provider calls',async()=>{const store=backend();const res=await auth({action:'login-password',...credentials,botToken:''},store);assert.equal(res.code,400);assert.equal(store.calls.length,0);});
test('password signup requires email verification and strips privilege/redirect input',async()=>{
 const store=backend(),res=await auth({action:'signup-password',...credentials,role:'admin',admin:true,redirectTo:'https://evil.invalid'},store);assert.equal(res.code,200);assert.equal(res.data.status,'verification-required');assert.equal(res.headers['Set-Cookie'],undefined);
 const signup=store.calls.find(c=>c.url.endsWith('/signup'));assert.equal(signup.payload.data.first_name,'Pat');assert.equal(signup.payload.data.role,undefined);assert.equal(signup.payload.redirectTo,undefined);assert.equal(signup.payload.gotrue_meta_security.captcha_token,credentials.botToken);
});
test('auto-confirmed provider signup is rejected and never creates website cookies',async()=>{const store=backend({override:url=>url.endsWith('/signup')?json({user,access_token:'unsafe-autoconfirm'}):null});const res=await auth({action:'signup-password',...credentials},store);assert.equal(res.code,503);assert.equal(res.headers['Set-Cookie'],undefined);assert.ok(store.calls.some(c=>c.url.includes('/logout')));});
test('short signup password never reaches provider',async()=>{const store=backend(),res=await auth({action:'signup-password',...credentials,password:'short'},store);assert.equal(res.code,400);assert.equal(store.calls.length,0);});
for(const action of ['signup-password','login-password','request-reset','verify-recovery','reset-password','logout'])test(`${action} rejects absent and foreign Origin before upstream`,async()=>{
 for(const origin of [undefined,'https://nutrition.fitness.evil.invalid','https://evil.invalid']){const store=backend(),res=await auth({action,...credentials,code:'123456'},store,{headers:{origin}});assert.equal(res.code,403);assert.equal(store.calls.length,0);}
});
test('recovery email does not disclose whether an address exists',async()=>{
 const existing=await auth({action:'request-reset',...credentials});const missing=await auth({action:'request-reset',...credentials},backend({override:url=>url.endsWith('/recover')?json({code:'user_not_found'},400):null}));assert.equal(existing.code,200);assert.equal(missing.code,200);assert.deepEqual(existing.data,missing.data);
});
test('recovery verifies a recovery OTP and issues an opaque reset-only cookie',async()=>{
 const store=backend(),res=await auth({action:'verify-recovery',...credentials,code:'123456'},store,{headers:{cookie:''}});assert.equal(res.code,200);assert.equal(res.data.status,'recovery-verified');
 const verify=store.calls.find(c=>c.url.endsWith('/verify'));assert.equal(verify.payload.type,'recovery');assert.equal(verify.payload.token,'123456');
 assert.equal(store.grants.size,1);const grant=[...store.grants.values()][0];assert.ok(!JSON.stringify(grant).includes('reset-only-access'));assert.match(grant.token_hash,/^[a-f0-9]{64}$/);
 assert.equal(res.headers['Set-Cookie'].length,1);const cookie=cookieValue(res,'__Host-nufi-recovery');assert.match(cookie,/=[A-Za-z0-9_-]{43}$/);assert.ok(!cookie.includes('reset-only-access'));assert.match(res.headers['Set-Cookie'][0],/Max-Age=600/);
 const account=response();await createAccountHandler({env,fetcher:store.fetcher})(request('GET',undefined,{cookie}),account);assert.equal(account.code,401);
});
test('recovery cookie can change its verified user password exactly once',async()=>{
 const store=backend(),verified=await auth({action:'verify-recovery',...credentials,code:'123456'},store);const cookie=cookieValue(verified,'__Host-nufi-recovery');
 const reset=await auth({action:'reset-password',password:'A different long password',access_token:'caller-injected'},store,{headers:{cookie}});assert.equal(reset.code,200);assert.equal(reset.data.status,'password-reset');assert.equal(store.passwords,1);assert.equal(store.grants.size,0);
 const update=store.calls.find(c=>c.url.endsWith('/user')&&c.options.method==='PUT');assert.equal(update.options.headers.Authorization,'Bearer reset-only-access');assert.deepEqual(update.payload,{password:'A different long password'});
 const repeat=await auth({action:'reset-password',password:'Another long test password'},store,{headers:{cookie}});assert.equal(repeat.code,401);assert.equal(store.passwords,1);
});
test('ordinary account cookies and arbitrary request tokens cannot authorize a reset',async()=>{const store=backend(),res=await auth({action:'reset-password',password:'Another long password',access_token:'test-access',refresh_token:'test-refresh'},store);assert.equal(res.code,401);assert.equal(store.passwords,0);assert.equal(store.calls.length,0);});
test('expired recovery and tampered ciphertext never change passwords',async()=>{
 for(const tamper of [record=>record.expires_at=new Date(Date.now()-1000).toISOString(),record=>record.access_ciphertext=Buffer.alloc(100).toString('base64')]){
  const store=backend(),verified=await auth({action:'verify-recovery',...credentials,code:'123456'},store);tamper([...store.grants.values()][0]);const res=await auth({action:'reset-password',password:'Another long password'},store,{headers:{cookie:cookieValue(verified,'__Host-nufi-recovery')}});assert.equal(res.code,401);assert.equal(store.passwords,0);
 }
});
test('incorrect recovery code creates no recovery grant or cookie',async()=>{const store=backend({override:url=>url.endsWith('/verify')?json({code:'otp_expired'},403):null});const res=await auth({action:'verify-recovery',...credentials,code:'123456'},store);assert.equal(res.code,400);assert.equal(store.grants.size,0);assert.equal(res.headers['Set-Cookie'],undefined);});
for(const identity of [{...user,is_anonymous:true},{...user,email_confirmed_at:null}])test(`session and login reject unverified/anonymous identity ${identity.is_anonymous}`,async()=>{
 const store=backend({identity}),res=await auth({action:'login-password',...credentials},store);assert.equal(res.code,401);assert.equal(res.headers['Set-Cookie'],undefined);
 await assert.rejects(()=>session(request(),response(),env,store.fetcher),{status:401});
});
test('suspension is checked on every request and cannot be bypassed by refresh cookies',async()=>{
 const store=backend({profile:{...member,status:'suspended'}}),res=response();await assert.rejects(()=>session(request('GET',undefined,{cookie:'__Host-nufi-access=test-access; __Host-nufi-refresh=test-refresh'}),res,env,store.fetcher),{status:403});assert.ok(res.headers['Set-Cookie'].every(c=>c.includes('Max-Age=0')));assert.ok(!store.calls.some(c=>c.url.includes('refresh_token')));
});
test('fresh protected member roles overrule editable metadata and bootstrap after demotion',async()=>{
 const store=backend(),current=await session(request(),response(),env,store.fetcher);await assert.rejects(()=>requireAdmin(user,current.api,{...env,NUFI_ADMIN_USER_IDS:user.id}),{status:403});assert.equal(current.member.role,'member');
});
test('missing member seed never accepts user metadata roles and cannot overwrite racing rows',async()=>{
 const store=backend({profile:null}),current=await session(request(),response(),env,store.fetcher);assert.equal(current.member.role,'member');const insert=store.calls.find(c=>c.url.includes('nufi_members?on_conflict'));assert.equal(insert.payload.role,'member');assert.match(insert.options.headers.Prefer,/ignore-duplicates/);
});
test('account reads expose only current user profile and their workspace metadata',async()=>{
 const store=backend(),res=response();await createAccountHandler({env,fetcher:store.fetcher})(request(),res);assert.equal(res.code,200);assert.deepEqual(res.data.user,{id:user.id,email:user.email,firstName:'Pat',admin:false,status:'active'});assert.deepEqual(res.data.workspace,{version:5,updatedAt:'2026-09-21T13:00:00Z',savedRecipes:2,courseProgress:['core-1','core-2','build-1']});assert.deepEqual(res.data.access,{recipes:'account'});assert.deepEqual(res.data.onboarding,{targets:{protein:140}});
 const workspace=store.calls.find(c=>c.url.includes('/nufi_workspaces'));assert.ok(workspace.url.includes(user.id));assert.equal(workspace.options.headers.Authorization,'Bearer test-access');assert.ok(!JSON.stringify(res.data).includes('test-access'));assert.equal(res.headers['Cache-Control'],'no-store, private');
});
test('profile change refuses role, identity and status inputs',async()=>{
 for(const extra of [{role:'admin'},{userId:'another-person'},{status:'active'}]){const store=backend(),res=response();await createAccountHandler({env,fetcher:store.fetcher})(request('PATCH',{firstName:'James',...extra}),res);assert.equal(res.code,400);assert.ok(!store.calls.some(c=>c.options.method==='PATCH'));}
});
test('profile update is scoped to the verified active user and checks saved representation',async()=>{
 const store=backend(),res=response();await createAccountHandler({env,fetcher:store.fetcher})(request('PATCH',{firstName:'James'}),res);assert.equal(res.code,200);assert.deepEqual(res.data.profile,{firstName:'James'});const patch=store.calls.find(c=>c.options.method==='PATCH');assert.ok(patch.url.includes(user.id));assert.ok(patch.url.includes('status=eq.active'));assert.deepEqual(Object.keys(patch.payload).sort(),['first_name','updated_at']);
});
test('password change reauthenticates the session email and signs out after success',async()=>{
 const store=backend(),res=response();await createAccountHandler({env,fetcher:store.fetcher})(request('POST',{action:'change-password',email:'other@example.com',currentPassword:'Old password',password:'A completely new password',botToken:'fresh-captcha'}),res);assert.equal(res.code,200);assert.equal(res.data.status,'password-changed');assert.equal(store.passwords,1);const login=store.calls.find(c=>c.url.includes('grant_type=password'));assert.equal(login.payload.email,user.email);assert.equal(login.payload.password,'Old password');assert.equal(login.payload.gotrue_meta_security.captcha_token,'fresh-captcha');assert.ok(res.headers['Set-Cookie'].every(c=>c.includes('Max-Age=0')));
});
test('wrong current password and identity mismatch cannot update account password',async()=>{
 for(const loginResponse of [json({code:'invalid_credentials'},400),json({user:{...user,id:'22222222-2222-4222-a222-222222222222'},access_token:'other-token'})]){
  const store=backend({override:url=>url.includes('grant_type=password')?loginResponse:null}),res=response();await createAccountHandler({env,fetcher:store.fetcher})(request('POST',{action:'change-password',currentPassword:'Wrong password',password:'A completely new password',botToken:'fresh-captcha'}),res);assert.ok([400,401].includes(res.code));assert.equal(store.passwords,0);
 }
});
test('account writes reject CSRF before reading protected data',async()=>{for(const method of ['PATCH','POST']){const store=backend(),res=response();await createAccountHandler({env,fetcher:store.fetcher})(request(method,{firstName:'James'},{origin:'https://evil.invalid'}),res);assert.equal(res.code,403);assert.equal(store.calls.length,0);}});
test('account management does not fabricate profiles when storage is not enabled',async()=>{const store=backend(),res=response();await createAccountHandler({env:{...env,NUFI_ACCOUNT_MANAGEMENT_READY:'false'},fetcher:store.fetcher})(request(),res);assert.equal(res.code,503);assert.equal(store.calls.length,0);});

test('provider failure cannot prevent clearing local sign-in and recovery cookies',async()=>{
 for(const failedEndpoint of ['/auth/v1/user','/auth/v1/logout']){const store=backend({override:url=>url.includes(failedEndpoint)?json({},503):null});const res=await auth({action:'logout'},store);assert.equal(res.code,200);assert.equal(res.data.status,'signed-out');for(const name of ['__Host-nufi-access','__Host-nufi-refresh','__Host-nufi-recovery'])assert.ok(res.headers['Set-Cookie'].some(c=>c.startsWith(`${name}=`)&&c.includes('Max-Age=0')));}
});
for(const [config,status] of [[{NUFI_RECIPE_CONTENT_READY:'false'},'pending'],[{NUFI_RECIPE_ACCESS_MODE:''},'pending'],[{NUFI_RECIPE_ACCESS_MODE:'membership'},'membership-required'],[{NUFI_EMAIL_OTP_READY:'false',NUFI_PASSWORD_AUTH_READY:'false'},'pending']])test(`account recipe access reflects configured state ${JSON.stringify(config)}`,async()=>{const store=backend(),res=response();await createAccountHandler({env:{...env,...config},fetcher:store.fetcher})(request(),res);assert.equal(res.code,200);assert.equal(res.data.access.recipes,status);});

test('password-only signup verification cannot become generic recovery-token sign-in',async()=>{
 const store=backend(),res=await auth({action:'verify-code',...credentials,code:'123456'},store,{env:{...env,NUFI_EMAIL_OTP_READY:'false'}});assert.equal(res.code,200);assert.equal(res.data.status,'signed-in');const verify=store.calls.find(c=>c.url.endsWith('/verify'));assert.equal(verify.payload.type,'signup');
});
