import test from 'node:test';
import assert from 'node:assert/strict';
import {handleStudio} from '../server/studio.mjs';
import {loadPlanner} from '../server/studio-planner-context.mjs';
import {studioData} from '../server/studio-store.mjs';

const actor={role:'admin',id:'admin'};
const api=async()=>[];
const load=async()=>({records:[],files:{}});
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}};}

test('Home and Team work render saved work without waiting for an unavailable HQ',async()=>{
 for(const section of ['home','team-work']){
  let calls=0;const res=response();
  await handleStudio({method:'GET'},res,{params:new URLSearchParams({studio:section}),actor,api,load,env:{NUFI_HQ_SITE_TOKEN:'fixture'},fetcher:()=>{calls++;return new Promise(()=>{});}});
  assert.equal(res.statusCode,200);assert.equal(calls,0);
  assert.match(res.body,/data-worker-deferred/);assert.match(res.body,/Loading live worker activity/);
 }
});
test('background refresh still loads real HQ activity and never publishes a loading state',async()=>{
 let calls=0;const res=response();const params=new URLSearchParams({studio:'home',live:'1'});
 await handleStudio({method:'GET'},res,{params,actor,api,load,env:{NUFI_HQ_SITE_TOKEN:'fixture'},fetcher:async()=>{calls++;return new Response(JSON.stringify({ideas:[],production:{}}));}});
 assert.equal(res.statusCode,200);assert.equal(calls,4);assert.doesNotMatch(res.body,/data-worker-deferred|Loading live worker activity/);
 assert.equal(params.has('live'),false);
});
test('administrator scheduling uses the already fresh portfolio and profiles without extra database reads',async()=>{
 const data={actor,projects:[],people:[],byId:new Map([['studio:team-profile:person',{id:'studio:team-profile:person',fields:{engagementType:'owner_director'}}]])};
 await loadPlanner(data,()=>{throw new Error('redundant database query');});
 assert.ok(data.planner.rows instanceof Map);assert.deepEqual(data.planner.directorIds,[]);
});
test('workspace queries exclude private account snapshot bodies at the database',async()=>{
 const calls=[];await studioData(async url=>{calls.push(url);return [];},actor,load);
 assert.ok(calls.some(url=>url.includes('id.not.like.studio:account-preview:*')));
});
