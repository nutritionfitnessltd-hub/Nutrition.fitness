import test from 'node:test';
import assert from 'node:assert/strict';
import {saveWorkoutDays, workoutDaysEditor} from '../server/studio-workout-days.mjs';
import {workoutSession} from '../server/studio-workouts.mjs';
import {itemPage} from '../server/studio-pages.mjs';
import {changeStudio} from '../server/studio-actions.mjs';
import {handleStudio} from '../server/studio.mjs';

function fixture() {
  const programme={id:'training:plan',kind:'programme',title:'Plan',fields:{weeks:2},status:'Draft'};
  const sessions=['a','b','c'].map(id=>({id:'training:'+id,kind:'session',title:'Workout '+id,fields:{warmup:['Walk'],blocks:[],cooldown:['Walk'],adjustmentRuleIds:['rule-adjust']},status:'Draft',revision:0}));
  const schedule={id:'training:days',kind:'structure',parent:programme.id,title:'3 days',status:'Approved',revision:4,approval:{revision:4},fields:{frequency:3,spacing:'Recovery day between workouts.',weeks:[{number:1,title:'Learn',message:'Keep this note',sessionIds:['a','b','c'],reflection:'Keep reflection'},{number:2,title:'Build',sessionIds:['c','b','a']}],adjustmentRuleIds:['rule-adjust']}};
  const rule={id:'training:rule-adjust',kind:'rule',title:'Missed session',fields:{instructions:'Resume the schedule.'},status:'Draft'};
  const unrelated={...sessions[0],id:'training:unrelated',title:'Other programme workout'};
  const items=[programme,schedule,...sessions,rule,unrelated];
  return {actor:{role:'admin',id:'admin'},items,byId:new Map(items.map(r=>[r.id,r])),assigned:new Set(items.map(r=>r.id)),projects:[],people:[],schedule,sessions,programme};
}
const params=new URLSearchParams({studio:'item',id:'training:plan',tab:'plan',schedule:'training:days',week:'1'});
const form=()=>({action:'workout-days-save',schedule:'training:days',week:'1',revision:'4',count:'3',session0:'training:c',label0:'Monday',session1:'training:a',label1:'Wednesday',session2:'training:b',label2:'Friday'});

test('save days changes only the chosen week, preserves guidance and writes one draft revision',async()=>{
  const d=fixture(),before=structuredClone(d.schedule),calls=[];
  const next=await changeStudio(params,form(),d,async(path,options)=>{calls.push({path,...options});return [{}];});
  assert.equal(calls.length,1);assert.equal(calls[0].payload.expected,4);
  const saved=calls[0].payload.document;
  assert.deepEqual(saved.fields.weeks[0].sessionIds,['training:c','training:a','training:b']);
  assert.deepEqual(saved.fields.weeks[0].dayLabels,['Monday','Wednesday','Friday']);
  assert.equal(saved.fields.weeks[0].reflection,'Keep reflection');
  assert.deepEqual(saved.fields.weeks[1],before.fields.weeks[1]);
  assert.deepEqual(saved.fields.adjustmentRuleIds,before.fields.adjustmentRuleIds);
  assert.equal(saved.status,'Draft');assert.equal(saved.approval,undefined);
  assert.deepEqual(d.schedule,before);assert.equal(next.id,d.programme.id);assert.equal(next.week,'1');assert.equal(next.notice,'days-saved');
});

test('stale, unauthorised and out-of-programme changes do not write',async()=>{
  const d=fixture(),noWrite=async()=>assert.fail('Must not write');
  await assert.rejects(saveWorkoutDays(params,{...form(),revision:'3'},d,noWrite),e=>e.status===409);
  await assert.rejects(saveWorkoutDays(params,{...form(),session0:'training:unrelated'},d,noWrite),e=>e.status===400);
  await assert.rejects(saveWorkoutDays(params,{...form(),count:'4'},d,noWrite),e=>e.status===400);
  await assert.rejects(saveWorkoutDays(params,{...form(),week:'99'},d,noWrite),e=>e.status===400);
  d.actor.role='staff';d.assigned.delete(d.schedule.id);
  await assert.rejects(saveWorkoutDays(params,form(),d,noWrite),e=>e.status===403);
  assert.equal(workoutDaysEditor(params,d,d.schedule,d.schedule.fields.weeks[0]),'');
});

test('missing, archived and invalid day names do not write; database conflicts propagate',async()=>{
  const d=fixture(),noWrite=async()=>assert.fail('Must not write');
  await assert.rejects(saveWorkoutDays(params,{...form(),session0:'missing'},d,noWrite),e=>e.status===400);
  await assert.rejects(saveWorkoutDays(params,{...form(),label0:'a'.repeat(41)},d,noWrite),e=>e.status===400);
  await assert.rejects(saveWorkoutDays(params,{...form(),label0:'Monday\nTuesday'},d,noWrite),e=>e.status===400);
  await assert.rejects(saveWorkoutDays(params,form(),d,async()=>[]),e=>e.status===409);
  d.sessions[2].status='Archived';
  await assert.rejects(saveWorkoutDays(params,form(),d,noWrite),e=>e.status===400);
});

test('editor displays named workouts and exposes edit days only to assigned editors',()=>{
  const d=fixture(),p=new URLSearchParams(params);p.set('editDays','1');
  const html=itemPage(p,d);
  for(const text of ['Edit days · Week 1','Day name (optional)','Save days','Move earlier','Edit this workout','this week only'])assert.ok(html.includes(text),text);
  assert.doesNotMatch(html,/Other programme workout/);
  d.actor.role='staff';d.assigned.clear();
  assert.doesNotMatch(itemPage(p,d),/data-week-days|>Edit days<|Edit Day 1 workout/);
});

test('adjustment rules leave the workout view while remaining stored and accessible on the programme',()=>{
  const d=fixture(),before=structuredClone(d.sessions[0]);
  assert.doesNotMatch(workoutSession(d.sessions[0],d),/Adjustment Rule|Missed session|rule-adjust/);
  assert.deepEqual(d.sessions[0],before);
  assert.match(itemPage(new URLSearchParams({id:d.programme.id}),d),/Missed session/);
});

test('HTTP save reloads day labels and order; failure retains unsaved changes safely',async()=>{
  const d=fixture(),saved=new Map([[d.schedule.id,{id:d.schedule.id,payload:d.schedule,revision:4}]]);
  const api=async(path,opts={})=>{
    if(path.includes('rpc/nufi_studio_save')){const p=opts.payload,row={id:p.item,payload:p.document,revision:p.expected+1};saved.set(p.item,row);return [row];}
    return path.includes('nufi_studio_items')?[...saved.values()]:[];
  };
  const context={params,actor:d.actor,api,load:async()=>({records:d.items,files:{}}),env:{}};
  const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},end(b){this.body=b;}});
  let res=response();await handleStudio({method:'POST',body:form()},res,context);
  assert.equal(res.statusCode,303);assert.match(res.headers.Location,/week=1/);
  res=response();await handleStudio({method:'GET'},res,context);
  assert.equal(res.statusCode,200);assert.match(res.body,/Day 1 · Monday/);
  assert.ok(res.body.indexOf('<strong>Workout c</strong>')<res.body.indexOf('<strong>Workout a</strong>'));
  res=response();await handleStudio({method:'POST',body:{...form(),label0:'<b>Unsaved</b>'}},res,context);
  assert.equal(res.statusCode,409);assert.match(res.body,/&lt;b&gt;Unsaved&lt;\/b&gt;/);assert.match(res.body,/data-unsaved="true"/);
  assert.equal(saved.get(d.schedule.id).revision,5);
});
