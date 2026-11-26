import test from 'node:test';
import assert from 'node:assert/strict';
import {offeringManifest,offeringReviewAction,approvedOffering,offeringDocumentId,reviewQueue,websiteApprovedRecord} from '../server/offering-review.mjs';
import {dashboardWork,workspaceDashboard} from '../server/studio-dashboard.mjs';
import {canReviewContent,canEditContent} from '../server/library-permissions.mjs';
import {handleStudio} from '../server/studio.mjs';
import {offeringReviewPage} from '../server/offering-review.mjs';
function fixture(){
 const file={name:'video.mp4',url:'https://nutritionfitness.sharepoint.com/sites/Test/video.mp4',bytes:10,sha256:'a'.repeat(64)};
 const items=[{id:'product',kind:'product',title:'Whole offering',status:'In review',fields:{description:'A useful product'}},{id:'other-product',kind:'product',title:'Other product',status:'In review',fields:{}},{id:'shared-asset',kind:'asset',title:'Shared asset',status:'In review',fields:{brief:'A shared asset',productIds:['product','other-product']}},{id:'video',kind:'asset',title:'Finished video',parent:'product',status:'Draft',fields:{brief:'Video',production:{files:[file]}}}];
 const rows=new Map(items.map(payload=>[payload.id,{id:payload.id,payload:structuredClone(payload),revision:1}]));
 const data={actor:{role:'admin',id:'owner',name:'Owner'},projects:[],tasks:[],people:[],index:{records:[]},assigned:new Set(),items:[],byId:new Map(),offeringReviews:[]};let writes=0;
 const reload=()=>{data.items=[...rows.values()].map(row=>({...structuredClone(row.payload),revision:row.revision}));data.byId=new Map(data.items.map(r=>[r.id,r]));data.offeringReviews=data.items.filter(r=>r.fields?.websiteOfferingReview);};reload();
 const api=async(path,o={})=>{if(o.method){const p=o.payload,old=rows.get(p.item);if((old?.revision||0)!==p.expected)return [];const row={id:p.item,payload:structuredClone(p.document),revision:p.expected+1};rows.set(row.id,row);writes++;return [row];}if(path.startsWith('/rest/v1/nufi_studio_items')){const id=new URL(path,'https://test').searchParams.get('id');return id?.startsWith('eq.')?[rows.get(id.slice(3))].filter(Boolean):[...rows.values()];}return [];};
 return {data,rows,api,reload,get writes(){return writes;}};
}
test('launch scope is explicit and a newly linked asset invalidates its final sign-off',async()=>{
 const f=fixture();f.rows.get('video').payload.status='Approved';f.reload();f.data.projects=[{id:'launch',name:'Supplements launch',creator_id:'owner',studio:{allowedIds:[]},entries:[]}];const key='project:launch';
 assert.equal(offeringManifest(f.data,key).records.length,0);assert.match(offeringReviewPage(new URLSearchParams({offering:key}),f.data),/include:product/);
 await assert.rejects(()=>offeringReviewAction({action:'offering-request',offering:key,revision:0},f.data,f.api),/Include the offering/);
 await offeringReviewAction({action:'offering-request',offering:key,revision:0,'include:product':'yes'},f.data,f.api);f.reload();
 const m=offeringManifest(f.data,key);assert.deepEqual(m.records.map(r=>r.id),['product','shared-asset','video']);
 await offeringReviewAction({action:'offering-approve',offering:key,revision:1,fingerprint:m.fingerprint,confirmed:'yes'},f.data,f.api);f.reload();assert.ok(approvedOffering(f.data,key));
 f.rows.set('new-asset',{id:'new-asset',revision:1,payload:{id:'new-asset',kind:'asset',parent:'product',title:'New asset',status:'Draft',fields:{brief:'New asset'}}});f.reload();assert.equal(approvedOffering(f.data,key),null);
});
test('routine drafts leave the queue; finished videos open the same approval modal from Home',()=>{
 const f=fixture();for(let i=0;i<120;i++){const r={id:'draft'+i,kind:'product',title:'Routine draft '+i,status:'In review',fields:{},revision:1};f.data.items.push(r);f.data.byId.set(r.id,r);}
 const queue=dashboardWork(f.data).reviews;assert.equal(queue.length,1);assert.equal(queue[0].record.id,'video');
 const home=workspaceDashboard(f.data);assert.match(home,/data-production-video/);assert.match(home,/Open video &amp; approve/);assert.match(home,/data-video-approval-source hidden/);assert.doesNotMatch(home,/Routine draft 119/);
 const staff={...f.data,actor:{role:'staff',id:'reviewer',access:{work:true,library:true,review_marketing:true}},assigned:new Set()};assert.equal(canReviewContent(staff,f.data.byId.get('video')),true);assert.equal(canEditContent(staff,'video'),false);
});
test('one offering includes linked assets without pulling in other products sharing them',()=>{
 const f=fixture(),m=offeringManifest(f.data,'product');assert.deepEqual(m.records.map(r=>r.id),['product','shared-asset','video']);assert.equal(m.unapprovedVideos.length,1);
});
test('final sign-off is administrator-only, waits for video approval and becomes stale on content or membership changes',async()=>{
 const f=fixture();await offeringReviewAction({action:'offering-request',offering:'product',revision:'0'},f.data,f.api);f.reload();const doc=f.data.offeringReviews[0];
 const form={action:'offering-approve',offering:'product',revision:doc.revision,fingerprint:offeringManifest(f.data,'product').fingerprint,confirmed:'yes'};
 await assert.rejects(()=>offeringReviewAction(form,f.data,f.api),/finished videos/);
 await assert.rejects(()=>offeringReviewAction(form,{...f.data,actor:{role:'staff',id:'staff',access:{work:true,library:true,all_library:true,edit:true}}},f.api),e=>e.status===403);
 f.rows.get('video').payload.status='Approved';f.reload();await offeringReviewAction({...form,fingerprint:offeringManifest(f.data,'product').fingerprint},f.data,f.api);f.reload();assert.ok(approvedOffering(f.data,'product'));assert.equal(f.rows.get('product').payload.status,'In review');assert.equal(f.rows.get('shared-asset').payload.status,'In review');assert.equal(reviewQueue(f.data).length,0);
 f.rows.get('shared-asset').payload.fields.brief='Changed copy';f.reload();assert.equal(approvedOffering(f.data,'product'),null);assert.equal(reviewQueue(f.data).filter(r=>r.type==='offering').length,1);
});
test('a saved sign-off covers the exact content version; website handoff needs no component approval click',async()=>{
 const f=fixture();f.rows.get('video').payload.status='Approved';f.reload();const m=offeringManifest(f.data,'product');await offeringReviewAction({action:'offering-approve',offering:'product',revision:0,fingerprint:m.fingerprint,confirmed:'yes'},f.data,f.api);f.reload();const approved=await websiteApprovedRecord(f.data.byId.get('product'),f.data,f.api);assert.equal(approved.status,'Approved');assert.equal(approved.approval.offeringKey,'product');f.reload();assert.ok(approvedOffering(f.data,'product'));f.rows.get('product').payload.fields.description='A different product promise';f.reload();await assert.rejects(()=>websiteApprovedRecord(f.data.byId.get('product'),f.data,f.api),/whole offering/);
});
test('video modal approval responses remain compatible and offer export records are revision guarded',async()=>{
 const f=fixture(),headers={},res={setHeader(k,v){headers[k]=v;},end(body){this.body=body;}};
 await handleStudio({method:'POST',headers:{},body:{action:'review-decision',decision:'approve',revision:'1',reviewId:'00000000-0000-4000-8000-000000000001',videoSha256:'a'.repeat(64)}},res,{params:new URLSearchParams({studio:'review-preview',id:'video',fragment:'1'}),actor:f.data.actor,api:f.api,load:async()=>({records:[]}),env:{}});
 assert.equal(res.statusCode,200);assert.match(res.body,/data-review-status>Approved\.</);assert.equal(f.rows.get('video').payload.status,'Approved');f.reload();
 const first=offeringManifest(f.data,'product');f.rows.get('product').payload.fields.description='Changed after preview';f.reload();await assert.rejects(()=>offeringReviewAction({action:'offering-approve',offering:'product',revision:0,fingerprint:first.fingerprint,confirmed:'yes'},f.data,f.api),e=>e.status===409);
});


