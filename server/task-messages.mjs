import {createHash,randomUUID} from 'node:crypto';
import {HttpError,uuid} from './platform.mjs';
import {canAccess,requireAccess} from './library-permissions.mjs';
import {projectTask,assignedTask,notifyTask} from './task-notifications.mjs';
import {taskAttachmentPanel} from './task-files.mjs';
import {saveProject} from './studio-store.mjs';
import {documentText} from './document-reader.mjs';
import {esc,url,heading,button,hidden,textarea,select,form} from './studio-ui.mjs';

export function taskContext(params,data){
 requireAccess(data.actor,'work');
 let task;
 if(params.get('task')){
  const id=uuid(params.get('task')),t=data.tasks.find(t=>t.id===id);
  if(t)task={...assignedTask(t),source:t,ownerId:t.created_by,brief:t.instructions||'',revision:t.revision,back:'/content-library/?work=1&assignments=1'};
 }else{
  const p=data.projects.find(p=>p.id===params.get('project'));
  const e=p?.entries?.find(e=>e.id===params.get('entry'));
  if(p&&e&&!p.assignmentOnly)task={...projectTask(p,e),source:e,project:p,ownerId:p.creator_id,brief:e.notes||'',revision:p.revision,back:url('project',{project:p.id,week:e.week||0})};
 }
 if(!task||data.actor.role!=='admin'&&!task.participants.includes(data.actor.id))throw new HttpError(403,'This task is outside your assigned work.');
 task.threadId='studio:task-thread:'+createHash('sha256').update(task.key).digest('hex');return task;
}
export const canUpdateTask=(task,actor)=>canAccess(actor,'edit')&&(actor.role==='admin'||task.assignee===actor.id||task.ownerId===actor.id);
const taskStatuses=['To do','In progress','Ready for review','Done'];
export async function threadFor(task,api){
 const rows=await api('/rest/v1/nufi_studio_items?id=eq.'+task.threadId+'&select=payload,revision',{service:true});
 return rows[0]||{revision:0,payload:{id:task.threadId,kind:'task-thread',title:'Task messages',status:'Draft',fields:{taskKey:task.key,messages:[]}}};
}
export async function taskPage(params,data,api,retained={},error=''){
 const task=taskContext(params,data),thread=await threadFor(task,api),messages=thread.payload.fields.messages||[];
 const page=Math.max(0,Math.min(Math.max(0,Math.ceil(messages.length/25)-1),parseInt(params.get('messagePage'))||0));
 const end=messages.length-page*25,visible=messages.slice(Math.max(0,end-25),end);
 return '<div class="project-document task-conversation">'+button('← Back to work',task.back)+button('Start a private team conversation',url('messages',{new:'1',...task.values}))+heading(task.title,task.status)+(data.actor.role==='admin'&&params.get('task')?button('Edit this task',url('home',{editTask:params.get('task')})):'')+'<section><h2>Task brief</h2>'+documentText(task.brief||'No brief recorded.',{headingLevel:3})+'</section>'+
 (canUpdateTask(task,data.actor)?'<section id="task-update"><h2>Update task</h2>'+form('assignment-status',hidden('revision',task.revision)+select('status','Status',Object.fromEntries(taskStatuses.map(s=>[s,s])),retained.status||task.status),{section:'task',...task.values},'Save status')+
 (task.status!=='Done'?form('assignment-status',hidden('revision',task.revision)+hidden('status','Done'),{section:'task',...task.values},'Mark complete'):'<p role="status">This task is complete. Choose a different status above to reopen it.</p>')+'</section>':'')+
 '<section id="task-notes"><h2>Progress notes</h2><p class="meta">Record progress, decisions and anything needed to finish this task.</p>'+
 ((thread.payload.fields.notes||[]).length?'<ol class="task-message-list">'+[...thread.payload.fields.notes].reverse().map(n=>'<li><header><strong>'+esc(n.author)+'</strong><time datetime="'+esc(n.at)+'">'+esc(new Date(n.at).toLocaleString('en-GB',{timeZone:'Europe/London',dateStyle:'medium',timeStyle:'short'}))+'</time></header>'+documentText(n.body,{headingLevel:3})+'</li>').join('')+'</ol>':'<p>No progress notes yet.</p>')+
 (canUpdateTask(task,data.actor)?form('task-note',hidden('threadRevision',thread.revision)+hidden('noteId',retained.noteId||randomUUID())+textarea('note','Progress note',retained.note||'',3),{section:'task',...task.values},'Save note'):'')+'</section>'+
 taskAttachmentPanel(task,thread,data)+
 '<section id="task-messages"><h2>Messages</h2><p class="meta">For the assignee, person who assigned the task, project owner and administrators.</p>'+(error?'<p role="alert">'+esc(error)+'</p>':'')+(params.get('notification')==='pending'?'<p role="status">Saved. Email delivery needs attention; an administrator can check Connections.</p>':'')+
 (messages.length?'<ol class="task-message-list">'+visible.map(m=>'<li><header><strong>'+esc(m.author)+'</strong><time datetime="'+esc(m.at)+'">'+esc(new Date(m.at).toLocaleString('en-GB',{timeZone:'Europe/London',dateStyle:'medium',timeStyle:'short'}))+'</time></header>'+documentText(m.body,{headingLevel:3})+'</li>').join('')+'</ol>':'<p>No messages yet. Use this thread to discuss the task.</p>')+
 (messages.length>25?'<nav aria-label="Task messages">'+(end>25?button('Older messages',url('task',{...task.values,messagePage:page+1})+'#task-messages'):'')+(page>0?button('Newer messages',url('task',{...task.values,messagePage:page-1})+'#task-messages'):'')+'</nav>':'')+
 form('task-message',hidden('threadRevision',thread.revision)+hidden('messageId',retained.messageId||randomUUID())+textarea('body','Message',retained.body||'',3),{section:'task',...task.values},'Post message')+'</section></div>';
}
export async function postTaskMessage(params,f,data,api){
 const task=taskContext(params,data),thread=await threadFor(task,api),id=uuid(f.messageId);
 const messages=thread.payload.fields.messages||[];
 const duplicate=messages.find(m=>m.id===id);
 if(duplicate){if(duplicate.authorId!==data.actor.id||duplicate.body!==String(f.body||'').trim())throw new HttpError(409,'Reopen the task before posting.');return {task,id,duplicate:true};}
 if(Number(f.threadRevision)!==thread.revision)throw new HttpError(409,'A new message arrived. Read it below, then post your message again.');
 if(typeof f.body!=='string'||!f.body.trim()||f.body.length>4000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(f.body))throw new HttpError(400,'Write a message of up to 4,000 characters.');
 if(messages.length>=500)throw new HttpError(400,'This thread has reached 500 messages. Ask the administrator to continue the discussion in a follow-up task.');
 const message={id,authorId:data.actor.id,author:data.actor.name||'Administrator',at:new Date().toISOString(),body:f.body.trim()};
 const record={...thread.payload,fields:{...thread.payload.fields,taskKey:task.key,messages:[...messages,message]}};
 const saved=await api('/rest/v1/rpc/nufi_studio_save',{service:true,method:'POST',payload:{item:task.threadId,expected:thread.revision,document:record,editor_name:'task-message:'+data.actor.id}});
 if(!saved.length)throw new HttpError(409,'A new message arrived. Read it below, then post your message again.');
 return {task,id};
}
export async function postTaskNote(params,f,data,api){
 const task=taskContext(params,data);
 if(!canUpdateTask(task,data.actor))throw new HttpError(403,'Only the assignee, task owner or administrator can update this task.');
 const thread=await threadFor(task,api),id=uuid(f.noteId),notes=thread.payload.fields.notes||[],body=String(f.note||'').trim(),duplicate=notes.find(n=>n.id===id);
 if(duplicate){if(duplicate.authorId!==data.actor.id||duplicate.body!==body)throw new HttpError(409,'Reopen the task before saving this note.');return false;}
 if(Number(f.threadRevision)!==thread.revision)throw new HttpError(409,'This task discussion changed. Read the latest notes, then save again.');
 if(!body||body.length>4000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(body))throw new HttpError(400,'Write a progress note of up to 4,000 characters.');
 if(notes.length>=500)throw new HttpError(400,'This task has reached 500 progress notes.');
 const note={id,body,authorId:data.actor.id,author:data.actor.name||'Administrator',at:new Date().toISOString()};
 const document={...thread.payload,fields:{...thread.payload.fields,notes:[...notes,note]}};
 const saved=await api('/rest/v1/rpc/nufi_studio_save',{service:true,method:'POST',payload:{item:task.threadId,expected:thread.revision,document,editor_name:'task-note:'+data.actor.id}});
 if(!saved.length)throw new HttpError(409,'This task discussion changed. Read the latest notes, then save again.');
 return false;
}
export async function changeTaskPage(params,f,data,api,env,fetcher){
 if(f.action==='task-note')return postTaskNote(params,f,data,api);
 if(f.action==='task-message'){
  const result=await postTaskMessage(params,f,data,api);
  return await notifyTask({task:result.task,reason:'message',version:result.id,actor:data.actor,api,env,fetcher});
 }
 if(f.action==='assignment-status'){
  requireAccess(data.actor,'work','edit');const task=taskContext(params,data);
  if(!canUpdateTask(task,data.actor))throw new HttpError(403,'Only the assignee, task owner or administrator can update this task.');
  if(!taskStatuses.includes(f.status))throw new HttpError(400,'Choose a task status.');
  if(!Number.isSafeInteger(Number(f.revision))||Number(f.revision)!==task.revision)throw new HttpError(409,'The task changed. Open the latest status before updating it.');
  if(task.project){
   const entries=task.project.entries.map(e=>e.id===task.values.entry?{...e,status:f.status,updatedAt:new Date().toISOString()}:e);
   await saveProject(api,data.actor,task.project,{entries});
   return task.status!==f.status?await notifyTask({task:{...task,status:f.status},reason:'status',version:task.revision+1,actor:data.actor,api,env,fetcher}):false;
  }
  const rows=await api('/rest/v1/nufi_library_tasks?id=eq.'+task.values.task+'&revision=eq.'+task.revision+(data.actor.role==='admin'?'':'&'+(task.assignee===data.actor.id?'staff_id':'created_by')+'=eq.'+data.actor.id),{service:true,method:'PATCH',headers:{Prefer:'return=representation'},payload:{status:f.status,revision:task.revision+1}});
  if(!rows.length)throw new HttpError(409,'The task changed. Reopen it before updating.');
  return task.status!==f.status?await notifyTask({task:{...task,status:f.status},reason:'status',version:task.revision+1,actor:data.actor,api,env,fetcher}):false;
 }
 throw new HttpError(400,'Choose a task action.');
}
