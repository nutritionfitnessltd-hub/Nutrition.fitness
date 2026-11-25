import {offeringSections,offeringFields,offeringDetails,offeringTasks} from './studio-offering-template.mjs';
import {randomUUID} from 'node:crypto';
import {projectTasks} from './studio-project-tasks.mjs';
import {HttpError} from './platform.mjs';
import {esc,url,heading,button,form,hidden,input,textarea,select} from './studio-ui.mjs';

export function projectCreatePage(params,data,values={}){
 if(data.actor.role!=='admin')throw new HttpError(403,'Only the administrator can create projects.');
 const step=['details','owner','tasks','review'].includes(values.step)?values.step:'details';
 const f={id:values.id||randomUUID(),name:values.name||'',brief:values.brief||'',launch:values.launch||'',creator:values.creator||''};
 f.projectTemplate=values.projectTemplate||'blank';
 if(!['blank','offering'].includes(f.projectTemplate))throw new HttpError(400,'Choose a project template.');
 Object.assign(f,offeringDetails(values));
 let tasks=projectTasks(values.tasks||'[]',data.people);
 if(values.applyTemplate==='1'&&f.projectTemplate==='offering'){
  const selected=offeringSections.filter(([key])=>values['include.'+key]==='1').map(([key])=>key);
  if(!selected.length)throw new HttpError(400,'Choose at least one template section.');
  tasks=projectTasks(JSON.stringify(offeringTasks(selected)),data.people);
 }
 if(values.taskAction==='edit'){
  const i=Number(values.taskIndex);if(!Number.isInteger(i)||!tasks[i])throw new HttpError(400,'Choose a task to edit.');
  tasks[i]={...tasks[i],title:values.taskTitle,assignee:values.taskAssignee,due:values.taskDue,estimatedHours:values.taskHours,notes:values.taskNotes,...(values.taskDependenciesPresent==='1'?{dependsOn:Object.keys(values).filter(k=>k.startsWith('taskDependency.')).map(k=>k.slice(15))}:{})};
  tasks=projectTasks(JSON.stringify(tasks),data.people);
 }
 if(values.taskAction==='add')tasks.push(...projectTasks(JSON.stringify([{title:values.taskTitle,assignee:values.taskAssignee,due:values.taskDue,estimatedHours:values.taskHours,notes:values.taskNotes}]),data.people));
 if(values.taskAction==='remove'){const i=Number(values.taskIndex);if(!Number.isInteger(i)||!tasks[i])throw new HttpError(400,'Choose a task to remove.');const removed=tasks.splice(i,1)[0];tasks=tasks.map(t=>({...t,dependsOn:t.dependsOn.filter(id=>id!==removed.id)}));}
 f.tasks=JSON.stringify(tasks);
 const retained=Object.entries(f).map(([key,value])=>hidden(key,value)).join('');
 const next=(target,body,label)=>form('project-setup',hidden('step',target)+body,{section:'project-create'},label);
 const back=target=>next(target,retained,'Back');
 let body=heading('Create a project','Start from the New Offering template or build a blank project.',button('Cancel',url('projects')))+
  '<ol class="studio-flow-steps" aria-label="Create project steps">'+[['details','1. Project details'],['owner','2. Choose an owner'],['tasks','3. Add tasks'],['review','4. Review and create']].map(([id,label],i)=>'<li'+(step===id?' aria-current="step"':'')+'><span>'+(i+1)+'</span>'+label.replace(/^\d+\. /,'')+'</li>').join('')+'</ol>';
 if(step==='details')return body+'<section class="panel">'+next('owner',hidden('id',f.id)+hidden('creator',f.creator)+hidden('tasks',f.tasks)+select('projectTemplate','Start with',{'blank':'Blank project','offering':'New Offering'},f.projectTemplate)+input('name','Project / offering name',f.name,'text','required maxlength="160"')+textarea('brief','Project brief',f.brief,3)+input('launch','Target launch date (optional)',f.launch,'date')+'<details'+(f.projectTemplate==='offering'?' open':'')+'><summary>New Offering setup</summary><p>Complete what you know now. You can fill in decisions later.</p>'+Object.entries(offeringFields).map(([key,label])=>key==='salesRoute'?select(key,label,{'':'Choose later',online:'Buy online',booking:'Book a call',enquiry:'Enquire'},f[key]):textarea(key,label,f[key],key==='decisions'?3:2)).join('')+'</details>','Next: choose an owner')+'</section>';
 if(!f.name.trim())throw new HttpError(400,'Give the project a name.');
 if(step==='owner')return body+'<section class="panel"><h2>Who will own this project?</h2>'+next('tasks',Object.entries(f).filter(([key])=>key!=='creator').map(([key,value])=>hidden(key,value)).join('')+select('creator','Project owner',{'':'Choose a team member',...Object.fromEntries(data.people.map(p=>[p.id,p.name]))},f.creator)+(f.projectTemplate==='offering'&&!tasks.length?hidden('applyTemplate','1')+'<fieldset><legend>Include these sections</legend>'+offeringSections.map(([key,label,rows])=>'<label><input type="checkbox" name="include.'+key+'" value="1" checked> '+esc(label)+' ('+rows.length+' tasks)</label>').join('')+'</fieldset>':''),'Next: review tasks')+back('details')+'</section>';
 const owner=data.people.find(p=>p.id===f.creator);if(!owner)throw new HttpError(400,'Choose a project owner.');
 const taskEditor=t=>input('taskTitle','Task title',t.title,'text','required maxlength="160"')+select('taskAssignee','Assign to',{'':'Project owner',...Object.fromEntries(data.people.map(p=>[p.id,p.name]))},t.assignee)+input('taskHours','Estimated hours',t.estimatedHours??'','number','min="0.01" max="5000" step="0.01"')+input('taskDue','Deadline (optional)',t.due,'date')+textarea('taskNotes','Task details',t.notes,3)+hidden('taskDependenciesPresent','1')+'<fieldset><legend>Must finish first</legend>'+tasks.filter(other=>other.id!==t.id).map(other=>'<label><input type="checkbox" name="taskDependency.'+esc(other.id)+'" value="1"'+((t.dependsOn||[]).includes(other.id)?' checked':'')+'>'+esc(other.title)+'</label>').join('')+'</fieldset>';
 const taskList=tasks.length?'<ol>'+tasks.map((t,i)=>'<li><strong>'+esc(t.title)+'</strong><p>'+esc(data.people.find(p=>p.id===t.assignee)?.name||owner.name)+(t.estimatedHours?' · '+esc(t.estimatedHours)+' hours':'')+(t.due?' · Deadline '+esc(t.due):'')+'</p>'+((t.dependsOn||[]).length?'<p>Must finish first: '+t.dependsOn.map(id=>esc(tasks.find(other=>other.id===id).title)).join(', ')+'</p>':'')+ (step==='tasks'?'<details><summary>Edit task</summary>'+next('tasks',retained+hidden('taskAction','edit')+hidden('taskIndex',i)+taskEditor(t),'Save task')+'</details>'+next('tasks',retained+hidden('taskAction','remove')+hidden('taskIndex',i),'Remove task'):'')+'</li>').join('')+'</ol>':'<p>No tasks added yet. You can add them later.</p>';
 if(step==='tasks')return body+'<section class="panel"><h2>Tasks and assignments</h2>'+taskList+next('tasks',retained+hidden('taskAction','add')+input('taskTitle','Task title','','text','required maxlength="160"')+select('taskAssignee','Assign to',{'':'Project owner',...Object.fromEntries(data.people.map(p=>[p.id,p.name]))})+input('taskHours','Estimated hours','','number','min="0.01" max="5000" step="0.01"')+input('taskDue','Deadline (optional)','','date')+textarea('taskNotes','Task details (optional)','','3'),'Add task')+next('review',retained,'Next: review project')+back('owner')+'</section>';
 return body+'<section class="panel"><h2>'+esc(f.name)+'</h2><p><strong>Owner:</strong> '+esc(owner.name)+'</p>'+(f.brief?'<p class="prose">'+esc(f.brief)+'</p>':'')+(f.launch?'<p><strong>Target date:</strong> '+esc(f.launch)+'</p>':'')+(f.projectTemplate==='offering'?'<h3>Offering setup</h3>'+Object.entries(offeringFields).filter(([key])=>f[key]).map(([key,label])=>'<p><strong>'+esc(label)+':</strong> '+esc(f[key])+'</p>').join(''):'')+'<h3>Tasks</h3>'+taskList+form('project-blank-create',retained,{section:'project-create'},'Create project')+back('tasks')+'</section>';
}
