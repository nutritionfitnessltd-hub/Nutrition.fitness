import test from 'node:test';
import assert from 'node:assert/strict';
import {productionTracking,productionTrackerPanel} from '../server/studio-production-tracker.mjs';
import {changeStudio} from '../server/studio-actions.mjs';
import {deleteTaskControl,deletedTasksPanel} from '../server/studio-project-tasks.mjs';
import {studioData} from '../server/studio-store.mjs';

function fixture(scope='courses'){
 const p={id:'p',name:'Courses',creator_id:'kasia',revision:3,weeks:4,entries:[{id:'task',title:'A task',record:'content',status:'To do'}],studio:{productionTracking:{scope,worker:'imogen',course:'Fat Loss',pilotIds:['pilot']}}};
 const pilot={id:'pilot',title:'First',kind:'lesson',sourceId:'s1',workerId:'imogen',status:'Draft',revision:2,fields:{production:{files:[{name:'test.mp4',url:'https://nutritionfitness.sharepoint.com/sites/Nutrition.fitness/Shared%20Documents/Content%20Library/Courses/For%20review/test.mp4',bytes:10,sha256:'a'.repeat(64)}]}}};
 const meta={courses:{'Fat Loss':{order:'confirmed',sections:[{title:'Module 1',entries:[{id:'s1',title:'First',position:1},{id:'s2',title:'Second',position:2}]}]}}};
 const data={actor:{id:'admin',role:'admin'},projects:[p],items:[pilot],byId:new Map([['pilot',pilot]]),index:{records:[{id:'s1',group:'Courses'},{id:'s2',group:'Courses'}]},assigned:new Set(),trackingMeta:meta};
 const add=(id,workerId,extra={})=>{const r={id,title:id,kind:'article',workerId,status:'Draft',revision:1,fields:{},...extra};data.items.push(r);data.byId.set(id,r);return r;};
 return {p,data,meta,pilot,add};
}
test('course tracker includes untouched lessons in order and does not count pilot export as finished',()=>{
 const {p,data,meta,add}=fixture();add('other','imogen');const m=productionTracking(p,data,meta);
 assert.deepEqual(m.rows.map(r=>r.title),['First','Second']);assert.deepEqual(m.rows.map(r=>r.status),['Imogen working','To do']);assert.equal(m.approved,0);
 const html=productionTrackerPanel(p,data,meta);assert.doesNotMatch(html,/studio=item|Rest of the library|Other content today/);assert.match(html,/Second/);
});
test('other tracker includes only assigned non-course items, including inherited assignments',()=>{
 const {p,data,meta,add}=fixture('other');add('mine','imogen');add('ninas','nina');add('unassigned',undefined);add('course-asset','imogen',{kind:'asset',sourceId:'s2'});
 add('parent','imogen',{kind:'ebook'});add('child',undefined,{parent:'parent'});delete data.byId.get('child').workerId;
 add('opt-out','none',{parent:'parent'});
 assert.deepEqual(productionTracking(p,data,meta).rows.map(r=>r.title).sort(),['child','mine','parent']);
});
test('a shared source cannot silently complete two separate course lessons',()=>{
 const {p,data,meta,pilot}=fixture();pilot.status='Approved';
 meta.courses.Other={order:'confirmed',sections:[{title:'Module 1',entries:[{id:'s1',title:'Another lesson',position:1}]}]};
 const model=productionTracking(p,data,meta);
 assert.equal(model.rows.filter(r=>r.group!=='Course to confirm'&&r.status==='Approved').length,0);
 assert.equal(model.rows.filter(r=>r.record?.id===pilot.id).length,1);
 assert.equal(model.groups.at(-1).name,'Course to confirm');
});
test('approval is distinct from delivery and For review files are never final delivery',()=>{
 const {p,data,meta,pilot}=fixture();pilot.status='Approved';assert.equal(productionTracking(p,data,meta).rows[0].status,'Approved');
 pilot.fields.production.files[0].url=pilot.fields.production.files[0].url.replace('For%20review','Approved');assert.equal(productionTracking(p,data,meta).rows[0].status,'Saved to SharePoint');
 pilot.status='Changes requested';assert.equal(productionTracking(p,data,meta).rows[0].status,'Changes requested');
});
test('source copies count once and worker reassignment excludes unrelated work',()=>{
 const {p,data,meta,add}=fixture('other');add('one','imogen',{sourceId:'original',updatedAt:'2026-11-19'});add('two','imogen',{sourceId:'original',updatedAt:'2026-11-20'});
 assert.equal(productionTracking(p,data,meta).rows.length,1);assert.equal(productionTracking(p,data,meta).rows[0].record.id,'two');
});
test('read permissions apply to both source-only lessons and saved items',()=>{
 const {p,data,meta}=fixture();data.actor={id:'kasia',role:'staff',access:{work:true,library:true}};
 assert.equal(productionTracking(p,data,meta).rows.length,0);data.assigned.add('pilot');assert.equal(productionTracking(p,data,meta).rows.length,1);
 data.actor.access.library=false;assert.equal(productionTrackerPanel(p,data,meta),'');
});
test('the project owner sees progress without acquiring access to draft bodies or other workers',async()=>{
 const {p,pilot,meta}=fixture();pilot.fields.body='Private lesson body';
 const rows=[pilot,{id:'nina',kind:'article',title:'Nina draft',workerId:'nina',status:'Draft',fields:{body:'Private'}}];
 const api=async path=>path.includes('nufi_studio_items')?rows.map(payload=>({id:payload.id,payload,revision:1})):path.includes('nufi_library_projects')?[p]:[];
 const actor={role:'staff',id:'kasia',access:{work:true,library:true,originals:true,edit:true}};
 const data=await studioData(api,actor,async()=>({records:[]}));
 assert.equal(data.items.length,0);assert.equal(data.byId.has(pilot.id),false);
 assert.equal(productionTracking(p,data,meta).rows[0].status,'Imogen working');
 assert.doesNotMatch(JSON.stringify(data.trackingByProject.get(p.id)),/Private|Nina draft/);
 actor.id='unrelated';const other=await studioData(api,actor,async()=>({records:[]}));assert.equal(other.trackingByProject.size,0);
});
test('tracking edits cannot approve content and require ownership and the current revision',async()=>{
 const {p,data,meta}=fixture(),row=productionTracking(p,data,meta).rows[1];let saved;
 const api=async(path,options)=>{saved=options.payload;return [saved];};
 const f={action:'tracking-update',projectRevision:3,trackingKey:row.key,status:'Imogen working',note:'Branding the slides'};
 await changeStudio(new URLSearchParams({project:p.id}),f,data,api);assert.equal(saved.studio.trackingUpdates[row.key].status,'Imogen working');assert.equal(saved.entries,undefined);
 for(const status of ['Approved','Saved to SharePoint'])await assert.rejects(changeStudio(new URLSearchParams({project:p.id}),{...f,status},data,api),e=>e.status===400);
 await assert.rejects(changeStudio(new URLSearchParams({project:p.id}),{...f,projectRevision:2},data,api),e=>e.status===409);
 data.actor={id:'someone',role:'staff',access:{work:true,library:true,edit:true}};await assert.rejects(changeStudio(new URLSearchParams({project:p.id}),f,data,api),e=>e.status===403);
});
test('delete and restore preserve task identity, attached content and unrelated project settings',async()=>{
 const {p,data}=fixture();p.studio.extra='keep';const calls=[];const api=async(path,options)=>{calls.push({path,options});return [{...p,...options.payload}];};
 await changeStudio(new URLSearchParams({project:p.id}),{action:'task-delete',entry:'task',projectRevision:3},data,api);
 const update=calls[0].options.payload;assert.equal(update.entries.length,0);assert.equal(update.studio.deletedTasks[0].record,'content');assert.equal(update.studio.extra,'keep');assert.equal(calls.length,1);assert.match(calls[0].path,/nufi_library_projects/);
 Object.assign(p,update);await changeStudio(new URLSearchParams({project:p.id}),{action:'task-restore',entry:'task',projectRevision:4},data,api);
 assert.equal(calls[1].options.payload.entries[0].id,'task');assert.equal(calls[1].options.payload.studio.deletedTasks.length,0);
});
test('task deletion is revision guarded and restricted to owner or admin',async()=>{
 const {p,data}=fixture();let writes=0;const api=async()=>{writes++;return [];};const f={action:'task-delete',entry:'task',projectRevision:3};
 data.actor={id:'someone',role:'staff',access:{work:true,edit:true}};assert.equal(deleteTaskControl(p,p.entries[0],data),'');await assert.rejects(changeStudio(new URLSearchParams({project:p.id}),f,data,api),e=>e.status===403);
 data.actor.id='kasia';assert.match(deleteTaskControl(p,p.entries[0],data),/Delete task/);await assert.rejects(changeStudio(new URLSearchParams({project:p.id}),{...f,projectRevision:2},data,api),e=>e.status===409);assert.equal(writes,0);
 p.studio.deletedTasks=[p.entries[0]];assert.match(deletedTasksPanel(p,data),/Restore task/);
});
