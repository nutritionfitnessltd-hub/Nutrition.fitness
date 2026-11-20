import {workerControls} from './worker-controls.mjs';
import {assignmentForm,assignmentProjectId} from './team-assignments.mjs';
import {organisationMap} from './team-organisation.mjs';
import {workers} from './studio-workers.mjs';
import {workerContent} from './studio-worker-content.mjs';
import {allRows,saveRecord} from './studio-store.mjs';
import {HttpError,uuid} from './platform.mjs';
import {esc,url,heading,button,input,textarea,hidden,form,list,badge} from './studio-ui.mjs';

const taskCount=n=>n+' open '+(n===1?'task':'tasks');
const finished=value=>['Done','Complete','Archived'].includes(value);
const teamUrl=values=>url('team',values);
const profileId=id=>'studio:team-profile:'+id;
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
const initials=name=>name.trim().split(/\s+/).slice(0,2).map(s=>s[0]||'').join('').toUpperCase();
const row=t=>'<div><a href="'+t.href+'">'+esc(t.title)+'</a><small>'+esc([t.context,t.due||t.due_date].filter(Boolean).join(' · '))+'</small></div>'+badge(t.status);
const card=(href,avatar,name,role,summary,current)=>'<a class="team-person-card" data-team-open href="'+href+'">'+avatar+'<h2>'+esc(name)+'</h2><p class="team-card-role">'+esc(role)+'</p><span class="team-card-state">'+esc(summary)+'</span><p class="team-card-current">'+esc(current)+'</p><span class="team-card-open">View profile</span></a>';
const personAvatar=name=>'<span class="team-person-avatar" aria-hidden="true">'+esc(initials(name))+'</span>';
const workerAvatar=w=>'<img class="team-person-avatar team-worker-avatar" src="'+esc(w.portrait)+'" alt="" width="80" height="80">';
const linkButton=(title,href)=>button(title,href).replace('<a ','<a data-team-load ');
function profileHeader(avatar,name,role,summary){return '<header class="team-profile-heading">'+avatar+'<div><h1>'+esc(name)+'</h1><p>'+esc(role)+'</p><span class="team-card-state">'+esc(summary)+'</span></div></header>';}
export function renderTeamPage({params,actor,staff,data,accessMarkup,createMarkup,hqChat,hqError,workerSettings}){
  if(actor.role!=='admin')throw new HttpError(403,'Administrator access is required.');
  if(params.get('tab')==='organisation')return organisationMap(actor,staff,data);
  const personKey=params.get('person'),workerKey=params.get('worker');
  if(personKey==='new')return '<div class="team-profile" data-team-profile>'+heading('Add a person','Create a team account and choose their access.')+createMarkup+'</div>';
  if(workerKey){
    const w=workers[workerKey];if(!w)throw new HttpError(404,'This worker is unavailable.');
    const work=workerWork(workerKey,data),chatState=hqChat?.task?.status;
    const state=hqError?'HQ status unavailable':({queued:'Queued in James HQ',working:'Working in James HQ',ready:'Reply ready for you',needs_input:'Waiting for your reply',done:'Conversation ready'})[chatState]||'No active HQ conversation';
    const recent=(hqChat?.messages||[]).filter(m=>m.role==='assistant').slice(-3).reverse();
    const view=workerKey==='morgan'?url('shiny-things'):workerKey==='ellis'?url('software-releases'):url('library',{worker:workerKey,view:'all'});
    return '<div class="team-profile" data-team-profile>'+profileHeader(workerAvatar(w),w.name,w.role,state)+
      '<div class="studio-actions">'+linkButton('Message '+w.name,url('worker-chat',{worker:workerKey}))+linkButton('Assign work',url('worker-chat',{worker:workerKey,brief:'1'}))+button('View work',view)+'</div>'+
      '<section class="team-profile-section"><h2>Role & responsibilities</h2><p>'+esc(w.reason.split(' HQ directory')[0])+'</p><p class="meta">Reports to the workspace owner · Works through James HQ</p></section>'+
      (hqChat?.employee?.instructions?'<details class="team-profile-section"><summary>Role instructions in James HQ</summary><p class="prose">'+esc(String(hqChat.employee.instructions).slice(0,16000))+'</p></details>':'')+
      (hqError?'<p role="status" class="team-activity-note">'+esc(hqError)+'</p>':'')+
      workerControls(workerKey,workerSettings)+'<section class="team-profile-section"><h2>Current work</h2>'+list(work.projects.filter(p=>!finished(p.status)),p=>'<a href="'+url('project',{project:p.id})+'">'+esc(p.name)+'</a>'+badge(p.status),'No active projects linked to this worker.')+list(work.tasks.filter(t=>!finished(t.status)),row,'No open project tasks recorded.')+'</section>'+
      (workerKey==='morgan'?'<section class="team-profile-section"><h2>Ideas & proposed projects</h2>'+list(data.items.filter(r=>r.id.startsWith('studio:idea:')&&!data.projects.some(p=>p.studio?.ideaId===r.id)),r=>'<a href="'+url('shiny-things',{id:r.id})+'">'+esc(r.title)+'</a>'+badge(r.fields.state||'Saved'),'No ideas awaiting a project plan.')+'</section>':'')+
      '<section class="team-profile-section"><h2>Awaiting your review</h2>'+list(work.review,r=>'<a href="'+url('item',{id:r.id})+'">'+esc(r.title)+'</a>'+badge(r.status),'No content awaiting review.')+'</section>'+
      '<section class="team-profile-section"><h2>Recent results</h2>'+list(recent,m=>'<div><p class="prose">'+esc(String(m.body||'').slice(0,1600))+'</p><small>'+esc(m.createdAt||'')+'</small></div>','No HQ replies recorded yet.')+list(work.content.slice(0,5),r=>'<a href="'+url('item',{id:r.id})+'">'+esc(r.title)+'</a>'+badge(r.status),'No saved content linked yet.')+'</section>'+
      (work.plans.length?'<section class="team-profile-section"><h2>Prepared briefs</h2>'+list(work.plans,r=>'<a href="'+url('worker-requests',{id:r.id})+'">'+esc(r.title)+'</a><span>Saved brief</span>')+'</section>':'')+'</div>';
  }
  if(personKey){
    if(personKey==='owner')return '<div class="team-profile" data-team-profile>'+profileHeader(personAvatar('Workspace owner'),'Workspace owner','Administrator','Approvals & team decisions')+'<section class="team-profile-section"><h2>Responsibilities</h2><p>Sets priorities, approves work and releases, and manages team access.</p></section><div class="studio-actions">'+button('Open projects',url('projects'))+button('Review work',url('review'))+'</div></div>';
    const person=staff.find(p=>p.id===personKey);if(!person)throw new HttpError(404,'This person is unavailable.');
    if(params.get('assign')==='1')return assignmentForm(person,data.projects);
    const profile=data.byId.get(profileId(person.id)),fields=profile?.fields||{},work=personWork(person,data);
    return '<div class="team-profile" data-team-profile>'+profileHeader(personAvatar(person.name),person.name,fields.role||'Team member',person.code_hash?(work.open.length?taskCount(work.open.length):'No open tasks recorded'):'Access disabled')+
      '<p class="team-profile-email">'+esc(person.email)+'</p><div class="studio-actions">'+button('Email '+person.name,'mailto:'+encodeURIComponent(person.email))+button('View work','/content-library/?work=1&assignments=1&staff='+encodeURIComponent(person.id))+linkButton('Assign work',teamUrl({person:person.id,assign:'1'}))+'</div>'+
      '<section class="team-profile-section"><h2>Role & responsibilities</h2>'+form('team-profile-save',hidden('staff',person.id)+hidden('revision',profile?.revision||0)+input('role','Role',fields.role||'','text','maxlength="160"')+textarea('responsibilities','Responsibilities',fields.responsibilities||'',4)+input('reportsTo','Reports to',fields.reportsTo||'Workspace owner','text','maxlength="160"'),{section:'team',person:person.id},'Save profile')+'</section>'+
      '<section class="team-profile-section"><h2>Current work</h2>'+list(work.projects.filter(p=>!finished(p.status)),p=>'<a href="'+url('project',{project:p.id})+'">'+esc(p.name)+'</a>'+badge(p.status),'No active projects assigned.')+list(work.open.slice(0,15),row,'No open tasks recorded.')+'</section>'+
      '<section class="team-profile-section"><h2>Recent completed work</h2>'+list(work.recent,row,'No completed work recorded.')+'</section>'+
      '<details class="team-profile-section team-profile-access"><summary>Manage access & login</summary>'+accessMarkup(person)+'</details></div>';
  }
  const workerTab=params.get('tab')==='workers';
  return '<div class="team-directory">'+heading('Team','The people and workers behind your next good idea.',button('Organisation map',teamUrl({tab:'organisation'}))+button('Add a person',teamUrl({person:'new'})).replace('<a ','<a data-team-open '))+
    '<nav class="team-directory-tabs" aria-label="Team type"><a href="'+teamUrl()+'"'+(!workerTab?' aria-current="page"':'')+'>People <span>'+ (staff.length+(staff.some(p=>p.id===actor.id)?0:1))+'</span></a><a href="'+teamUrl({tab:'workers'})+'"'+(workerTab?' aria-current="page"':'')+'>AI Workers <span>'+Object.keys(workers).length+'</span></a></nav>'+
    (!data.activityAvailable?'<p class="team-activity-note" role="status">Some work summaries are unavailable. Profiles and access settings are still available.</p>':'')+
    '<div class="team-directory-grid">'+(workerTab?Object.entries(workers).map(([key,w])=>{const work=workerWork(key,data),open=work.tasks.filter(t=>!finished(t.status));return card(teamUrl({tab:'workers',worker:key}),workerAvatar(w),w.name,w.role,!data.activityAvailable?'Activity unavailable':work.review.length?work.review.length+' awaiting review':open.length?taskCount(open.length):work.content.length?work.content.length+' saved items':'No linked work yet',open[0]?.title||work.projects.find(p=>!finished(p.status))?.name||w.reason.split(' HQ directory')[0]);}).join(''):
      (staff.some(p=>p.id===actor.id)?'':card(teamUrl({person:'owner'}),personAvatar('James Calam'),'James Calam','Administrator','Approvals & team decisions','Sets direction and helps the team move forward.'))+staff.map(person=>{const fields=data.byId.get(profileId(person.id))?.fields||{},work=personWork(person,data);return card(teamUrl({person:person.id}),personAvatar(person.name),person.name,fields.role||'Team member',person.id===actor.id?'Administrator account':!person.code_hash?'Access disabled':!data.activityAvailable?'Activity unavailable':work.open.length?taskCount(work.open.length):'No open tasks recorded',work.open[0]?.title||fields.responsibilities||'Open profile for work and access.');}).join(''))+'</div>'+
    '<div class="team-directory-footer">'+button('Confidentiality agreements',url('nda'))+button('Connections',url('connections'))+'</div></div>';
}
export async function saveTeamProfile(f,actor,staff,data,api){
  if(actor.role!=='admin')throw new HttpError(403,'Administrator access is required.');
  const id=uuid(f.staff);if(!staff.some(person=>person.id===id))throw new HttpError(404,'This person is unavailable.');
  const revision=Number(f.revision),old=data.byId.get(profileId(id));
  if(!Number.isSafeInteger(revision)||revision<0||(old?.revision||0)!==revision)throw new HttpError(409,'This profile changed. Reopen it before saving.');
  const text=(value,max)=>{if(typeof value!=='string'||value.length>max)throw new HttpError(400,'Check the profile text and length.');return value.trim();};
  await saveRecord(api,actor,{id:profileId(id),kind:'settings',title:'Team profile',status:'Draft',fields:{role:text(f.role||'',160),responsibilities:text(f.responsibilities||'',4000),reportsTo:text(f.reportsTo||'',160)}},revision);
}
