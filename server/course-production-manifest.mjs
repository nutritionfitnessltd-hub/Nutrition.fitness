import {createHash} from 'node:crypto';
import {HttpError} from './platform.mjs';
import {saveRecord,itemTable} from './studio-store.mjs';
import {coursePlan} from './studio-courses.mjs';

export function allowsProductionLesson(course,manifest){
 if(course.payload.status==='Archived')return false;
 if(course.payload.status==='Draft')return true;
 return coursePlan(course.payload,{byId:new Map(),trackingMeta:{courses:{[manifest.name]:manifest}}}).complete;
}

export const productionCourseId=name=>'studio:course:'+createHash('sha256').update(name).digest('hex').slice(0,24);
export async function sourceCourseManifest(api,sourceId){
 const rows=await api('/rest/v1/nufi_library_display?id=eq.shelves&select=payload&limit=1',{service:true});
 const matches=[];
 for(const [name,course] of Object.entries(rows[0]?.payload?.courses||{})){
  const lessons=(course.sections||[]).flatMap((section,moduleIndex)=>(section.entries||[]).map((e,i)=>({sourceId:e.id,key:e.key||e.id,title:e.title,position:e.position||i+1,module:section.title||'',modulePosition:moduleIndex+1})));
  const selected=lessons.filter(e=>e.sourceId===sourceId);
  for(const lesson of selected)matches.push({id:productionCourseId(name),name,order:course.order,sections:course.sections||[],lesson,lessons,support:course.support||[]});
 }
 if(matches.length!==1)return {ready:false,reason:matches.length?'This source maps to more than one lesson. Confirm the lesson identity before saving.':'This source is not mapped to a course lesson yet.'};
 const manifest=matches[0];
 return {...manifest,ready:manifest.order==='confirmed',...manifest.order!=='confirmed'?{reason:'The course lesson order is not confirmed yet.'}:{}};
}
export async function ensureProductionCourse(api,actor,manifest){
 if(!manifest.ready)throw new HttpError(409,manifest.reason);
 const read=async()=> (await api(itemTable+'?id=eq.'+encodeURIComponent(manifest.id)+'&select=id,payload,revision&limit=1',{service:true}))[0]||null;
 let course=await read();
 if(!course){
  const record={id:manifest.id,kind:'course',title:manifest.name,status:'Draft',workerId:'imogen',parent:null,comments:[],fields:{audience:'',outcome:'',introduction:'',lessonIds:[],production:{worker:'Imogen',collection:manifest.name,sourceLessonIds:manifest.lessons.map(e=>e.sourceId)}}};
  try{await saveRecord(api,actor,record,0);}catch(error){if(error.status!==409)throw error;}
  course=await read();
 }
 if(!course||course.payload.kind!=='course'||course.payload.fields?.production?.collection!==manifest.name)throw new HttpError(409,'The production course does not match the source manifest.');
 return course;
}
export async function attachProductionLesson(api,actor,manifest,lessonId){
 for(let attempt=0;attempt<3;attempt++){
  const course=await ensureProductionCourse(api,actor,manifest),ids=course.payload.fields.lessonIds||[];
  if(ids.includes(lessonId))return;
  if(!allowsProductionLesson(course,manifest))throw new HttpError(409,'Confirm the complete lesson order before adding lesson drafts.');
  // A planned draft links through its parent/source; do not revise a reviewed course.
  if(course.payload.status!=='Draft')return;
  const ordered=new Map(manifest.lessons.map((e,i)=>['studio:imogen:'+createHash('sha256').update(e.sourceId).digest('hex').slice(0,24),i]));
  const record={...course.payload,fields:{...course.payload.fields,lessonIds:[...ids,lessonId].sort((a,b)=>(ordered.get(a)??Infinity)-(ordered.get(b)??Infinity))}};
  try{await saveRecord(api,actor,record,course.revision);return;}catch(error){if(error.status!==409||attempt===2)throw error;}
 }
}
