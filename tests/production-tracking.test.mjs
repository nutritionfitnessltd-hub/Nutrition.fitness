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

test('checked replacement exports supersede older in-production tracker notes',()=>{
 const {p,data,meta,pilot}=fixture();p.studio.productionTracking.pilotIds=[];
 pilot.fields.production.checkedAt='2026-11-24T12:40:56Z';pilot.updatedAt='2026-11-24T12:40:57Z';
 p.studio.trackingUpdates={'lesson:Fat Loss:1':{status:'Imogen working',workState:'Stopped',at:'2026-11-24T12:20:06Z',note:'Opening title amendment is next.',nextStep:'Amend title',blocker:'Old blocker'}};
 const model=productionTracking(p,data,meta),row=model.rows[0];assert.equal(row.status,'Awaiting review');assert.equal(row.work.label,'Completed');assert.equal(model.counts['Awaiting review'],1);assert.equal(pilot.status,'Draft');
 const html=productionTrackerPanel(p,data,meta);assert.match(html,/>Approve</);assert.match(html,/Earlier update \(before checked export\)/);assert.doesNotMatch(html,/<b>Next step:<\/b> Amend title|<b>Blocker:<\/b> Old blocker/);
});

test('rework requested after the checked export stays in production',()=>{
 const {p,data,meta,pilot}=fixture();p.studio.productionTracking.pilotIds=[];pilot.fields.production.checkedAt='2026-11-24T12:40:56Z';
 p.studio.trackingUpdates={'lesson:Fat Loss:1':{status:'Imogen working',workState:'Blocked',at:'2026-11-24T13:00:00Z',note:'New correction required.',blocker:'Waiting for source'}};
 const row=productionTracking(p,data,meta).rows[0];assert.equal(row.status,'Imogen working');assert.equal(row.work.label,'Blocked');assert.equal(row.supersededUpdate,false);
});

