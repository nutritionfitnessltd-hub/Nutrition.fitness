import {randomUUID} from 'node:crypto';
import {teamProfiles} from './team-profiles.mjs';
import {esc,url,heading,form,hidden,input,textarea,select} from './studio-ui.mjs';
import {saveRecord} from './studio-store.mjs';
import {HttpError} from './platform.mjs';
export const organisationId='studio:team-organisation';
export function organisation(actor,staff,data){
 const members=teamProfiles(actor,staff,data),saved=data.byId?.get(organisationId);
 const roles=saved?.fields?.roles||members.filter(m=>!m.worker).map(m=>({id:m.key,title:m.owner?'Founder & CEO':m.role,parent:m.owner?'':m.parent||'person:'+actor.id,responsibilities:m.responsibilities,occupants:[{member:m.key,acting:false}],support:members.filter(p=>p.worker&&(p.parent===m.key||!p.parent&&m.owner)).map(p=>p.worker)}));
 return {members,roles,revision:saved?.revision||0};
}
const roleUrl=id=>url('team',{tab:'organisation',role:id});
function roleEditor(model,id){
 const role=id==='new'?{id:'',title:'',parent:'',responsibilities:'',occupants:[],support:[]}:model.roles.find(r=>r.id===id);
 if(!role)throw new HttpError(404,'This role is unavailable.');
 const descendant=id=>{const seen=new Set([role.id]);let r=model.roles.find(r=>r.id===id);while(r){if(seen.has(r.id))return true;seen.add(r.id);r=model.roles.find(p=>p.id===r.parent);}return false;};
 const people=model.members.filter(m=>!m.worker),workers=model.members.filter(m=>m.worker);
 const peopleFields=people.map(m=>select('occupant:'+m.key,m.name,{'':'Not assigned',permanent:'Holds this role',acting:'Acting / temporary cover'},role.occupants.find(o=>o.member===m.key)?.acting?'acting':role.occupants.some(o=>o.member===m.key)?'permanent':'' )).join('');
 const support=workers.map(m=>select('support:'+m.worker,m.name,{'':'Not supporting',yes:'Supports this role'},role.support.includes(m.worker)?'yes':'')).join('');
 return '<section class="team-profile" data-team-profile>'+heading(role.id?'Edit role':'Add a role','People can hold several roles. AI workers can support several roles.')+form('team-role-save',hidden('role',role.id)+hidden('revision',model.revision)+input('title','Role name',role.title,'text','required maxlength="160"')+select('parent','Reports to',{'':'Top level',...Object.fromEntries(model.roles.filter(r=>!descendant(r.id)).map(r=>[r.id,r.title]))},role.parent)+textarea('responsibilities','Responsibilities',role.responsibilities,4)+'<h2>People</h2><p>Leave unassigned to show a vacancy. Acting cover remains visible.</p>'+peopleFields+'<h2>AI support</h2><p>Supporting a role does not fill its vacancy.</p>'+support,{section:'team',tab:'organisation'},'Save role')+(role.id?form('team-role-delete',hidden('role',role.id)+hidden('revision',model.revision),{section:'team',tab:'organisation'},'Remove role'):'')+'</section>';
}
export function organisationMap(actor,staff,data,params=new URLSearchParams()){
 const model=organisation(actor,staff,data);
 if(params.get('role')==='workers')return '<section class="team-profile" data-team-profile>'+heading('AI workers','Pausing stops new assignments, scheduled work and queue claims. Work already running can finish. Their history and role support are kept.')+(data.hqError?'<p role="alert">'+esc(data.hqError)+'</p>':'')+model.members.filter(m=>m.worker).map(m=>{const state=data.hqStatus?.workers?.[m.worker];return '<section class="panel"><h2>'+esc(m.name)+'</h2><p>'+esc(m.role)+'</p>'+(state?form('team-worker-pause',hidden('worker',m.worker)+hidden('version',data.hqStatus.version)+hidden('paused',state.paused?'no':'yes')+'<p>'+ (state.paused?'Paused':'Active')+'</p>',{section:'team',tab:'organisation'},state.paused?'Resume worker':'Pause worker'):'<p>HQ status unavailable</p>')+'</section>';}).join('')+'</section>';
 if(params.has('role'))return roleEditor(model,params.get('role'));
 const {members,roles}=model,show=params.get('ai')!=='hide',visited=new Set();
 const card=r=>{const occupants=r.occupants.map(o=>{const m=members.find(m=>m.key===o.member);return m?'<span class="role-person">'+esc(m.name)+(o.acting?' <small>Acting</small>':'')+'</span>':'';}).join('');const support=show?r.support.map(k=>members.find(m=>m.worker===k)).filter(Boolean):[];const teams=[...new Set(r.occupants.map(o=>members.find(m=>m.key===o.member)?.team).filter(Boolean))];return '<a class="org-card role-card" data-team-open href="'+roleUrl(r.id)+'"><strong>'+esc(r.title)+'</strong>'+teams.map(t=>'<span class="org-team">'+esc(t)+'</span>').join('')+(occupants||'<span class="role-vacant">Vacant · needs filling</span>')+(r.occupants.some(o=>o.acting)&&!r.occupants.some(o=>!o.acting)?'<span class="role-vacant">Permanent appointment needed</span>':'')+(support.length?'<span class="role-support">AI support · '+support.map(m=>esc(m.name)+' <small>'+esc(m.role)+(data.hqStatus?.workers?.[m.worker]?.paused?' · Paused':'')+'</small>').join(', ')+'</span>':'')+'<span class="org-open">View role &amp; assignments ↗</span></a>';};
 const branch=r=>{visited.add(r.id);const children=roles.filter(c=>c.parent===r.id&&!visited.has(c.id));return '<li class="org-branch'+(children.length?' org-has-reports':'')+'">'+card(r)+(children.length?'<ul class="org-reports">'+children.map(branch).join('')+'</ul>':'')+'</li>';};
 const roots=roles.filter(r=>!r.parent||!roles.some(p=>p.id===r.parent));let tree=roots.map(branch).join('');for(const r of roles)if(!visited.has(r.id))tree+=branch(r);
 return '<div class="team-directory organisation-directory">'+heading('Organisation map','Build the business around roles. See who holds them, who supports them, and where you need help.','<a class="btn primary" data-team-open href="'+roleUrl('new')+'">Add role</a><a class="btn" data-team-open href="'+roleUrl('workers')+'">Manage AI workers</a><a class="btn" href="'+url('team')+'">Back to Team</a>')+'<div class="org-key"><span>'+roles.length+' roles</span><span>'+roles.filter(r=>!r.occupants.length).length+' vacant</span><a class="btn" href="'+url('team',{tab:'organisation',ai:show?'hide':'show'})+'">'+(show?'Hide':'Show')+' AI workers</a></div><section class="organisation-map" aria-label="Organisation roles"><ul class="org-root">'+tree+'</ul></section></div>';
}
export async function saveOrganisation(f,actor,staff,data,api){
 if(actor.role!=='admin')throw new HttpError(403,'Administrator access is required.');
 if(data.activityAvailable===false)throw new HttpError(503,'The team could not be loaded. Please retry.');
 const model=organisation(actor,staff,data);if(String(f.revision)!==String(model.revision))throw new HttpError(409,'The organisation changed. Reopen the role before saving.');
 const existing=model.roles.find(r=>r.id===f.role);if(f.role&&!existing)throw new HttpError(404,'This role is unavailable.');
 let roles;
 if(f.action==='team-role-delete'){
  if(!existing)throw new HttpError(404,'Choose a role.');
  if(model.roles.some(r=>r.parent===existing.id))throw new HttpError(400,'Move the roles reporting here before removing this role.');
  roles=model.roles.filter(r=>r.id!==existing.id);
 }else{
  const title=String(f.title||'').trim(),parent=String(f.parent||''),responsibilities=String(f.responsibilities||'').trim();
  if(!title||title.length>160||responsibilities.length>4000)throw new HttpError(400,'Add a role name up to 160 characters and responsibilities up to 4,000 characters.');
  if(parent&&!model.roles.some(r=>r.id===parent))throw new HttpError(400,'Choose an existing parent role.');
  const role={id:existing?.id||randomUUID(),title,parent,responsibilities,occupants:[],support:[]};
  for(const [key,value]of Object.entries(f)){
   if(key.startsWith('occupant:')&&value){const member=key.slice(9);if(!model.members.some(m=>!m.worker&&m.key===member)||!['acting','permanent'].includes(value))throw new HttpError(400,'Choose a person from the team.');role.occupants.push({member,acting:value==='acting'});}
   if(key.startsWith('support:')&&value){const worker=key.slice(8);if(value!=='yes'||!model.members.some(m=>m.worker===worker))throw new HttpError(400,'Choose an AI worker from the team.');role.support.push(worker);}
  }
  const seen=new Set([role.id]);let current=parent;while(current){if(seen.has(current))throw new HttpError(400,'This reporting line would create a loop.');seen.add(current);current=model.roles.find(r=>r.id===current)?.parent;}
  roles=[...model.roles.filter(r=>r.id!==role.id),role];
 }
 return saveRecord(api,actor,{id:organisationId,kind:'settings',title:'Team organisation',fields:{roles}},model.revision);
}
