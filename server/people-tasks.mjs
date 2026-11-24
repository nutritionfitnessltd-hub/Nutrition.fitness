import {createHash,randomUUID} from 'node:crypto';
import {HttpError,uuid} from './platform.mjs';
import {allRows,saveRecord} from './studio-store.mjs';
import {saveAssignment,assignmentProjectId} from './team-assignments.mjs';
import {esc,url,form,hidden,input,textarea,select,button} from './studio-ui.mjs';
export const roleTaskId=id=>'studio:role-task:'+uuid(id);
export const londonDay=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
const day=d=>new Date(d+'T12:00:00Z');
const plus=(d,n)=>{const v=day(d);v.setUTCDate(v.getUTCDate()+n);return v.toISOString().slice(0,10);};
const validDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')&&Number.isFinite(+day(d))&&day(d).toISOString().slice(0,10)===d;
const admin=data=>{if(data.actor.role!=='admin')throw new HttpError(403,'Only an administrator can create or manage assignments.');};
const text=(s,max,required=false)=>{if(typeof s!=='string'||s.length>max||required&&!s.trim())throw new HttpError(400,'Check the task details and length.');return s.trim();};
const integer=(v,min,max)=>{const n=Number(v);if(!Number.isInteger(n)||n<min||n>max)throw new HttpError(400,'Check the repeat interval and working days.');return n;};
const active=p=>!['Complete','Archived'].includes(p.status);
export function workStart(d,n){let result=d;while(n>0){result=plus(result,-1);if(![0,6].includes(day(result).getUTCDay()))n--;}return result;}
export function nextDelivery(rule,from){
 for(let d=from,i=0;i<3700;i++,d=plus(d,1)){
  if(d<rule.firstDue)continue;if(rule.end&&d>rule.end)return null;
  const elapsed=Math.round((day(d)-day(rule.firstDue))/86400000),weekday=day(d).getUTCDay();
  let match=rule.repeat==='daily'?(!rule.weekends||![0,6].includes(weekday)):
   rule.repeat==='weekly'?rule.days.includes(weekday):rule.repeat==='custom'?elapsed%rule.interval===0:false;
  if(rule.repeat==='monthly'){
   const anchor=day(rule.firstDue).getUTCDate(),last=new Date(Date.UTC(day(d).getUTCFullYear(),day(d).getUTCMonth()+1,0)).getUTCDate();
   match=day(d).getUTCDate()===Math.min(anchor,last);
  }
  if(match&&(!rule.weekends||![0,6].includes(weekday)||rule.repeat==='monthly'||rule.repeat==='custom')){
   // Fixed monthly/custom deadlines falling at the weekend move to Monday.
   let due=d;if(rule.weekends)while([0,6].includes(day(due).getUTCDay()))due=plus(due,1);
   if(rule.end&&due>rule.end)return null;
   return {scheduled:d,due};
  }
 }
 throw new HttpError(400,'No occurrence was found in the supported date range.');
}
export function occurrenceId(templateId,scheduled){const h=createHash('sha256').update(templateId+':'+scheduled).digest('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-5'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);}
export const roleTemplates=data=>(data.items||[]).filter(r=>r.kind==='settings'&&r.fields?.roleTaskTemplate===true);
function readRule(f,data){
 if(!data.people.some(p=>p.id===f.staff))throw new HttpError(400,'Choose a person from the team.');
 const repeat=f.repeat||'none';if(!['none','daily','weekly','monthly','custom'].includes(repeat))throw new HttpError(400,'Choose a repeat frequency.');
 const due=f.due||'';if((repeat!=='none'||due)&&!validDate(due))throw new HttpError(400,'Choose a valid first delivery date.');
 const end=f.end||'';if(end&&(!validDate(end)||end<due))throw new HttpError(400,'The end date must be on or after the first delivery.');
 const project=f.project?data.projects.find(p=>p.id===f.project&&active(p)):null;if(f.project&&!project)throw new HttpError(400,'Choose an active project.');
 const days=[0,1,2,3,4,5,6].filter(n=>f['day'+n]==='yes');if(repeat==='weekly'&&!days.length)throw new HttpError(400,'Choose at least one repeat day.');
 const hours=f.hours===''||f.hours===undefined?'':Number(f.hours);if(hours!==''&&(!Number.isFinite(hours)||hours<=0||hours>5000))throw new HttpError(400,'Enter estimated hours between 0 and 5,000.');
 const dependency=f.dependency?data.tasks.find(t=>t.id===f.dependency):null;if(f.dependency&&!dependency)throw new HttpError(400,'Choose an available task dependency.');
 const asset=f.asset?data.byId.get(f.asset):null;if(f.asset&&!asset)throw new HttpError(400,'Choose an available linked asset.');
 return {title:text(f.title||'',160,true),staff:f.staff,instructions:text(f.instructions||'',f.action==='people-task-edit'?3000:1400),checklist:text(f.checklist||'',700),project:project?.id||'',firstDue:due,repeat,days,end,weekends:f.weekends==='yes',leadDays:integer(f.leadDays||0,0,60),interval:integer(f.interval||1,1,365),hours,dependency:dependency?.id||'',dependencyTitle:dependency?.title||'',asset:asset?.id||'',assetTitle:asset?.title||''};
}
function assignmentFields(rule,id,due,recurring=false){
 const notes=[rule.instructions,rule.checklist?'Completion checklist:\n'+rule.checklist.split('\n').filter(s=>s.trim()).map(s=>'☐ '+s.trim()).join('\n'):'',rule.leadDays&&due?'Start by: '+workStart(due,rule.leadDays)+' ('+rule.leadDays+' working days before delivery)':'',rule.hours?'Estimated hours: '+rule.hours:'',rule.dependencyTitle?'Must finish first: '+rule.dependencyTitle:'',rule.asset?'Linked asset: '+rule.assetTitle+'\nhttps://team.nutrition.fitness'+url('item',{id:rule.asset}).replaceAll('&amp;','&'):'',recurring?'Recurring role task · '+due:''].filter(Boolean).join('\n\n');
 return {id,staff:rule.staff,title:rule.title,instructions:notes,project:rule.project,due};
}
export async function generateRoleOccurrence(record,{api,people,projects,now=new Date(),forceFirst=false}){
 const rule=record.fields;if(rule.paused||rule.finished)return {record,generated:false};
 const next=nextDelivery(rule,rule.nextDate||rule.firstDue);if(!next){const ended={...record,fields:{...rule,finished:true}};delete ended.revision;delete ended.updatedAt;await saveRecord(api,{id:rule.createdBy,role:'admin'},ended,record.revision);return {record,generated:false,ended:true};}
 if(!forceFirst&&workStart(next.due,rule.leadDays)>londonDay(now))return {record,generated:false};
 // Stable IDs and ignore-duplicates preserve completed work on retries and overlap.
 const owner={id:rule.createdBy,role:'admin'};
 await saveAssignment(assignmentFields(rule,occurrenceId(record.id,next.scheduled),next.due,true),owner,people,projects,api);
 const nextDate=plus(next.scheduled,1),following=nextDelivery(rule,nextDate);
 const updated={...record,fields:{...rule,nextDate,lastDelivery:next.due,finished:!following,generationError:'',lastGeneratedAt:now.toISOString()}};delete updated.revision;delete updated.updatedAt;
 const saved=await saveRecord(api,owner,updated,record.revision);
 return {record:{...updated,revision:saved.revision},generated:true};
}
export async function peopleTaskAction(f,data,api){
 admin(data);
 if(f.action==='people-task-edit'){
  const old=data.tasks.find(t=>t.id===f.id);if(!old)throw new HttpError(404,'Task unavailable.');
  if(old.revision!==Number(f.revision))throw new HttpError(409,'This task changed. Reopen it before saving.');
  const rule=readRule({...f,repeat:'none'},data);
  const rows=await api('/rest/v1/nufi_library_tasks?id=eq.'+uuid(f.id)+'&revision=eq.'+old.revision,{service:true,method:'PATCH',headers:{Prefer:'return=representation'},payload:{staff_id:rule.staff,title:rule.title,instructions:text(f.instructions||'',3000),record_id:rule.project?'project:'+rule.project:'assignment:'+old.id,record_title:data.projects.find(p=>p.id===rule.project)?.name||'Standalone task',due_date:rule.firstDue||null,revision:old.revision+1,...(['To do','In progress','Ready for review','Done'].includes(f.status)?{status:f.status}:{})}});
  if(!rows.length)throw new HttpError(409,'This task changed. Reopen it before saving.');return {section:'home'};
 }
 const id=uuid(f.id),old=roleTemplates(data).find(r=>r.id===roleTaskId(id));
 if(f.action==='role-task-toggle'){
  if(!old||old.revision!==Number(f.revision))throw new HttpError(409,'This role task changed. Reopen it before saving.');
  const paused=!old.fields.paused,next={...old,fields:{...old.fields,paused,...(!paused?{nextDate:londonDay()}:{} )}};delete next.revision;delete next.updatedAt;
  await saveRecord(api,data.actor,next,old.revision);return {section:'home'};
 }
 if(f.action==='people-task-create'&&old){await generateRoleOccurrence(old,{api,people:data.people,projects:data.projects});return {section:'home'};}
 const rule=readRule(f,data);
 if(rule.repeat==='weekly'&&rule.weekends&&rule.days.every(n=>[0,6].includes(n)))throw new HttpError(400,'Choose a weekday or turn off Skip weekends.');
 if(f.action==='role-task-save'&&(!old||old.revision!==Number(f.revision)))throw new HttpError(409,'This role task changed. Reopen it before saving.');
 if(f.action==='people-task-create'&&rule.repeat==='none'){
  await saveAssignment(assignmentFields(rule,id,rule.firstDue),data.actor,data.people,data.projects,api);return {section:'home'};
 }
 if(rule.repeat!=='none'&&!nextDelivery(rule,rule.firstDue))throw new HttpError(400,'No delivery falls within the selected dates.');
 if(rule.repeat==='none')throw new HttpError(400,'Choose a repeat frequency for a role task. Pause it to stop future occurrences.');
 // Edits never recreate old occurrences. Existing task snapshots are unchanged.
 text(assignmentFields(rule,id,rule.firstDue).instructions,3000);
 const record={id:roleTaskId(id),kind:'settings',title:rule.title,status:'Draft',fields:{...rule,roleTaskTemplate:true,createdBy:old?.fields.createdBy||data.actor.id,paused:old?.fields.paused||false,nextDate:old?(londonDay()>rule.firstDue?londonDay():rule.firstDue):rule.firstDue}};
 const saved=await saveRecord(api,data.actor,record,old?.revision||0);
 if(!old)await generateRoleOccurrence({...record,revision:saved.revision},{api,people:data.people,projects:data.projects,forceFirst:true});
 return {section:'home'};
}
export async function runRoleTasks({api,now=new Date()}){
 const [rows,people,projects]=await Promise.all([allRows(api,'/rest/v1/nufi_studio_items?select=id,payload,revision&payload->fields->>roleTaskTemplate=eq.true&order=id'),allRows(api,'/rest/v1/nufi_library_staff?select=id,name&order=id'),allRows(api,'/rest/v1/nufi_library_projects?select=*&order=id')]);
 let generated=0;const errors=[];
 for(const row of rows){let record={...row.payload,id:row.id,revision:row.revision};try{
  for(let i=0;i<50&&generated<200;i++){const result=await generateRoleOccurrence(record,{api,people,projects,now});if(!result.generated)break;generated++;record=result.record;}
 }catch(e){const reason=e.status===409?'Changed during generation; retry next run.':'Task generation failed; check the assignee and linked project.';errors.push({id:row.id,reason});if(e.status!==409){try{const next={...record,fields:{...record.fields,generationError:reason}};delete next.revision;await saveRecord(api,{id:record.fields.createdBy,role:'admin'},next,record.revision);}catch{}}}}
 return {generated,errors};
}
const daysNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
export function peopleTaskModal(data,params=new URLSearchParams(),retained={}){
 if(data.actor.role!=='admin')return '';
 const old=params.get('roleTask')?roleTemplates(data).find(r=>r.id===params.get('roleTask')):null;
 const task=params.get('editTask')?data.tasks.find(t=>t.id===params.get('editTask')):null;
 if(params.has('roleTask')&&!old||params.has('editTask')&&!task)throw new HttpError(404,'Task unavailable.');
 const r={...(old?.fields||{}),...(task?{title:task.title,staff:task.staff_id,instructions:task.instructions,project:assignmentProjectId(task),due:task.due_date}:{}),...retained};
 if(retained.formPresent==='yes'){r.days=[0,1,2,3,4,5,6].filter(n=>retained['day'+n]==='yes');r.weekends=retained.weekends==='yes';}
 const id=task?.id||old?.id.slice('studio:role-task:'.length)||r.id||randomUUID(),open=params.has('newTask')||!!old||!!task||Object.keys(retained).length>0;
 const repeat=r.repeat||'none',due=r.due??r.firstDue??'',people=Object.fromEntries(data.people.map(p=>[p.id,p.name]));
 const fields=hidden('formPresent','yes')+hidden('id',id)+hidden('revision',old?.revision||task?.revision||0)+input('title','Task name',r.title||'','text','required maxlength="160"')+select('staff','Assign to a person',{'':'Choose a person',...people},r.staff||params.get('person')||'')+textarea('instructions',task?'Instructions / completion checklist':'Instructions / expected result',r.instructions||'',3)+select('project','Project (optional)',{'':'Standalone task',...Object.fromEntries(data.projects.filter(active).map(p=>[p.id,p.name]))},r.project||'')+input('due',task?'Delivery date':'First delivery date',due,'date')+(task?select('status','Status',Object.fromEntries(['To do','In progress','Ready for review','Done'].map(s=>[s,s])),task.status):'')+
 (!task?textarea('checklist','Completion checklist — one item per line',r.checklist||'',3)+select('repeat','Repeat',{none:'Does not repeat',daily:'Daily',weekly:'Weekly',monthly:'Monthly',custom:'Every N days'},repeat)+'<div data-repeat-options'+(repeat==='none'?' hidden':'')+'><fieldset data-weekly-days'+(repeat==='weekly'?'':' hidden')+'><legend>Repeat on</legend>'+[1,2,3,4,5,6,0].map(n=>'<label class="check"><input type="checkbox" name="day'+n+'" value="yes"'+((r.days||[5]).includes(n)?' checked':'')+'>'+daysNames[n]+'</label>').join('')+'</fieldset><div data-custom-interval'+(repeat==='custom'?'':' hidden')+'>'+input('interval','Repeat every (calendar days)',r.interval||1,'number','min="1" max="365"')+'</div>'+input('leadDays','Working days before delivery to start',r.leadDays||0,'number','min="0" max="60"')+input('end','End date (optional)',r.end||'','date')+'<label class="check"><input type="checkbox" name="weekends" value="yes"'+(r.weekends!==false?' checked':'')+'>Skip weekends / move weekend deliveries to Monday</label><p class="meta">London dates. The first occurrence is created now. Later tasks appear when their start date arrives. Pausing stops future creation; existing tasks stay visible.</p></div><details><summary>More options</summary>'+input('hours','Estimated hours',r.hours||'','number','min="0.01" max="5000" step="0.01"')+select('dependency','Must finish first (optional)',{'':'No dependency',...Object.fromEntries((data.tasks||[]).filter(t=>t.status!=='Done').map(t=>[t.id,t.title]))},r.dependency||'')+select('asset','Linked asset (optional)',{'':'No linked asset',...Object.fromEntries(data.items.filter(t=>t.kind!=='settings').slice(0,300).map(t=>[t.id,t.title]))},r.asset||'')+'<p class="meta">The dependency is included in the task brief.</p></details>':'');
 return '<dialog class="people-task-modal" data-people-task-modal'+(open?' data-open-on-load':'')+' aria-labelledby="people-task-title"><header><h2 id="people-task-title">'+(task?'Edit this occurrence':old?'Edit future role tasks':'New task')+'</h2><button type="button" data-people-task-close aria-label="Close task form">×</button></header><div class="people-task-modal-body">'+(old?'<p>Changes apply to occurrences not yet created. Existing assignments keep their saved details.</p>':'')+form(task?'people-task-edit':old?'role-task-save':'people-task-create',fields+'<button type="button" data-people-task-close>Cancel</button>',{section:'home'},task?'Save this task':old?'Save future tasks':'Create & assign')+'</div></dialog><script type="module" src="/people-tasks.js"></script>';
}
export function roleTasksPanel(data,person=''){
 if(data.actor.role!=='admin')return '';
 const rows=roleTemplates(data).filter(r=>!person||r.fields.staff===person);
 const render=r=>{
  const f=r.fields,next=f.paused||f.finished?null:nextDelivery(f,f.nextDate||f.firstDue);
  const schedule=f.repeat==='weekly'?(f.days||[]).map(n=>daysNames[n]).join(', '):f.repeat==='custom'?'Every '+f.interval+' days':f.repeat;
  return '<article><div><strong>'+esc(r.title)+'</strong><p>'+esc(data.people.find(p=>p.id===f.staff)?.name||'Person unavailable')+' · '+esc(schedule)+' · '+(f.paused?'Paused':f.finished?'Ended':'Active')+'</p>'+(next?'<p>Next delivery: '+esc(next.due)+' · Start: '+esc(workStart(next.due,f.leadDays))+'</p>':'')+(f.generationError?'<p role="alert">'+esc(f.generationError)+'</p>':'')+'</div><div class="studio-actions">'+button('Edit future tasks',url('home',{roleTask:r.id}))+form('role-task-toggle',hidden('id',r.id.slice('studio:role-task:'.length))+hidden('revision',r.revision),{section:'home'},f.paused?'Resume':'Pause')+'</div></article>';
 };
 return '<section class="panel role-tasks"><div class="dashboard-section-heading"><h2>Role tasks</h2>'+button('+ New task',url('home',{newTask:'1',...(person?{person}:{})}))+'</div><p class="meta">Recurring responsibilities. Edit an existing assignment to change only that occurrence.</p>'+(rows.length?rows.map(render).join(''):'<p>No recurring role tasks yet.</p>')+'</section>';
}
export function linkedPeopleTasks(project,data){
 const tasks=(data.tasks||[]).filter(t=>assignmentProjectId(t)===project?.id);
 return tasks.length?'<section class="panel"><h2>Assigned people tasks</h2>'+tasks.map(t=>'<article class="people-project-task"><strong>'+esc(t.title)+'</strong><p>'+esc(data.people.find(p=>p.id===t.staff_id)?.name||'Assigned person')+' · '+esc(t.status)+' · Delivery '+esc(t.due_date||'not set')+'</p>'+button('Open task',url('task',{task:t.id}))+(data.actor.role==='admin'?button('Edit this task',url('home',{editTask:t.id})):'')+'</article>').join('')+'</section>':'';
}
