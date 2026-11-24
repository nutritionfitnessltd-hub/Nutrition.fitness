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
    m.team=m.fields.team||'';
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
export const profileDestination=member=>({section:'team',...(member.worker?{worker:member.worker}:{person:member.id})});
export function teamProfileEditor(member){
  const photo='<div class="team-photo-editor" data-team-photo><div data-team-photo-preview data-name="'+esc(member.name)+'" data-default-portrait="'+esc(member.defaultPortrait)+'">'+teamAvatar(member)+'</div><div><label class="team-photo-pick">Change photo<input type="file" accept="image/jpeg,image/png,image/webp" data-team-photo-file></label><button type="button" class="team-photo-remove" data-team-photo-remove'+(member.fields.portrait?'':' hidden')+'>Use default</button><p class="meta" data-team-photo-status role="status">JPG, PNG or WebP · up to 8 MB</p></div>'+hidden('portrait',validProfilePhoto(member.fields.portrait)?member.fields.portrait:'')+'</div>';
  return form('team-profile-save',hidden(member.worker?'worker':'staff',member.worker||member.id)+hidden('revision',member.revision)+photo+
    input('role','Job role',member.role,'text','maxlength="160"')+(member.worker?'':engagementEditor(member.fields))+textarea('responsibilities','Responsibilities',member.responsibilities,4),
    profileDestination(member),'Save profile','data-team-profile-form');
}
export function teamReportingPanel(member,members){
  const canReportTo=(person,manager)=>{try{validateReportingLine(person,manager.key,members);return !person.owner;}catch{return false;}};
  const managers={'':'No manager set',...Object.fromEntries(members.filter(m=>canReportTo(member,m)).map(m=>[m.key,m.name+(m.worker?' · AI worker':'')]))};
  const current=resolveManager(member.manager,members)?.key||member.manager;
  if(current&&!Object.hasOwn(managers,current))managers[current]=member.manager+' (check reporting line)';
  const destination=profileDestination(member),returnTo=hidden('returnTo',member.key);
  const identity=person=>hidden('memberVersion',person.key+'|'+person.revision);
  const teams=[...new Set(['Content','Marketing','Operations',...members.map(m=>m.team).filter(Boolean)])].sort((a,b)=>a.localeCompare(b));
  const teamField=input('team','Team',member.team,'text','maxlength="80" list="team-profile-teams" placeholder="Choose or enter a team"')+'<datalist id="team-profile-teams">'+teams.map(team=>'<option value="'+esc(team)+'"></option>').join('')+'</datalist>';
  const managerField=member.owner?hidden('reportsTo','')+'<div class="team-manager-owner"><strong>Reports to</strong><span>Account owner · no manager</span></div>':select('reportsTo','Reports to',managers,current);
  const managerForm=form('team-reporting-save',identity(member)+returnTo+'<div class="team-manager-fields">'+managerField+teamField+'</div>',destination,'Save reporting details','data-team-reporting-form');
  const reports=members.filter(m=>m.parent===member.key&&!m.owner);
  const candidates=members.filter(m=>m.parent!==member.key&&canReportTo(m,member));
  const choices={'':'Choose a person or AI worker',...Object.fromEntries(candidates.map(m=>[m.key+'|'+m.revision,m.name+(m.worker?' · AI worker':'')+(m.parent?' — currently reports to '+members.find(p=>p.key===m.parent)?.name:'')]))};
  const reportCards=reports.length?'<ul class="team-direct-reports">'+reports.map(r=>'<li><a data-team-load href="'+r.href+'">'+teamAvatar(r)+'<span><strong>'+esc(r.name)+'</strong><small>'+esc(r.role)+'</small></span></a>'+form('team-reporting-save',identity(r)+returnTo+hidden('reportsTo',''),destination,'Remove','data-team-reporting-form aria-label="Remove '+esc(r.name)+' from direct reports"')+'</li>').join('')+'</ul>':'<p class="team-reports-empty">No one reports to '+esc(member.name)+' yet.</p>';
  const colleagues=member.team?members.filter(m=>m.key!==member.key&&m.team.toLowerCase()===member.team.toLowerCase()):[];
  const teamList=member.team?'<div class="team-colleagues"><h3>'+esc(member.team)+' team</h3>'+(colleagues.length?'<div>'+colleagues.map(m=>'<a data-team-load href="'+m.href+'">'+teamAvatar(m)+'<span>'+esc(m.name)+'</span></a>').join('')+'</div>':'<p class="meta">No other profiles have joined this team yet.</p>')+'</div>':'';
  return '<section class="team-reporting"><h2>Reporting & team</h2>'+managerForm+teamList+'<div class="team-direct-heading"><h3>Reports to them</h3><span>'+reports.length+'</span></div>'+reportCards+
    (candidates.length?form('team-reporting-save',returnTo+hidden('reportsTo',member.key)+select('memberVersion','Add a direct report',choices),destination,'Add direct report','data-team-reporting-form'):'')+'</section>';
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

export const engagementTypes={'':'Choose engagement type',freelance:'Freelance',contractor:'Contractor',fte:'Full-time employee (FTE)',part_time:'Part-time employee',volunteer:'Volunteer',intern:'Intern'};
export function engagementEditor(f){
  return '<fieldset><legend>Working arrangement</legend>'+select('engagementType','Engagement type',engagementTypes,f.engagementType||'')+
    input('rate','Agreed rate',f.rate||'','number','min="0" step="0.01"')+input('currency','Currency',f.currency||'GBP','text','maxlength="3"')+
    select('rateBasis','Rate basis',{hour:'Per hour',day:'Per day',month:'Per month',year:'Per year',project:'Per project'},f.rateBasis||'hour')+
    input('agreedHours','Agreed hours',f.agreedHours||'','number','min="0" max="744" step="0.25"')+
    select('hoursPeriod','Hours period',{week:'Per week',month:'Per month'},f.hoursPeriod||'week')+
    input('startDate','Start date',f.startDate||'','date')+textarea('availability','Agreed availability / flexible working',f.availability||'',3)+
    '<p class="meta">Employee arrangements require a separate employment contract. Contract preparation is deferred and is not completed by this welcome letter.</p></fieldset>';
}
export function engagementFields(post,old={}){
 const fields={};
 for(const [key,max] of Object.entries({engagementType:30,rate:20,currency:3,rateBasis:20,agreedHours:20,hoursPeriod:10,startDate:10,availability:2000})){
  const value=post[key]??old[key]??'';
  if(typeof value!=='string'||value.length>max)throw new HttpError(400,'Check the working arrangement details.');
  fields[key]=value.trim();
 }
 if(fields.engagementType&&!Object.hasOwn(engagementTypes,fields.engagementType))throw new HttpError(400,'Choose an engagement type.');
 for(const key of ['rate','agreedHours'])if(fields[key]&&(!/^\d+(?:\.\d{1,2})?$/.test(fields[key])||!Number.isFinite(Number(fields[key]))||Number(fields[key])>(key==='rate'?100000000:744)))throw new HttpError(400,'Enter valid non-negative rates and hours.');
 if(fields.currency&&!/^[A-Z]{3}$/.test(fields.currency))throw new HttpError(400,'Use a three-letter currency code.');
 if(fields.rateBasis&&!['hour','day','month','year','project'].includes(fields.rateBasis)||fields.hoursPeriod&&!['week','month'].includes(fields.hoursPeriod))throw new HttpError(400,'Choose the rate and hours periods.');
 if(fields.startDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(fields.startDate)||!Number.isFinite(Date.parse(fields.startDate))))throw new HttpError(400,'Enter a valid start date.');
 return fields;
}
