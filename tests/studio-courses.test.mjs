import test from 'node:test';
import assert from 'node:assert/strict';
import {coursePlan,coursePack,coursePreview,courseEditorRecord,reviewCourseStructure,courseProductionBrief} from '../server/studio-courses.mjs';
import {itemPage} from '../server/studio-pages.mjs';
import {authorizeStudioRequest} from '../server/library-permissions.mjs';
import {attachProductionLesson} from '../server/course-production-manifest.mjs';
import {handleStudio} from '../server/studio.mjs';

export function courseFixture(){
 const course={id:'course',kind:'course',title:'Fat Loss Course',revision:2,status:'Draft',fields:{introduction:'',outcome:'',lessonIds:['lesson1'],production:{collection:'Fat Loss Course'}},comments:[]};
 const lesson={id:'lesson1',kind:'lesson',title:'First lesson',parent:course.id,sourceId:'catalogue:first',status:'Draft',fields:{}};
 const meta={courses:{'Fat Loss Course':{order:'confirmed',sections:[{title:'Module 1',entries:[{id:'catalogue:first',title:'First lesson'},{id:'catalogue:second',title:'Second lesson'}]},{title:'Module 2',entries:[{id:'catalogue:third',title:'Third lesson'}]}]}}};
 const data={actor:{role:'admin',id:'james',name:'James'},items:[course,lesson],byId:new Map([[course.id,course],[lesson.id,lesson]]),assigned:new Set(),trackingMeta:meta,projects:[],index:{records:[]}};
 const params=new URLSearchParams({id:course.id});
 const review={revision:2,fingerprint:coursePlan(course,data).fingerprint,decision:'approve',note:''};
 return {course,lesson,data,params,review};
}
test('course preview includes the complete ordered structure, empty overview and a separate approval action',()=>{
 const {course,data,params}=courseFixture(),html=itemPage(params,data);
 assert.match(html,/2 modules · 3 lessons/);assert.match(html,/Second lesson/);assert.match(html,/Third lesson/);
 assert.match(html,/Approve course structure/);assert.match(html,/Imogen still needs to add/);
 assert.doesNotMatch(html,/<article class="studio-content-preview"><\/article>/);
 assert.match(html,/0 \/ 6 drafts ready/);assert.equal(coursePlan(course,data).approved,false);
});
test('structure approval is versioned, preserves Draft and does not approve content',async()=>{
 const {course,data,params,review}=courseFixture();let payload;
 await reviewCourseStructure(params,review,data,async(_,o)=>{payload=o.payload;return [{}];});
 assert.equal(payload.expected,2);assert.equal(payload.document.status,'Draft');assert.equal(payload.document.approval,undefined);
 assert.deepEqual(payload.document.fields,course.fields);assert.equal(payload.document.courseStructureReview.by,'James');
 Object.assign(course,payload.document);assert.equal(coursePlan(course,data).approved,true);
 course.fields.lessonIds.push('new-export');course.fields.introduction='Updated copy';assert.equal(coursePlan(course,data).approved,true);
 data.trackingMeta.courses[course.title].sections[0].entries.reverse();assert.equal(coursePlan(course,data).approved,false);
});
test('stale versions, reordered source and incomplete indexes cannot be approved',async()=>{
 const {course,data,params,review}=courseFixture();const never=()=>{throw Error('Must not save');};
 await assert.rejects(reviewCourseStructure(params,{...review,revision:1},data,never),e=>e.status===409);
 await assert.rejects(reviewCourseStructure(params,{...review,fingerprint:'old'},data,never),e=>e.status===409);
 data.trackingMeta.courses[course.title].order='partial';
 await assert.rejects(reviewCourseStructure(params,review,data,never),e=>e.status===400);
 data.trackingMeta={};assert.equal(coursePlan(course,data).complete,false);assert.equal(coursePlan(course,data).lessons.length,0);
});
test('only a course reviewer with access can approve; ordinary assigned editors cannot',async()=>{
 const {course,data,params,review}=courseFixture();
 data.actor={id:'kasia',name:'Kasia',role:'staff',access:{library:true,work:true,edit:true}};data.assigned.add(course.id);
 await assert.rejects(reviewCourseStructure(params,review,data,async()=>[{}]),e=>e.status===403);
 data.actor.access.review_courses=true;data.actor.access.edit=false;
 authorizeStudioRequest(data.actor,'item','POST',{action:'course-structure-review'});
 await reviewCourseStructure(params,review,data,async()=>[{}]);
 data.assigned.clear();await assert.rejects(reviewCourseStructure(params,review,data,async()=>[{}]),e=>e.status===403);
});
test('request changes needs a note and concurrent saves fail closed',async()=>{
 const {data,params,review}=courseFixture();
 await assert.rejects(reviewCourseStructure(params,{...review,decision:'changes'},data,async()=>[{}]),e=>e.status===400);
 await assert.rejects(reviewCourseStructure(params,review,data,async()=>[]),e=>e.status===409);
 let saved;await reviewCourseStructure(params,{...review,decision:'changes',note:'Add the missing introduction'},data,async(_,o)=>{saved=o.payload.document;return [{}];});
 assert.equal(saved.status,'Draft');assert.equal(saved.courseStructureReview.decision,'changes');
});
test('a linked worker pack renders saved copy, copyable script and private uploaded hero image',()=>{
 const {course,data}=courseFixture();
 const pack={id:'pack',kind:'campaign',status:'Draft',fields:{coursePack:true,courseId:course.id,introduction:'Hello',outcome:'Understand',audience:'Members',marketingCopy:'Landing copy',introductionScript:'Welcome to the course',welcomeEmail:'Welcome',socialCopy:'Launch',imageAlt:'A person walking',imageCredit:'Our original photo'},workerImage:{bucket:'worker-content',path:'content-manager/12345678-1234-1234-1234-123456789abc.webp'}};
 data.items.push(pack);data.byId.set(pack.id,pack);
 const model=coursePack(course,data),html=coursePreview(course,data,v=>String(v));
 assert.equal(model.ready,6);assert.match(html,/Copy introduction script/);assert.match(html,/Estimated narration/);assert.match(html,/studio=article-image/);
 assert.equal(courseEditorRecord(course,data).fields.marketingCopy,'Landing copy');
 course.fields.marketingCopy='Owner revised copy';assert.equal(coursePack(course,data).fields.marketingCopy,'Owner revised copy');
 assert.equal(courseEditorRecord(course,data).fields.marketingCopy,'Owner revised copy');
 assert.match(html,/Landing copy/);assert.doesNotMatch(html,/src="https?:\/\/.*12345678/);
 pack.fields.heroImageUrl='javascript:alert(1)';delete pack.workerImage;assert.equal(coursePack(course,data).ready,5);
});
test('unrelated or inaccessible packs do not appear and cannot forge structure approval',()=>{
 const {course,data}=courseFixture();const pack={id:'hidden',kind:'campaign',status:'Draft',fields:{coursePack:true,courseId:course.id,marketingCopy:'PRIVATE'}};
 data.items.push(pack);data.actor={role:'staff',id:'editor',access:{library:true,edit:true}};data.assigned.add(course.id);
 course.fields.courseStructureReview={decision:'approve',fingerprint:coursePlan(course,data).fingerprint};
 assert.equal(coursePlan(course,data).approved,false);assert.equal(coursePack(course,data).linked,undefined);
 assert.doesNotMatch(coursePreview(course,data,v=>String(v)),/PRIVATE|Approve course structure/);
});
test('production can attach a later draft after structure approval',async()=>{
 const {course,data}=courseFixture();course.courseStructureReview={decision:'approve',fingerprint:coursePlan(course,data).fingerprint};
 let row={id:course.id,revision:2,payload:course};
 const api=async(_,o={})=>{if(o.method==='POST'){assert.equal(o.payload.expected,row.revision);row={...row,revision:row.revision+1,payload:o.payload.document};}return [row];};
 await attachProductionLesson(api,{id:'worker',role:'admin'},{id:course.id,name:course.title,ready:true,lessons:[{sourceId:'catalogue:first'},{sourceId:'catalogue:second'}]},'lesson2');
 assert.equal(row.payload.status,'Draft');assert.ok(row.payload.fields.lessonIds.includes('lesson2'));assert.deepEqual(row.payload.courseStructureReview,course.courseStructureReview);
});
test('worker instructions explicitly include the launch pack and continuing daily work',()=>{
 assert.match(courseProductionBrief,/marketing and landing page copy/);assert.match(courseProductionBrief,/hero image/);
 assert.match(courseProductionBrief,/three course lessons every day plus/);assert.match(courseProductionBrief,/do not stop/);assert.match(courseProductionBrief,/Never approve or publish/);
});
test('older training lesson references retain their saved order and working links',()=>{
 const {course,data}=courseFixture();delete course.fields.production;
 const first={id:'training:old-one',title:'First older lesson',kind:'lesson',status:'Draft',fields:{}},second={...first,id:'training:old-two',title:'Second older lesson'};
 data.items.push(first,second);data.byId.set(first.id,first);data.byId.set(second.id,second);
 course.fields.lessonIds=['old-two','old-one'];const plan=coursePlan(course,data);
 assert.equal(plan.complete,true);assert.deepEqual(plan.lessons.map(l=>l.title),[second.title,first.title]);
 assert.match(coursePreview(course,data,v=>String(v)),/id=training%3Aold-two/);
});
test('the authenticated Studio form saves structure approval and redirects back to the draft',async()=>{
 const {course,lesson,data,params}=courseFixture();delete course.fields.production;
 const rows=[course,lesson].map(r=>({id:r.id,revision:r.revision||1,payload:r}));let saved;
 const api=async(path,o={})=>{if(path.includes('rpc/nufi_studio_save')){saved=o.payload;return [{}];}return path.includes('nufi_studio_items')?rows:[];};
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}};
 params.set('studio','item');
 await handleStudio({method:'POST',body:{action:'course-structure-review',revision:2,fingerprint:coursePlan(course,data).fingerprint,decision:'approve',note:''}},res,{params,actor:data.actor,api,load:async()=>({records:[],files:{}}),env:{}});
 assert.equal(res.statusCode,303);assert.match(res.headers.Location,/studio=item/);assert.equal(saved.document.status,'Draft');assert.equal(saved.document.courseStructureReview.decision,'approve');
});
