import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {offeringSections,offeringTasks} from '../server/studio-offering-template.mjs';
import {projectTasks} from '../server/studio-project-tasks.mjs';
import {projectCreatePage} from '../server/studio-project-create.mjs';
import {changeStudio} from '../server/studio-actions.mjs';
import {projectPage} from '../server/studio-pages.mjs';
const owner=randomUUID(),actor={id:randomUUID(),role:'admin'},people=[{id:owner,name:'Owner'}];
const data={actor,people,projects:[],items:[],byId:new Map(),tasks:[],assigned:new Set()};
const values={id:randomUUID(),name:'New coaching offer',creator:owner,projectTemplate:'offering',audience:'Busy parents',salesRoute:'booking',decisions:'Confirm the price',launch:'2026-12-20'};

test('template selection is optional and all ten sections can be selected',()=>{
 const initial=projectCreatePage(new URLSearchParams(),data);
 assert.match(initial,/Blank project/);assert.match(initial,/New Offering/);
 const html=projectCreatePage(new URLSearchParams(),data,{...values,step:'owner'});
 for(const [key] of offeringSections)assert.match(html,new RegExp('name="include\\.'+key+'"'));
 assert.match(html,/Confirm the price/);
});
test('selected sections seed once, preserve IDs and support editing and removal',()=>{
 const f={...values,step:'tasks',applyTemplate:'1','include.offering':'1','include.socials':'1'};
 const html=projectCreatePage(new URLSearchParams(),data,f);
 assert.match(html,/Plan the social campaign/);assert.doesNotMatch(html,/Build and review the landing page/);
 const raw=offeringTasks(['offering','socials']),tasks=projectTasks(JSON.stringify(raw),people);
 assert.deepEqual(tasks.map(t=>t.id),raw.map(t=>t.id));assert.deepEqual(tasks[2].dependsOn,raw.slice(0,2).map(t=>t.id));
 const edit=projectCreatePage(new URLSearchParams(),data,{...values,step:'tasks',tasks:JSON.stringify(tasks),taskAction:'edit',taskIndex:'0',taskTitle:'Updated offer',taskAssignee:owner,taskDue:'2026-12-01',taskNotes:'Approved scope',taskHours:'2'});
 assert.match(edit,/Updated offer/);assert.match(edit,/Approved scope/);
 const removed=projectCreatePage(new URLSearchParams(),data,{...values,step:'review',tasks:JSON.stringify(tasks),taskAction:'remove',taskIndex:'0'});
 assert.doesNotMatch(removed,/<strong>Offering brief: Define the offering/);
});
test('offering metadata and prerequisites save atomically and appear in the project',async()=>{
 let payload;const f={...values,action:'project-blank-create',tasks:JSON.stringify(offeringTasks(offeringSections.map(s=>s[0])))};
 await changeStudio(new URLSearchParams(),f,data,async(path,opts)=>{payload=opts.payload;return [];});
 assert.equal(payload.project.entries.length,23);assert.deepEqual(payload.records,[]);
 assert.equal(payload.project.studio.offering.salesRoute,'booking');assert.equal(payload.project.studio.template,'offering');
 const p={...payload.project,status:'Planning',revision:1};
 const html=projectPage(new URLSearchParams({project:p.id}),{...data,projects:[p]});
 assert.match(html,/Busy parents/);assert.match(html,/Confirm the price/);assert.match(html,/Offering setup/);
});
test('invalid sales routes, cyclic prerequisites and unauthorised creation never write',async()=>{
 for(const f of [{...values,salesRoute:'invalid'},{...values,tasks:JSON.stringify([{id:values.id,title:'Circular',dependsOn:[values.id]}])}]){
  let writes=0;await assert.rejects(changeStudio(new URLSearchParams(),{action:'project-blank-create',...f},data,async()=>{writes++;}),e=>e.status===400);assert.equal(writes,0);
 }
 await assert.rejects(changeStudio(new URLSearchParams(),{...values,action:'project-blank-create'},{...data,actor:{...actor,role:'staff'}},async()=>{}),e=>e.status===403);
});
