import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {reviewDecision,reviewPreview,reviewWindowDocument} from '../server/studio-review.mjs';
import {reviewPage,calendar} from '../server/studio-pages.mjs';
import {draftDocument,draftResult,reviewGuidance} from '../server/worker-drafts.mjs';
import {handleStudio} from '../server/studio.mjs';

const fixture=()=>{
 const record={id:'worker:sample',kind:'article',title:'Vitamin D questions',status:'In review',workerId:'nina',revision:1,parent:null,fields:{body:'Read the evidence.',shortAnswer:'A useful explanation.',imageAlt:'A relevant photograph',imageCredit:'Fixture photographer',marginNote:'Look a little closer.'},comments:[],workerImage:{bucket:'worker-content',path:'content-manager/00000000-0000-4000-8000-000000000001.jpg',type:'image/jpeg'}};
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
 assert.match(list,/data-review-preview target="_blank" rel="noopener"/);assert.doesNotMatch(list,/<dialog/);
 assert.match(preview,/Website preview/);assert.match(preview,/>Approve</);assert.match(preview,/>Request changes</);
 assert.match(preview,/What needs changing/);assert.match(preview,/Remember for future work/);assert.match(preview,/Nina/);
});
test('article review window has one article and persistent controls without manager navigation and with a deferred editor',()=>{
 const f=fixture(),html=reviewWindowDocument(params,f.data);
 assert.match(html,/article-review-window/);assert.match(html,/review-window-controls/);assert.ok(html.indexOf('review-window-controls')<html.indexOf('<h1>'));
 for(const label of ['Approve','Edit','Request changes'])assert.ok(html.includes('>'+label+'<'));
 assert.doesNotMatch(html,/Studio navigation|review-popup-header/);
 assert.match(html,/<iframe title="Edit content form" data-review-edit-frame><\/iframe>/);
 assert.match(html,/data-review-edit-dialog/);
 assert.equal((html.match(/<h1>/g)||[]).length,1);
});
test('staff article window offers Edit only for assigned content with editing access',()=>{
 const f=fixture();f.data.actor={role:'staff',id:'creator',access:{library:true,work:true,edit:true}};f.data.assigned=new Set(['worker:sample']);
 const html=reviewWindowDocument(params,f.data);assert.match(html,/>Edit</);assert.doesNotMatch(html,/>Approve<|>Schedule<|>Request changes</);
 f.data.actor.access.edit=false;assert.doesNotMatch(reviewWindowDocument(params,f.data),/>Edit</);
});
test('administrator draft preview hides the separate submission step',async()=>{
 const f=fixture();f.data.byId.get('worker:sample').status='Draft';
 assert.doesNotMatch(reviewWindowDocument(params,f.data),/>Submit for review<|>Schedule<|publishing is separate/);
 const result=await reviewDecision(params,{action:'review-decision',decision:'submit',revision:'1',reviewId:randomUUID()},f.data,f.api);
 assert.equal(result.record.status,'In review');assert.equal(result.record.approval,undefined);assert.equal(result.record.fields.body,'Read the evidence.');
 assert.doesNotMatch(reviewWindowDocument(params,{...f.data,byId:new Map([[result.id,result.record]])}),/>Submit for review</);
});
test('scheduling saves an editorial date, appears in calendar, preserves content and rejects stale or invalid dates',async()=>{
 const f=fixture(),result=await reviewDecision(params,{action:'review-schedule',revision:'1',scheduledDate:'2099-12-01'},f.data,f.api);
 assert.equal(result.record.publicationPlan.date,'2099-12-01');assert.equal(result.record.status,'In review');assert.equal(result.record.fields.body,'Read the evidence.');assert.equal(result.record.publication,undefined);
 f.data.items=[result.record];assert.match(calendar(f.data),/2099-12-01/);assert.match(calendar(f.data),/Planned publication/);
 for(const scheduledDate of ['2020-01-01','2099-02-30','bad'])await assert.rejects(reviewDecision(params,{action:'review-schedule',revision:'1',scheduledDate},fixture().data,fixture().api));
 await assert.rejects(reviewDecision(params,{action:'review-schedule',revision:'0',scheduledDate:'2099-12-01'},f.data,f.api),/changed/);
});
test('change request is versioned, persists guidance and survives an unavailable HQ connection',async()=>{
 const f=fixture(),reviewId=randomUUID(),result=await reviewDecision(params,{action:'review-decision',decision:'changes',revision:'1',reviewId,feedback:'Shorten the introduction.',guidance:'Explain technical words.'},f.data,f.api);
 assert.equal(result.record.status,'Changes requested');assert.equal(result.record.fields.body,'Read the evidence.');assert.equal(f.writes,1);
 assert.equal(result.record.reviewFeedback[0].reviewedRevision,1);assert.equal(result.record.reviewFeedback[0].delivery,'pending');assert.match(result.record.comments[0].body,/technical words/);
 f.data.byId.set(result.id,result.record);await reviewDecision(params,{action:'review-decision',decision:'changes',revision:'1',reviewId},f.data,f.api);
 assert.equal(f.writes,1,'A repeated POST must not duplicate feedback');
 assert.equal(reviewGuidance([f.stored],'nina').length,2);assert.equal(reviewGuidance([f.stored],'imogen').length,0);
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
test('legacy article links lead to the complete review window without saving or approving',async()=>{
 const f=fixture(),res={headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}};
 await handleStudio({method:'GET'},res,{params:new URLSearchParams({studio:'item',id:'worker:sample'}),actor:f.data.actor,api:f.api,load:async()=>({records:[]}),env:{}});
 assert.equal(res.statusCode,303);assert.match(res.headers.Location,/studio=review-preview/);
 assert.equal(f.writes,0);assert.equal(f.stored.status,'In review');
});

test('article save-and-preview returns the saved revision and standalone URL, with stale failures as JSON',async()=>{
 const f=fixture(),out=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}}),opts={params:new URLSearchParams({studio:'item',id:'worker:sample'}),actor:f.data.actor,api:f.api,load:async()=>({records:[]}),env:{}};
 const body={action:'content-save',intent:'preview',previewWindow:'yes',revision:'1',title:'Updated title',fields:JSON.stringify({body:'Saved edited content.'})};
 let res=out();await handleStudio({method:'POST',body},res,opts);assert.equal(res.statusCode,200);const result=JSON.parse(res.body);assert.equal(result.record.revision,2);assert.equal(result.record.fields.body,'Saved edited content.');assert.match(result.previewUrl,/studio=review-preview/);
 res=out();await handleStudio({method:'POST',body},res,opts);assert.equal(res.statusCode,409);assert.match(JSON.parse(res.body).error,/newer version/);assert.equal(f.writes,1);
});


