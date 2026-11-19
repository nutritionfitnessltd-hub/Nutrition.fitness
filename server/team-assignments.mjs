import {randomUUID} from 'node:crypto';
import {HttpError,uuid} from './platform.mjs';
import {esc,url,heading,hidden,input,textarea,select,form,button} from './studio-ui.mjs';

const closed=p=>['Complete','Archived'].includes(p.status);
export const assignmentProjectId=task=>/^project:([a-f0-9-]{36})$/i.exec(task.record_id||'')?.[1]||'';
export function assignmentLink(task){
  const project=assignmentProjectId(task);
  return project?url('project',{project}):/^assignment:/.test(task.record_id||'')?'':null;
}
export function assignmentForm(person,projects,values={},error=''){
  const available=projects.filter(p=>!closed(p));
  return '<section class="team-assignment">'+heading('Assign work','Give '+person.name+' a clear task and, if relevant, link it to a project.')+
    (error?'<p role="alert">'+esc(error)+'</p>':'')+
    form('team-assign',hidden('staff',person.id)+hidden('id',values.id||randomUUID())+
      input('title','Task name',values.title||'','text','required maxlength="160" placeholder="What needs doing?"')+
      textarea('instructions','Brief',values.instructions||'',4)+
      select('project','Project (optional)',{'':'Standalone task',...Object.fromEntries(available.map(p=>[p.id,p.name]))},values.project||'')+
      (!available.length?'<p class="meta">No active projects are available. You can still assign this task.</p>':'')+
      input('due','Due date (optional)',values.due||'','date'),{section:'team',person:person.id,assign:'1'},'Assign to '+person.name)+
      '<p>'+button('Back to profile',url('team',{person:person.id}))+'</p></section>';
}
export async function saveAssignment(fields,actor,staff,projects,api){
  if(actor.role!=='admin')throw new HttpError(403,'Administrator access is required.');
  const id=uuid(fields.id),staffId=uuid(fields.staff);
  if(!staff.some(p=>p.id===staffId))throw new HttpError(404,'This person is unavailable.');
  const text=(value,max,required=false)=>{
    if(typeof value!=='string'||value.length>max||required&&!value.trim()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw new HttpError(400,'Check the task name and brief.');
    return value.trim();
  };
  const project=fields.project?projects.find(p=>p.id===uuid(fields.project)&&!closed(p)):null;
  if(fields.project&&!project)throw new HttpError(400,'Choose an available project or a standalone task.');
  const due=fields.due||'';
  if(due&&(!/^\d{4}-\d{2}-\d{2}$/.test(due)||!Number.isFinite(Date.parse(due))||new Date(due).toISOString().slice(0,10)!==due))throw new HttpError(400,'Choose a valid due date.');
  const task={id,staff_id:staffId,created_by:actor.id,record_id:project?'project:'+project.id:'assignment:'+id,record_title:project?.name||'Standalone task',title:text(fields.title,160,true),instructions:text(fields.instructions||'',3000),due_date:due||null};
  // The form ID makes retrying a successful submission safe.
  await api('/rest/v1/nufi_library_tasks?on_conflict=id',{service:true,method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},payload:task});
  return task;
}
