import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sourceBundle, suggestedOutputs, builderPage, workerPreview, saveWorkerRequest, workerRequestsPage } from '../server/studio-workers.mjs';
import { studioData } from '../server/studio-store.mjs';
import { handleStudio } from '../server/studio.mjs';

function fixture(){
 const source={id:'catalogue:challenge',title:'Six-week challenge',group:'Challenges',kind:'Challenge guide',fields:{collection:'Six-week challenge'},files:[]};
 return {actor:{role:'admin',id:randomUUID()},index:{records:[source],files:{}},items:[],byId:new Map(),projects:[],people:[],tasks:[],assigned:new Set()};
}
function values(){return {requestId:randomUUID(),source:'catalogue:challenge',output_newsletter:'yes',output_socials:'yes',worker_newsletter:'nina',worker_socials:'rory',audience:'Members',instructions:'Keep it practical',sourceText:'Source excerpt'};}

test('archive selections use authoritative membership and preserve evidenced course order',()=>{
 const data=fixture();data.index.records.push({id:'catalogue:other',title:'Other',group:'Challenges',fields:{collection:'Six-week challenge'},files:[]});
 const meta={originalShelves:{groups:{Challenges:{'Six-week challenge':['catalogue:other']}}}};
 const bundle=sourceBundle({folder:'Six-week challenge',shelf:'Challenges'},data,meta);
 assert.deepEqual(bundle.records.map(r=>r.id),['catalogue:other']);
 assert.deepEqual(suggestedOutputs(bundle),['challenge','emails','landing','socials']);
 data.index.records.push({id:'course:Basics',title:'Basics',kind:'Course outline',group:'Courses',fields:{}});
 meta.courses={Basics:{members:['catalogue:challenge','catalogue:other'],sections:[{entries:[{id:'catalogue:other'},{id:'catalogue:challenge'}]}],support:[]}};
 assert.deepEqual(sourceBundle({source:'course:Basics'},data,meta).records.map(r=>r.id),['course:Basics','catalogue:other','catalogue:challenge']);
 assert.throws(()=>sourceBundle({source:'not-an-original'},data),e=>e.status===404);
});

test('newsletter suggests Nina, social suggests Rory, and missing source text is explicit',()=>{
 const data=fixture(),html=workerPreview(values(),data);
 assert.match(html,/name="worker_newsletter"[\s\S]*?value="nina" selected/);
 assert.match(html,/name="worker_socials"[\s\S]*?value="rory" selected/);
 assert.match(html,/0 with saved text/);assert.match(html,/must open those originals/);
 assert.match(html,/Saving keeps this brief ready/);assert.match(html,/Save plan to dashboard/);
 assert.doesNotMatch(html,/>Send to|In progress|Generated successfully/);
 const intake=builderPage(new URLSearchParams({source:'catalogue:challenge',build:'challenge'}),data);
 assert.match(intake,/name="output_challenge" value="yes"/);assert.match(intake,/Suggested worker: Imogen/);
 assert.throws(()=>workerPreview({...values(),output_newsletter:'',output_socials:''},data),e=>e.status===400);
});

test('saved request keeps worker overrides, source provenance and draft-only constraints; retries do not duplicate',async()=>{
 const data=fixture(),f={...values(),worker_newsletter:'imogen',output_branding:'yes',worker_branding:'imogen'},calls=[];
 const api=async(path,o)=>{calls.push({path,...o});return [{id:o.payload.item}];};
 const id=await saveWorkerRequest(f,data,{},api),record=calls[0].payload.document;
 assert.equal(record.fields.outputs.find(o=>o.type==='newsletter').worker,'imogen');assert.equal(record.fields.outputs.find(o=>o.type==='socials').worker,'rory');
 assert.equal(record.fields.production.reviewRequired,true);assert.match(record.fields.production.folderUrl,/Content%20Library%2FCourses/);assert.equal(record.fields.production.dispatchState,'not_connected');
 assert.equal(record.fields.state,'prepared');assert.equal(record.status,'Draft');
 assert.equal(record.fields.sources[0].id,'catalogue:challenge');assert.equal(record.fields.sources[0].text,'');
 assert.equal(record.fields.sourceText,'Source excerpt');assert.match(record.fields.constraints,/Do not publish/);
 assert.equal(calls[0].path,'/rest/v1/rpc/nufi_studio_save');assert.equal(calls[0].payload.expected,0);
 data.byId.set(id,record);assert.equal(await saveWorkerRequest(f,data,{},api),id);assert.equal(calls.length,1);
 const page=workerRequestsPage(new URLSearchParams({id}),data);assert.match(page,/Saved request · not sent/);
 assert.match(page,/No worker has been started/);
 const overlays=[{id,payload:record,revision:1,updated_at:new Date().toISOString()}];
 const loaded=await studioData(async path=>path.includes('nufi_studio_items')?overlays:[],data.actor,async()=>data.index);
 assert.equal(loaded.items.length,0);assert.equal(loaded.byId.get(id).kind,'worker-request');
 const staff=await studioData(async path=>path.includes('nufi_studio_items')?overlays:[],{role:'staff',id:randomUUID()},async()=>data.index);assert.equal(staff.byId.has(id),false);
});

test('staff and forged assignments cannot create worker requests',async()=>{
 const data=fixture();data.actor.role='staff';let writes=0;const api=async()=>{writes++;return [];};
 assert.throws(()=>builderPage(new URLSearchParams(),data),e=>e.status===403);
 await assert.rejects(saveWorkerRequest(values(),data,{},api),e=>e.status===403);
 data.actor.role='admin';await assert.rejects(saveWorkerRequest({...values(),worker_socials:'unknown'},data,{},api),e=>e.status===400);
 assert.equal(writes,0);
});

test('HTTP flow saves then reloads a prepared request without making a model request',async()=>{
 const data=fixture(),f=values(),rows=[];let modelCalls=0;
 const api=async(path,o)=>{
  if(path.includes('rpc/nufi_studio_save')){const p=o.payload;const row={id:p.item,payload:p.document,revision:1,updated_at:new Date().toISOString()};rows.push(row);return [row];}
  return path.includes('nufi_studio_items')?rows:[];
 };
 const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}});
 const options={actor:data.actor,api,load:async()=>data.index,env:{OPENAI_API_KEY:'not-used'},fetcher:async()=>{modelCalls++;throw Error('No model requests allowed');}};
 let res=response();await handleStudio({method:'POST',body:{...f,action:'worker-save'}},res,{...options,params:new URLSearchParams({studio:'builder'})});
 assert.equal(res.statusCode,303);assert.match(res.headers.Location,/studio=worker-requests/);
 const params=new URL(res.headers.Location,'https://test.invalid').searchParams;res=response();
 await handleStudio({method:'GET'},res,{...options,params});assert.equal(res.statusCode,200);assert.match(res.body,/Saved request · not sent/);assert.equal(modelCalls,0);
});
