import test from 'node:test';
import assert from 'node:assert/strict';
import {workFinish,workStart,projectSchedule,scheduleFields,validateDependencies,ganttPanel,reorderAndSchedule,portfolioSchedule,weeklyHours,schedulingInputs} from '../server/studio-project-schedule.mjs';
test('inclusive working durations skip weekends and cross year boundaries',()=>{
 assert.equal(workFinish('2026-11-27',2),'2026-11-30');
 assert.equal(workStart('2026-11-28'),'2026-11-30');
 assert.equal(workFinish('2026-12-31',3),'2027-01-04');
});
test('unfinished dependencies push forecasts without rewriting due dates',()=>{
 const p={entries:[{id:'a',title:'First',start:'2026-11-27',duration:2,status:'To do'},{id:'b',title:'Second',start:'2026-11-27',duration:2,due:'2026-12-01',dependsOn:['a'],status:'To do'}]};
 const [a,b]=projectSchedule(p,'2026-11-24');assert.equal(a.finish,'2026-11-30');assert.equal(b.start,'2026-12-01');assert.equal(b.finish,'2026-12-02');assert.equal(b.blocked,true);assert.equal(b.atRisk,true);assert.equal(p.entries[1].due,'2026-12-01');
});
test('completed tasks are not late; overdue weekends do not count as work days',()=>{
 const rows=projectSchedule({entries:[{id:'a',due:'2026-11-27',status:'To do'},{id:'b',due:'2026-11-20',status:'Done'}]},'2026-11-30');assert.equal(rows[0].late,1);assert.equal(rows[1].overdue,false);
});
test('rejects cycles, self, unknown task, invalid duration and dates',()=>{
 const entries=[{id:'a',dependsOn:['b']},{id:'b',dependsOn:['a']}];assert.throws(()=>validateDependencies(entries));
 for(const f of [{start:'2026-02-30',duration:'2'},{duration:'0'},{duration:'2.5'},{duration:'2',dependencies:'a'},{duration:'2',dependencies:'missing'}])assert.throws(()=>scheduleFields({schedulePresent:'1',...f},entries[0],[entries[0]]));
});
test('older forms retain schedules; unknown predecessor timing stays unscheduled',()=>{
 const e={id:'a',start:'2026-11-24',duration:3,dependsOn:[]};scheduleFields({},e,[e]);assert.equal(e.duration,3);
 const rows=projectSchedule({entries:[{id:'a',status:'To do'},{id:'b',start:'2026-11-24',duration:2,dependsOn:['a']}]},'2026-11-24');assert.equal(rows[1].finish,'');assert.equal(rows[1].blocked,true);
});
test('Gantt escapes task names and renders weekend and dependency information',()=>{
 const html=ganttPanel({id:'p',creator_id:'joyce',entries:[{id:'a',title:'<script>alert(1)</script>',start:'2026-11-27',duration:2,status:'To do'}]},{byId:new Map([['studio:team-profile:joyce',{fields:{agreedHours:'20',hoursPeriod:'week'}}]])});assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/View timeline/);assert.match(html,/weekend/);
});

test('saving and reordering never overwrite a committed deadline',()=>{
 const entries=[{id:'b',due:'2026-12-10',start:'2026-11-27',duration:2,dependsOn:['a'],status:'To do'},{id:'a',due:'2026-12-03',start:'2026-11-27',duration:2,status:'To do'}];
 const rows=reorderAndSchedule(entries);assert.deepEqual(rows.map(e=>e.id),['a','b']);assert.equal(rows[0].due,'2026-12-03');assert.equal(rows[1].due,'2026-12-10');
 rows[0].duration=30;const changed=reorderAndSchedule(rows);assert.equal(changed[0].due,'2026-12-03');assert.equal(changed[1].due,'2026-12-10');
});

test('manual ordering persists except when it would precede a prerequisite',()=>{
 const rows=[{id:'a'},{id:'b'},{id:'c',dependsOn:['a']}];assert.deepEqual(reorderAndSchedule(rows,'b','1').map(e=>e.id),['b','a','c']);assert.deepEqual(reorderAndSchedule(rows,'c','1').map(e=>e.id),['a','c','b']);assert.throws(()=>reorderAndSchedule(rows,'a','0'));
});
test('past schedules do not silently move delivery dates to today',()=>{
 const row=reorderAndSchedule([{id:'a',due:'2026-01-02',start:'2026-01-01',duration:2,status:'To do'}])[0];assert.equal(row.due,'2026-01-02');
});

