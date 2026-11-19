import {ndaDocument} from './nda-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createHash,randomUUID} from 'node:crypto';
import {createLibraryReader} from '../server/library-reader.mjs';
import {HttpError} from '../server/platform.mjs';

test('one login protects all entry points and admin-created team users share it',async()=>{
  const adminId=randomUUID(),fileId='c'.repeat(64),staff=new Map(),saved=[];
  let blocked=false;
  const env={NUFI_LIBRARY_CATALOGUE_KEY:'a'.repeat(64),NUFI_LIBRARY_PASSWORD_SHA256:createHash('sha256').update('fixture-shared').digest('hex'),SUPABASE_SERVICE_ROLE_KEY:'fixture-only',SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'fixture',SITE_URL:'https://example.test'};
  const index={version:1,records:[],files:{[fileId]:{name:'Sample.pdf',type:'application/pdf'}}};
  const api=async(endpoint,opts={})=>{
    if(endpoint.includes('nufi_library_nda_agreements'))return [ndaDocument];
    if(endpoint.includes('nufi_library_nda_acceptances'))return [{id:'existing-test-acceptance'}];
    const query=new URL(endpoint,'https://example.invalid').searchParams;
    if(endpoint.includes('consume_password_attempt'))return {allowed:!blocked,retry_after:blocked?60:0};
    if(endpoint.includes('grant_type=password')){
      if(opts.payload.email!=='admin@example.test'||opts.payload.password!=='fixture-admin-password'){
        const e=new HttpError(401,'Invalid');e.upstreamStatus=400;throw e;
      }
      return {user:{id:adminId,email:'admin@example.test',email_confirmed_at:'2026-01-01'},access_token:'fixture-only'};
    }
    if(endpoint.includes('nufi_members'))return [{user_id:adminId,role:'admin',status:'active'}];
    if(endpoint.includes('nufi_library_staff')){
      if(opts.method==='POST'){
        if([...staff.values()].some(p=>p.email===opts.payload.email))throw new HttpError(409,'Duplicate');
        const person={id:randomUUID(),...opts.payload};staff.set(person.id,person);saved.push(opts.payload);return [person];
      }
      const rows=[...staff.values()].filter(p=>(!query.has('email')||p.email===query.get('email').slice(3))&&(!query.has('id')||p.id===query.get('id').slice(3)));
      if(opts.method==='PATCH')for(const p of rows)Object.assign(p,opts.payload);
      return rows;
    }
    if(endpoint.includes('/auth/v1/logout'))return {};
    return [];
  };
  const handler=createLibraryReader({env,apiFactory:()=>api,load:async()=>index,fetchFile:async()=>({stream:new Response('Private file bytes').body})});
  const server=createServer(async(req,res)=>{
    if(req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;req.body=body;}
    await handler(req,res);
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port,origin=base.replace('http:','https:');
  const request=(path='',fields=null,cookie='',site=origin)=>fetch(base+'/content-library/'+path,{method:fields?'POST':'GET',body:fields?new URLSearchParams(fields):undefined,headers:{cookie,origin:site},redirect:'manual'});
  const cookieOf=res=>res.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
  try{
    for(const path of ['', '?work=1&studio=home','?work=1&studio=team','?file='+fileId]){
      const response=await request(path),html=await response.text();
      assert.equal(response.status,401);assert.equal((html.match(/<form /g)||[]).length,1);
      assert.doesNotMatch(html,/<aside|Studio navigation|Personal work code|My assignments/);
      assert.match(html,/name="email"/);assert.match(html,/name="password"/);
    }
    const denied=await request('',{action:'sign-in',email:'admin@example.test',password:'fixture-admin-password'},'','https://other.example');
    assert.equal(denied.status,403);assert.ok(!denied.headers.has('set-cookie'));
    const login=await request('',{action:'sign-in',email:'admin@example.test',password:'fixture-admin-password'});
    assert.equal(login.status,303);const adminCookie=cookieOf(login);
    assert.match(login.headers.get('location'),/studio=home/);
    const landing=await request('',null,adminCookie);assert.equal(landing.status,303);assert.match(landing.headers.get('location'),/studio=home/);
    for(const path of ['?work=1','?work=1&studio=home']){
      const dashboard=await request(path,null,adminCookie);assert.equal(dashboard.status,200);assert.match(await dashboard.text(),/<h1>Dashboard/);
    }
    const deepLogin=await request('?work=1&studio=builder&build=newsletter&source=archive%3Aone',{action:'sign-in',email:'admin@example.test',password:'fixture-admin-password'});
    assert.match(deepLogin.headers.get('location'),/build=newsletter/);assert.match(deepLogin.headers.get('location'),/source=archive%3Aone/);
    const team=await request('?work=1&studio=team',null,adminCookie);
    assert.equal(team.status,200);assert.match(await team.text(),/Add a person/);
    const created=await request('?work=1&studio=team',{action:'create-user',accessVersion:'1',access_library:'1',access_originals:'1',access_sources:'1',name:'Team member',email:'team@example.test',role:'admin'},adminCookie);
    assert.equal(created.status,200);const html=await created.text(),password=html.match(/class="staff-code">([^<]+)/)[1];
    assert.match(created.headers.get('cache-control'),/no-store/);
    assert.match(html,/Send welcome email/);assert.match(html,/Copy welcome message/);
    assert.match(html,/Sends directly from notifications@nutrition.fitness/);assert.doesNotMatch(html,/mailto:/);
    assert.ok(html.includes('Password: '+password));
    assert.ok(html.includes(origin+'/content-library/?work=1'));
    assert.match(html,/confidentiality agreement/);
    assert.match(html,/administrator handles approval and publishing/);
    assert.equal(saved[0].code_hash,createHash('sha256').update(password).digest('hex'));
    assert.equal(saved[0].role,undefined);assert.ok(!JSON.stringify(saved).includes(password));
    const person=[...staff.values()][0];
    const originalHash=person.code_hash;
    const welcomePage=await request('?work=1&studio=team&person='+person.id,null,adminCookie),welcomeHtml=await welcomePage.text();
    assert.match(welcomeHtml,/Send welcome details to Team member/);
    assert.match(welcomeHtml,/Use your existing team password/);
    assert.ok(!welcomeHtml.includes(password));assert.ok(!welcomeHtml.includes(originalHash));
    assert.equal(person.code_hash,originalHash);assert.equal(saved.length,1);
    const memberLogin=await request('',{action:'sign-in',email:person.email,password});
    assert.equal(memberLogin.status,303);const memberCookie=cookieOf(memberLogin);
    const download=await request('?file='+fileId,null,memberCookie);
    assert.equal(download.status,200);assert.equal(await download.text(),'Private file bytes');
    person.access={library:true};
    assert.equal((await request('?file='+fileId,null,memberCookie)).status,403);
    assert.equal((await request('?work=1&assets=catalogue%3Aone',null,memberCookie)).status,403);
    assert.equal((await request('?work=1&studio=archive',null,memberCookie)).status,403);
    assert.equal((await request('?work=1&studio=item&id=test',{action:'ai-draft'},memberCookie)).status,403);
    person.access={};
    assert.equal((await request('?preview='+'a'.repeat(32),null,memberCookie)).status,403);
    assert.equal((await request('?work=1&studio=media&preview='+'a'.repeat(32),null,memberCookie)).status,403);
    person.access=null;
    assert.equal((await request('?file='+fileId,null,memberCookie)).status,200);
    assert.equal((await request('?work=1&studio=team',null,memberCookie)).status,403);
    assert.equal((await request('?work=1&studio=team',{action:'create-user',accessVersion:'1',access_library:'1',access_originals:'1',access_sources:'1',name:'Not allowed',email:'other@example.test'},memberCookie)).status,403);
    const duplicate=await request('?work=1&studio=team',{action:'create-user',accessVersion:'1',access_library:'1',access_originals:'1',access_sources:'1',name:'Again',email:person.email},adminCookie);
    assert.equal(duplicate.status,409);assert.equal(staff.size,1);
    await request('?work=1&studio=team',{action:'create-user',accessVersion:'1',access_library:'1',access_originals:'1',access_sources:'1',name:'Admin team profile',email:'admin@example.test'},adminCookie);
    const overlapping=await request('',{action:'sign-in',email:'admin@example.test',password:'fixture-admin-password'});
    assert.equal(overlapping.status,303);
    assert.equal((await request('?work=1&studio=team',null,cookieOf(overlapping))).status,200);
    await request('?work=1&studio=team',{action:'issue-code',staff:person.id},adminCookie);
    assert.equal((await request('?file='+fileId,null,memberCookie)).status,401);
    assert.equal((await request('',{action:'sign-in',email:person.email,password})).status,401);
    const reset=await request('?work=1&studio=team',{action:'issue-code',staff:person.id},adminCookie);
    const nextPassword=(await reset.text()).match(/class="staff-code">([^<]+)/)[1];
    const next=await request('',{action:'sign-in',email:person.email,password:nextPassword});
    assert.equal(next.status,303);
    await request('?work=1&studio=team',{action:'disable-user',staff:person.id},adminCookie);
    const disabledHtml=await (await request('?work=1&studio=team&person='+person.id,null,adminCookie)).text();
    assert.doesNotMatch(disabledHtml,/Send welcome details to Team member/);
    assert.match(disabledHtml,/Set a password to enable this account and prepare its welcome email/);
    assert.equal((await request('?file='+fileId,null,cookieOf(next))).status,401);
    assert.equal((await request('',{action:'sign-in',email:person.email,password:nextPassword})).status,401);
    blocked=true;
    const limited=await request('',{action:'sign-in',email:person.email,password});
    assert.equal(limited.status,429);assert.ok(!limited.headers.has('set-cookie'));
    const logout=await request('?work=1&studio=library',{action:'work-logout'},adminCookie);
    assert.equal(logout.status,303);assert.equal(logout.headers.get('location'),'/content-library/');
    assert.equal(logout.headers.getSetCookie().length,2);assert.ok(logout.headers.getSetCookie().every(c=>c.includes('Max-Age=0')));
    assert.equal((await request('',null,'__Host-nufi-access=unrelated-website-session')).status,401);
  }finally{server.close();await once(server,'close');}
});
