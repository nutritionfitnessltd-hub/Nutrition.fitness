import test from 'node:test';
import assert from 'node:assert/strict';
import {workFinish,workStart,projectSchedule,scheduleFields,validateDependencies,ganttPanel,reorderAndSchedule} from '../server/studio-project-schedule.mjs';
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
 const html=ganttPanel({entries:[{id:'a',title:'<script>alert(1)</script>',start:'2026-11-27',duration:2,status:'To do'}]});assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/Gantt chart/);assert.match(html,/weekend/);
});

test('saved durations update delivery dates and cascade through dependency order',()=>{
 const entries=[{id:'b',title:'Second',start:'2026-11-27',duration:2,dependsOn:['a'],status:'To do'},{id:'a',title:'First',start:'2026-11-27',duration:2,status:'To do'}];
 const rows=reorderAndSchedule(entries);assert.deepEqual(rows.map(e=>e.id),['a','b']);assert.equal(rows[0].due,'2026-11-30');assert.equal(rows[1].due,'2026-12-02');
 rows[0].duration=3;const changed=reorderAndSchedule(rows);assert.equal(changed[0].due,'2026-12-01');assert.equal(changed[1].due,'2026-12-03');
});
test('manual ordering persists except when it would precede a prerequisite',()=>{
 const rows=[{id:'a'},{id:'b'},{id:'c',dependsOn:['a']}];assert.deepEqual(reorderAndSchedule(rows,'b','1').map(e=>e.id),['b','a','c']);assert.deepEqual(reorderAndSchedule(rows,'c','1').map(e=>e.id),['a','c','b']);assert.throws(()=>reorderAndSchedule(rows,'a','0'));
});
test('past schedules do not silently move delivery dates to today',()=>{
 const row=reorderAndSchedule([{id:'a',start:'2026-01-01',duration:2,status:'To do'}])[0];assert.equal(row.due,'2026-01-02');
});
