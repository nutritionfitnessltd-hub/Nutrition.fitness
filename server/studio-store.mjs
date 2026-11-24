import {applyProgrammeResets} from './studio-programme-reset.mjs';
import {isIdea,ideaTeams,canSeeIdea} from './idea-visibility.mjs';
import {ownsTask} from './studio-project-tasks.mjs';
import {includeAdministrator} from './team-owner.mjs';
import {projectTrackingSummaries} from './studio-production-tracker.mjs';
import {assignmentProjectId} from './team-assignments.mjs';
import { requireAccess, canReadContent, canReviewContent, reviewsKind } from './library-permissions.mjs';
import { HttpError } from './platform.mjs';
import { canonical, descendants, references } from './studio-model.mjs';

const service={service:true};
export const itemTable='/rest/v1/nufi_studio_items';
export const projectTable='/rest/v1/nufi_library_projects';
export function mergeStudioRecord(base,payload){
  if(!payload._basePatch)return payload;
  if(!base)throw new HttpError(503,'The original content for this revised draft is unavailable.');
  const record={...base,...payload,fields:{...base.fields,...payload.fields}};
  for(const key of payload.removedFields||[])delete record.fields[key];
  delete record._basePatch;delete record.removedFields;
  return record;
}
export async function allRows(api,url){
  const rows=[];
  for(let offset=0;;offset+=500){
    const batch=await api(url+'&limit=500&offset='+offset,service);
    rows.push(...batch);if(batch.length<500)return rows;
  }
}
export async function studioData(api,actor,load){
  let [index,overlays,projects,tasks,people,releases]=await Promise.all([
    load(),allRows(api,itemTable+'?select=id,payload,revision,updated_at&order=id&id=not.like.studio:notification:*&and=(id.not.like.studio:task-thread:*,id.not.like.studio:account-preview:*)'),
    allRows(api,projectTable+'?select=*&order=created_at.desc,id'+(actor.role==='admin'?'':'&or=(creator_id.eq.'+actor.id+',entries.cs.'+encodeURIComponent(JSON.stringify([{assignee:actor.id}]))+')')),
    allRows(api,'/rest/v1/nufi_library_tasks?select=*&order=created_at.desc,id'+(actor.role==='admin'?'':'&staff_id=eq.'+actor.id)),
    api('/rest/v1/nufi_library_staff?select=id,name'+(actor.role==='admin'?',email':'')+'&order=name',service),
    actor.role==='admin'?allRows(api,'/rest/v1/nufi_studio_releases?select=item_id,environment,source_revision,published_at&order=item_id'):Promise.resolve([])
  ]);
  if(actor.role==='admin')people=await includeAdministrator(api,actor,people);
  const ideaPeople=people;
  if(actor.role!=='admin')people=[{id:actor.id,name:actor.name}];
  if(actor.role!=='admin'){
    const linked=new Set(tasks.map(assignmentProjectId).filter(Boolean));
    const missing=[...linked].filter(id=>!projects.some(p=>p.id===id));
    if(missing.length){
      const shared=await allRows(api,projectTable+'?select=*&order=id&id=in.('+missing.join(',')+')');
      projects.push(...shared.filter(p=>linked.has(p.id)&&!projects.some(old=>old.id===p.id)).map(p=>({...p,assignmentOnly:true})));
    }
  }
  const sourceById=new Map(index.records.map(r=>[r.id,r]));
  const backgroundControls=new Map(overlays.filter(r=>r.payload?.fields?.backgroundJobControl&&projects.some(p=>p.id===r.payload.fields.backgroundJob?.projectId)).map(r=>[r.payload.fields.backgroundJob.projectId,{...r.payload,id:r.id,revision:r.revision}]));
  const records=new Map(index.records.filter(r=>r.id.startsWith('training:')||r.fields?.recipeText).map(r=>[r.id,canonical(r)]));
  for(const row of overlays.filter(row=>!row.payload.fields?.backgroundJobControl&&row.payload.kind!=='task-thread'&&row.payload.kind!=='account-preview'&&(actor.role==='admin'||row.payload.kind!=='worker-request')))records.set(row.id,{...mergeStudioRecord(records.get(row.id),row.payload),id:row.id,revision:row.revision,updatedAt:row.updated_at});
  applyProgrammeResets(records);
  // Course outlines remain reference material until explicitly imported as working content.
  const courseNames=new Set([...records.values()].filter(r=>r.kind==='course'&&r.status!=='Archived').flatMap(r=>[r.title,r.fields?.production?.collection].filter(Boolean).map(n=>n.trim().toLowerCase())));
  for(const source of index.records.filter(r=>r.kind==='Course outline'&&r.id.startsWith('course:'))){
    if(courseNames.has(source.title.trim().toLowerCase())||records.has(source.id))continue;
    records.set(source.id,{id:source.id,title:source.title,kind:'course',status:'Original material',sourceOnly:true,shared:true,revision:0,fields:{modules:(source.fields?.modules||[]).map(m=>({title:m.title,lessons:(m.lessons||[]).map(id=>sourceById.get(id)?.title||id)}))}});
  }
  const teams=ideaTeams([...records.values()]);
  for(const [id,r] of records)if(isIdea(r)&&!canSeeIdea(actor,r,teams))records.delete(id);
  const items=[...records.values()].filter(r=>r.kind!=='worker-request');
  const assigned=actor.role==='admin'?new Set(items.map(r=>r.id)):descendants([
    ...tasks.map(t=>t.record_id),
  ],index.records);
  if(actor.role!=='admin'){
    for(const r of items)if(r.createdBy===actor.id)assigned.add(r.id);
    for(const p of projects.filter(p=>!p.assignmentOnly)){
      for(const id of p.creator_id===actor.id?p.studio?.allowedIds||[]:[])assigned.add(id);
      for(const e of p.entries.filter(e=>e.assignedAsset&&(p.creator_id===actor.id||ownsTask(p,e,actor.id)))){
        for(const id of e.scopeIds||[e.record])if(id)assigned.add(id);
      }
    }
  }
  const data={index,items,backgroundControls,byId:records,projects,tasks,people,releases,assigned,actor,ideaTeams:teams,ideaPeople};
  data.collectionLinks=items.filter(r=>r.kind==='settings'&&r.fields?.libraryCollectionLink===true&&r.fields.active===true).map(r=>({collectionId:r.fields.collectionId,contentId:r.fields.contentId}));
  // Project owners can track their worker's progress without gaining draft-body access.
  data.trackingByProject=projectTrackingSummaries(data);
  // Product assignment includes its assets, never the other products sharing an asset.
  const assignedProducts=new Set(items.filter(r=>r.kind==='product'&&assigned.has(r.id)).map(r=>r.id));
  for(const r of items)if(r.kind==='asset'&&r.fields.productAsset===true&&r.fields.productIds?.some(id=>assignedProducts.has(id)))assigned.add(r.id);
  data.reviewHistory=items.flatMap(r=>(r.reviewFeedback||[]).filter(f=>['approve','changes'].includes(f.decision)&&
    (actor.role==='admin'||f.authorId===actor.id&&reviewsKind(actor,r.kind))).map(f=>({
      ...f,recordId:r.id,title:f.reviewedTitle||r.title,kind:r.kind
    })));
  if(actor.role!=='admin'){
    // A submission may cite already approved exercises, recipes or lessons.
    // These are reading dependencies, never additional editing/review grants.
    data.reviewSupport=new Set();
    const queue=items.filter(r=>canReviewContent(data,r));
    while(queue.length){
      for(const id of references(queue.pop(),records)){
        const linked=records.get(id);
        if(linked?.status==='Approved'&&!data.reviewSupport.has(id)){
          data.reviewSupport.add(id);queue.push(linked);
        }
      }
    }
    data.items=items.filter(r=>isIdea(r)?canSeeIdea(actor,r,teams):canReadContent(data,r));
    data.byId=new Map(data.items.map(r=>[r.id,r]));
  }
  return data;
}
export function readable(data,id){
  const r=data.byId.get(id);
  if(!canReadContent(data,r))throw new HttpError(403,'This item is outside your assigned work or review responsibilities.');
  return r;
}
export function editable(data,id){
  if(data.actor.role!=='admin'&&!data.assigned.has(id))throw new HttpError(403,'This item is outside your assigned work.');
  const r=data.byId.get(id);if(!r)throw new HttpError(404,'This content is unavailable.');if(r.sourceOnly)throw new HttpError(403,'Original material is read-only. Import it before editing.');return r;
}
export function projectFor(data,id){
  const p=data.projects.find(p=>p.id===id);
  if(!p)throw new HttpError(404,'This project is unavailable.');
  return p;
}
export async function saveRecord(api,actor,record,expected){
  requireAccess(actor,'library','edit');
  const rows=await api('/rest/v1/rpc/nufi_studio_save',{service:true,method:'POST',payload:{
    item:record.id,expected,document:record,editor_name:actor.role+':'+actor.id
  }});
  if(!rows.length)throw new HttpError(409,'This item has changed. Reopen it before saving your changes.');
  return rows[0];
}
export async function saveProject(api,actor,p,update){
  if(p.assignmentOnly)throw new HttpError(403,'Only the project owner or administrator can change this project.');
  requireAccess(actor,'work','edit');
  const rows=await api(projectTable+'?id=eq.'+p.id+'&revision=eq.'+p.revision+(actor.role==='admin'?'':'&or=(creator_id.eq.'+actor.id+',entries.cs.'+encodeURIComponent(JSON.stringify([{assignee:actor.id}]))+')'),{
    service:true,method:'PATCH',headers:{Prefer:'return=representation'},payload:{...update,revision:p.revision+1}
  });
  if(!rows.length)throw new HttpError(409,'This project changed. Reopen it before saving.');
}
