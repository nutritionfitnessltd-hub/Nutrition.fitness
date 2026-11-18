import { randomUUID } from 'node:crypto';
import { HttpError, uuid } from './platform.mjs';
import { kinds, templates, blankFields, cleanText, validateFields, validateShape, issues, makeProjectPlan, descendants } from './studio-model.mjs';
import { editable, projectFor, saveRecord, saveProject } from './studio-store.mjs';
import { extractDrafts } from './studio-import.mjs';
import { refreshMealPlan } from './studio-mealplans.mjs';

const adminOnly=data=>{if(data.actor.role!=='admin')throw new HttpError(403,'Administrator access is required.');};
function number(value,min,max){
  const n=Number(value);if(!Number.isInteger(n)||n<min||n>max)throw new HttpError(400,'Check the number of weeks or the saved version.');return n;
}
function date(value){
  if(!value)return '';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw new HttpError(400,'Choose a valid date.');
  return value;
}
export function projectDraft(f,data){
  adminOnly(data);
  const template=templates[f.template];if(!template)throw new HttpError(400,'Choose a project template.');
  const name=cleanText(f.name,160),weeks=number(f.weeks,1,52);
  if(!name)throw new HttpError(400,'Give the project a name.');
  if(!data.people.some(p=>p.id===f.creator))throw new HttpError(400,'Choose a creator.');
  const existing=f.rootId&&data.byId.get(f.rootId);
  if(template.kind==='programme'&&!([4,6,8,12].includes(weeks)||(existing?.id==='training:nufi365'&&weeks===52)))throw new HttpError(400,'Choose 4, 6, 8 or 12 weeks. NUFI365 remains 52 weeks.');
  if(existing?.kind==='programme'&&weeks!==existing.fields.weeks)throw new HttpError(400,'Keep the project duration aligned with the selected programme.');
  const root=existing||{id:'studio:'+uuid(f.id),kind:template.kind,title:name,status:'Draft',fields:{...blankFields(template.kind),audience:cleanText(f.audience||'',500),outcome:cleanText(f.outcome||'',1000),weeks},parent:null,comments:[]};
  let entries=makeProjectPlan(f.template,weeks);
  if(f.outline){
    let proposed;try{proposed=JSON.parse(f.outline);}catch{throw new HttpError(400,'The project outline could not be read.');}
    if(!Array.isArray(proposed)||!proposed.length||proposed.length>300)throw new HttpError(400,'Check the proposed task list.');
    entries=proposed.map(e=>({week:number(e.week,0,weeks),title:cleanText(e.title,160),kind:cleanText(e.kind,100),notes:cleanText(e.notes||'',4000),status:'To do',record:null,assignedAsset:false}));
    for(let week=1;week<=weeks;week++)if(!entries.some(e=>e.week===week))throw new HttpError(400,'The proposed plan needs tasks for week '+week+'.');
  }
  entries=entries.map(e=>({...e,id:randomUUID()}));
  if(existing)entries.unshift({id:randomUUID(),week:0,kind:'Existing content',record:root.id,title:root.title,notes:'Check the existing content and finish the items needed for release.',status:'To do',assignedAsset:true});
  return {root,existing:Boolean(existing),project:{id:uuid(f.id),name,weeks,creator_id:f.creator,created_by:data.actor.id,
    brief:cleanText(f.brief||'',4000),entries,studio:{type:f.template,rootId:root.id,allowedIds:[...descendants([root.id],data.items)],audience:cleanText(f.audience||'',500),outcome:cleanText(f.outcome||'',1000),launchDate:date(f.launch||'')}}};
}
function verifyRevision(current,expected){
  if(current.revision!==number(expected,0,1000000))throw new HttpError(409,'A newer version has been saved. Reopen this page before making changes.');
}
export async function createItem(record,projectId,entryId,data,api){
  if(!projectId){adminOnly(data);await saveRecord(api,data.actor,record,0);return;}
  const p=projectFor(data,projectId);
  const chosen=p.entries.find(e=>e.id===entryId);
  if(chosen?.record)throw new HttpError(409,'This task already has content attached.');
  const entry={id:randomUUID(),week:chosen?.week||0,kind:kinds[record.kind],record:record.id,scopeIds:[record.id],title:record.title,notes:chosen?.notes||'',status:'In progress',assignedAsset:true};
  // Creation and attachment are committed together, so retries cannot leave an unattached draft.
  await api('/rest/v1/rpc/nufi_studio_attach_item',{service:true,method:'POST',payload:{project_id:p.id,expected:p.revision,document:record,entry:{...entry,replaces:chosen?.id||null},editor_name:data.actor.role+':'+data.actor.id}});
  p.revision++;p.entries.push(entry);
}
export async function changeStudio(params,f,data,api){
  const action=f.action;
  if(action==='project-create'){
    const {project,root,existing}=projectDraft(f,data);
    await api('/rest/v1/rpc/nufi_studio_create_project',{service:true,method:'POST',payload:{project,records:existing?[]:[root],editor_name:'admin:'+data.actor.id}});
    return {section:'project',project:project.id};
  }
  if(action==='content-create'){
    if(!Object.hasOwn(kinds,f.kind))throw new HttpError(400,'Choose a content type.');
    const title=cleanText(f.title,200);if(!title)throw new HttpError(400,'Add a title.');
    const id='studio:'+uuid(String(f.id||'').replace(/^studio:/,''));
    if(data.byId.has(id))return {section:'item',id};
    const record={id,title,kind:f.kind,status:'Draft',fields:blankFields(f.kind),parent:null,comments:[]};
    await createItem(record,f.project,f.entry,data,api);return {section:'item',id};
  }
  if(action==='import-save'){
    if(!['recipe','programme','exercise','lesson','article','communication'].includes(f.kind))throw new HttpError(400,'Choose an import type.');
    const importId=uuid(f.importId);
    const drafts=extractDrafts(f.sourceText,f.kind,cleanText(f.sourceName||'',200),f.source||'').map((r,i)=>({...r,id:'studio:import:'+importId+':'+i})).filter((_,i)=>f['pick'+i]==='yes');
    if(!drafts.length)throw new HttpError(400,'Select at least one item to import.');
    // A separate batch transaction commits all selected drafts and their project links.
    if(f.project)projectFor(data,f.project);else adminOnly(data);
    const p=f.project?projectFor(data,f.project):null;
    await api('/rest/v1/rpc/nufi_studio_import',{service:true,method:'POST',payload:{records:drafts,project_id:p?.id||null,expected:p?.revision||0,editor_name:data.actor.role+':'+data.actor.id}});
    return {section:'item',id:drafts[0].id};
  }
  if(action.startsWith('content-')){
    const r=editable(data,params.get('id'));verifyRevision(r,f.revision);
    let next=structuredClone(r);delete next.revision;delete next.updatedAt;
    if(action==='content-save'){
      next.title=cleanText(f.title,200);if(!next.title)throw new HttpError(400,'Add a title.');
      try{next.fields=JSON.parse(f.fields);}catch{throw new HttpError(400,'The content fields could not be read.');}
      if(!next.fields||Array.isArray(next.fields)||typeof next.fields!=='object'||JSON.stringify(next.fields).length>500000)throw new HttpError(400,'Check the content fields and size.');
      validateFields(next.fields,0,next.kind==='mealplan'?2000:500);
      validateShape(next.kind,next.fields);
      if(next.kind==='mealplan'&&r.fields.plannerVersion===1){
        next.fields=refreshMealPlan(next.fields,data,r.fields);
      }
      if(next.source&&f.sourceChecked==='yes')next.source.needsChecking=false;
      next.status='Draft';delete next.approval;
    }else if(action==='content-review'){
      if(!['In review','Changes requested','Approved','Archived'].includes(f.status))throw new HttpError(400,'Choose a review status.');
      if(f.status!=='In review')adminOnly(data);
      const missing=issues(next,data.items);
      if(next.kind==='mealplan'&&next.fields.plannerVersion===1)next.fields=refreshMealPlan(next.fields,data,r.fields);
      if(f.status==='Approved'&&missing.length)throw new HttpError(400,missing.join(' '));
      next.status=f.status;
      if(f.status==='Approved')next.approval={by:data.actor.id,at:new Date().toISOString(),revision:r.revision+1};
      const note=cleanText(f.feedback||'',4000);
      if(note)next.comments=[...(next.comments||[]),{id:randomUUID(),body:note,author:data.actor.name||'Administrator',at:new Date().toISOString()}];
    }else if(action==='content-comment'){
      const body=cleanText(f.comment||'',4000);if(!body)throw new HttpError(400,'Write your feedback first.');
      next.comments=[...(next.comments||[]),{id:randomUUID(),body,author:data.actor.name||'Administrator',at:new Date().toISOString()}];
    }else throw new HttpError(400,'Choose a valid content action.');
    await saveRecord(api,data.actor,next,r.revision);return {section:'item',id:r.id};
  }
  if(['task-save','task-add','task-attach','project-save'].includes(action)){
    const p=projectFor(data,params.get('project'));verifyRevision(p,f.projectRevision);
    const entries=structuredClone(p.entries);let update={};
    const week=number(params.get('week')||0,0,p.weeks);
    if(action==='project-save'){
      const allowed=data.actor.role==='admin'?['Planning','In progress','Ready for review','Complete']:['Planning','In progress','Ready for review'];
      if(!allowed.includes(f.status))throw new HttpError(403,'Choose a permitted project status.');
      update={brief:cleanText(f.brief||'',4000),status:f.status,studio:{...p.studio,launchDate:date(f.launch||'')}};
      if(data.actor.role==='admin'){
        if(!data.people.some(s=>s.id===f.creator))throw new HttpError(400,'Choose a creator.');
        update.name=cleanText(f.name,160);update.creator_id=f.creator;
      }
    }else if(action==='task-save'){
      const entry=entries.find(e=>e.id===f.entry);if(!entry)throw new HttpError(404,'Task not found.');
      if(!['To do','In progress','Ready for review','Changes requested','Done'].includes(f.status))throw new HttpError(400,'Choose a status.');
      if(f.status==='Done')adminOnly(data);
      Object.assign(entry,{title:cleanText(f.title,160),notes:cleanText(f.notes||'',4000),status:f.status,week:number(f.week,0,p.weeks),due:date(f.due||'')});update.entries=entries;
    }else{
      const r=action==='task-attach'?data.byId.get(f.record):null;
      if(action==='task-attach'&&!r)throw new HttpError(404,'Choose a library item.');
      if(r&&entries.some(e=>e.record===r.id&&e.week===week))throw new HttpError(409,'This content already belongs to the selected week.');
      entries.push({id:randomUUID(),week,title:r?.title||cleanText(f.title,160),kind:r?kinds[r.kind]:cleanText(f.kind||'Content to create',100),
        record:r?.id||null,scopeIds:r&&data.actor.role==='admin'?[...descendants([r.id],data.items)]:[],assignedAsset:data.actor.role==='admin',status:'To do',notes:cleanText(f.notes||'',4000)});
      update.entries=entries;
    }
    await saveProject(api,data.actor,p,update);return {section:'project',project:p.id,week};
  }
  throw new HttpError(400,'Choose a valid studio action.');
}
