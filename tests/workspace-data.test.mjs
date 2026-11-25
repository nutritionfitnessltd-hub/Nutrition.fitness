import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {workspaceRows,invalidateWorkspaceRows} from '../server/workspace-data.mjs';
import {platform} from '../server/platform.mjs';
import {allRows} from '../server/studio-store.mjs';
import {handleStudio} from '../server/studio.mjs';
import {readdir} from 'node:fs/promises';

const url='/rest/v1/nufi_studio_items?select=id,payload,revision,updated_at&order=id';
const row=(id,revision=1)=>({id,revision,updated_at:String(revision),payload:{id,kind:'recipe',title:id,fields:{body:'source '.repeat(1000)}}});
function fixture(){
 const api={workspaceScope:randomUUID()},calls=[];let rows=[row('one'),row('two')];
 const read=async(_,path)=>{calls.push(path);if(path.includes('id=in.')){const ids=JSON.parse('['+decodeURIComponent(path.split('id=in.(')[1].slice(0,-1))+']');return structuredClone(rows.filter(r=>ids.includes(r.id)));}return structuredClone(path.includes('select=id,revision,updated_at')?rows.map(({id,revision,updated_at})=>({id,revision,updated_at})):rows);};
 return {api,calls,read,get rows(){return rows;},set rows(value){rows=value;}};
}
test('warm navigation transfers no unchanged bodies and returned objects cannot alter the cache',async()=>{
 const f=fixture();const first=await workspaceRows(f.api,url,f.read);first[0].payload.title='unsaved';
 assert.equal((await workspaceRows(f.api,url,f.read))[0].payload.title,'one');assert.equal(f.calls.length,1);
 f.api.workspaceFresh=true;await workspaceRows(f.api,url,f.read);assert.equal(f.calls.length,2);assert.match(f.calls[1],/select=id,revision,updated_at/);
});
test('refresh reconciles additions, revisions, same-revision timestamps and deletions',async()=>{
 const f=fixture();await workspaceRows(f.api,url,f.read);f.rows=[row('one',2),{...row('three'),updated_at:'new'}];invalidateWorkspaceRows(f.api.workspaceScope);
 const refreshed=await workspaceRows(f.api,url,f.read);assert.deepEqual(refreshed.map(r=>r.id),['one','three']);assert.equal(refreshed[0].revision,2);assert.equal(f.calls.filter(x=>x===url).length,1);
 f.rows[0].updated_at='later';f.rows[0].payload.title='Updated externally';invalidateWorkspaceRows(f.api.workspaceScope);
 assert.equal((await workspaceRows(f.api,url,f.read))[0].payload.title,'Updated externally');
});
test('concurrent cold loads share a transfer; failed refresh never serves stale data',async()=>{
 const f=fixture();let release;const waiting=new Promise(resolve=>{release=resolve;});let reads=0;
 const read=async()=>{reads++;await waiting;return f.rows;};const requests=[workspaceRows(f.api,url,read),workspaceRows(f.api,url,read)];release();await Promise.all(requests);assert.equal(reads,1);
 invalidateWorkspaceRows(f.api.workspaceScope);await assert.rejects(workspaceRows(f.api,url,async()=>{throw Error('database unavailable');}),/database unavailable/);
});
test('independent database scopes never share snapshots',async()=>{
 const a=fixture(),b=fixture();await workspaceRows(a.api,url,a.read);b.rows=[row('private-other-project')];assert.equal((await workspaceRows(b.api,url,b.read))[0].id,'private-other-project');
});
test('pagination uses known totals with bounded concurrency and preserves order',async()=>{
 let active=0,max=0;const calls=[];const rows=await allRows(async(path,options)=>{const offset=Number(new URL(path,'https://example.test').searchParams.get('offset'));calls.push(offset);active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,2));active--;const data=Array.from({length:Math.min(500,3100-offset)},(_,i)=>({id:offset+i}));if(offset===0){assert.equal(options.headers.Prefer,'count=exact');Object.defineProperty(data,'totalRows',{value:3100});}return data;},url);
 assert.equal(rows.length,3100);assert.equal(rows[3099].id,3099);assert.equal(calls.length,7);assert.ok(max<=4&&max>1);
});
test('platform shares simultaneous service reads, preserves totals, and refreshes after writes',async()=>{
 const env={SUPABASE_URL:'https://example.test',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:randomUUID(),SITE_URL:'https://example.test'};let reads=0;
 const fetcher=async(_,options)=>{if(options.method==='GET')reads++;await new Promise(r=>setTimeout(r,2));return new Response('[{"id":"one","revision":1,"payload":{}}]',{headers:{'content-range':'0-0/1'}});};
 const api=platform(env,fetcher),other=platform(env,fetcher);const [a,b]=await Promise.all([api(url,{service:true}),other(url,{service:true})]);assert.equal(reads,1);assert.equal(a.totalRows,1);a[0].id='changed';assert.equal(b[0].id,'one');
 await workspaceRows(api,url,allRows);await api('/rest/v1/rpc/save',{service:true,method:'POST',payload:{}});await workspaceRows(api,url,allRows);assert.equal(reads,3);
});
test('staging image responds without loading the catalogue or portfolio and remains access controlled',async()=>{
 const file=(await readdir(new URL('../server/recipe-staging-images/',import.meta.url)))[0],key=file.slice(0,-5);const r={id:'recipe-stage:test',kind:'recipe',status:'Draft',fields:{recipeStaging:{batchId:'test',imageKey:key}}};
 for(const actor of [{role:'admin',id:'owner'},{role:'staff',id:'reader',access:{library:true,all_library:true}}]){
  let calls=0;const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}};
  await handleStudio({method:'GET'},res,{params:new URLSearchParams({studio:'recipe-staging-image',id:r.id}),actor,api:async path=>{calls++;assert.match(path,/id=eq.recipe-stage%3Atest/);return [{id:r.id,payload:r}];},load:()=>{throw Error('Must not load catalogue');},env:{}});
  assert.equal(calls,1);assert.equal(res.statusCode,200);assert.equal(res.headers['Content-Type'],'image/webp');assert.match(res.headers['Cache-Control'],/private/);assert.equal(res.headers.Vary,'Cookie');assert.ok(Buffer.isBuffer(res.body));
 }
 const res={setHeader(){},end(body){this.body=body;}};await handleStudio({method:'GET'},res,{params:new URLSearchParams({studio:'recipe-staging-image',id:r.id}),actor:{role:'staff',id:'outsider',access:{}},api:()=>{throw Error('Unauthorized database read');},load:()=>{throw Error('Unauthorized catalogue read');},env:{}});assert.equal(res.statusCode,403);
});
