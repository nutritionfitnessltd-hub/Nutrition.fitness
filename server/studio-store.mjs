import { HttpError } from './platform.mjs';
import { canonical, descendants } from './studio-model.mjs';

const service={service:true};
export const itemTable='/rest/v1/nufi_studio_items';
export const projectTable='/rest/v1/nufi_library_projects';
export async function allRows(api,url){
  const rows=[];
  for(let offset=0;;offset+=500){
    const batch=await api(url+'&limit=500&offset='+offset,service);
    rows.push(...batch);if(batch.length<500)return rows;
  }
}
export async function studioData(api,actor,load){
  const [index,overlays,projects,tasks,people]=await Promise.all([
    load(),allRows(api,itemTable+'?select=id,payload,revision,updated_at&order=id'),
    allRows(api,projectTable+'?select=*&order=created_at.desc,id'+(actor.role==='admin'?'':'&creator_id=eq.'+actor.id)),
    allRows(api,'/rest/v1/nufi_library_tasks?select=*&order=created_at.desc,id'+(actor.role==='admin'?'':'&staff_id=eq.'+actor.id)),
    actor.role==='admin'?api('/rest/v1/nufi_library_staff?select=id,name,email&order=name',service):Promise.resolve([{id:actor.id,name:actor.name}])
  ]);
  const records=new Map(index.records.filter(r=>r.id.startsWith('training:')||r.fields?.recipeText).map(r=>[r.id,canonical(r)]));
  for(const row of overlays)records.set(row.id,{...row.payload,id:row.id,revision:row.revision,updatedAt:row.updated_at});
  const items=[...records.values()];
  const assigned=actor.role==='admin'?new Set(items.map(r=>r.id)):descendants([
    ...tasks.map(t=>t.record_id),
  ],index.records);
  if(actor.role!=='admin'){
    for(const p of projects){
      for(const id of p.studio?.allowedIds||[])assigned.add(id);
      for(const e of p.entries.filter(e=>e.assignedAsset)){
        for(const id of e.scopeIds||[e.record])if(id)assigned.add(id);
      }
    }
  }
  return {index,items,byId:records,projects,tasks,people,assigned,actor};
}
export function editable(data,id){
  if(data.actor.role!=='admin'&&!data.assigned.has(id))throw new HttpError(403,'This item is outside your assigned work.');
  const r=data.byId.get(id);if(!r)throw new HttpError(404,'This content is unavailable.');return r;
}
export function projectFor(data,id){
  const p=data.projects.find(p=>p.id===id);
  if(!p)throw new HttpError(404,'This project is unavailable.');
  return p;
}
export async function saveRecord(api,actor,record,expected){
  const rows=await api('/rest/v1/rpc/nufi_studio_save',{service:true,method:'POST',payload:{
    item:record.id,expected,document:record,editor_name:actor.role+':'+actor.id
  }});
  if(!rows.length)throw new HttpError(409,'This item has changed. Reopen it before saving your changes.');
  return rows[0];
}
export async function saveProject(api,actor,p,update){
  const rows=await api(projectTable+'?id=eq.'+p.id+'&revision=eq.'+p.revision+(actor.role==='admin'?'':'&creator_id=eq.'+actor.id),{
    service:true,method:'PATCH',headers:{Prefer:'return=representation'},payload:{...update,revision:p.revision+1}
  });
  if(!rows.length)throw new HttpError(409,'This project changed. Reopen it before saving.');
}
