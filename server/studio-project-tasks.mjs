import {randomUUID} from 'node:crypto';
import {HttpError} from './platform.mjs';
import {cleanText} from './studio-model.mjs';
import {canAccess} from './library-permissions.mjs';
import {esc,form,hidden} from './studio-ui.mjs';

export function projectTasks(value='[]',people=[]){
 let rows;try{rows=JSON.parse(value);}catch{throw new HttpError(400,'Reopen the project tasks and try again.');}
 if(!Array.isArray(rows)||rows.length>100)throw new HttpError(400,'Add up to 100 tasks.');
 return rows.map(row=>{
  if(!row||typeof row!=='object')throw new HttpError(400,'Check the task details.');
  const title=cleanText(row.title||'',160),assignee=row.assignee||'';
  if(!title)throw new HttpError(400,'Give each task a title.');
  if(assignee&&!people.some(p=>p.id===assignee))throw new HttpError(400,'Choose a team member for each assigned task.');
  const due=row.due||'';
  if(due&&(!/^\d{4}-\d{2}-\d{2}$/.test(due)||!Number.isFinite(Date.parse(due))||new Date(due).toISOString().slice(0,10)!==due))throw new HttpError(400,'Choose a valid task due date.');
  const estimatedHours=row.estimatedHours===undefined||row.estimatedHours===null||row.estimatedHours===''?null:Number(row.estimatedHours);
  if(estimatedHours!==null&&(!Number.isFinite(estimatedHours)||estimatedHours<=0||estimatedHours>5000||!/^\d+(?:\.\d{1,2})?$/.test(String(row.estimatedHours))))throw new HttpError(400,'Enter estimated hours between 0.01 and 5,000.');
  return {id:randomUUID(),title,assignee,due,estimatedHours,notes:cleanText(row.notes||'',4000),kind:'Task',week:0,status:'To do',record:null,scopeIds:[],assignedAsset:true};
 });
}
export const participates=(p,id)=>p.creator_id===id||p.entries.some(e=>e.assignee===id);
export const ownsTask=(p,e,id)=>(e.assignee||p.creator_id)===id;
export const canManageTasks=(p,actor)=>canAccess(actor,'edit')&&(actor.role==='admin'||p.creator_id===actor.id);
export function deleteTaskControl(p,e,data){
 if(!canManageTasks(p,data.actor))return '';
 return form('task-delete',hidden('projectRevision',p.revision)+hidden('entry',e.id),{section:'project',project:p.id},'Delete task','data-task-delete');
}
export function deletedTasksPanel(p,data){
 if(!canManageTasks(p,data.actor)||!p.studio.deletedTasks?.length)return '';
 return '<details class="panel deleted-tasks"><summary>Deleted tasks ('+p.studio.deletedTasks.length+')</summary>'+p.studio.deletedTasks.map(e=>'<div><strong>'+esc(e.title)+'</strong>'+form('task-restore',hidden('projectRevision',p.revision)+hidden('entry',e.id),{section:'project',project:p.id},'Restore task')+'</div>').join('')+'</details>';
}
