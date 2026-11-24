import {teamEmailEditor,teamIdentityPanel} from './team-contact.mjs';
import {roleTasksPanel} from './people-tasks.mjs';
import {isIdea,ideaTeams,canSeeIdea} from './idea-visibility.mjs';
import {workerSettingsPanel} from './team-worker-settings.mjs';
import {assignmentForm,assignmentProjectId} from './team-assignments.mjs';
import {organisationMap} from './team-organisation.mjs';
import {engagementFields,profileId,teamProfiles,teamAvatar,teamProfileEditor,teamReportingPanel,profileDestination,validProfilePhoto,validateReportingLine} from './team-profiles.mjs';
import {workers} from './studio-workers.mjs';
import {workerContent} from './studio-worker-content.mjs';
import {allRows,saveRecord} from './studio-store.mjs';
import {HttpError,uuid} from './platform.mjs';
import {esc,url,heading,button,list,badge} from './studio-ui.mjs';

const taskCount=n=>n+' open '+(n===1?'task':'tasks');
const finished=value=>['Done','Complete','Archived'].includes(value);
const teamUrl=values=>url('team',values);
export async function teamWorkSnapshot(api){
  const results=await Promise.allSettled([
    allRows(api,'/rest/v1/nufi_library_projects?select=*&order=created_at.desc,id'),
    allRows(api,'/rest/v1/nufi_library_tasks?select=*&order=created_at.desc,id'),
    allRows(api,'/rest/v1/nufi_studio_items?select=id,payload,revision,updated_at&order=id&id=not.like.studio:notification:*')
  ]);
  const [projects,tasks,rows]=results.map(r=>r.status==='fulfilled'?r.value:[]);
  const items=rows.filter(r=>r.payload).map(r=>({...r.payload,id:r.id,revision:r.revision,updatedAt:r.updated_at}));
  return {projects,tasks,items,byId:new Map(items.map(r=>[r.id,r])),activityAvailable:results.every(r=>r.status==='fulfilled')};
}
function personWork(person,data){
  const ownProjects=data.projects.filter(p=>p.creator_id===person.id);
  const projectIds=new Set(data.tasks.filter(t=>t.staff_id===person.id).map(assignmentProjectId));
  const projects=data.projects.filter(p=>p.creator_id===person.id||projectIds.has(p.id));
  const tasks=[...data.tasks.filter(t=>t.staff_id===person.id).map(t=>({...t,href:'/content-library/?work=1&assignments=1&staff='+encodeURIComponent(person.id)})),...ownProjects.flatMap(p=>(p.entries||[]).map(e=>({...e,context:p.name,href:url('project',{project:p.id,week:e.week||0})})))];
  return {projects,tasks,open:tasks.filter(t=>!finished(t.status)),recent:tasks.filter(t=>finished(t.status)).slice(0,5)};
}
function workerWork(key,data){
  const content=workerContent({...data,actor:{role:'admin'}},key);
  const projects=data.projects.filter(p=>p.studio?.projectManager===key||p.entries?.some(e=>[key,workers[key].name.toLowerCase()].includes(String(e.worker||'').toLowerCase())));
  const tasks=projects.flatMap(p=>(p.entries||[]).filter(e=>[key,workers[key].name.toLowerCase()].includes(String(e.worker||'').toLowerCase())).map(e=>({...e,context:p.name,href:url('project',{project:p.id,week:e.week||0})})));
  const plans=data.items.filter(r=>r.kind==='worker-request'&&r.fields?.outputs?.some(o=>o.worker===key));
  return {content,projects,tasks,plans,review:content.filter(r=>r.status==='In review')};
}
const row=t=>'<div><a href="'+t.href+'">'+esc(t.title)+'</a><small>'+esc([t.context,t.due||t.due_date].filter(Boolean).join(' · '))+'</small></div>'+badge(t.status);
const card=(href,avatar,name,role,summary,current)=>'<a class="team-person-card" data-team-open href="'+href+'">'+avatar+'<h2>'+esc(name)+'</h2><p class="team-card-role">'+esc(role)+'</p><span class="team-card-state">'+esc(summary)+'</span><p class="team-card-current">'+esc(current)+'</p><span class="team-card-open">View profile</span></a>';
const linkButton=(title,href)=>button(title,href).replace('<a ','<a data-team-load ');
function profileHeader(avatar,name,role,summary){return '<header class="team-profile-heading">'+avatar+'<div><h1>'+esc(name)+'</h1><p>'+esc(role)+'</p><span class="team-card-state">'+esc(summary)+'</span></div></header>';}
export function renderTeamPage({params,actor,staff,data,accessMarkup,createMarkup,hqChat,hqError,hqSettings,hqSettingsError}){
  if(actor.role!=='admin')throw new HttpError(403,'Administrator access is required.');
  if(params.get('tab')==='organisation')return organisationMap(actor,staff,data,params);
  const teams=ideaTeams(data.items||[]),items=(data.items||[]).filter(r=>!isIdea(r)||canSeeIdea(actor,r,teams));
  data={...data,items,byId:new Map([...(data.byId||new Map(items.map(r=>[r.id,r])))].filter(([,r])=>!isIdea(r)||canSeeIdea(actor,r,teams)))};
  const members=teamProfiles(actor,staff,data);
  const personKey=params.get('person'),workerKey=params.get('worker');
  if(personKey==='new')return '<div class="team-profile" data-team-profile>'+heading('Add a person','Create a team account and choose their access.')+createMarkup+'</div>';
  if(workerKey){
    const w=members.find(m=>m.worker===workerKey);if(!w)throw new HttpError(404,'This worker is unavailable.');
    const work=workerWork(workerKey,data),chatState=hqChat?.task?.status;
    const state=workerKey==='imogen'&&hqSettings?.production?({queued:'Production queued',working:'Production claim active',needs_input:'Production needs input',ready:'Production check ended',done:'Production job closed'})[hqSettings.production.status]||'Production status unavailable':hqError?'HQ status unavailable':({queued:'Queued in James HQ',working:'Working in James HQ',ready:'Reply ready for you',needs_input:'Waiting for your reply',done:'Conversation ready'})[chatState]||'No active HQ conversation';
    const recent=(hqChat?.messages||[]).filter(m=>m.role==='assistant').slice(-3).reverse();
    const view=workerKey==='morgan'?url('shiny-things'):workerKey==='ellis'?url('software-releases'):url('library',{worker:workerKey,view:'all'});
    return '<div class="team-profile" data-team-profile>'+profileHeader(teamAvatar(w),w.name,w.role,'AI worker · '+state)+
      '<div class="studio-actions">'+linkButton('Message '+w.name,url('worker-chat',{worker:workerKey}))+linkButton('Assign work',url('worker-chat',{worker:workerKey,brief:'1'}))+button('View work',view)+'</div>'+
      workerSettingsPanel(workerKey,hqSettings,hqSettingsError,hqChat?.employee?.instructions)+
      teamReportingPanel(w,members)+
      '<section class="team-profile-section"><h2>Role & responsibilities</h2>'+teamProfileEditor(w,members)+'<p class="meta">This profile describes their role in the team. Edit their AI instructions in the AI prompt section above.</p></section>'+
      (hqError?'<p role="status" class="team-activity-note">'+esc(hqError)+'</p>':'')+
      '<section class="team-profile-section"><h2>Current work</h2>'+list(work.projects.filter(p=>!finished(p.status)),p=>'<a href="'+url('project',{project:p.id})+'">'+esc(p.name)+'</a>'+badge(p.status),'No active projects linked to this worker.')+list(work.tasks.filter(t=>!finished(t.status)),row,'No open project tasks recorded.')+'</section>'+
      (workerKey==='morgan'?'<section class="team-profile-section"><h2>Ideas & proposed projects</h2>'+list(data.items.filter(r=>r.id.startsWith('studio:idea:')&&!data.projects.some(p=>p.studio?.ideaId===r.id)),r=>'<a href="'+url('shiny-things',{id:r.id})+'">'+esc(r.title)+'</a>'+badge(r.fields.state||'Saved'),'No ideas awaiting a project plan.')+'</section>':'')+
      '<section class="team-profile-section"><h2>Awaiting your review</h2>'+list(work.review,r=>'<a href="'+url('item',{id:r.id})+'">'+esc(r.title)+'</a>'+badge(r.status),'No content awaiting review.')+'</section>'+
      '<section class="team-profile-section"><h2>Recent results</h2>'+list(recent,m=>'<div><p class="prose">'+esc(String(m.body||'').slice(0,1600))+'</p><small>'+esc(m.createdAt||'')+'</small></div>','No HQ replies recorded yet.')+list(work.content.slice(0,5),r=>'<a href="'+url('item',{id:r.id})+'">'+esc(r.title)+'</a>'+badge(r.status),'No saved content linked yet.')+'</section>'+
      (work.plans.length?'<section class="team-profile-section"><h2>Prepared briefs</h2>'+list(work.plans,r=>'<a href="'+url('worker-requests',{id:r.id})+'">'+esc(r.title)+'</a><span>Saved brief</span>')+'</section>':'')+'</div>';
  }
  if(personKey){
    if(personKey==='owner')return renderTeamPage({params:new URLSearchParams({person:actor.id}),actor,staff,data,accessMarkup,createMarkup,hqChat,hqError,hqSettings,hqSettingsError});
    const person=staff.find(p=>p.id===personKey)||(personKey===actor.id?{id:actor.id,name:members.find(m=>m.owner).name,email:''}:null);if(!person)throw new HttpError(404,'This person is unavailable.');
    if(params.get('assign')==='1')return assignmentForm(person,data.projects);
    const member=members.find(m=>m.id===person.id),work=personWork(person,data);
    return '<div class="team-profile" data-team-profile>'+profileHeader(teamAvatar(member),person.name,member.role,member.owner?'Administrator account':person.code_hash?(work.open.length?taskCount(work.open.length):'No open tasks recorded'):'Access disabled')+
      (person.email?'<p class="team-profile-email">'+esc(person.email)+'</p>':'')+'<div class="studio-actions">'+(person.email?button('Email '+person.name,'mailto:'+encodeURIComponent(person.email)):'')+button('View work','/content-library/?work=1&assignments=1&staff='+encodeURIComponent(person.id))+linkButton('Assign work',teamUrl({person:person.id,assign:'1'}))+'</div>'+
      (params.get('saved')==='email'?'<p role="status">Email address saved. Send a fresh welcome email if this corrects an earlier address.</p>':'')+teamEmailEditor(person,member.owner)+teamIdentityPanel(data.personIdentity,data.personIdentityUnavailable)+
      teamReportingPanel(member,members)+roleTasksPanel({...data,actor,people:members.filter(p=>!p.worker)},person.id)+
      '<section class="team-profile-section"><h2>Role & responsibilities</h2>'+teamProfileEditor(member,members)+'</section>'+
      '<section class="team-profile-section"><h2>Current work</h2>'+list(work.projects.filter(p=>!finished(p.status)),p=>'<a href="'+url('project',{project:p.id})+'">'+esc(p.name)+'</a>'+badge(p.status),'No active projects assigned.')+list(work.open.slice(0,15),row,'No open tasks recorded.')+'</section>'+
      '<section class="team-profile-section"><h2>Recent completed work</h2>'+list(work.recent,row,'No completed work recorded.')+'</section>'+
      (member.owner?'<div class="team-profile-section">'+button('My account',url('account'))+'</div>':'<details class="team-profile-section team-profile-access"><summary>Manage access & login</summary>'+accessMarkup(person)+'</details>')+'</div>';
  }
  const workerTab=params.get('tab')==='workers';
  return '<div class="team-directory">'+heading('Team','The people and workers behind your next good idea.',button('Organisation map',teamUrl({tab:'organisation'}))+button('Add a person',teamUrl({person:'new'})).replace('<a ','<a data-team-open '))+
    '<nav class="team-directory-tabs" aria-label="Team type"><a href="'+teamUrl()+'"'+(!workerTab?' aria-current="page"':'')+'>People <span>'+ (staff.length+(staff.some(p=>p.id===actor.id)?0:1))+'</span></a><a href="'+teamUrl({tab:'workers'})+'"'+(workerTab?' aria-current="page"':'')+'>AI Workers <span>'+Object.keys(workers).length+'</span></a></nav>'+
    (!data.activityAvailable?'<p class="team-activity-note" role="status">Some work summaries are unavailable. Profiles and access settings are still available.</p>':'')+
    '<div class="team-directory-grid">'+(workerTab?members.filter(m=>m.worker).map(w=>{const work=workerWork(w.worker,data),open=work.tasks.filter(t=>!finished(t.status));return card(w.href,teamAvatar(w),w.name,w.role,!data.activityAvailable?'Activity unavailable':work.review.length?work.review.length+' awaiting review':open.length?taskCount(open.length):work.content.length?work.content.length+' saved items':'No linked work yet',open[0]?.title||work.projects.find(p=>!finished(p.status))?.name||w.responsibilities);}).join(''):
      members.filter(m=>!m.worker).map(m=>{const person=staff.find(p=>p.id===m.id)||{id:m.id},work=personWork(person,data);return card(m.href,teamAvatar(m),m.name,m.role,m.owner?'Administrator account':!person.code_hash?'Access disabled':!data.activityAvailable?'Activity unavailable':work.open.length?taskCount(work.open.length):'No open tasks recorded',work.open[0]?.title||m.responsibilities||'Open profile for work and access.');}).join(''))+'</div>'+
    '<div class="team-directory-footer">'+button('Confidentiality agreements',url('nda'))+button('Connections',url('connections'))+'</div></div>';
}
export async function saveTeamProfile(f,actor,staff,data,api){
  if(actor.role!=='admin')throw new HttpError(403,'Administrator access is required.');
  if(f.worker&&f.staff)throw new HttpError(400,'Choose one team profile.');
  const id=f.worker?'worker:'+f.worker:uuid(f.staff);
  if(f.worker?!Object.hasOwn(workers,f.worker):id!==actor.id&&!staff.some(person=>person.id===id))throw new HttpError(404,'This team member is unavailable.');
  const revision=Number(f.revision),old=data.byId.get(profileId(id));
  if(!Number.isSafeInteger(revision)||revision<0||(old?.revision||0)!==revision)throw new HttpError(409,'This profile changed. Reopen it before saving.');
  const text=(value,max)=>{if(typeof value!=='string'||value.length>max)throw new HttpError(400,'Check the profile text and length.');return value.trim();};
  const members=teamProfiles(actor,staff,data),member=members.find(m=>m.id===id);
  const portrait=f.portrait??old?.fields?.portrait??'';
  if(portrait!==''&&!validProfilePhoto(portrait))throw new HttpError(400,'Choose a photo using Change photo. The saved image must be smaller than 120 KB.');
  const reportsTo=validateReportingLine(member,text(f.reportsTo??member.manager,160),members);
  const enteredTeam=text(f.team??old?.fields?.team??'',80),team=members.find(m=>m.team.toLowerCase()===enteredTeam.toLowerCase())?.team||enteredTeam;
  await saveRecord(api,actor,{id:profileId(id),kind:'settings',title:'Team profile',status:'Draft',fields:{...old?.fields,...(f.worker?{}:engagementFields(f,old?.fields)),role:text(f.role||'',160),responsibilities:text(f.responsibilities||'',4000),reportsTo,portrait,team}},revision);
}

export async function saveTeamReporting(f,actor,staff,data,api){
  if(actor.role!=='admin')throw new HttpError(403,'Administrator access is required.');
  if(typeof f.memberVersion!=='string'||!/^((?:person:[\da-f-]+)|(?:worker:[a-z]+))\|\d+$/.test(f.memberVersion))throw new HttpError(400,'Choose a person or AI worker.');
  const [key,revision]=f.memberVersion.split('|'),members=teamProfiles(actor,staff,data);
  const member=members.find(m=>m.key===key),destination=members.find(m=>m.key===f.returnTo);
  if(!member||!destination)throw new HttpError(404,'This team profile is unavailable.');
  if(member.owner&&f.reportsTo!=='')throw new HttpError(400,'The account owner has no manager.');
  if(typeof f.reportsTo!=='string')throw new HttpError(400,'Choose who they report to.');
  await saveTeamProfile({...(member.worker?{worker:member.worker}:{staff:member.id}),revision,
    role:member.fields.role??member.role,responsibilities:member.responsibilities,reportsTo:f.reportsTo,...(f.team===undefined?{}:{team:f.team})},actor,staff,data,api);
  return profileDestination(destination);
}
