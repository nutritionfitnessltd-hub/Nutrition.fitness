import { randomUUID } from 'node:crypto';
import { HttpError, uuid } from './platform.mjs';
import { esc, link } from './library-shelves.mjs';

import { assetButton } from './library-assets.mjs';

const table='/rest/v1/nufi_library_projects';
const service={service:true};
const statuses=['Planning','In progress','Ready for review','Complete'];
const entryStates=['To do','In progress','Ready for review','Done'];
const kinds=['Content to create','GHL workflow','PT WhatsApp message'];
const url=(values={})=>link({work:'1',projects:'1',...values});
const hidden=(name,v)=>'<input type="hidden" name="'+name+'" value="'+esc(v)+'">';
const opts=(list,current)=>list.map(v=>'<option'+(current===v?' selected':'')+'>'+esc(v)+'</option>').join('');
const numbers=(n)=>Array.from({length:n},(_,i)=>String(i+1));
const scope=actor=>actor.role==='admin'?'':'&creator_id=eq.'+uuid(actor.id);
const getStaff=api=>api('/rest/v1/nufi_library_staff?select=id,name&order=name.asc',service);
const staffChoices=(people,current)=>people.map(p=>'<option value="'+esc(p.id)+'"'+(p.id===current?' selected':'')+'>'+esc(p.name)+'</option>').join('');
function clean(s,max,required=false){
  if(typeof s!=='string'||s.length>max||(required&&!s.trim())||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s))throw new HttpError(400,'Check the project fields and try again.');
  return s.trim();
}
function weeks(value,max=104){
  const n=Number(value);
  if(!Number.isInteger(n)||n<1||n>max)throw new HttpError(400,'Choose a valid week.');
  return n;
}
const postForm=(action,inside,p)=>'<form class="edit-form" method="post" action="'+url(p?{project:p.id}:{})+'">'+hidden('action',action)+(p?hidden('revision',p.revision):'')+inside+'</form>';
function personAndPlan(people,p={}){
  return '<label>Project name<input name="name" required maxlength="160" value="'+esc(p.name)+'" placeholder="Six-week challenge"></label><label>Creator<select required name="creator">'+staffChoices(people,p.creator_id)+'</select></label><label>Duration in weeks<input type="number" min="1" max="104" name="weeks" value="'+esc(p.weeks||6)+'" required></label><label>Project brief<textarea name="brief" maxlength="4000" rows="3">'+esc(p.brief)+'</textarea></label>';
}
async function getProject(id,actor,api){
  const rows=await api(table+'?id=eq.'+uuid(id)+scope(actor)+'&select=*,creator:nufi_library_staff(name)&limit=1',service);
  if(!rows[0])throw new HttpError(404,'This project is unavailable.');
  return rows[0];
}
export async function projectScreen(params,actor,api,load){
  const admin=actor.role==='admin', id=params.get('project');
  const people=admin?await getStaff(api):[];
  if(!id){
    const page=Math.max(1,Math.min(10000,parseInt(params.get('page'))||1));
    const rows=await api(table+'?select=id,name,weeks,status,creator:nufi_library_staff(name)'+scope(actor)+'&order=created_at.desc,id.desc&limit=31&offset='+((page-1)*30),service);
    const cards=rows.slice(0,30).map(r=>'<li><a href="'+url({project:r.id})+'">'+esc(r.name)+'</a><span>'+esc(r.creator?.name)+' · '+r.weeks+' weeks · '+esc(r.status)+'</span></li>').join('');
    return '<a class="back" href="'+link({work:'1'})+'">← Work assignments</a><h1>'+ (admin?'Projects':'My projects')+'</h1><div class="panels">'+(admin?'<section class="panel"><h2>Create a project</h2>'+postForm('project-create',hidden('id',randomUUID())+personAndPlan(people)+'<button class="primary">Create project</button>')+'</section>':'')+'<section class="panel"><h2>'+ (admin?'Team projects':'Assigned to me')+'</h2>'+(cards?'<ul class="project-list">'+cards+'</ul>':'<p>No projects yet.</p>')+'<nav class="pages">'+(page>1?'<a href="'+url({page:page-1})+'">Previous</a>':'')+(rows.length>30?'<a href="'+url({page:page+1})+'">Next</a>':'')+'</nav></section></div>';
  }
  const p=await getProject(id,actor,api);
  const selected=Math.min(p.weeks,Math.max(1,parseInt(params.get('week'))||1));
  const find=(params.get('find')||'').trim().slice(0,160);
  const selection=params.get('pick');
  const index=find||selection?await load():null;
  const record=index?.records.find(r=>r.id===selection);
  const hits=find?index.records.filter(r=>(r.title+' '+r.group).toLowerCase().includes(find.toLowerCase())).slice(0,30):[];
  const weekInput=hidden('week',selected);
  let out='<a class="back" href="'+url()+'">← Projects</a><h1>'+esc(p.name)+'</h1><p class="meta">Creator · '+esc(p.creator?.name)+' &nbsp; | &nbsp; '+p.weeks+' weeks &nbsp; | &nbsp; '+esc(p.status)+'</p><p class="prose">'+esc(p.brief)+'</p><div class="panels">';
  out+='<section class="panel"><details><summary>Project settings</summary>'+postForm('project-settings',weekInput+(admin?personAndPlan(people,p):'')+'<label>Project status<select name="status">'+opts(statuses,p.status)+'</select></label><button>Save changes</button>',p)+'</details></section>';
  out+='<section class="panel"><h2>Weekly plan</h2><nav class="tabs" aria-label="Project weeks">'+numbers(p.weeks).map(n=>'<a href="'+url({project:id,week:n})+'"'+(Number(n)===selected?' aria-current="page"':'')+'>Week '+n+'</a>').join('')+'</nav><h3>Week '+selected+'</h3>';
  const entries=p.entries.filter(e=>e.week===selected);
  if(!entries.length)out+='<p>No content assigned to this week yet.</p>';
  for(const e of entries){
    out+='<section class="task"><small>'+esc(e.kind)+' · '+esc(e.status)+'</small><strong>'+(e.record?'<a href="'+link({item:e.record})+'">'+esc(e.title)+'</a>':esc(e.title))+'</strong>'+(e.record&&(admin||e.assignedAsset)?assetButton(e.record):'')+(admin&&e.record&&!e.assignedAsset?postForm('project-allow-asset',weekInput+hidden('entry',e.id)+'<button>Give creator access to original assets</button>',p):'')+'<p>'+esc(e.notes)+'</p><details><summary>Edit item</summary>'+postForm('project-entry-save',hidden('entry',e.id)+'<label>Week<select name="week">'+opts(numbers(p.weeks),String(e.week))+'</select></label><label>Status<select name="status">'+opts(entryStates,e.status)+'</select></label><label>Build notes<textarea name="notes" maxlength="4000">'+esc(e.notes)+'</textarea></label><button>Save item</button>',p)+postForm('project-entry-remove',weekInput+hidden('entry',e.id)+'<button>Remove from project</button>',p)+'</details></section>';
  }
  out+='</section><section class="panel"><h2>Add library content to Week '+selected+'</h2><form class="workbar" action="/content-library/">'+hidden('work','1')+hidden('projects','1')+hidden('project',id)+weekInput+'<label>Search the library<input type="search" name="find" value="'+esc(find)+'" required></label><button>Find content</button></form>';
  if(find)out+=hits.length?'<ul>'+hits.map(r=>'<li><a href="'+url({project:id,week:selected,pick:r.id})+'">'+esc(r.title)+'</a> · '+esc(r.group)+'</li>').join('')+'</ul>':'<p>No matching content.</p>';
  if(record)out+=postForm('project-attach',weekInput+hidden('record',record.id)+'<strong>'+esc(record.title)+'</strong><label>Build notes<textarea name="notes" maxlength="4000"></textarea></label><button class="primary">Attach to Week '+selected+'</button>',p);
  out+='</section><section class="panel"><h2>Brief new work for Week '+selected+'</h2>'+postForm('project-brief',weekInput+'<label>Type<select name="kind">'+opts(kinds,'')+'</select></label><label>Title<input name="title" required maxlength="160"></label><label>Build notes<textarea name="notes" rows="4" maxlength="4000" placeholder="Include the trigger, timing, message and reply steps for a workflow."></textarea></label><button>Add to weekly plan</button>',p)+'</section></div>';
  return out;
}
export async function changeProject(params,f,actor,api,load){
  const admin=actor.role==='admin';
  if(f.action==='project-create'){
    if(!admin)throw new HttpError(403,'Administrator access is required.');
    const id=uuid(f.id);
    await api(table+'?on_conflict=id',{service:true,method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},payload:{id,created_by:actor.id,name:clean(f.name,160,true),creator_id:uuid(f.creator),weeks:weeks(f.weeks),brief:clean(f.brief||'',4000)}});
    return {project:id,week:1};
  }
  const p=await getProject(params.get('project'),actor,api);
  if(p.revision!==Number(f.revision))throw new HttpError(409,'This project has changed. Reopen it before saving.');
  let week=weeks(f.week,p.weeks), update={};
  if(f.action==='project-settings'){
    if(!statuses.includes(f.status))throw new HttpError(400,'Choose a project status.');
    update.status=f.status;
    if(admin){
      const duration=weeks(f.weeks);
      if(p.entries.some(e=>e.week>duration))throw new HttpError(400,'Move content out of later weeks before shortening the project.');
      Object.assign(update,{name:clean(f.name,160,true),brief:clean(f.brief||'',4000),creator_id:uuid(f.creator),weeks:duration});
      week=Math.min(week,duration);
    }
  }else{
    const entries=[...p.entries];
    if(['project-attach','project-brief'].includes(f.action)){
      const record=f.action==='project-attach'?(await load()).records.find(r=>r.id===f.record):null;
      if(f.action==='project-attach'&&!record)throw new HttpError(400,'Select an existing library item.');
      if(!record&&!kinds.includes(f.kind))throw new HttpError(400,'Select the type of work.');
      if(record&&entries.some(e=>e.week===week&&e.record===record.id))throw new HttpError(409,'This item already belongs to the selected week.');
      entries.push({id:randomUUID(),week,kind:record?.group||f.kind,record:record?.id||null,assignedAsset:Boolean(admin&&record),title:record?.title||clean(f.title,160,true),notes:clean(f.notes||'',4000),status:'To do'});
    }else{
      const i=entries.findIndex(e=>e.id===f.entry);
      if(i<0)throw new HttpError(404,'Project item not found.');
      if(f.action==='project-allow-asset'&&admin&&entries[i].record)entries[i]={...entries[i],assignedAsset:true};
      else if(f.action==='project-entry-remove')entries.splice(i,1);
      else if(f.action==='project-entry-save'&&entryStates.includes(f.status)){
        if(entries[i].record&&entries.some((e,j)=>j!==i&&e.record===entries[i].record&&e.week===week))throw new HttpError(409,'This item is already in the destination week.');
        entries[i]={...entries[i],week,status:f.status,notes:clean(f.notes||'',4000)};
      }else throw new HttpError(400,'Choose a valid project action.');
    }
    update.entries=entries;
  }
  const changed=await api(table+'?id=eq.'+p.id+scope(actor)+'&revision=eq.'+p.revision+'&select=id',{service:true,method:'PATCH',headers:{Prefer:'return=representation'},payload:{...update,revision:p.revision+1}});
  if(!changed.length)throw new HttpError(409,'This project changed while you were editing. Reopen it before saving.');
  return {project:p.id,week};
}