const profiles={joyce:{agreedHours:'20',hoursPeriod:'week'},other:{agreedHours:'40',hoursPeriod:'week'}};
const task=(id,extra={})=>({id,title:id,status:'To do',estimatedHours:4,...extra});
const project=(id,entries,creator='joyce')=>({id,creator_id:creator,status:'In progress',entries});
const row=(plan,p,t)=>plan.get(p+':'+t);
test('20 weekly hours are shared across projects rather than booked twice',()=>{
 const plan=portfolioSchedule([project('a',[task('first',{estimatedHours:8})]),project('b',[task('second',{estimatedHours:8})])],profiles,'2026-11-24');
 assert.equal(row(plan,'a','first').start,'2026-11-24');assert.equal(row(plan,'a','first').finish,'2026-11-25');
 assert.equal(row(plan,'b','second').start,'2026-11-26');assert.equal(row(plan,'b','second').finish,'2026-11-27');
});
test('independent short tasks share spare hours while prerequisites wait until finished',()=>{
 const p=project('p',[task('a',{estimatedHours:2}),task('b',{estimatedHours:2}),task('c',{dependsOn:['a']})]);
 const plan=portfolioSchedule([p],profiles,'2026-11-24');
 assert.equal(row(plan,'p','a').finish,'2026-11-24');assert.equal(row(plan,'p','b').finish,'2026-11-24');assert.equal(row(plan,'p','c').start,'2026-11-25');assert.equal(row(plan,'p','c').blocked,true);
});
test('remaining work, deadline priority and different owners determine forecasts',()=>{
 const p=project('p',[task('later',{due:'2026-11-30'}),task('earlier',{estimatedHours:40,remainingHours:2,status:'In progress',due:'2026-11-24'}),task('other',{assignee:'other',estimatedHours:8})]);
 const plan=portfolioSchedule([p],profiles,'2026-11-24');assert.equal(row(plan,'p','earlier').finish,'2026-11-24');assert.equal(row(plan,'p','later').finish,'2026-11-25');assert.equal(row(plan,'p','other').finish,'2026-11-24');
});
test('missing hours, missing effort, approval waits and cycles do not produce invented dates',()=>{
 const p=project('p',[task('unknown',{assignee:'missing'}),task('no-effort',{estimatedHours:null}),task('review',{status:'Ready for review'}),task('wait',{dependsOn:['review']}),task('cycle1',{dependsOn:['cycle2']}),task('cycle2',{dependsOn:['cycle1']})]);
 const plan=portfolioSchedule([p],profiles,'2026-11-24');
 for(const t of p.entries){assert.equal(row(plan,'p',t.id).finish,'');assert.ok(row(plan,'p',t.id).error);}
 assert.match(row(plan,'p','unknown').error,/weekly hours/);assert.match(row(plan,'p','no-effort').error,/estimated hours/);assert.match(row(plan,'p','review').error,/review/);
});
test('weekends, completed tasks, deadlines and legacy estimates stay consistent',()=>{
 const p=project('p',[task('old',{estimatedHours:null,duration:2,due:'2026-11-27'}),task('done',{status:'Done',completedAt:'2026-11-20T10:00:00Z'})]);
 const plan=portfolioSchedule([p],profiles,'2026-11-27');assert.equal(row(plan,'p','old').finish,'2026-11-30');assert.equal(row(plan,'p','old').atRisk,true);assert.equal(p.entries[0].due,'2026-11-27');assert.equal(row(plan,'p','done').finish,'2026-11-20');
 assert.equal(weeklyHours({agreedHours:'173.33',hoursPeriod:'month'})>39,true);
});
test('simple form submits prerequisites without JavaScript and rejects invalid effort',()=>{
 const entries=[task('a'),task('b')];scheduleFields({schedulePresent:'1',plannerVersion:'2',dependencySelection:'1','dependency.a':'1',estimatedHours:'3.5'},entries[1],entries);assert.deepEqual(entries[1].dependsOn,['a']);assert.equal(entries[1].estimatedHours,3.5);
 for(const estimatedHours of ['-1','0','1e3','5001','bad'])assert.throws(()=>scheduleFields({schedulePresent:'1',plannerVersion:'2',estimatedHours},entries[1],entries));
 const html=schedulingInputs(project('p',entries),entries[1]);assert.match(html,/type="checkbox"/);assert.match(html,/Estimated hours/);assert.doesNotMatch(html,/Task position|Earliest start|select.*multiple|schedule-entries/);
});

test('completed projects consume no future capacity and milestones consume no hours',()=>{
 const p=project('p',[task('a'),task('mark',{kind:'Milestone',dependsOn:['a']}),task('next',{dependsOn:['mark']})]);
 const closed={...project('old',[task('closed',{estimatedHours:400})]),status:'Complete'};
 const plan=portfolioSchedule([closed,p],profiles,'2026-11-24');assert.equal(row(plan,'p','mark').finish,'2026-11-24');assert.equal(row(plan,'p','next').start,'2026-11-25');assert.equal(plan.has('old:closed'),false);
});
