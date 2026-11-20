import {workers} from './studio-workers.mjs';
import {esc,url,hidden,input,textarea,select,form} from './studio-ui.mjs';
import {HttpError} from './platform.mjs';

export const profileId=id=>'studio:team-profile:'+id;
export const profilePhotoLimit=120000;
export function validProfilePhoto(value){
  if(typeof value!=='string'||value.length>profilePhotoLimit||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))return false;
  const bytes=Buffer.from(value.slice(23),'base64');
  return bytes.length>4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes.at(-2)===255&&bytes.at(-1)===217;
}
export function teamProfiles(actor,staff,data){
  const people=staff.some(p=>p.id===actor.id)?staff:[{id:actor.id,name:'James Calam'},...staff];
  const members=[...people.map(p=>({key:'person:'+p.id,id:p.id,name:p.name,owner:p.id===actor.id,type:p.id===actor.id?'Account owner':'Person',role:p.id===actor.id?'Workspace owner / Administrator':'Team member',responsibilities:'',portrait:'',href:url('team',{person:p.id})})),
    ...Object.entries(workers).map(([key,w])=>({key:'worker:'+key,id:'worker:'+key,worker:key,name:w.name,type:'AI worker',role:w.role,responsibilities:w.reason.split(' HQ directory')[0],portrait:w.portrait,href:url('team',{tab:'workers',worker:key})}))];
  for(const m of members){
    const saved=data.byId?.get(profileId(m.id));m.revision=saved?.revision||0;m.fields=saved?.fields||{};
    m.role=m.fields.role||m.role;m.responsibilities=m.fields.responsibilities??m.responsibilities;
    m.defaultPortrait=m.portrait;m.portrait=validProfilePhoto(m.fields.portrait)?m.fields.portrait:m.portrait;
    m.manager=m.owner?'':m.fields.reportsTo??(m.worker?'person:'+actor.id:'');
  }
  for(const m of members)m.parent=m.owner?null:resolveManager(m.manager,members)?.key||null;
  return members;
}
export function resolveManager(value,members){
  const target=String(value||'').trim().toLowerCase();if(!target)return null;
  if(['workspace owner','administrator','owner'].includes(target))return members.find(m=>m.owner);
  const key=members.find(m=>m.key.toLowerCase()===target);if(key)return key;
  const matches=members.filter(m=>m.name.toLowerCase()===target);
  return matches.length===1?matches[0]:null;
}
export function teamAvatar(member){
  if(member.portrait)return '<img class="team-person-avatar" src="'+esc(member.portrait)+'" alt="" width="80" height="80" loading="lazy" decoding="async">';
  const initials=member.name.trim().split(/\s+/).slice(0,2).map(s=>s[0]||'').join('').toUpperCase();
  return '<span class="team-person-avatar team-initials" aria-hidden="true">'+esc(initials)+'</span>';
}
export function teamProfileEditor(member,members){
  const managers={'':'No manager set',...Object.fromEntries(members.filter(m=>m.key!==member.key).map(m=>[m.key,m.name+(m.worker?' · AI worker':'')]))};
  const current=resolveManager(member.manager,members)?.key||member.manager;
  if(current&&!Object.hasOwn(managers,current))managers[current]=member.manager+' (check reporting line)';
  const photo='<div class="team-photo-editor" data-team-photo><div data-team-photo-preview data-name="'+esc(member.name)+'" data-default-portrait="'+esc(member.defaultPortrait)+'">'+teamAvatar(member)+'</div><div><label class="team-photo-pick">Change photo<input type="file" accept="image/jpeg,image/png,image/webp" data-team-photo-file></label><button type="button" class="team-photo-remove" data-team-photo-remove'+(member.fields.portrait?'':' hidden')+'>Use default</button><p class="meta" data-team-photo-status role="status">JPG, PNG or WebP · up to 8 MB</p></div>'+hidden('portrait',validProfilePhoto(member.fields.portrait)?member.fields.portrait:'')+'</div>';
  return form('team-profile-save',hidden(member.worker?'worker':'staff',member.worker||member.id)+hidden('revision',member.revision)+photo+
    input('role','Job role',member.role,'text','maxlength="160"')+textarea('responsibilities','Responsibilities',member.responsibilities,4)+
    (member.owner?'<p class="meta">Account owner</p>':select('reportsTo','Reports to',managers,current)),
    {section:'team',...(member.worker?{worker:member.worker}:{person:member.id})},'Save profile','data-team-profile-form');
}
export function validateReportingLine(member,value,members){
  if(member.owner)return '';
  if(!value)return '';
  const manager=resolveManager(value,members);
  if(!manager){if(value===member.manager)return value;throw new HttpError(400,'Choose a manager from the team.');}
  const visited=new Set([member.key]);let current=manager;
  while(current){if(visited.has(current.key))throw new HttpError(400,'This reporting line would create a loop. Choose another manager.');visited.add(current.key);current=members.find(m=>m.key===current.parent);}
  return manager.key;
}
