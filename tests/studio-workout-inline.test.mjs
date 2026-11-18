import test from 'node:test';
import assert from 'node:assert/strict';
import {handleStudio} from '../server/studio.mjs';
import {inlineWorkoutForm} from '../server/studio-workout-inline.mjs';

const session={id:'training:session',kind:'session',title:'Full body',status:'Approved',approval:{revision:2},fields:{duration:35,warmup:['Walk'],blocks:[{referenceId:'squat',sets:2,setTargets:['8','8'],unit:'reps',restSeconds:90,restMaxSeconds:150,restDisplay:'90–150 sec',approvedSwaps:{easier:'Chair stand'}}],cooldown:['Walk'],adjustmentRuleIds:['rule'],customNote:'Keep this'},revision:2};
function fixture(role='admin'){
 const records=[session,{id:'training:squat',kind:'exercise',title:'Squat',fields:{}}],saved={id:session.id,payload:structuredClone(session),revision:2},calls=[];
 const api=async(path,opts={})=>{
  if(path.includes('rpc/nufi_studio_save')){calls.push(opts.payload);Object.assign(saved,{payload:opts.payload.document,revision:opts.payload.expected+1});return [saved];}
  return path.includes('nufi_studio_items')?[saved]:[];
 };
 return {calls,saved,context:{params:new URLSearchParams({studio:'item',id:session.id}),actor:{role,id:'test'},api,load:async()=>({records,files:{}}),env:{}}};
}
const request=(extra={})=>({method:'POST',body:{action:'workout-inline-save',revision:'2',title:'Updated workout',dayName:'Day 2',fields:JSON.stringify({...session.fields,introduction:'Updated cue'}),...extra}});
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}});

test('inline save returns an updated preview and revision without a redirect, preserving other fields',async()=>{
 const f=fixture(),res=response();await handleStudio(request(),res,f.context);
 assert.equal(res.statusCode,200);assert.match(res.headers['Content-Type'],/application\/json/);assert.equal(res.headers.Location,undefined);
 const result=JSON.parse(res.body);assert.equal(result.record.revision,3);assert.equal(result.record.status,'Draft');assert.equal(result.record.approval,undefined);
 assert.match(result.preview,/Updated workout|Updated cue/);assert.match(result.preview,/data-workout-edit/);assert.match(result.preview,/Edit Day 2 workout/);
 assert.deepEqual(result.record.fields.blocks,session.fields.blocks);assert.deepEqual(result.record.fields.adjustmentRuleIds,['rule']);assert.equal(result.record.fields.customNote,'Keep this');assert.equal(f.calls.length,1);
});

test('invalid, stale and unauthorised inline saves return JSON errors and never write',async()=>{
 for(const [role,extra,status] of [['admin',{revision:1},409],['admin',{title:''},400],['admin',{fields:'invalid'},400],['staff',{},403]]){
  const f=fixture(role),res=response();await handleStudio(request(extra),res,f.context);
  assert.equal(res.statusCode,status);assert.ok(JSON.parse(res.body).error);assert.equal(f.calls.length,0);assert.equal(res.headers.Location,undefined);
 }
});

test('inline form is embedded and uses local save and cancel controls only for editors',()=>{
 const data={actor:{role:'admin'},assigned:new Set(),items:[session]};
 const html=inlineWorkoutForm(session,data,'Day 2');assert.match(html,/data-workout-editor hidden/);assert.match(html,/data-workout-cancel/);assert.match(html,/Save workout/);
 data.actor.role='staff';assert.equal(inlineWorkoutForm(session,data,'Day 2'),'');
});
