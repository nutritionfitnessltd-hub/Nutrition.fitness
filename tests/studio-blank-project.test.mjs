import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {projectCreatePage} from '../server/studio-project-create.mjs';
import {changeStudio} from '../server/studio-actions.mjs';
import {projectPage,projectList,library} from '../server/studio-pages.mjs';
import {studioData} from '../server/studio-store.mjs';
import {dashboardWork} from '../server/studio-dashboard.mjs';
import {teamWorkRows} from '../server/studio-team-work.mjs';
const owner=randomUUID(),assignee=randomUUID(),admin={role:'admin',id:randomUUID()};
const people=[{id:owner,name:'Owner'},{id:assignee,name:'Joyce'}];
const fixture=()=>({actor:admin,people,projects:[],items:[],byId:new Map(),tasks:[],assigned:new Set()});
const fields=()=>({id:randomUUID(),name:'Recipe books',brief:'Build a new range',creator:owner,launch:'2026-12-20',tasks:JSON.stringify([{title:'Check recipes',assignee,due:'2026-12-01',notes:'Check quantities'}])});
test('dedicated project flow keeps details and task assignments between steps',()=>{
 const data=fixture(),f=fields();
 assert.match(projectList(new URLSearchParams(),data),/studio=project-create/);
 for(const step of ['details','owner','tasks','review']){
  const html=projectCreatePage(new URLSearchParams(),data,{...f,step});
  assert.match(html,/Create a project/);assert.match(html,/Recipe books/);assert.match(html,/Check recipes/);
  assert.doesNotMatch(html,/An article|A landing page/);
 }
 const html=projectCreatePage(new URLSearchParams(),data,{...f,step:'tasks',taskAction:'add',taskTitle:'Design cover',taskAssignee:owner});
 assert.match(html,/Design cover/);assert.match(html,/Joyce/);
 assert.throws(()=>projectCreatePage(new URLSearchParams(),{...data,actor:{role:'staff'}},f),e=>e.status===403);
});
test('blank project and initial tasks save together without generated content',async()=>{
 const data=fixture(),f=fields(),calls=[];
 await changeStudio(new URLSearchParams(),{...f,action:'project-blank-create'},data,async(path,options)=>{calls.push({path,...options});return [];});
 assert.equal(calls.length,1);const {project,records}=calls[0].payload;
 assert.deepEqual(records,[]);assert.equal(project.studio.type,'blank');assert.equal(project.entries.length,1);assert.equal(project.entries[0].assignee,assignee);assert.equal(project.entries[0].due,'2026-12-01');assert.equal(project.studio.rootId,undefined);
 data.projects=[{...project,status:'Planning',revision:1}];const html=projectPage(new URLSearchParams({project:project.id}),data);
 assert.match(html,/Tasks/);assert.match(html,/Joyce/);assert.match(html,/Assign to/);assert.doesNotMatch(html,/Preview journey|Open week|Create this content/);
});
test('invalid task assignments and dates never write',async()=>{
 for(const tasks of [[{title:'Task',assignee:randomUUID()}],[{title:'Task',due:'2026-02-30'}],[{title:''}]]){
  let writes=0;await assert.rejects(changeStudio(new URLSearchParams(),{...fields(),action:'project-blank-create',tasks:JSON.stringify(tasks)},fixture(),async()=>{writes++;}),e=>e.status===400);assert.equal(writes,0);
 }
});
test('task assignments appear on the assignee dashboard and can be reassigned by admin',async()=>{
 const data=fixture(),p={id:randomUUID(),name:'Recipe books',creator_id:owner,revision:1,weeks:1,status:'Planning',studio:{type:'blank'},entries:[{id:randomUUID(),title:'Check recipes',assignee,status:'To do',week:0,kind:'Task'}]};data.projects=[p];
 const staffData={...data,actor:{id:assignee,role:'staff',name:'Joyce',access:{work:true,edit:true}}};
 assert.equal(dashboardWork(staffData).mine[0].title,'Check recipes');assert.equal(teamWorkRows(staffData)[0].owner,'person:'+assignee);
 let saved;const api=async(path,options)=>{saved=options.payload;return [saved];};
 const f={action:'task-save',projectRevision:1,entry:p.entries[0].id,title:'Check recipes',status:'In progress',week:0,assignee:owner};
 await assert.rejects(changeStudio(new URLSearchParams({project:p.id}),f,staffData,api),e=>e.status===403);
 await changeStudio(new URLSearchParams({project:p.id}),f,data,api);assert.equal(saved.entries[0].assignee,owner);
 await changeStudio(new URLSearchParams({project:p.id}),{action:'task-add',projectRevision:1,title:'Design cover',kind:'Task',assignee,due:'2026-12-02'},data,api);assert.equal(saved.entries[1].assignee,assignee);
});
test('participant query and content grants stay within assigned tasks',async()=>{
 const p={creator_id:owner,studio:{allowedIds:['private']},entries:[{record:'mine',assignee,assignedAsset:true,scopeIds:['mine']},{record:'private',assignee:owner,assignedAsset:true,scopeIds:['private']}]};let query='';
 const data=await studioData(async path=>{if(path.includes('nufi_library_projects')){query=decodeURIComponent(path);return [p];}return [];},{role:'staff',id:assignee,name:'Joyce'},async()=>({records:[],files:{}}));
 assert.match(query,/entries.cs/);assert.match(query,new RegExp(assignee));assert.ok(data.assigned.has('mine'));assert.ok(!data.assigned.has('private'));
});
test('newsletter shelf includes newsletter designs and named drafts without mixing messages',()=>{
 const data=fixture();data.items=[{id:'email',kind:'communication',title:'Recipe newsletter',status:'Draft',fields:{}},{id:'design',kind:'communication',title:'Monthly update',status:'Draft',fields:{emailHtml:'<p>Hello</p>'}},{id:'message',kind:'communication',title:'Welcome message',status:'Draft',fields:{}}];data.byId=new Map(data.items.map(r=>[r.id,r]));
 assert.match(library(new URLSearchParams(),data),/Newsletters/);
 const html=library(new URLSearchParams({kind:'newsletter'}),data);assert.match(html,/Recipe newsletter/);assert.match(html,/Monthly update/);assert.doesNotMatch(html,/Welcome message/);assert.match(html,/studio=builder&amp;build=newsletter/);
 const messages=library(new URLSearchParams({kind:'communication'}),data);assert.match(messages,/Welcome message/);assert.doesNotMatch(messages,/Recipe newsletter/);
});
