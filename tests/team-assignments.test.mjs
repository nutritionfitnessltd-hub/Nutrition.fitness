import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {assignmentForm,saveAssignment,assignmentLink} from '../server/team-assignments.mjs';
import {renderTeamPage} from '../server/studio-team.mjs';
import {studioData,saveProject} from '../server/studio-store.mjs';
import {projectPage} from '../server/studio-pages.mjs';
import {handleLibraryWork} from '../server/library-work.mjs';

const owner={role:'admin',id:randomUUID()},person={id:randomUUID(),name:'Joyce',email:'joyce@example.test'};
const project={id:randomUUID(),name:'Launch campaign',creator_id:randomUUID(),status:'In progress',weeks:1,brief:'Launch brief',studio:{allowedIds:['secret']},entries:[{title:'Prepare campaign',status:'To do'}]};
const values=()=>({id:randomUUID(),staff:person.id,title:'Create the launch newsletter',instructions:'Use the approved brief.',due:'2026-12-01',project:project.id});
test('Assign work opens a direct person-specific form with active projects and standalone option',()=>{
 const html=renderTeamPage({params:new URLSearchParams({person:person.id,assign:'1'}),actor:owner,staff:[person],data:{projects:[project,{...project,id:'closed',name:'Old project',status:'Complete'}]}});
 for(const text of ['Assign work','Task name','Brief','Due date','Project (optional)','Standalone task','Assign to Joyce','Launch campaign'])assert.ok(html.includes(text),text);
 assert.doesNotMatch(html,/Open content studio|Leave work screen|Old project/);
 assert.match(assignmentForm(person,[]),/No active projects/);
});
test('assignments persist either a validated project link or a standalone task through existing storage',async()=>{
 const calls=[],api=async(path,options)=>{calls.push({path,...options});return [];};
 let task=await saveAssignment(values(),owner,[person],[project],api);
 assert.equal(task.record_id,'project:'+project.id);assert.match(assignmentLink(task),/studio=project/);
 assert.equal(calls[0].payload.staff_id,person.id);assert.equal(calls[0].payload.created_by,owner.id);assert.match(calls[0].headers.Prefer,/ignore-duplicates/);
 task=await saveAssignment({...values(),project:'',due:''},owner,[person],[project],api);
 assert.match(task.record_id,/^assignment:/);assert.equal(task.due_date,null);assert.equal(assignmentLink(task),'');
 const count=calls.length;
 for(const f of [{...values(),title:''},{...values(),project:randomUUID()},{...values(),due:'2026-02-30'},{...values(),staff:randomUUID()}])await assert.rejects(saveAssignment(f,owner,[person],[project],api));
 await assert.rejects(saveAssignment(values(),{role:'staff'},[person],[project],api),e=>e.status===403);
 assert.equal(calls.length,count);
});
test('project-linked assignees see project context without management or content permissions',async()=>{
 let writes=0;const actor={role:'staff',id:person.id,name:person.name};
 const api=async(path,options={})=>{
  if(options.method){writes++;return [];}
  if(path.includes('nufi_library_tasks'))return [{...values(),record_id:'project:'+project.id,staff_id:person.id}];
  if(path.includes('nufi_library_projects'))return path.includes('id=in.')?[project]:[];
  if(path.includes('nufi_studio_items'))return [{id:'secret',payload:{id:'secret',kind:'article',title:'Private draft',status:'Draft',fields:{body:'Secret text'}},revision:1}];
  return [];
 };
 const data=await studioData(api,actor,async()=>({records:[]}));
 assert.equal(data.projects[0].assignmentOnly,true);assert.equal(data.byId.has('secret'),false);
 const html=projectPage(new URLSearchParams({project:project.id}),data);
 assert.match(html,/Launch brief/);assert.match(html,/Prepare campaign/);assert.doesNotMatch(html,/<form|Private draft|Secret text/);
 await assert.rejects(saveProject(api,actor,data.projects[0],{name:'Changed'}),e=>e.status===403);assert.equal(writes,0);
});
test('team assignment route saves and returns to the selected profile',async()=>{
 const tasks=[];const api=async(path,options={})=>{
  if(path.includes('nufi_library_staff'))return [person];
  if(path.includes('nufi_library_projects'))return [project];
  if(path.includes('nufi_library_tasks')){if(options.method==='POST'){tasks.push(options.payload);return [];}return tasks;}
  return [];
 };
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}};
 await handleLibraryWork({method:'POST',headers:{host:'example.test',origin:'https://example.test'},body:{action:'team-assign',...values()}},res,{env:{NUFI_LIBRARY_CATALOGUE_KEY:'fixture'},params:new URLSearchParams({studio:'team',person:person.id,assign:'1'}),copyActor:owner,apiFactory:()=>api,load:async()=>({records:[]})});
 assert.equal(res.statusCode,303);assert.match(res.headers.Location,/saved=assignment/);assert.equal(tasks.length,1);assert.equal(tasks[0].record_id,'project:'+project.id);
});