test('approval saves first and opens publishing choices only for the administrator',async()=>{
 const f=fixture();const result=await reviewDecision(params,{action:'review-decision',decision:'approve',revision:'1',reviewId:randomUUID()},f.data,f.api);
 f.data.byId.set(result.id,result.record);f.data.items=[result.record];
 const html=reviewWindowDocument(new URLSearchParams({id:result.id,reviewed:'approve'}),f.data);
 assert.match(html,/data-publication-dialog data-open-on-load/);
 for(const label of ['Publish now','Schedule','Keep as approved draft'])assert.ok(html.includes('>'+label+'<'));
 assert.equal(result.record.approval.revision,result.record.revision);
});

test('publication choices validate approval, save London time and publish only on a separate explicit action',async()=>{
 const {publishFromReview,runScheduledPublications,londonPublicationTime}=await import('../server/studio-review-publication.mjs');
 const f=fixture();f.data.livePublishingReady=true;const r={...f.data.items[0],status:'Approved',approval:{by:'owner',revision:1}};
 const result=await publishFromReview({action:'review-schedule',revision:'1',scheduledAt:'2099-12-01T09:30'},r,f.data,f.api);
 assert.equal(result.record.publicationPlan.scheduledAt,'2099-12-01T09:30:00.000Z');assert.equal(result.record.approval.revision,2);
 assert.equal(londonPublicationTime('2099-07-01T09:30'),'2099-07-01T08:30:00.000Z');
 await assert.rejects(publishFromReview({action:'review-publish',revision:'0'},r,f.data,f.api),/changed/);
 await assert.rejects(publishFromReview({action:'review-publish',revision:'1'},{...r,status:'Draft'},f.data,f.api),/Approve/);
 const calls=[];await publishFromReview({action:'review-publish',revision:'1'},r,f.data,async(path,o)=>{calls.push(o.payload.target);return [];});assert.deepEqual(calls,['test','live']);
 let releases=0;const scheduled={...result.record,publicationPlan:{...result.record.publicationPlan,scheduledAt:'2026-01-01T09:00:00Z'}};
 const api=async(path,o)=>{if(path.includes('nufi_studio_items'))return [{id:scheduled.id,revision:2,payload:scheduled}];if(path.includes('nufi_studio_release')){if(o?.method==='POST'){releases++;return [];}return [];}return [];};
 assert.equal((await runScheduledPublications({api,env:{NUFI_STUDIO_LIVE_READY:'true'}})).published,1);assert.equal(releases,2);
 releases=0;scheduled.approval.revision=1;await runScheduledPublications({api,env:{NUFI_STUDIO_LIVE_READY:'true'}});assert.equal(releases,0,'Edited versions cannot be auto-published');
});


