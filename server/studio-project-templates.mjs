import {randomUUID} from 'node:crypto';
import {HttpError} from './platform.mjs';
import {cleanText} from './studio-model.mjs';
import {saveRecord} from './studio-store.mjs';
import {offeringSections} from './studio-offering-template.mjs';
import {esc,url,heading,button,form,hidden,input,textarea} from './studio-ui.mjs';

export const offeringTemplateId='studio:project-template:offering';
const admin=data=>{if(data.actor.role!=='admin')throw new HttpError(403,'Only administrators can amend project templates.');};
export function validateSections(sections){
 if(!Array.isArray(sections)||!sections.length||sections.length>20)throw new HttpError(400,'Use between 1 and 20 sections.');
 let total=0;const keys=new Set();
 const result=sections.map(section=>{
  if(!Array.isArray(section)||section.length!==3)throw new HttpError(400,'Check the template sections.');
  const [key,label,rows]=section;
  if(typeof key!=='string'||!/^[a-z0-9-]{1,80}$/.test(key)||keys.has(key))throw new HttpError(400,'Each section needs a unique identifier.');keys.add(key);
  const name=cleanText(label,80);if(!name)throw new HttpError(400,'Give each section a name.');
  if(!Array.isArray(rows)||!rows.length||rows.length>100)throw new HttpError(400,'Each section needs at least one task.');
  total+=rows.length;
  return [key,name,rows.map(row=>{if(!Array.isArray(row)||row.length!==2)throw new HttpError(400,'Check the template tasks.');const title=cleanText(row[0],160-name.length-2),notes=cleanText(row[1],4000);if(!title)throw new HttpError(400,'Give each task a title.');return [title,notes];})];
 });
 if(total>100)throw new HttpError(400,'Use up to 100 tasks across the template.');return result;
}
export function savedOffering(data){
 const r=data.byId?.get(offeringTemplateId);
 return {title:r?.title||'New Offering',sections:r?validateSections(r.fields.sections):offeringSections,revision:r?.revision||0};
}
export function projectTemplatesPage(params,data,values){
 admin(data);const template=savedOffering(data),sections=template.sections;const v=(key,fallback='')=>values?.[key]??fallback,checked=key=>values?.[key]==='1'?' checked':'';
 let body=heading('Project templates','Amend the reusable starting point for future projects.',button('Back to projects',url('projects')));
 if(params.get('saved')==='1')body+='<p role="status">Template saved. New projects will use this version.</p>';
 const editor=sections.map(([key,label,rows],i)=>'<details class="panel" open><summary>'+esc(label)+'</summary>'+hidden('sectionKey.'+i,v('sectionKey.'+i,key))+input('sectionName.'+i,'Section name',v('sectionName.'+i,label),'text','required maxlength="80"')+'<label><input type="checkbox" name="removeSection.'+i+'" value="1"'+checked('removeSection.'+i)+'> Remove this section</label>'+hidden('taskCount.'+i,rows.length)+rows.map(([title,notes],j)=>'<details><summary>'+esc(title)+'</summary>'+input('taskTitle.'+i+'.'+j,'Task title',v('taskTitle.'+i+'.'+j,title),'text','maxlength="160"')+textarea('taskNotes.'+i+'.'+j,'Task details',v('taskNotes.'+i+'.'+j,notes),3)+'<label><input type="checkbox" name="removeTask.'+i+'.'+j+'" value="1"'+checked('removeTask.'+i+'.'+j)+'> Remove this task</label></details>').join('')+'<details><summary>Add a task to this section</summary>'+input('newTaskTitle.'+i,'New task title',v('newTaskTitle.'+i),'text','maxlength="160"')+textarea('newTaskNotes.'+i,'New task details',v('newTaskNotes.'+i),3)+'</details></details>').join('');
 return body+form('project-template-save',hidden('revision',v('revision',template.revision))+hidden('sectionCount',sections.length)+input('templateTitle','Template name',v('templateTitle',template.title),'text','required maxlength="160"')+'<p>Tasks within a section can run together. Each following section waits for the previous one. Existing projects keep their own tasks.</p>'+editor+'<details class="panel"><summary>Add a section</summary>'+input('newSectionName','New section name',v('newSectionName'),'text','maxlength="80"')+input('newSectionTask','First task title',v('newSectionTask'),'text','maxlength="160"')+textarea('newSectionNotes','First task details',v('newSectionNotes'),3)+'</details>',{section:'project-templates'},'Save template');
}
export async function saveProjectTemplate(f,data,api){
 admin(data);const current=savedOffering(data);
 if(!Number.isInteger(Number(f.revision))||Number(f.revision)!==current.revision)throw new HttpError(409,'This template has changed. Reload it before saving.');
 const count=Number(f.sectionCount);if(!Number.isInteger(count)||count<1||count>20)throw new HttpError(400,'Check the section count.');
 const sections=[];
 for(let i=0;i<count;i++){
  if(f['removeSection.'+i]==='1')continue;
  const countTasks=Number(f['taskCount.'+i]);if(!Number.isInteger(countTasks)||countTasks<1||countTasks>100)throw new HttpError(400,'Check the task count.');
  const rows=[];for(let j=0;j<countTasks;j++)if(f['removeTask.'+i+'.'+j]!=='1')rows.push([f['taskTitle.'+i+'.'+j]||'',f['taskNotes.'+i+'.'+j]||'']);
  if(f['newTaskTitle.'+i]?.trim())rows.push([f['newTaskTitle.'+i],f['newTaskNotes.'+i]||'']);
  sections.push([f['sectionKey.'+i],f['sectionName.'+i],rows]);
 }
 if(f.newSectionName?.trim()||f.newSectionTask?.trim())sections.push(['section-'+randomUUID(),f.newSectionName||'',[[f.newSectionTask||'',f.newSectionNotes||'']]]);
 const title=cleanText(f.templateTitle||'',160);if(!title)throw new HttpError(400,'Give the template a name.');
 const record={id:offeringTemplateId,kind:'settings',title,status:'Draft',fields:{projectTemplate:true,sections:validateSections(sections)},comments:[],createdBy:data.actor.id};
 await saveRecord(api,data.actor,record,current.revision);
 return {section:'project-templates',saved:'1'};
}
