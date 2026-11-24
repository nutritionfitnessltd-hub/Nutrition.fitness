import test from 'node:test';
import assert from 'node:assert/strict';
import {checkedVideo,productionVideoSource} from '../server/production-video.mjs';
const sha='a'.repeat(64),record={id:'video',kind:'lesson',revision:2,status:'Draft',fields:{production:{files:[{url:'https://nutritionfitness.sharepoint.com/sites/Nutrition.fitness/Shared%20Documents/Courses/test.mp4',bytes:10,sha256:sha}]}}};
const data=()=>({actor:{role:'admin'},byId:new Map([['video',structuredClone(record)]])});
const params=()=>new URLSearchParams({id:'video',sha,revision:'2'});
const env={EXCHANGE_TENANT_ID:'tenant',EXCHANGE_CLIENT_ID:'client',EXCHANGE_CLIENT_SECRET:'test-secret'};
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},end(){this.ended=true;}};}
function graph(item={size:10,'@microsoft.graph.downloadUrl':'https://nutritionfitness.sharepoint.com/download?temporary=example'}){const calls=[];return {calls,fetcher:async(url,options)=>{calls.push({url,options});return Response.json(calls.length===1?{access_token:'test-token'}:calls.length===2?{id:'site-id'}:item);}};}
test('protected playback resolves a checked version and redirects without leaking the Graph token',async()=>{
 const g=graph(),res=response();await productionVideoSource({method:'GET'},res,params(),data(),env,g.fetcher);
 assert.equal(res.statusCode,302);assert.equal(res.headers['Cache-Control'],'private, no-store');assert.equal(res.headers.Location,'https://nutritionfitness.sharepoint.com/download?temporary=example');assert.equal(g.calls.length,3);assert.match(g.calls[2].url,/drive\/root:\/Courses\/test.mp4/);assert.doesNotMatch(JSON.stringify(res),/test-secret|test-token/);
});
test('playback rejects unreadable content and stale or missing export identity before contacting Microsoft',async()=>{
 for(const patch of [{revision:'1'},{sha:'b'.repeat(64)},{sha:''}]){const p=params();for(const [k,v]of Object.entries(patch))p.set(k,v);await assert.rejects(productionVideoSource({method:'GET'},response(),p,data(),env,()=>{throw Error('must not fetch');}),e=>e.status===409||e.statusCode===409);}
 const d=data();d.actor={id:'other',role:'staff',access:{library:true}};d.assigned=new Set();await assert.rejects(productionVideoSource({method:'GET'},response(),params(),d,env),/outside your assigned/);
});
test('playback refuses replaced files and unexpected download hosts',async()=>{
 for(const item of [{size:11,'@microsoft.graph.downloadUrl':'https://nutritionfitness.sharepoint.com/x'},{size:10,'@microsoft.graph.downloadUrl':'https://evil.example/video.mp4'},{size:10,'@microsoft.graph.downloadUrl':'http://nutritionfitness.sharepoint.com/x'}])await assert.rejects(productionVideoSource({method:'GET'},response(),params(),data(),env,graph(item).fetcher),/changed|destination/);
});
test('playback reports a missing or denied connection and rejects unverified videos',async()=>{
 await assert.rejects(productionVideoSource({method:'GET'},response(),params(),data(),{}),/not configured/);
 await assert.rejects(productionVideoSource({method:'GET'},response(),params(),data(),env,async()=>Response.json({error:'denied'},{status:403})),/authentication/);
 assert.equal(checkedVideo({...record,fields:{production:{files:[{...record.fields.production.files[0],url:'https://evil.example/a.mp4'}]}}}),undefined);
});
