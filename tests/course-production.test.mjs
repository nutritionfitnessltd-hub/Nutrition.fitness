import test from 'node:test';
import assert from 'node:assert/strict';
import {productionAction,productionDraftId} from '../server/course-production.mjs';
import {createCourseProductionHandler} from '../api/course-production.js';
import {coursePlan} from '../server/studio-courses.mjs';
const env={NUFI_COURSE_PRODUCTION_TOKEN:'test-production-secret'};
const req={headers:{authorization:'Bearer test-production-secret'}};
const source={id:'C00579',title:'BMR',group:'Courses'};
const input={action:'save-draft',sourceId:source.id,expectedRevision:0,durationSeconds:236.82,body:'Source-supported lesson.',canvaUrl:'https://www.canva.com/design/COPY/edit',files:[{name:'lesson.mp4',url:'https://nutritionfitness.sharepoint.com/sites/Nutrition.fitness/Shared%20Documents/Content%20Library/Courses/Fat%20Loss/lesson.mp4',bytes:4567,sha256:'a'.repeat(64)}]};
function fixture(){const rows=new Map();const manifest={order:'confirmed',sections:[{title:'Module 1',entries:[{id:source.id,title:source.title,position:1},{id:'next',title:'Next lesson',position:2}]}]};return {rows,manifest,index:{records:[source]},env,api:async(path,options={})=>{
 if(path.includes('nufi_library_display'))return [{payload:{courses:{'Fat Loss Course':manifest}}}];
 if(options.method==='POST'){const old=rows.get(options.payload.item);assert.equal(options.payload.editor_name,'staff:imogen-course-production');assert.equal(options.payload.expected,old?.revision||0);const row={id:options.payload.item,payload:options.payload.document,revision:(old?.revision||0)+1};rows.set(row.id,row);return [row];}
 const id=new URL('https://test.invalid'+path).searchParams.get('id')?.slice(3),row=rows.get(id);return row?[row]:[];
}};}
test('production requires its scoped credential and rejects non-course sources',async()=>{const ctx=fixture();await assert.rejects(productionAction({headers:{}},input,ctx),e=>e.status===401);await assert.rejects(productionAction(req,{...input,sourceId:'another'},ctx),e=>e.status===404);});
test('writes a linked Studio Draft, reads it back and refuses stale retries',async()=>{const ctx=fixture(),saved=await productionAction(req,input,ctx);assert.equal(saved.id,productionDraftId(source.id));assert.equal(saved.status,'Draft');assert.equal(saved.record.sourceId,source.id);assert.equal(saved.record.fields.production.files[0].bytes,4567);assert.equal(saved.revision,1);assert.equal(saved.record.approval,undefined);await assert.rejects(productionAction(req,input,ctx),e=>e.status===409);const read=await productionAction(req,{action:'read-draft',sourceId:source.id},ctx);assert.equal(read.draft.id,saved.id);});
test('cannot publish, inject fields, save unchecked files or use another destination',async()=>{for(const change of [{status:'Approved'},{expectedRevision:-1},{files:[]},{files:[{...input.files[0],url:'https://evil.example/file.mp4'}]},{files:[{...input.files[0],sha256:'unchecked'}]}])await assert.rejects(productionAction(req,{...input,...change},fixture()),e=>[400,409].includes(e.status));});
test('HTTP bridge rejects unauthenticated requests before loading private content',async()=>{let status,loaded=false;const res={setHeader(){},status(n){status=n;return this;},json(value){return value;}};const handler=createCourseProductionHandler({env,load:async()=>{loaded=true;throw Error('must not read');}});await handler({headers:{},method:'POST',body:input},res);assert.equal(status,401);assert.equal(loaded,false);});


