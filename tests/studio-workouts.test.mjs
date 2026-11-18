import test from 'node:test';
import assert from 'node:assert/strict';
import { workoutSession, workoutDays } from '../server/studio-workouts.mjs';
import { itemPage } from '../server/studio-pages.mjs';

const exercise = { id:'training:squat', kind:'exercise', title:'Goblet Squat', fields:{} };
const rule = { id:'training:rule', kind:'rule', title:'Straight sets', fields:{} };
const block = { type:'exercise', referenceId:'squat', ruleId:'rule', sets:2, setTargets:['8','8'], repMin:8, repMax:8, unit:'reps', effortType:'RIR', effortValue:'4', restSeconds:90, restMaxSeconds:150, restDisplay:'90–150 sec', tempo:'3-1-1', method:'Straight sets', primaryLift:false, notes:'Keep the whole foot planted.', commonError:'Heels lifting.', stopRule:'Stop if pain occurs.', approvedSwaps:{easier:'Sit-to-Stand'} };
const session = { id:'training:session', title:'Week 1 — Full body A', kind:'session', status:'Draft', fields:{duration:35, introduction:'Complete in order.', warmup:['5 min easy cardio.'], blocks:[block], cooldown:['3–5 min walking.'], trainingGuidance:'Preparation sets are additional.'}, files:[] };
const data = () => ({items:[exercise,rule,session], byId:new Map([exercise,rule,session].map(r=>[r.id,r])), actor:{role:'admin'}, assigned:new Set(), projects:[], people:[]});
const render = changes => workoutSession({...session, fields:{...session.fields, blocks:[{...block,...changes}]}}, data());

test('workout view combines repeated prescriptions and preserves coaching and reference links without mutation', () => {
  const before = JSON.stringify(session), html = workoutSession(session, data());
  for (const text of ['2 × 8 reps','4 reps in reserve','90–150 sec','Tempo: 3-1-1','Warm-up','Cool-down','Keep the whole foot planted.','Heels lifting.','Stop if pain occurs.','Sit-to-Stand','Preparation sets are additional.']) assert.ok(html.includes(text), text);
  assert.match(html, /id=training%3Asquat&amp;tab=preview/);
  assert.match(html, /id=training%3Arule&amp;tab=preview/);
  assert.doesNotMatch(html, /Primary Lift|Primary lift|Rest Max|Set Targets|>false</);
  assert.equal(JSON.stringify(session), before);
});

test('different set targets and back-off method remain explicit', () => {
  const html = render({sets:3,setTargets:['5–8','8–10','8–10'],method:'Top set + 2 back-off sets (-8–12% load)',effortValue:'1.5'});
  assert.match(html, /3 sets/);
  for (const text of ['Set 1: 5–8 reps','Set 2: 8–10 reps','Set 3: 8–10 reps','Top set + 2 back-off sets (-8–12% load)','1.5 reps in reserve']) assert.ok(html.includes(text),text);
  assert.doesNotMatch(html, /3 × 5–8/);
});

test('time, distance, rep ranges and each-side doses use their saved units', () => {
  assert.match(render({setTargets:['20','20'],unit:'metres/side',perSide:true,distanceMetres:20}), /2 × 20 metres each side/);
  assert.match(render({setTargets:['30–45','30–45'],unit:'seconds',durationSeconds:30}), /2 × 30–45 seconds/);
  assert.match(render({setTargets:[],repMin:6,repMax:10,perSide:true}), /2 × 6–10 reps each side/);
  assert.match(render({setTargets:[],repMin:undefined,repMax:undefined,durationSeconds:45,unit:'seconds'}), /2 × 45 sec/);
});

test('zero targets and numeric rest survive; mismatched and structured targets are not flattened', () => {
  assert.match(render({restDisplay:'',restSeconds:0,restMaxSeconds:0,effortValue:0}), /0 sec/);
  assert.match(render({effortValue:0}), /0 reps in reserve/);
  assert.match(render({sets:3,setTargets:['8','8']}), /3 sets/);
  assert.match(render({setTargets:[{reps:8,load:'Light'},{reps:6,load:'Heavy'}]}), /Light/);
  assert.match(render({effortType:'RPE',effortValue:'7'}), /RPE 7/);
});

test('missing references, custom fields and unsafe text remain safe and visible', () => {
  const html = render({referenceId:'missing<script>',notes:'<script>alert(1)</script>',customInstruction:{rounds:4,description:'Walk between rounds.'}});
  assert.match(html, /Unavailable exercise \(missing&lt;script&gt;\)/);
  assert.match(html, /Walk between rounds\./);
  assert.doesNotMatch(html, /<script>/);
});

test('day navigation renders just the selected workout and handles missing or invalid days', () => {
  const second={...session,title:'Full body B',fields:{blocks:[{referenceId:'squat',sets:3,repMin:12}]}};
  const href=day=>'/content-library/?week=2&amp;day='+day;
  const html=workoutDays(new URLSearchParams({day:'2'}),data(),[session,second,undefined],href);
  assert.match(html, /week=2&amp;day=2#workout" aria-current="page"/);
  assert.match(html, /3 × 12 reps/);
  assert.doesNotMatch(html, /2 × 8 reps/);
  assert.match(workoutDays(new URLSearchParams({day:'99'}),data(),[session],href),/Day 1 of 1/);
  assert.match(workoutDays(new URLSearchParams({day:'3'}),data(),[session,second,undefined],href),/This session is unavailable/);
  assert.match(workoutDays(new URLSearchParams(),data(),[],href),/No workouts have been added/);
});

test('session opens the compact preview by default while edit route retains the editor', () => {
  const d=data();
  assert.match(itemPage(new URLSearchParams({id:session.id}),d),/2 × 8 reps/);
  assert.match(itemPage(new URLSearchParams({id:session.id,tab:'preview'}),d),/workout-exercises/);
  assert.match(itemPage(new URLSearchParams({id:session.id,tab:'edit'}),d),/id="studio-editor"/);
  d.actor.role='staff';
  assert.doesNotMatch(workoutSession(session,d),/Edit workout/);
});
