import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {projectCreatePage} from '../server/studio-project-create.mjs';
const owner=randomUUID(),assignee=randomUUID();
const fixture=()=>({actor:{role:'admin'},people:[{id:owner,name:'Owner'},{id:assignee,name:'Assignee'}]});
const fields=()=>({name:'Products',creator:owner});

test('project setup edits prerequisites and shows them on review',()=>{
 const data=fixture(),f=fields(),first=randomUUID(),second=randomUUID();
 f.tasks=JSON.stringify([{id:first,title:'Confirm product',assignee:owner},{id:second,title:'Design label',assignee}]);
 const values={...f,step:'tasks',taskAction:'edit',taskIndex:'1',taskTitle:'Design label',taskAssignee:assignee,taskDependenciesPresent:'1',['taskDependency.'+first]:'1'};
 const html=projectCreatePage(new URLSearchParams(),data,values);
 assert.match(html,/Must finish first: Confirm product/);
 assert.ok(html.includes('name="taskDependency.'+first+'" value="1" checked'));
 assert.throws(()=>projectCreatePage(new URLSearchParams(),data,{...values,['taskDependency.'+second]:'1'}),e=>e.status===400);
 const review=projectCreatePage(new URLSearchParams(),data,{...f,step:'review',tasks:JSON.stringify([{id:first,title:'Confirm product'},{id:second,title:'Design label',dependsOn:[first]}])});
 assert.match(review,/Must finish first: Confirm product/);
});
