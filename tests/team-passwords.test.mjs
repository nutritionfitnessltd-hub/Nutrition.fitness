import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {createTeamPasswordLink,readTeamPasswordLink,completeTeamPassword,verifyTeamPassword,hashTeamPassword,teamPasswordPage} from '../server/team-passwords.mjs';
import {sendWelcome,welcomeEmail,resetEmail} from '../server/library-welcome.mjs';
import {welcomeGeneration} from '../server/studio-mail-private.mjs';
import {handleLibraryWork} from '../server/library-work.mjs';
import {ndaDocument} from './nda-fixture.mjs';
const env={NUFI_LIBRARY_CATALOGUE_KEY:'fixture-private-key',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',NUFI_NOTIFICATION_BASE_URL:'https://team.example.test',EXCHANGE_TENANT_ID:'fixture',EXCHANGE_CLIENT_ID:'fixture',EXCHANGE_CLIENT_SECRET:'fixture'};
const hash=value=>createHash('sha256').update(value).digest('hex');
const tokenOf=link=>new URL(link).searchParams.get('token');
function fixture(){
 const person={id:randomUUID(),name:'Colleague',email:'colleague@example.test',code_hash:hash('previous fixture password'),access:{library:true}},rows=new Map(),sent=[],writes=[];
 let blocked=false;
 const api=async(path,o={})=>{
  const q=new URL(path,'https://fixture').searchParams;
  if(path.includes('nufi_consume_password_attempt'))return {allowed:!blocked,retry_after:blocked?60:0};
  if(path.includes('nufi_library_staff')){
   if(q.get('id')&&q.get('id')!=='eq.'+person.id||q.get('email')&&q.get('email')!=='eq.'+person.email||q.get('code_hash')&&q.get('code_hash')!=='eq.'+person.code_hash)return [];
   if(o.method==='PATCH'){writes.push(o.payload);Object.assign(person,o.payload);}
   return [structuredClone(person)];
  }
  if(path.includes('rpc/nufi_studio_save')){
   const {item,document,expected}=o.payload;if((rows.get(item)?.revision||0)!==expected)return [];
   const row={id:item,payload:structuredClone(document),revision:expected+1};rows.set(item,row);return [row];
  }
  if(path.includes('nufi_studio_items'))return rows.has(q.get('id')?.slice(3))?[rows.get(q.get('id').slice(3))]:[];
  if(path.includes('nufi_library_nda_agreements'))return [ndaDocument];
  if(path.includes('nufi_library_nda_acceptances'))return [{id:'test'}];
  if(path.includes('nufi_library_tasks'))return [];
  throw Error(path);
 };
 const fetcher=async(url,o)=>{if(url.includes('/token'))return new Response(JSON.stringify({access_token:'fixture'}));sent.push(JSON.parse(o.body));return new Response(null,{status:202});};
 const actor={role:'admin',id:randomUUID()},context={api,env,fetcher,actor,origin:'https://untrusted.example'};
 async function request(params,body=null,extra={}){
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.body=v;}};
  await handleLibraryWork({method:body?'POST':'GET',body,headers:{host:'team.example.test',origin:'https://team.example.test',...extra}},res,{params:new URLSearchParams(params),apiFactory:()=>api,env,fetcher,load:async()=>({records:[],files:{}})});return res;
 }
 const cookie=()=>{const generation=createHmac('sha256',env.NUFI_LIBRARY_CATALOGUE_KEY).update('library-work:v1:'+person.code_hash).digest('base64url'),p=Buffer.from(JSON.stringify({role:'staff',id:person.id,generation,expires:Date.now()/1000+3600})).toString('base64url');return '__Host-nufi-library-work='+p+'.'+createHmac('sha256',env.NUFI_LIBRARY_CATALOGUE_KEY).update('library-work:v1:'+p).digest('base64url');};
 return {person,api,context,rows,sent,writes,request,cookie,set blocked(v){blocked=v;}};
}
test('setup and reset emails contain a private secure button and no initial password',async()=>{
 for(const purpose of ['setup','reset']){
  const f=fixture(),before=f.person.code_hash,mail=purpose==='setup'?welcomeEmail(f.person,{origin:env.NUFI_NOTIFICATION_BASE_URL}):resetEmail(f.person);
  const fields={staff:f.person.id,requestId:randomUUID(),generation:welcomeGeneration(env,f.person),subject:mail.subject,message:mail.message};
  assert.equal((await sendWelcome(fields,f.context,purpose)).state,'accepted');
  const html=f.sent[0].message.body.content;
  assert.match(html,new RegExp('>'+(purpose==='setup'?'Set':'Reset')+' your password</a>'));
  assert.doesNotMatch(html,/Nutrition@123|Password:|SET_PASSWORD_LINK|RESET_PASSWORD_LINK|untrusted\.example/);
  const link=html.match(/href="(https:\/\/team\.example\.test\/content-library\/\?work=1&amp;teamPassword=1&amp;token=[^"]+)"/)[1].replaceAll('&amp;','&');
  assert.equal((await readTeamPasswordLink(tokenOf(link),f.api,env)).purpose,purpose);
  assert.equal(f.person.code_hash,before);assert.equal(f.writes.length,0);
  assert.ok(!JSON.stringify([...f.rows.values()]).includes(tokenOf(link)));
  await sendWelcome(fields,f.context,purpose);assert.equal(f.sent.length,1);
 }
});
test('GET does not consume an email link; saving uses scrypt and invalidates links and sessions',async()=>{
 const f=fixture(),oldCookie=f.cookie(),token=tokenOf(createTeamPasswordLink(f.person,env)),fields={action:'complete-team-password',token,password:'A fresh team passphrase',confirmPassword:'A fresh team passphrase'};
 for(let i=0;i<2;i++){const get=await f.request({work:'1',teamPassword:'1',token});assert.equal(get.statusCode,200);assert.match(get.body,/Save password/);assert.equal(get.headers['Referrer-Policy'],'strict-origin');}
 assert.equal(f.writes.length,0);
 const saved=await f.request({work:'1',teamPassword:'1'},fields);assert.equal(saved.statusCode,200);assert.match(saved.body,/Your password is saved/);
 assert.ok(saved.headers['Set-Cookie'].every(c=>c.includes('Max-Age=0')));
 assert.equal(await verifyTeamPassword(fields.password,f.person),true);assert.notEqual(f.person.code_hash,hash(fields.password));
 assert.equal((await f.request({work:'1',teamPassword:'1'},fields)).statusCode,400);assert.equal(f.writes.length,1);
 assert.equal((await f.request({work:'1',assignments:'1'},null,{cookie:oldCookie})).statusCode,401);
 assert.equal((await f.request({work:'1'},{action:'staff-login',email:f.person.email,password:fields.password})).statusCode,303);
});
test('expired, tampered, disabled and changed-email links cannot set passwords',async()=>{
 const f=fixture(),now=Date.now(),expired=tokenOf(createTeamPasswordLink(f.person,env,'reset',now-3601000));
 await assert.rejects(readTeamPasswordLink(expired,f.api,env),{status:400});
 const token=tokenOf(createTeamPasswordLink(f.person,env));
 await assert.rejects(readTeamPasswordLink('x'+token,f.api,env),{status:400});
 f.person.email='changed@example.test';await assert.rejects(readTeamPasswordLink(token,f.api,env),{status:400});
 f.person.email='colleague@example.test';f.person.code_hash=null;await assert.rejects(readTeamPasswordLink(token,f.api,env),{status:400});assert.equal(f.writes.length,0);
});
test('a simultaneous reset can update a password only once',async()=>{
 const f=fixture(),token=tokenOf(createTeamPasswordLink(f.person,env)),fields={token,password:'Concurrent fresh password',confirmPassword:'Concurrent fresh password'};
 const results=await Promise.allSettled([completeTeamPassword(fields,f.api,env),completeTeamPassword(fields,f.api,env)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.writes.length,1);
});
test('password validation and foreign origins cannot mutate access',async()=>{
 const f=fixture(),token=tokenOf(createTeamPasswordLink(f.person,env)),fields={action:'complete-team-password',token,password:'too short',confirmPassword:'different'};
 let result=await f.request({teamPassword:'1'},fields);assert.equal(result.statusCode,400);assert.match(result.body,/name="token"/);assert.match(result.body,/12 to 128/);
 assert.equal((await f.request({teamPassword:'1'},fields,{origin:'https://evil.test'})).statusCode,403);
 assert.equal((await f.request({teamPassword:'1',accountPreview:randomUUID()},fields)).statusCode,403);
 assert.equal(f.writes.length,0);assert.deepEqual(f.person.access,{library:true});
});
test('forgot-password responses hide unknown and disabled accounts and respect throttling',async()=>{
 const f=fixture(),known=await f.request({teamPassword:'forgot'},{action:'request-team-reset',email:f.person.email});
 assert.equal(known.statusCode,200);assert.equal(f.sent.length,1);assert.match(f.sent[0].message.subject,/Reset/);
 const unknown=await f.request({teamPassword:'forgot'},{action:'request-team-reset',email:'unknown@example.test'});assert.equal(unknown.body,known.body);
 f.person.code_hash=null;const disabled=await f.request({teamPassword:'forgot'},{action:'request-team-reset',email:f.person.email});assert.equal(disabled.body,known.body);assert.equal(f.sent.length,1);
 f.blocked=true;assert.equal((await f.request({teamPassword:'forgot'},{action:'request-team-reset',email:f.person.email})).statusCode,429);
});
test('password hashing is account-salted, legacy compatible, and pages escape link values',async()=>{
 const f=fixture(),password='A secure test passphrase';
 assert.notEqual(await hashTeamPassword(password,f.person.id),await hashTeamPassword(password,randomUUID()));
 assert.equal(await verifyTeamPassword('previous fixture password',f.person),true);
 assert.equal(await verifyTeamPassword('wrong password',f.person),false);
 const html=teamPasswordPage({token:'"><script>bad</script>'});assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
});
