import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createHash,randomUUID} from 'node:crypto';
const token='a'.repeat(64),tokenHash=createHash('sha256').update(token).digest('hex');
const bundled=await build({entryPoints:['supabase/functions/content-worker-bridge/index.ts'],bundle:true,write:false,platform:'neutral',format:'esm'});
let handler;globalThis.Deno={env:{get:key=>key==='SUPABASE_URL'?'https://db.test':'test-service-key'},serve:fn=>{handler=fn;}};
await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));delete globalThis.Deno;
test('existing authenticated edge transport completes idea CRUD and enforces revocation and namespace scope',async()=>{
 const originalFetch=globalThis.fetch,rows=new Map(),calls=[];let enabled=true,connectionId='content-manager';
 globalThis.fetch=async(url,options={})=>{calls.push(String(url));const u=new URL(url);let result=[];
 assert.equal(options.headers.Authorization,'Bearer test-service-key');
 if(u.pathname.endsWith('nufi_worker_connections'))result=enabled&&u.searchParams.get('token_hash')==='eq.'+tokenHash?[{id:connectionId,namespace:'worker:'+connectionId+':'}]:[];
 else if(u.pathname.endsWith('nufi_library_projects'))result=[];
 else if(u.pathname.endsWith('nufi_studio_save')){const p=JSON.parse(options.body),current=rows.get(p.item);if((current?.revision||0)===p.expected){const row={id:p.item,payload:p.document,revision:p.expected+1};rows.set(row.id,row);result=[row];}}
 else if(u.searchParams.get('id')?.startsWith('eq.'))result=[rows.get(u.searchParams.get('id').slice(3))].filter(Boolean);
 else result=[...rows.values()];return Response.json(result);};
 const call=async(body,credential=token)=>{const response=await handler(new Request('https://edge.test',{method:'POST',headers:{'content-type':'application/json','x-nufi-worker-token':credential},body:JSON.stringify(body)}));return {status:response.status,body:await response.json()};};
 try{
  assert.equal((await call({action:'idea-list'},'')).status,401);assert.equal(calls.length,0);
  const id='studio:idea:'+randomUUID();const created=await call({action:'idea-create',id,title:'Voice transport',description:'One board',category:'Growth',priority:'urgent'});assert.equal(created.status,200);assert.equal(created.body.id,id);assert.match(created.body.url,/team.nutrition.fitness/);
  assert.equal((await call({action:'idea-get',id})).body.title,'Voice transport');assert.equal((await call({action:'idea-list'})).body.total,1);
  assert.equal((await call({action:'idea-update',id,revision:1,status:'Parked'})).body.revision,2);
  assert.equal((await call({action:'idea-update',id,revision:1,title:'Stale'})).status,409);
  enabled=false;assert.equal((await call({action:'idea-list'})).status,401);enabled=true;connectionId='other';assert.equal((await call({action:'idea-list'})).status,403);assert.equal(rows.size,1);
 }finally{globalThis.fetch=originalFetch;}
});
