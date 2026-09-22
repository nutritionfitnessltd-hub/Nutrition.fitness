import test from 'node:test';
import assert from 'node:assert/strict';
import {provisionedReadiness} from '../server/account-readiness.mjs';
import {createAuthHandler} from '../api/auth.js';
const env={SITE_URL:'https://example.test',SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'fixture-public',SUPABASE_SERVICE_ROLE_KEY:'fixture-secret-do-not-return',NUFI_AUTH_MODE:'provisioned',NUFI_ACCOUNT_MANAGEMENT_READY:'true'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status});
const unreachable=async()=>{throw new Error('must not call provider');};
test('missing settings disclose names only, never other settings or values',async()=>{
 const state=await provisionedReadiness({...env,SUPABASE_SERVICE_ROLE_KEY:'',EXTRA_SECRET:'not-disclosed'},unreachable);
 assert.deepEqual(state,{ready:false,state:'missing-settings',missingSettings:['SUPABASE_SERVICE_ROLE_KEY']});
});
test('empty and whitespace settings are not ready',async()=>{
 for(const key of ['SITE_URL','SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY']) {
  const state=await provisionedReadiness({...env,[key]:'  '},unreachable);
  assert.equal(state.ready,false);assert.deepEqual(state.missingSettings,[key]);
 }
});
test('invalid URL and inactive permissions are distinguishable without values',async()=>{
 assert.deepEqual(await provisionedReadiness({...env,SUPABASE_URL:'not-a-url'},unreachable),{ready:false,state:'invalid-settings'});
 assert.deepEqual(await provisionedReadiness({...env,NUFI_ACCOUNT_MANAGEMENT_READY:'false'},unreachable),{ready:false,state:'account-permissions-disabled'});
});
test('partial provider CAPTCHA does not fall back to unprotected readiness',async()=>{
 assert.deepEqual(await provisionedReadiness({...env,TURNSTILE_SITE_KEY:'site'},unreachable),{ready:false,state:'security-check-incomplete'});
});
for(const [status,code,state] of [[401,'invalid_token','server-access-denied'],[403,'42501','server-access-denied'],[404,'PGRST205','database-not-ready'],[503,'private-provider-detail','connection-unavailable']]) {
 test('provider '+status+' maps to a fixed safe status',async()=>{
  const out=await provisionedReadiness(env,async()=>json({code,message:'do-not-disclose-provider-details'},status));
  assert.deepEqual(out,{ready:false,state});
  assert.ok(!JSON.stringify(out).includes('fixture-'));assert.ok(!JSON.stringify(out).includes('provider-details'));
 });
}
test('readiness uses existing server-authenticated zero-row GET only',async()=>{
 let calls=0;
 const state=await provisionedReadiness(env,async(url,options)=>{
  calls++;assert.equal(url,'https://example.supabase.co/rest/v1/nufi_login_limits?select=bucket&limit=0');
  assert.equal(options.method,'GET');assert.equal(options.body,undefined);
  assert.equal(options.headers.Authorization,'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY);
  return json([]);
 });
 assert.equal(calls,1);assert.deepEqual(state,{ready:true,state:'ready'});
});
test('unexpected payload and network errors fail closed without leaking messages',async()=>{
 for(const fetcher of [async()=>json({unexpected:true}),async()=>{throw new Error('sensitive detail');}])
  assert.deepEqual(await provisionedReadiness(env,fetcher),{ready:false,state:'connection-unavailable'});
});
test('public auth endpoint reports exact missing names with no-store and no secrets',async()=>{
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(s){this.code=s;return this;},json(v){this.data=v;return this;}};
 await createAuthHandler({env:{...env,SUPABASE_ANON_KEY:''},fetcher:unreachable})({method:'GET',headers:{}},res);
 assert.equal(res.code,200);assert.equal(res.data.passwordConfigured,false);assert.equal(res.data.signupConfigured,false);assert.equal(res.data.recoveryConfigured,false);
 assert.deepEqual(res.data.connection,{ready:false,state:'missing-settings',missingSettings:['SUPABASE_ANON_KEY']});
 assert.match(res.headers['Cache-Control'],/no-store/);assert.ok(!JSON.stringify(res.data).includes('fixture-secret'));
});
