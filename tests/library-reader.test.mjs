import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createLibraryReader } from '../server/library-reader.mjs';

const password='fixture-guest-password-for-tests-only';
const fileId='a'.repeat(64);
const item={id:'training:sample',title:'Fixture training programme',group:'Programmes',kind:'programme',status:'draft',fields:{warmup:['Gentle walk'],cooldown:['Easy pace']},files:[fileId]};
const index={version:1,records:[item],files:{[fileId]:{name:'A meal guide.pdf',type:'application/pdf'}}};
const env={NUFI_LIBRARY_PASSWORD_SHA256:createHash('sha256').update(password).digest('hex'), NUFI_LIBRARY_CATALOGUE_KEY:'a'.repeat(64)};
let server,base,loads=0,files=0;
before(async()=>{
  const handler=createLibraryReader({env,load:async()=>{loads++;return index;},fetchFile:async key=>{files++;assert.equal(key,'nutrition-library/v1/files/'+fileId);return {stream:new Response('Private bytes').body};}});
  server=createServer(async(req,res)=>{if(req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;req.body=body;}await handler(req,res);});
  server.listen(0,'127.0.0.1');await once(server,'listening');base='http://127.0.0.1:'+server.address().port;
});
after(async()=>{server.close();await once(server,'close');});
const post=(body,origin=base.replace('http:','https:'))=>fetch(base+'/content-library/',{method:'POST',body:new URLSearchParams(body),headers:{origin},redirect:'manual'});
test('shared password controls the catalogue, detail pages and direct downloads',async()=>{
  for(const suffix of ['','?item=training%3Asample','?file='+fileId,'?q=Fixture','?view=library']){
    const response=await fetch(base+'/content-library/'+suffix);
    assert.equal(response.headers.get('referrer-policy'),'same-origin');
    assert.equal(response.status,401);assert.match(response.headers.get('cache-control'),/no-store/);
    const html=await response.text();assert.ok(!html.includes(item.title));assert.ok(!html.includes('Private bytes'));
  }
  assert.equal(loads,0);assert.equal(files,0);
  assert.equal((await post({password:'wrong'})).status,401);
  assert.equal((await post({password},'https://other.example')).status,403);
  const login=await post({password});assert.equal(login.status,303);
  const session=login.headers.get('set-cookie');assert.match(session,/HttpOnly; Secure/);assert.ok(!session.includes(password));
  const cookie=session.split(';')[0];
  assert.match(session,/Max-Age=28800/);
  const remembered=await post({password,remember:'1'});assert.equal(remembered.status,303);
  assert.match(remembered.headers.get('set-cookie'),/Max-Age=2592000/);
  assert.equal((await fetch(base+'/content-library/?shelf=Training',{headers:{cookie:remembered.headers.get('set-cookie').split(';')[0]}})).status,200);
  const get=suffix=>fetch(base+'/content-library/'+suffix,{headers:{cookie}});
  const listing=await get('?shelf=Training');assert.equal(listing.status,200);assert.match(await listing.text(),/Fixture training programme/);
  const detail=await get('?item=training%3Asample');assert.match(await detail.text(),/Gentle walk/);
  const empty=await get('?q=NoMatches');assert.match(await empty.text(),/0 results/);
  const download=await get('?file='+fileId);assert.match(download.headers.get('content-disposition'),/attachment/);assert.equal(await download.text(),'Private bytes');
  assert.equal((await get('?file=..%2Fprivate')).status,404);
  const tamper=await fetch(base+'/',{headers:{cookie:cookie+'x'}});assert.equal(tamper.status,401);
  assert.equal((await get('?item=missing')).status,404);
  const logout=await post({action:'logout'});assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
  env.NUFI_LIBRARY_PASSWORD_SHA256='b'.repeat(64);
  assert.equal((await get('')).status,401);
  delete env.NUFI_LIBRARY_PASSWORD_SHA256;assert.equal((await get('')).status,503);
});
