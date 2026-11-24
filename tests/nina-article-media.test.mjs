import test from 'node:test';
import assert from 'node:assert/strict';
import {articleMediaIssues,reviewGuidance,draftDocument,draftResult} from '../server/worker-drafts.mjs';
import {issues} from '../server/studio-model.mjs';
import {reviewDecision} from '../server/studio-review.mjs';
const draft=()=>({id:'worker:sample',kind:'article',title:'A useful article',status:'Draft',revision:1,workerId:'nina',fields:{body:'Evidence-backed article',assetUrls:['https://unsplash.com/photos/example'],marginNote:'A useful label',imageAlt:'An accurate description',imageCredit:'Photographer / source'}});
test('a photo source page is incomplete until the photograph is uploaded',()=>{const r=draft();assert.match(articleMediaIssues(r).join(' '),/Upload a relevant article photograph/);assert.equal(articleMediaIssues(r).length,1);assert.ok(issues(r,[r]).length);});
test('uploaded photographs require an explicit label, description and credit',()=>{
 const r=draft();r.workerImage={bucket:'worker-content',path:'content-manager/00000000-0000-4000-8000-000000000001.jpg',type:'image/jpeg'};assert.deepEqual(articleMediaIssues(r),[]);
 for(const key of ['marginNote','imageAlt','imageCredit']){const next=structuredClone(r);next.fields[key]='';assert.equal(articleMediaIssues(next).length,1);}
 r.workerImage.path='https://unsplash.com/photo';assert.ok(articleMediaIssues(r).length);
});
test('Nina always receives the image-upload and label requirement, including without review history',()=>{const result=reviewGuidance([],'nina');assert.match(result[0].guidance,/upload_content_image/);assert.match(result[0].guidance,/fields.marginNote/);assert.deepEqual(reviewGuidance([],'marcus'),[]);});
test('drafts can be saved before uploading, with missing media reported back to the worker',()=>{
 const r=draftDocument({id:'sample',kind:'article',title:'Article',body:'Draft',revision:0},null,'worker:content-manager:');const result=draftResult({payload:r,revision:1},'https://example.test');assert.equal(result.articleMedia.ready,false);assert.equal(result.articleMedia.required,true);assert.equal(result.imageUploaded,false);
});
test('review submission and approval reject incomplete Nina images without any writes',async()=>{
 const r=draft(),data={actor:{role:'admin',id:'owner'},items:[r],byId:new Map([[r.id,r]]),people:[]};let writes=0;
 for(const decision of ['approve','submit'])await assert.rejects(reviewDecision(new URLSearchParams({id:r.id}),{action:'review-decision',decision,revision:'1',reviewId:'00000000-0000-4000-8000-000000000001'},data,async()=>{writes++;return [];}),/Upload a relevant article photograph/);
 assert.equal(writes,0);
});
