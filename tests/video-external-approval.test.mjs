import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {reviewDecision} from '../server/studio-review.mjs';
test('external playback approval requires confirmation and records the current export, method and source check',async()=>{
 const sha='a'.repeat(64),record={id:'lesson',title:'Lesson',kind:'lesson',workerId:'imogen',revision:1,status:'Draft',source:{id:'original',needsChecking:true},fields:{body:'Saved lesson',production:{files:[{name:'lesson.mp4',url:'https://nutritionfitness.sharepoint.com/sites/Nutrition.fitness/Shared%20Documents/lesson.mp4',bytes:10,sha256:sha}]}},comments:[]};
 const data={actor:{role:'admin',id:'owner',name:'Owner'},items:[record],byId:new Map([[record.id,record]]),assigned:new Set(),projects:[],people:[]},params=new URLSearchParams({id:record.id});let writes=0;
 const api=async(path,o={})=>{if(o.method){writes++;return [{revision:2,payload:o.payload.document}];}return [];};
 const form={decision:'approve',reviewId:randomUUID(),revision:'1',videoSha256:sha,sourceChecked:'yes',videoPlaybackMethod:'sharepoint'};
 await assert.rejects(()=>reviewDecision(params,form,data,api),/Confirm you watched/);assert.equal(writes,0);
 await assert.rejects(()=>reviewDecision(params,{...form,videoWatched:'yes',revision:'0'},data,api),/changed/);assert.equal(writes,0);
 const result=await reviewDecision(params,{...form,videoWatched:'yes'},data,api);assert.equal(writes,1);assert.equal(result.record.status,'Approved');assert.equal(result.record.reviewFeedback[0].videoReview.playbackMethod,'sharepoint');assert.equal(result.record.reviewFeedback[0].videoReview.sha256,sha);assert.equal(result.record.reviewFeedback[0].videoReview.sourceChecked,true);
});

