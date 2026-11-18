import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {reviewDecision,reviewPreview} from '../server/studio-review.mjs';
import {reviewPage} from '../server/studio-pages.mjs';
import {draftDocument,draftResult,reviewGuidance} from '../server/worker-drafts.mjs';
import {handleStudio} from '../server/studio.mjs';

const fixture=()=>{
 const record={id:'worker:sample',kind:'article',title:'Vitamin D questions',status:'In review',workerId:'nina',revision:1,parent:null,fields:{body:'Read the evidence.',shortAnswer:'A useful explanation.'},comments:[]};
 const data={actor:{role:'admin',id:'owner',name:'James'},items:[record],byId:new Map([[record.id,record]]),assigned:new Set(),projects:[],people:[]};
 let stored=structuredClone(record),writes=0;
 const api=async(path,opts={})=>{
  if(path.includes('rpc/nufi_studio_save')){assert.equal(opts.payload.expected,stored.revision);stored={...opts.payload.document,revision:stored.revision+1};writes++;return [{id:stored.id,payload:stored,revision:stored.revision}];}
  if(path.includes('nufi_studio_items'))return [{id:stored.id,payload:stored,revision:stored.revision}];return [];
 };
 return {data,api,get stored(){return stored;},get writes(){return writes;}};
};
const params=new URLSearchParams({studio:'review-preview',id:'worker:sample'});
test('review list opens accessible preview with saved revision and two clear decisions',()=>{
 const f=fixture(),list=reviewPage(new URLSearchParams({studio:'review'}),f.data),preview=reviewPreview(params,f.data);
 assert.match(list,/data-review-preview/);assert.match(list,/<dialog[^>]+aria-labelledby="review-popup-title"/);
 assert.match(preview,/Website preview/);assert.match(preview,/>Approve</);assert.match(preview,/>Request changes</);
 assert.match(preview,/What needs changing/);assert.match(preview,/Remember for future work/);assert.match(preview,/Nina/);
});
test('change request is versioned, persists guidance and survives an unavailable HQ connection',async()=>{
 const f=fixture(),reviewId=randomUUID(),result=await reviewDecision(params,{action:'review-decision',decision:'changes',revision:'1',reviewId,feedback:'Shorten the introduction.',guidance:'Explain technical words.'},f.data,f.api);
 assert.equal(result.record.status,'Changes requested');assert.equal(result.record.fields.body,'Read the evidence.');assert.equal(f.writes,1);
 assert.equal(result.record.reviewFeedback[0].reviewedRevision,1);assert.equal(result.record.reviewFeedback[0].delivery,'pending');assert.match(result.record.comments[0].body,/technical words/);
 f.data.byId.set(result.id,result.record);await reviewDecision(params,{action:'review-decision',decision:'changes',revision:'1',reviewId},f.data,f.api);
 assert.equal(f.writes,1,'A repeated POST must not duplicate feedback');
 assert.equal(reviewGuidance([f.stored],'nina').length,1);assert.equal(reviewGuidance([f.stored],'imogen').length,0);
 const input={id:'sample',kind:'article',revision:2,title:'Revised draft',body:'Revised text.'};
 const revised=draftDocument(input,{payload:f.stored,revision:2},'worker:');
 assert.equal(revised.reviewFeedback[0].id,reviewId);assert.equal(revised.status,'Draft');
 const returned=draftResult({payload:{...revised,workerSource:{id:'sample',kind:'article'}},revision:3},'https://team.nutrition.fitness');
 assert.match(returned.feedback[0].body,/Shorten/);assert.equal(returned.reviewFeedback[0].id,reviewId);
});
test('stale revisions, empty feedback, missing workers and staff reviews never write',async()=>{
 for(const overrides of [{revision:'0'},{feedback:' '},{decision:'bad'}]){
  const f=fixture();await assert.rejects(reviewDecision(params,{action:'review-decision',decision:'changes',revision:'1',reviewId:randomUUID(),feedback:'Fix it',...overrides},f.data,f.api));assert.equal(f.writes,0);
 }
 const f=fixture();f.data.actor.role='staff';await assert.rejects(reviewDecision(params,{reviewId:randomUUID()},f.data,f.api),/administrator/);assert.equal(f.writes,0);
});
test('approval checks completeness and records the approved version without publishing',async()=>{
 const f=fixture();f.data.byId.get('worker:sample').fields.body='';await assert.rejects(reviewDecision(params,{action:'review-decision',decision:'approve',revision:'1',reviewId:randomUUID()},f.data,f.api));assert.equal(f.writes,0);
 f.data.byId.get('worker:sample').fields.body='Read the evidence.';
 const result=await reviewDecision(params,{action:'review-decision',decision:'approve',revision:'1',reviewId:randomUUID()},f.data,f.api);
 assert.equal(result.record.status,'Approved');assert.equal(result.record.approval.revision,2);assert.equal(result.record.publication,undefined);
});
test('fragment failures retain typed feedback and GET previews do not write',async()=>{
 const f=fixture(),options={params:new URLSearchParams({studio:'review-preview',id:'worker:sample',fragment:'1'}),actor:f.data.actor,api:f.api,load:async()=>({records:[]}),env:{}},res=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}});
 let out=res();await handleStudio({method:'GET'},out,options);assert.equal(out.statusCode,200);assert.equal(f.writes,0);assert.equal(out.headers['Cache-Control'],'private, no-store');
 out=res();await handleStudio({method:'POST',body:{action:'review-decision',decision:'changes',revision:'0',reviewId:randomUUID(),feedback:'Keep my typed feedback'}},out,options);assert.equal(out.statusCode,409);assert.match(out.body,/Keep my typed feedback/);assert.equal(f.writes,0);
 out=res();await handleStudio({method:'GET'},out,{...options,actor:{role:'staff',id:'unassigned'}});assert.equal(out.statusCode,403);assert.doesNotMatch(out.body,/Read the evidence/);
});
