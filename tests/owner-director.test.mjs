import test from 'node:test';
import assert from 'node:assert/strict';
import {engagementFields,engagementEditor} from '../server/team-profiles.mjs';
import {requireLibraryNda} from '../server/library-nda.mjs';
import {portfolioSchedule,schedulingInputs} from '../server/studio-project-schedule.mjs';
const actor={role:'staff',id:'owner'};
const res=()=>({setHeader(){},end(){}});
test('owner status removes employment terms and is available in the profile editor',()=>{
 const f=engagementFields({engagementType:'owner_director',rate:'malformed',agreedHours:'not hours'},{rate:'7',agreedHours:'20'});
 assert.equal(f.rate,'');assert.equal(f.agreedHours,'');assert.equal(f.engagementType,'owner_director');
 assert.match(engagementEditor(f),/Owner \/ Director/);assert.match(engagementEditor(f),/data-contract-terms hidden/);
});
test('saved owner designation bypasses welcome and NDA without broadening permissions',async()=>{
 let queries=0;const api=async path=>{queries++;assert.match(path,/nufi_studio_items/);return [{payload:{fields:{engagementType:'owner_director'}}}];};
 assert.equal(await requireLibraryNda({method:'GET'},res(),{actor,api,params:new URLSearchParams()}),false);assert.equal(queries,1);assert.equal(actor.role,'staff');
 const r=res();assert.equal(await requireLibraryNda({method:'POST',body:{action:'accept-nda'}},r,{actor,api,params:new URLSearchParams()}),true);assert.equal(r.statusCode,303);
});
test('posting an owner label cannot bypass the saved freelance profile',async()=>{
 const r=res();const api=async()=>[{payload:{fields:{engagementType:'freelance'}}}];
 assert.equal(await requireLibraryNda({method:'POST',body:{engagementType:'owner_director'}},r,{actor,api,params:new URLSearchParams()}),true);assert.equal(r.statusCode,403);
});
test('owner tasks use deadlines without hours, and do not consume freelance capacity',()=>{
 const p={id:'p',creator_id:'owner',entries:[{id:'a',status:'To do',due:'2026-11-25'},{id:'b',status:'To do',estimatedHours:4,assignee:'joyce'}]};
 const plan=portfolioSchedule([p],{owner:{engagementType:'owner_director'},joyce:{agreedHours:'20',hoursPeriod:'week'}},'2026-11-24');
 assert.equal(plan.get('p:a').manual,true);assert.equal(plan.get('p:a').finish,'2026-11-25');assert.equal(plan.get('p:a').missingCapacity,undefined);assert.equal(plan.get('p:b').finish,'2026-11-24');
 const html=schedulingInputs(p,p.entries[0],{planner:{directorIds:['owner']},byId:new Map()});assert.match(html,/data-task-effort-fields hidden/);
});
