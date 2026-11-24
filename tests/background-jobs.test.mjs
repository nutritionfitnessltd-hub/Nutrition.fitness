import test from 'node:test';
import assert from 'node:assert/strict';
import {backgroundControlId,backgroundJobState,backgroundJobPanel,requestBackgroundRestart} from '../server/background-jobs.mjs';
import {studioData} from '../server/studio-store.mjs';

const project={id:'project',studio:{productionTracking:{scope:'courses'}}};
const now=new Date('2026-11-24T16:00:00Z');
const actor={id:'admin',role:'admin'};
const taskUrl='https://chatgpt.com/c/6b05bd61-cb80-83eb-bb49-d1e6bae60c50';
function control(extra={}){return {id:backgroundControlId(project.id),kind:'asset',title:'Cloud control',fields:{body:'Preserve the checkpoint',backgroundJobControl:true,backgroundJob:{projectId:project.id,runtime:'chatgpt-cloud',taskUrl,wakeEnabled:true,state:'working',heartbeatAt:now.toISOString(),...extra}}};}
test('whole-library counts reconcile before display and handoff links stay in the established tenant folder',()=>{
 const base='https://nutritionfitness.sharepoint.com/sites/Nutrition.fitness/Shared%20Documents/Content%20Library/Courses/Cloud%20production%20handover/';
 const progress={total:167,readyForPC:2,preparationOutstanding:159,blocked:1,finalQa:1,finished:4,referenceOnly:0};
 const make=extra=>backgroundJobPanel(project,{actor,backgroundControls:new Map([[project.id,control(extra)]])},+now);
 const html=make({batchProgress:progress,handoffUrl:base+'queue.md',handoffManifestUrl:base+'queue.json'});
 assert.match(html,/167 source items/);assert.match(html,/<strong>2<\/strong> ready for PC/);assert.match(html,/PC finishing checklist/);assert.match(html,/Download finishing queue/);
 assert.doesNotMatch(make({handoffUrl:'https://evil.test/queue.md',handoffManifestUrl:'javascript:alert(1)'}),/PC finishing checklist|Download finishing queue/);
 assert.doesNotMatch(make({handoffUrl:base.replace('nutritionfitness.sharepoint.com','nutritionfitness.sharepoint.com.evil.test')+'queue.md'}),/PC finishing checklist/);
 for(const extra of [{readyForPC:3},{readyForPC:-1},{total:'167'},{readyForPC:2.5}]){
  const invalid=make({batchProgress:{...progress,...extra}});assert.match(invalid,/counts are being reconciled/);assert.doesNotMatch(invalid,/167 source items/);
 }
});
test('only a recent actual heartbeat means working; a request alone never does',()=>{
 assert.equal(backgroundJobState(control(),+now).active,true);
 assert.equal(backgroundJobState(control(),+now+600001).active,false);
 assert.match(backgroundJobState(control(),+now+600001).label,/unconfirmed/);
 assert.equal(backgroundJobState(control({heartbeatAt:'2026-11-25'}),+now).active,false);
 assert.equal(backgroundJobState(control({requestId:'new'}),+now).label,'Restart requested');
 assert.equal(backgroundJobState(control({requestId:'new',acknowledgedRequestId:'new'}),+now).label,'Working in ChatGPT cloud');
});
test('unconnected wake-up is visibly disabled; malicious chat URLs cannot become actions',()=>{
 const data={actor,backgroundControls:new Map([[project.id,{...control({wakeEnabled:false}),revision:1}]])};
 let html=backgroundJobPanel(project,data,+now);assert.match(html,/<button type="button" disabled>Restart cloud job/);assert.doesNotMatch(html,/name="action" value="background-restart"/);
 data.backgroundControls.set(project.id,control({taskUrl:'https://evil.test/c/6b05bd61-cb80-83eb-bb49-d1e6bae60c50'}));
 html=backgroundJobPanel(project,data,+now);assert.doesNotMatch(html,/evil.test|name="action" value="background-restart"/);
});
test('restart writes only a request with expected revision and preserves actual worker state',async()=>{
 const r=control(),data={actor,projects:[project]},calls=[];
 const api=async(url,options)=>{calls.push({url,options});return url.includes('rpc/')?[{revision:5}]:[{payload:r,revision:4}];};
 await requestBackgroundRestart(new URLSearchParams({project:project.id}),{controlRevision:4},data,api,now);
 const save=calls.find(x=>x.url.includes('rpc/')).options.payload;
 assert.equal(save.expected,4);assert.equal(save.document.fields.body,r.fields.body);
 assert.equal(save.document.fields.backgroundJob.state,'working');assert.ok(save.document.fields.backgroundJob.requestId);assert.equal(save.document.fields.backgroundJob.acknowledgedRequestId,undefined);
 await assert.rejects(()=>requestBackgroundRestart(new URLSearchParams({project:project.id}),{controlRevision:3},data,api),e=>e.status===409);
 await assert.rejects(()=>requestBackgroundRestart(new URLSearchParams({project:project.id}),{controlRevision:4},{...data,actor:{role:'staff'}},api),e=>e.status===403);
 await assert.rejects(()=>requestBackgroundRestart(new URLSearchParams({project:project.id}),{controlRevision:4},data,async()=>[{payload:control({wakeEnabled:false}),revision:4}]),e=>e.status===409);
});
test('control records stay out of content, reviews and worker delivery totals',async()=>{
 const p={...project,creator_id:'admin',entries:[]},r=control();
 const data=await studioData(async url=>url.includes('nufi_studio_items')?[{id:r.id,payload:r,revision:2}]:url.includes('nufi_library_projects')?[p]:[],actor,async()=>({records:[]}));
 assert.equal(data.backgroundControls.get(project.id).revision,2);assert.equal(data.items.length,0);assert.equal(data.byId.has(r.id),false);
 const staff=await studioData(async url=>url.includes('nufi_studio_items')?[{id:r.id,payload:r,revision:2}]:[],{role:'staff',id:'stranger'},async()=>({records:[]}));
 assert.equal(staff.backgroundControls.size,0);
});
