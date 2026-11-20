import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createReviewTask,staffTaskPanel} from '../server/review-staff-task.mjs';
test('approved handoff creates an assigned version-linked task with due date and editable checklist',async()=>{
 const staff=randomUUID(),r={id:'worker:test',title:'Newsletter',kind:'newsletter',status:'Approved',revision:3,approval:{revision:3}},data={actor:{role:'admin',id:randomUUID()},people:[{id:staff,name:'GHL colleague'}],tasks:[]};
 const form={staff,taskId:randomUUID(),revision:3,taskTitle:'Prepare newsletter in GHL',taskBrief:'Check the images and audience.',due:'2026-12-01'},writes=[];
 assert.match(staffTaskPanel(r,data),/Create staff task/);
 const result=await createReviewTask(form,r,data,async(path,options)=>{writes.push(options.payload);});
 assert.equal(result.reviewed,'assigned');assert.equal(writes[0].record_id,r.id);assert.equal(writes[0].staff_id,staff);assert.match(writes[0].instructions,/Approved content version: 3/);assert.equal(writes[0].due_date,'2026-12-01');
 data.tasks=[{...writes[0],status:'To do'}];await createReviewTask(form,r,data,()=>assert.fail('Duplicate active handoff'));assert.equal(writes.length,1);
 await assert.rejects(createReviewTask({...form,revision:2},r,data,()=>assert.fail()),e=>e.status===409);
 await assert.rejects(createReviewTask(form,r,{...data,actor:{role:'staff'}},()=>assert.fail()),e=>e.status===403);
});
