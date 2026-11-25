import test from 'node:test';
import assert from 'node:assert/strict';
import {Writable} from 'node:stream';
import {productionVideoSource,videoRange} from '../server/production-video.mjs';
const sha='a'.repeat(64),body=Buffer.from('0123456789'),record={id:'video',kind:'lesson',revision:2,status:'Draft',fields:{production:{files:[{url:'https://nutritionfitness.sharepoint.com/sites/Test/video.mp4',bytes:10,sha256:sha}]}}},params=()=>new URLSearchParams({id:'video',sha,revision:'2'}),data=()=>({actor:{role:'admin'},byId:new Map([['video',structuredClone(record)]])}),env={BLOB_READ_WRITE_TOKEN:'fixture'};
class ResponseSink extends Writable{constructor(){super();this.headers={};this.chunks=[];}setHeader(k,v){this.headers[k]=v;}_write(chunk,_e,done){this.chunks.push(chunk);done();}}
const head=async()=>({size:10,url:'https://fixture.private.blob.vercel-storage.com/video.mp4'});
test('mobile playback streams the exact saved video through the app and supports range seeking and HEAD',async()=>{
 for(const range of ['', 'bytes=0-1','bytes=4-','bytes=-3']){const expected=videoRange(range,10),res=new ResponseSink();let requested;
 const get=async(path,options)=>{requested=options.headers?.Range;const selected=expected?body.subarray(expected.start,expected.end+1):body;return {stream:new Response(selected).body,headers:new Headers(expected?{'content-range':'bytes '+expected.start+'-'+expected.end+'/10'}:{})};};
 await productionVideoSource({method:'GET',headers:{range}},res,params(),data(),env,get,head);assert.equal(res.statusCode,expected?206:200);assert.equal(res.headers['Content-Type'],'video/mp4');assert.equal(res.headers.Location,undefined);assert.equal(res.headers['Cache-Control'],'private, no-store');assert.equal(Buffer.concat(res.chunks).toString(),expected?body.subarray(expected.start,expected.end+1).toString():body.toString());if(expected)assert.equal(requested,'bytes='+expected.start+'-'+expected.end);
 }
 const res=new ResponseSink();await productionVideoSource({method:'HEAD'},res,params(),data(),env,()=>{throw Error('body fetched on HEAD');},head);assert.equal(res.headers['Content-Length'],'10');assert.equal(res.chunks.length,0);
});
test('invalid ranges, stale exports and unreadable records never leak video bytes',async()=>{
 const never=async()=>{throw Error('Storage must not be called');};for(const range of ['bytes=10-','bytes=5-2','bytes=0-1,4-5','bytes=-0']){const res=new ResponseSink();await productionVideoSource({method:'GET',headers:{range}},res,params(),data(),env,never,never);assert.equal(res.statusCode,416);assert.equal(res.headers['Content-Range'],'bytes */10');}
 const stale=params();stale.set('revision','1');await assert.rejects(()=>productionVideoSource({method:'GET'},new ResponseSink(),stale,data(),env,never,never),e=>e.status===409);
 const denied=data();denied.actor={role:'staff',id:'other',access:{library:true}};denied.assigned=new Set();await assert.rejects(()=>productionVideoSource({method:'GET'},new ResponseSink(),params(),denied,env,never,never),/outside your assigned/);
 await assert.rejects(()=>productionVideoSource({method:'GET'},new ResponseSink(),params(),data(),env,never,async()=>({size:9,url:'https://fixture.private.blob.vercel-storage.com/video.mp4'})),e=>e.status===409);
});

