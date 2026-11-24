import test from 'node:test';
import assert from 'node:assert/strict';
import {checkedVideo,productionVideoSource} from '../server/production-video.mjs';
const sha='a'.repeat(64),record={id:'video',kind:'lesson',revision:2,status:'Draft',fields:{production:{files:[{url:'https://nutritionfitness.sharepoint.com/sites/Nutrition.fitness/Shared%20Documents/Courses/test.mp4',bytes:10,sha256:sha}]}}};
const data=()=>({actor:{role:'admin'},byId:new Map([['video',structuredClone(record)]])});
const params=()=>new URLSearchParams({id:'video',sha,revision:'2'});
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},end(){this.ended=true;}};}
test('protected playback uses the existing browser SharePoint sign-in without Exchange or Graph credentials',async()=>{
 const res=response();await productionVideoSource({method:'GET'},res,params(),data());
 assert.equal(res.statusCode,302);assert.equal(res.headers['Cache-Control'],'private, no-store');assert.equal(res.headers['Referrer-Policy'],'no-referrer');assert.equal(res.ended,true);
 const target=new URL(res.headers.Location);assert.equal(target.origin,'https://nutritionfitness.sharepoint.com');assert.equal(target.pathname,'/sites/Nutrition.fitness/_layouts/15/download.aspx');assert.equal(target.searchParams.get('SourceUrl'),'/sites/Nutrition.fitness/Shared Documents/Courses/test.mp4');
});
test('playback rejects unreadable content and stale or missing export identity',async()=>{
 for(const patch of [{revision:'1'},{sha:'b'.repeat(64)},{sha:''}]){const p=params();for(const [k,v]of Object.entries(patch))p.set(k,v);await assert.rejects(productionVideoSource({method:'GET'},response(),p,data()),e=>e.status===409);}
 const d=data();d.actor={id:'other',role:'staff',access:{library:true}};d.assigned=new Set();await assert.rejects(productionVideoSource({method:'GET'},response(),params(),d),/outside your assigned/);
});
test('playback encodes spaces, punctuation and literal percent signs exactly once',async()=>{
 const d=data(),path='/sites/Nutrition.fitness/Shared Documents/Courses/Module 1 — test/Profit 20% & title #1.mp4';d.byId.get('video').fields.production.files[0].url='https://nutritionfitness.sharepoint.com'+path.split('/').map(encodeURIComponent).join('/');
 const res=response();await productionVideoSource({method:'GET'},res,params(),d);assert.equal(new URL(res.headers.Location).searchParams.get('SourceUrl'),path);
});
test('unverified exports, unsupported paths and writes never redirect',async()=>{
 for(const url of ['https://evil.example/a.mp4','http://nutritionfitness.sharepoint.com/sites/Test/test.mp4','https://nutritionfitness.sharepoint.com/test.mp4','https://nutritionfitness.sharepoint.com/sites/Test/%xx.mp4']){const d=data();d.byId.get('video').fields.production.files[0].url=url;const res=response();await assert.rejects(productionVideoSource({method:'GET'},res,params(),d));assert.equal(res.headers.Location,undefined);}
 await assert.rejects(productionVideoSource({method:'POST'},response(),params(),data()),/Use GET/);
 assert.equal(checkedVideo({...record,fields:{production:{files:[{...record.fields.production.files[0],bytes:0}]}}}),undefined);
});