test('video exports populate the actual lesson video and measured length fields',async()=>{const ctx=fixture();const saved=await productionAction(req,{...input,script:'Preserve the narration.',activity:'Keep this action.'},ctx);assert.equal(saved.record.fields.videoUrl,input.files[0].url);assert.equal(saved.record.fields.durationSeconds,237);assert.equal(saved.record.fields.production.durationSeconds,236.82);const revised=await productionAction(req,{...input,expectedRevision:1,body:'Updated body.'},ctx);assert.equal(revised.record.fields.script,'Preserve the narration.');assert.equal(revised.record.fields.activity,'Keep this action.');assert.equal(revised.record.fields.videoUrl,input.files[0].url);});
test('video exports cannot silently save a zero or missing duration',async()=>{for(const durationSeconds of [undefined,0,-1,NaN,Infinity,'236.82',86401])await assert.rejects(productionAction(req,{...input,durationSeconds},fixture()),e=>e.status===400);});
test('a document export does not need a fabricated video duration',async()=>{const saved=await productionAction(req,{...input,durationSeconds:undefined,files:[{...input.files[0],name:'lesson.pdf',url:input.files[0].url.replace('.mp4','.pdf')}]},fixture());assert.equal(saved.record.fields.videoUrl,'');assert.equal(saved.record.fields.durationSeconds,0);});

test('source exposes the full course order and saves real course/module association',async()=>{
 const ctx=fixture(),read=await productionAction(req,{action:'source',sourceId:source.id},ctx);
 assert.equal(read.course.ready,true);assert.equal(read.course.lessons.length,2);assert.equal(read.course.lesson.module,'Module 1');
 const saved=await productionAction(req,input,ctx),course=ctx.rows.get(saved.record.parent);
 assert.equal(course.payload.title,'Fat Loss Course');assert.deepEqual(course.payload.fields.lessonIds,[saved.id]);
 assert.equal(saved.record.fields.production.course.lessonPosition,1);assert.equal(saved.record.fields.production.course.module,'Module 1');
 assert.equal(saved.record.workerId,'imogen');assert.equal(saved.record.status,'Draft');
});
test('worker reads actual structure approval and feedback without gaining approval powers',async()=>{
 const ctx=fixture(),saved=await productionAction(req,input,ctx),parent=ctx.rows.get(saved.record.parent);
 const read=()=>productionAction(req,{action:'source',sourceId:source.id},ctx);
 assert.equal((await read()).structureReview.status,'awaiting_review');
 const fingerprint=coursePlan(parent.payload,{byId:new Map(),trackingMeta:{courses:{'Fat Loss Course':ctx.manifest}}}).fingerprint;
 parent.payload.courseStructureReview={decision:'approve',fingerprint,by:'James',note:'Order checked',at:'2026-11-20'};
 let result=await read();assert.equal(result.structureReview.status,'approved');assert.equal(result.structureReview.note,'Order checked');assert.equal(result.launchPack.fields.courseId,parent.id);
 ctx.manifest.sections[0].entries.reverse();result=await read();assert.equal(result.structureReview.status,'awaiting_review');assert.equal(result.structureReview.structureChangedSinceReview,true);
 assert.equal(parent.payload.status,'Draft');
});
test('unconfirmed or ambiguous mappings cannot create orphan lessons',async()=>{
 for(const ambiguous of [false,true]){const ctx=fixture();if(ambiguous)ctx.manifest.sections[0].entries.push({...ctx.manifest.sections[0].entries[0],position:3});else ctx.manifest.order='partial';
  await assert.rejects(productionAction(req,input,ctx),e=>e.status===409);assert.equal(ctx.rows.size,0);
 }
});
test('existing pilot gets its parent without losing content, timing or source identity',async()=>{
 const ctx=fixture(),id=productionDraftId(source.id);ctx.rows.set(id,{id,revision:2,payload:{id,kind:'lesson',title:source.title,parent:null,status:'Draft',sourceId:source.id,fields:{script:'Keep this script',activity:'Keep this action',durationSeconds:237,production:{durationSeconds:236.82}}}});
 const saved=await productionAction(req,{...input,expectedRevision:2},ctx);
 assert.ok(saved.record.parent);assert.equal(saved.record.fields.script,'Keep this script');assert.equal(saved.record.fields.activity,'Keep this action');assert.equal(saved.record.fields.production.durationSeconds,236.82);assert.equal(saved.record.sourceId,source.id);
});
