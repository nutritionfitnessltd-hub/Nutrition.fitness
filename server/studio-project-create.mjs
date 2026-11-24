import {randomUUID} from 'node:crypto';
import {projectTasks} from './studio-project-tasks.mjs';
import {HttpError} from './platform.mjs';
import {esc,url,heading,button,form,hidden,input,textarea,select} from './studio-ui.mjs';

export function projectCreatePage(params,data,values={}){
 if(data.actor.role!=='admin')throw new HttpError(403,'Only the administrator can create projects.');
 const step=['details','owner','tasks','review'].includes(values.step)?values.step:'details';
 const f={id:values.id||randomUUID(),name:values.name||'',brief:values.brief||'',launch:values.launch||'',creator:values.creator||''};
 let tasks=projectTasks(values.tasks||'[]',data.people);
 if(values.taskAction==='add')tasks.push(...projectTasks(JSON.stringify([{title:values.taskTitle,assignee:values.taskAssignee,due:values.taskDue,estimatedHours:values.taskHours,notes:values.taskNotes}]),data.people));
 if(values.taskAction==='remove')tasks.splice(Number(values.taskIndex),1);
 f.tasks=JSON.stringify(tasks);
 const retained=Object.entries(f).map(([key,value])=>hidden(key,value)).join('');
 const next=(target,body,label)=>form('project-setup',hidden('step',target)+body,{section:'project-create'},label);
 const back=target=>next(target,retained,'Back');
 let body=heading('Create a project','Start with a blank project and add your own tasks.',button('Cancel',url('projects')))+
  '<ol class="studio-flow-steps" aria-label="Create project steps">'+[['details','1. Project details'],['owner','2. Choose an owner'],['tasks','3. Add tasks'],['review','4. Review and create']].map(([id,label],i)=>'<li'+(step===id?' aria-current="step"':'')+'><span>'+(i+1)+'</span>'+label.replace(/^\d+\. /,'')+'</li>').join('')+'</ol>';
 if(step==='details')return body+'<section class="panel">'+next('owner',hidden('id',f.id)+hidden('creator',f.creator)+hidden('tasks',f.tasks)+input('name','Project name',f.name,'text','required maxlength="160"')+textarea('brief','What is this project for? (optional)',f.brief,3)+input('launch','Target date (optional)',f.launch,'date'),'Next: choose an owner')+'</section>';
 if(!f.name.trim())throw new HttpError(400,'Give the project a name.');
 if(step==='owner')return body+'<section class="panel"><h2>Who will own this project?</h2>'+next('tasks',hidden('tasks',f.tasks)+hidden('id',f.id)+hidden('name',f.name)+hidden('brief',f.brief)+hidden('launch',f.launch)+select('creator','Project owner',{'':'Choose a team member',...Object.fromEntries(data.people.map(p=>[p.id,p.name]))},f.creator),'Next: add tasks')+back('details')+'</section>';
 const owner=data.people.find(p=>p.id===f.creator);if(!owner)throw new HttpError(400,'Choose a project owner.');
 const taskList=tasks.length?'<ol>'+tasks.map((t,i)=>'<li><strong>'+esc(t.title)+'</strong><p>'+esc(data.people.find(p=>p.id===t.assignee)?.name||owner.name)+(t.estimatedHours?' · '+esc(t.estimatedHours)+' hours':'')+(t.due?' · Deadline '+esc(t.due):'')+'</p>'+ (step==='tasks'?next('tasks',retained+hidden('taskAction','remove')+hidden('taskIndex',i),'Remove task'):'')+'</li>').join('')+'</ol>':'<p>No tasks added yet. You can add them later.</p>';
 if(step==='tasks')return body+'<section class="panel"><h2>Tasks and assignments</h2>'+taskList+next('tasks',retained+hidden('taskAction','add')+input('taskTitle','Task title','','text','required maxlength="160"')+select('taskAssignee','Assign to',{'':'Project owner',...Object.fromEntries(data.people.map(p=>[p.id,p.name]))})+input('taskHours','Estimated hours','','number','min="0.01" max="5000" step="0.01"')+input('taskDue','Deadline (optional)','','date')+textarea('taskNotes','Task details (optional)','','3'),'Add task')+next('review',retained,'Next: review project')+back('owner')+'</section>';
 return body+'<section class="panel"><h2>'+esc(f.name)+'</h2><p><strong>Owner:</strong> '+esc(owner.name)+'</p>'+(f.brief?'<p class="prose">'+esc(f.brief)+'</p>':'')+(f.launch?'<p><strong>Target date:</strong> '+esc(f.launch)+'</p>':'')+'<h3>Tasks</h3>'+taskList+form('project-blank-create',retained,{section:'project-create'},'Create project')+back('tasks')+'</section>';
}
