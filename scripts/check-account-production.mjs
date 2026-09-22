/** Public deployment smoke checks only. Does not use James's credentials or send email. */
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
const origin='https://www.nutrition.fitness';
const hash=v=>createHash('sha256').update(v).digest('hex');
const expected=hash(await readFile(new URL('../public/account.mjs',import.meta.url)));
const get=path=>fetch(origin+path,{signal:AbortSignal.timeout(15000),headers:{'Cache-Control':'no-cache'}});
let ready=false,last='Waiting for deployment';
for(let i=0;i<18;i++){
 try{
  const script=await get('/account.mjs?release='+Date.now());
  if(!script.ok||hash(await script.text())!==expected)throw new Error('Latest account client is not deployed yet');
  const res=await get('/api/auth'),body=await res.json();
  if(!res.ok||body.passwordConfigured!==true||body.provisionedAccountsOnly!==true||body.signupConfigured!==false||body.recoveryConfigured!==false||body.configured!==false)throw new Error('Provisioned password login or its database connection is not ready');
  ready=true;break;
 }catch(error){last=error.message;console.log(`Account deployment check ${i+1}/18: ${last}`);if(i<17)await new Promise(r=>setTimeout(r,10000));}
}
if(!ready)throw new Error(last);
const checks=[];
for(const path of ['/login/','/account/','/admin/','/admin/members/','/admin/recipes/','/admin/pages/','/admin/products/','/admin/settings/','/admin/audit/']){
 const res=await get(path);if(!res.ok||!(await res.text()).includes('data-nf-portal'))throw new Error('Account route unavailable: '+path);checks.push({path,status:res.status});
}
for(const path of ['/api/account','/api/manage?section=overview','/api/recipes?scope=accessible']){
 const res=await get(path),data=await res.json();if(![401,403].includes(res.status)||data.user||data.recipes||data.items||!res.headers.get('cache-control')?.includes('no-store'))throw new Error('Guest privacy check failed: '+path);checks.push({path,status:res.status});
}
const post=(payload,from=origin)=>fetch(origin+'/api/auth',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Origin:from,'Content-Type':'application/json'},body:JSON.stringify(payload)});
for(const action of ['signup-password','request-reset']){
 const res=await post({action,email:'release-check@example.invalid',password:'Not a real credential'});if(res.status!==503||res.headers.has('set-cookie'))throw new Error('Email flow is unexpectedly enabled');checks.push({action,status:res.status});
}
const csrf=await post({action:'login-password',email:'release-check@example.invalid',password:'Not a real credential'},'https://example.invalid');
if(csrf.status!==403||csrf.headers.has('set-cookie'))throw new Error('Cross-origin login was not denied');checks.push({action:'foreign-origin',status:csrf.status});
// One non-existent account request verifies provider rejection; this does not sign anyone in.
const incorrect=await post({action:'login-password',email:`release-${randomUUID()}@example.invalid`,password:'Not a real credential'});
if(incorrect.status!==400||incorrect.headers.has('set-cookie'))throw new Error('Provider rejection was not confirmed; expected invalid-credentials response');checks.push({action:'nonexistent-account-login',status:incorrect.status});
const report={status:'passed',origin,verifiedAt:new Date().toISOString(),sourceCommit:process.env.GITHUB_SHA||null,checks,ownerPasswordLoginTested:false,emailDeliveryTested:false};
await mkdir('test-results',{recursive:true});await writeFile('test-results/account-production-smoke.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