test('checkedAt alone never finishes a draft without an evidenced export',()=>{
 const {p,data,meta,pilot}=fixture();p.studio.productionTracking.pilotIds=[];pilot.fields.production.checkedAt='2026-11-24T12:40:56Z';pilot.fields.production.files=[];
 assert.equal(productionTracking(p,data,meta).rows[0].status,'Imogen working');
});
test('course tracker includes untouched lessons in order and does not count pilot export as finished',()=>{
 const {p,data,meta,add}=fixture();add('other','imogen');const m=productionTracking(p,data,meta);
 assert.deepEqual(m.rows.map(r=>r.title),['First','Second']);assert.deepEqual(m.rows.map(r=>r.status),['Imogen working','To do']);assert.equal(m.approved,0);
 const html=productionTrackerPanel(p,data,meta);assert.doesNotMatch(html,/Rest of the library|Other content today|Review &amp; approve/);assert.match(html,/Previous export; replacement in progress/);assert.match(html,/studio=item/);assert.match(html,/Second/);
});
test('checked lessons link to the video and asset page without approving on GET',()=>{
 const {p,data,meta,pilot}=fixture();p.studio.productionTracking.pilotIds=[];
 let html=productionTrackerPanel(p,data,meta);
 assert.match(html,/href="https:\/\/nutritionfitness.sharepoint.com[^\"]+test.mp4"/);assert.match(html,/Open video/);
 assert.match(html,/studio=item&amp;id=pilot/);assert.match(html,/Open asset/);assert.match(html,/name="action" value="review-decision"/);assert.match(html,/name="revision" value="2"/);assert.match(html,/>Approve</);
 assert.equal(pilot.status,'Draft');
 pilot.fields.production.files[0].url='javascript:alert(1)';html=productionTrackerPanel(p,data,meta);assert.doesNotMatch(html,/javascript:|Review &amp; approve|Open video/);
});
test('project summaries cannot grant draft review or editing permissions',async()=>{
 const {p,pilot,meta}=fixture();p.studio.productionTracking.pilotIds=[];
 const api=async path=>path.includes('nufi_studio_items')?[{id:pilot.id,payload:pilot,revision:pilot.revision}]:path.includes('nufi_library_projects')?[p]:[];
 const actor={role:'staff',id:'kasia',access:{work:true,library:true,originals:true,edit:true}};
 const data=await studioData(api,actor,async()=>({records:[]}));
 const html=productionTrackerPanel(p,data,meta);assert.match(html,/Open video/);assert.doesNotMatch(html,/Review &amp; approve|studio=review-preview|studio=item/);
});
test('fresh matching worker checkpoints update the row and counts while an old export is being redone',()=>{
 const {p,data,meta,pilot,add}=fixture();p.studio.productionTracking.pilotIds=[];
 const index=add('index','imogen',{kind:'asset',fields:{courseProductionIndex:true,runner:{projectId:p.id,status:'working',currentSourceId:'s1',stage:'Correcting colours',updatedAt:new Date().toISOString(),completedSourceIds:[]}}});
 let model=productionTracking(p,data,meta);assert.equal(model.counts['Imogen working'],1);assert.equal(model.counts['Awaiting review'],0);
 index.fields.runner.currentSourceId='catalogue:s1';model=productionTracking(p,data,meta);assert.equal(model.counts['Imogen working'],1);assert.equal(model.rows[0].working,true);
 let html=productionTrackerPanel(p,data,meta);assert.match(html,/Latest production update/);assert.match(html,/Correcting colours/);assert.match(html,/Previous export; replacement in progress/);assert.doesNotMatch(html,/Review &amp; approve/);
 index.fields.runner.updatedAt='2020-01-01T00:00:00Z';model=productionTracking(p,data,meta);assert.equal(model.counts['Imogen working'],0);
 index.fields.runner.projectId='different-project';html=productionTrackerPanel(p,data,meta);assert.doesNotMatch(html,/Latest production update|Correcting colours/);
});
test('missing files never gain an approval shortcut and saved approvals retain their state',()=>{
 const {p,data,meta,pilot}=fixture();p.studio.productionTracking.pilotIds=[];
 pilot.fields.production.files=[];assert.doesNotMatch(productionTrackerPanel(p,data,meta),/Review &amp; approve|Open video/);
 pilot.status='Approved';assert.equal(productionTracking(p,data,meta).rows[0].status,'Approved');
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

 test('multiple supporting files and duplicate videos produce one video and one asset action',()=>{
 const {p,data,meta,pilot}=fixture();
 const video=pilot.fields.production.files[0];
 pilot.fields.production.files.push({...video},{...video,name:'captions.vtt',url:video.url.replace('test.mp4','captions.vtt')},{...video,name:'transcript.txt',url:video.url.replace('test.mp4','transcript.txt')});
 let html=productionTrackerPanel(p,data,meta);
 assert.equal((html.match(/>Open video<\/a>/g)||[]).length,1);
 assert.equal((html.match(/>Open asset<\/a>/g)||[]).length,1);
 assert.doesNotMatch(html,/Open file|href="[^"]+captions.vtt|href="[^"]+transcript.txt/);
 pilot.fields.production.files=pilot.fields.production.files.filter(f=>!f.url.endsWith('.mp4'));
 html=productionTrackerPanel(p,data,meta);assert.match(html,/Open asset/);assert.doesNotMatch(html,/Open video|Open file/);
 });

test('updates have a clear dropdown label and keep timestamps and full notes inside',()=>{
 const {p,data,meta}=fixture();p.studio.trackingUpdates={'lesson:Fat Loss:1':{note:'Long update '.repeat(40),at:'2026-11-24T12:00:00Z'}};
 const html=productionTrackerPanel(p,data,meta);
 assert.match(html,/<details class="tracker-work-update"><summary>Updates<\/summary><div><p class="tracker-update-time">/);
 assert.doesNotMatch(html,/<details class="tracker-work-update" open/);
 assert.ok(html.indexOf('tracker-file-actions')<html.indexOf('tracker-work-update'));
 assert.ok(html.includes('Long update '.repeat(40)));
});