test('review handler dispatches the new schedule and keep-draft actions',async()=>{
 const f=fixture();const r=f.data.items[0];r.status='Approved';r.approval={by:'owner',revision:1};f.data.livePublishingReady=true;
 const result=await reviewDecision(params,{action:'review-schedule',revision:'1',scheduledAt:'2099-12-01T09:30'},f.data,f.api);
 assert.equal(result.reviewed,'scheduled');assert.equal(result.record.publicationPlan.state,'scheduled');
 f.data.byId.set(r.id,result.record);
 const kept=await reviewDecision(params,{action:'review-keep-draft',revision:'2'},f.data,f.api);
 assert.equal(kept.record.publicationPlan,undefined);assert.equal(kept.record.status,'Approved');
});


test('Vercel destination publishes and schedules to the existing website without enabling nutrition.fitness live releases',async()=>{
 const {publicationDestination}=await import('../server/studio-publishing.mjs');
 const {publishFromReview,runScheduledPublications}=await import('../server/studio-review-publication.mjs');
 const f=fixture();const r={...f.data.items[0],status:'Approved',approval:{by:'owner',revision:1}};
 f.data.publicationDestination=publicationDestination({NUFI_STUDIO_PUBLISH_TARGET:'vercel'});f.data.livePublishingReady=false;
 const calls=[];await publishFromReview({action:'review-publish',revision:'1'},r,f.data,async(path,o)=>{calls.push(o.payload.target);return [];});assert.deepEqual(calls,['test']);
 const result=await publishFromReview({action:'review-schedule',revision:'1',scheduledAt:'2099-12-01T09:30'},r,f.data,f.api);assert.equal(result.record.publicationPlan.destination,'test');
 const scheduled={...result.record,publicationPlan:{...result.record.publicationPlan,scheduledAt:'2026-01-01T09:00:00Z'}};
 const published=[];const api=async(path,o)=>path.includes('nufi_studio_items')?[{id:scheduled.id,revision:2,payload:scheduled}]:o?.method==='POST'?(published.push(o.payload.target),[]):[];
 assert.equal((await runScheduledPublications({api,env:{NUFI_STUDIO_PUBLISH_TARGET:'vercel'}})).published,1);assert.deepEqual(published,['test']);
});

test('asset approval reads the report before named folders and omits empty detail boxes',()=>{
 const f=fixture(),r={...f.data.items[0],kind:'asset',title:'Course production index',fields:{brief:'Course copies ready for review',body:'The course setup is ready.\n\nOne source still needs access.',courseFolders:{'Fat Loss Course':{url:'https://www.canva.com/folder/fatloss'},'Sleep Mastery':{url:'https://www.canva.com/folder/sleep'}},assetUrls:['https://www.canva.com/folder/fatloss','https://www.canva.com/folder/sleep'],ownedSourceCount:2,canvaSourceCount:3,ownedWorkingCopies:[{title:'Sleep basics',collection:'Sleep Mastery',canvaUrl:'https://www.canva.com/design/sleep/edit',pageCount:12}]}};
 f.data.items=[r];f.data.byId.set(r.id,r);
 const html=reviewWindowDocument(params,f.data);
 assert.match(html,/approval-paper/);assert.ok(html.indexOf('The course setup is ready.')<html.indexOf('Files &amp; editable copies'));
 assert.match(html,/>Fat Loss Course</);assert.match(html,/>Sleep Mastery</);assert.match(html,/Browse 1 working copy/);assert.match(html,/Sleep basics/);
 assert.doesNotMatch(html,/>More details<|History, feedback &amp; other actions|Copy verification/);
 assert.equal((html.match(/href="https:\/\/www.canva.com\/folder\/fatloss"/g)||[]).length,1);
});

test('boxed editor requires editing access and does not approve on open',async()=>{
 const f=fixture(),out=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}}),opts={params:new URLSearchParams({studio:'item',id:'worker:sample',tab:'edit',reviewEditor:'1'}),actor:f.data.actor,api:f.api,load:async()=>({records:[]}),env:{}};
 let res=out();await handleStudio({method:'GET'},res,opts);assert.equal(res.statusCode,200);assert.match(res.body,/data-review-editor/);assert.match(res.headers['Content-Security-Policy'],/frame-ancestors 'self'/);assert.equal(res.headers['X-Frame-Options'],'SAMEORIGIN');assert.match(res.body,/id="studio-editor-form"/);assert.doesNotMatch(res.body,/Studio navigation/);assert.equal(f.writes,0);
 res=out();await handleStudio({method:'GET'},res,{...opts,actor:{role:'staff',id:'reviewer',access:{library:true,work:true,edit:false,review_articles:true}}});assert.equal(res.statusCode,403);assert.doesNotMatch(res.body,/id="studio-editor-form"/);assert.equal(f.writes,0);
});
