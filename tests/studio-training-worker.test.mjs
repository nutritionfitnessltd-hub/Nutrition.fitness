import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { workers, outputs, suggestedOutputs, builderPage, workerPreview, saveWorkerRequest } from '../server/studio-workers.mjs';
import { workspaceDashboard } from '../server/studio-dashboard.mjs';

const source={id:'original:training',title:'Starter strength programme',kind:'Workout programme',group:'Programs',fields:{body:'Original overview: three training sessions per week.'},files:[]};
const fixture=()=>({actor:{role:'admin',id:randomUUID()},index:{records:[source],files:{}},items:[],byId:new Map(),projects:[],tasks:[],people:[],assigned:new Set()});

test('programme and workout requests use the training worker and open the programme archive',()=>{
 const d=fixture();assert.deepEqual(suggestedOutputs({group:'Programs'}),['programme','workout']);
 assert.doesNotMatch(workspaceDashboard(d),/<h3>Marcus<\/h3>/);
 for(const build of ['programme','workout']){
  const selection=builderPage(new URLSearchParams({build}),d);assert.match(selection,/value="Programs" selected/);assert.match(selection,/Starter strength programme/);
  const brief=builderPage(new URLSearchParams({build,source:source.id}),d);assert.match(brief,/Suggested worker: Marcus/);assert.match(brief,/goal, experience level, equipment, days per week and session length/);
  const preview=workerPreview({requestId:randomUUID(),build,source:source.id,['output_'+build]:'yes'},d);assert.match(preview,new RegExp('name="worker_'+build+'"[\\s\\S]*?value="marcus" selected'));assert.match(preview,/James to review/);
 }
});

test('training plan save retains source evidence, Marcus identity and draft-only constraints',async()=>{
 const d=fixture();let saved;
 const f={requestId:randomUUID(),build:'programme',source:source.id,output_programme:'yes',worker_programme:'marcus',output_workout:'yes',worker_workout:'marcus',audience:'Members',instructions:'Use the original structure and flag missing equipment details.'};
 await saveWorkerRequest(f,d,{},async(_,opts)=>{saved=opts.payload.document;return [{id:saved.id}];});
 assert.equal(saved.fields.state,'prepared');assert.equal(saved.status,'Draft');assert.equal(saved.fields.production,null);
 assert.deepEqual(saved.fields.outputs.map(o=>o.worker),['marcus','marcus']);assert.ok(saved.fields.outputs.every(o=>o.employeeId===workers.marcus.employeeId));
 assert.equal(saved.fields.sources[0].text,source.fields.body);assert.match(saved.fields.constraints,/drafts for James/);assert.match(saved.fields.constraints,/Do not publish/);
 d.byId.set(saved.id,saved);const home=workspaceDashboard(d);assert.match(home,/2 planned · not started/);assert.match(home,/What Marcus will do/);assert.match(home,/<h3>Marcus<\/h3>/);assert.match(home,/build=programme[^>]*>Plan work for Marcus/);
});

test('training worker is available as an override without reassigning course or content roles',()=>{
 const d=fixture(),html=workerPreview({requestId:randomUUID(),source:source.id,output_newsletter:'yes',worker_newsletter:'marcus'},d);
 assert.match(html,/value="marcus" selected/);assert.equal(outputs.course.worker,'imogen');assert.equal(outputs.branding.worker,'imogen');assert.equal(outputs.newsletter.worker,'nina');assert.equal(outputs.socials.worker,'rory');
 for(const [id,worker] of Object.entries(workers))if(id!=='morgan')assert.ok(Object.hasOwn(outputs,worker.defaultBuild));
 assert.equal(workers.morgan.role,'Project Manager');
});
