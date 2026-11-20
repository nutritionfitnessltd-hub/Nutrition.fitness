import {createHash} from 'node:crypto';
import {courseProductionBrief,coursePackFields,coursePlan} from './studio-courses.mjs';
import {HttpError,requireSecret} from './platform.mjs';
import {blankFields,cleanText} from './studio-model.mjs';
import {saveRecord,itemTable} from './studio-store.mjs';
import {sourceCourseManifest,ensureProductionCourse,attachProductionLesson} from './course-production-manifest.mjs';
export const productionDraftId=id=>'studio:imogen:'+createHash('sha256').update(id).digest('hex').slice(0,24);
const actor={id:'imogen-course-production',role:'staff',name:'Imogen',access:{library:true,edit:true}};
function link(raw,host,prefix){let u;try{u=new URL(raw);}catch{throw new HttpError(400,'Invalid production link.');}if(u.protocol!=='https:'||u.hostname!==host||u.username||u.password||!decodeURIComponent(u.pathname).startsWith(prefix))throw new HttpError(400,'Link is outside the production destination.');return u.href;}
export async function productionAction(req,input,{env,api,index}){
 requireSecret(req,env.NUFI_COURSE_PRODUCTION_TOKEN);
 if(!input||typeof input!=='object'||Array.isArray(input))throw new HttpError(400,'Supply a production action.');
 if(input.action==='status')return {connected:true,store:'Nutrition.Fitness Studio',publishing:false};
 if(!['source','save-draft','read-draft'].includes(input.action))throw new HttpError(400,'Unsupported production action.');
 const source=index.records.find(r=>r.id===input.sourceId&&r.group==='Courses');if(!source)throw new HttpError(404,'Choose an existing course source.');
 const id=productionDraftId(source.id),read=async()=>{const rows=await api(itemTable+'?id=eq.'+encodeURIComponent(id)+'&select=id,payload,revision&limit=1',{service:true});return rows[0]||null;};
 const current=await read();
 if(input.action==='source'){
  const course=await sourceCourseManifest(api,source.id);
  const parent=course.id?(await api('/rest/v1/nufi_studio_items?id=eq.'+encodeURIComponent(course.id)+'&select=id,payload,revision&limit=1',{service:true}))[0]:null;
  const plan=parent?coursePlan(parent.payload,{byId:new Map(),trackingMeta:{courses:{[course.name]:course}}}):null;
  const structureReview={status:plan?.approved?'approved':plan?.review?.decision==='changes'&&plan.review.fingerprint===plan.fingerprint?'changes_requested':'awaiting_review',note:plan?.review?.note||'',reviewedBy:plan?.review?.by||'',reviewedAt:plan?.review?.at||'',structureChangedSinceReview:Boolean(plan?.review&&plan.review.fingerprint!==plan.fingerprint)};
  return {source,draft:current,draftId:id,course,structureReview,courseBrief:courseProductionBrief,launchPack:{courseId:course.id||null,kind:'marketing',fields:{coursePack:true,courseId:course.id||null,workerId:'imogen',...Object.fromEntries(Object.keys(coursePackFields).map(k=>[k,'']))},saveWith:'Content Manager save_content_draft, using a stable ID per course. Read existing revision first. Upload the real hero image to that same draft with upload_content_image, including its description and source/rights. Studio displays the private uploaded image automatically; heroImageUrl is only for a real hosted image. All outputs remain Draft.'}};
 }
 if(input.action==='read-draft')return {draft:current};
 const allowed=['action','sourceId','expectedRevision','title','body','introduction','script','takeaway','activity','canvaUrl','files','durationSeconds'];
 if(Object.keys(input).some(k=>!allowed.includes(k)))throw new HttpError(400,'Only lesson draft fields may be changed.');
 if(!Number.isInteger(input.expectedRevision)||input.expectedRevision<0)throw new HttpError(400,'Supply the revision read before editing.');
 if((current?.revision||0)!==input.expectedRevision)throw new HttpError(409,'Draft changed. Read it again before saving.');
 if(current&&current.payload.status!=='Draft')throw new HttpError(409,'Draft has entered review. Return it to Draft in Studio before editing.');
 const title=cleanText(input.title||current?.payload.title||source.title,200),body=cleanText(input.body||'',100000);if(!title||!body)throw new HttpError(400,'Add a title and sourced lesson body.');
 const canvaUrl=link(input.canvaUrl,'www.canva.com','/design/');
 if(!Array.isArray(input.files)||!input.files.length||input.files.length>20)throw new HttpError(400,'Attach checked exports.');
 const files=input.files.map(f=>{if(!f||!Number.isSafeInteger(f.bytes)||f.bytes<=0||!/^[a-f0-9]{64}$/.test(f.sha256||''))throw new HttpError(400,'Files need checked size and SHA-256.');return {name:cleanText(f.name,240),url:link(f.url,'nutritionfitness.sharepoint.com','/sites/Nutrition.fitness/Shared Documents/Content Library/Courses/'),bytes:f.bytes,sha256:f.sha256};});
 const previous=current?.payload.fields||{},video=files.find(f=>/\.mp4$/i.test(f.name));
 const measured=input.durationSeconds??previous.production?.durationSeconds??previous.durationSeconds;
 if(video&&(typeof measured!=='number'||!Number.isFinite(measured)||measured<=0||measured>86400))throw new HttpError(400,'Video exports require a measured duration in seconds.');
 if(input.durationSeconds!==undefined&&(typeof input.durationSeconds!=='number'||!Number.isFinite(input.durationSeconds)||input.durationSeconds<0||input.durationSeconds>86400))throw new HttpError(400,'Use a valid measured duration in seconds.');
 const manifest=await sourceCourseManifest(api,source.id);
 if(!manifest.ready)throw new HttpError(409,manifest.reason);
 const parent=await ensureProductionCourse(api,actor,manifest);
 if(current?.payload.parent&&current.payload.parent!==parent.id)throw new HttpError(409,'The saved lesson belongs to another course. Check its association before changing it.');
 if(parent.payload.status!=='Draft'&&!(parent.payload.fields.lessonIds||[]).includes(id))throw new HttpError(409,'The course has entered review. Return it to Draft before adding lessons.');
 const record={...current?.payload,id,kind:'lesson',title,status:'Draft',parent:current?.payload.parent||null,sourceId:source.id,comments:current?.payload.comments||[],source:{...current?.payload.source,id:source.id,needsChecking:true},fields:{...blankFields('lesson'),...previous,body,...Object.fromEntries(['introduction','script','takeaway','activity'].map(k=>[k,cleanText(Object.hasOwn(input,k)?input[k]||'':previous[k]||'',100000)])),videoUrl:video?.url||previous.videoUrl||'',durationSeconds:video?Math.max(1,Math.round(measured)):previous.durationSeconds||0,production:{...previous.production,worker:'Imogen',sourceId:source.id,canvaUrl,files,...(video?{durationSeconds:measured}:{}),checkedAt:new Date().toISOString(),reviewRequired:true}}};
 delete record.approval;
 record.parent=parent.id;record.workerId='imogen';
 record.fields.production.course={id:parent.id,name:manifest.name,module:manifest.lesson.module,modulePosition:manifest.lesson.modulePosition,lessonPosition:manifest.lesson.position,lessonKey:manifest.lesson.key};
 await saveRecord(api,actor,record,input.expectedRevision);
 await attachProductionLesson(api,actor,manifest,id);
 const saved=await read();if(!saved||saved.revision!==input.expectedRevision+1||saved.payload.status!=='Draft'||saved.payload.sourceId!==source.id)throw new HttpError(503,'Draft save could not be verified. Read before retrying.');
 return {id,revision:saved.revision,status:'Draft',reviewUrl:'/content-library/?work=1&studio=item&id='+encodeURIComponent(id),record:saved.payload};
}
