import {uuid} from './platform.mjs';
import {deliverNotification} from './studio-notifications.mjs';
import {url} from './studio-ui.mjs';

export const projectTask=(p,e)=>({title:e.title,status:e.status,assignee:e.assignee||p.creator_id,participants:[e.assignee||p.creator_id,p.creator_id,p.created_by].filter(Boolean),values:{project:p.id,entry:e.id},key:'project:'+p.id+':'+e.id});
export const assignedTask=t=>({title:t.title,status:t.status,assignee:t.staff_id,participants:[t.staff_id,t.created_by].filter(Boolean),values:{task:t.id},key:'assignment:'+t.id});
export async function notifyAssignment(id,reason,context,previous){
 try{
  const rows=await context.api('/rest/v1/nufi_library_tasks?id=eq.'+uuid(id)+'&select=*',{service:true}),t=rows[0];
  if(!t)return true;if(reason==='status'&&t.status===previous)return false;
  return await notifyTask({...context,task:assignedTask(t),reason,version:reason==='assigned'?'created':t.revision});
 }catch{return true;}
}
export async function taskEmailSettings(api){
 const rows=await api('/rest/v1/nufi_studio_items?id=eq.studio:notifications&select=payload,revision',{service:true});
 return rows[0]?.payload?.fields||{};
}
// Task events are recorded by the server after the task/message write succeeds.
// Directory addresses and recipients are resolved on the server, never from a form.
export async function notifyTask({task,reason,version,actor,api,env,fetcher=fetch}){
 try{
  const settings=await taskEmailSettings(api);if(settings.tasksEnabled!==true)return false;
  const ids=[...new Set((reason==='assigned'?[task.assignee]:task.participants).filter(id=>id&&id!==actor.id))];
  if(!ids.length)return false;
  const checked=ids.map(id=>uuid(id));
  const people=await api('/rest/v1/nufi_library_staff?select=id,email&id=in.('+checked.join(',')+')',{service:true});
  const peopleById=new Map(people.map(p=>[p.id,p]));
  const label=reason==='assigned'?'Task assigned':reason==='message'?'New task message':task.status==='Done'?'Task completed':task.status==='Ready for review'?'Task ready for review':task.status==='Changes requested'?'Task changes requested':'Task status updated';
  let base=new URL(env.NUFI_NOTIFICATION_BASE_URL||'https://team.nutrition.fitness');
  if(base.protocol!=='https:'||base.username||base.password)throw Error('Invalid notification address');
  let pending=false;const sent=new Set();
  for(const id of checked){
   const recipient=peopleById.get(id)?.email?.trim().toLowerCase();
   if(!recipient){pending=true;continue;}if(sent.has(recipient))continue;sent.add(recipient);
   const event={type:'task-workflow',key:task.key+':'+reason+':'+version+':'+recipient,recipient,title:label+': '+task.title,message:reason==='assigned'?'You have been assigned this task. Open it to view the brief and discuss the work.':reason==='message'?'A new message has been posted on this task. Open the task to read and reply.':'The task status is now '+task.status+'.',link:base.origin+url('task',task.values).replaceAll('&amp;','&')};
   const state=await deliverNotification({api,actor:{role:'system',id:'task-workflow'},env,event,fetcher});
   if(state!=='accepted')pending=true;
  }
  return pending;
 }catch{return true;}
}
export async function notifyProjectTasks(params,f,before,next,context){
 if(!['project-blank-create','project-create','project-save','task-add','task-attach','task-save','task-restore'].includes(f.action))return false;
 try{
  const id=next.project||params.get('project');if(!id)return false;
  const rows=await context.api('/rest/v1/nufi_library_projects?id=eq.'+uuid(id)+'&select=*',{service:true}),p=rows[0];if(!p)return true;
  const old=before.projects.find(project=>project.id===id);let pending=false;
  for(const e of p.entries||[]){
   const prior=old?.entries.find(entry=>entry.id===e.id),task=projectTask(p,e),previousAssignee=prior&&(prior.assignee||old.creator_id);
   if(!prior||previousAssignee!==task.assignee)pending=await notifyTask({...context,task,reason:'assigned',version:p.revision})||pending;
   if(prior&&prior.status!==e.status)pending=await notifyTask({...context,task,reason:'status',version:p.revision})||pending;
  }
  return pending;
 }catch{return true;}
}
