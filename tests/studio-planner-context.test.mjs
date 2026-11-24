import test from 'node:test';
import assert from 'node:assert/strict';
import {loadPlanner} from '../server/studio-planner-context.mjs';
import {ganttPanel} from '../server/studio-project-schedule.mjs';
test('private portfolio workload affects dates without revealing other project names or notes',async()=>{
 const current={id:'z',creator_id:'joyce',entries:[{id:'mine',title:'My task',status:'To do',estimatedHours:4}]};
 const other={id:'a',creator_id:'joyce',entries:[{id:'private',title:'Secret acquisition',notes:'Private notes',status:'In progress',estimatedHours:8}]};
 const data={actor:{role:'staff',id:'joyce'},projects:[current]};
 await loadPlanner(data,async url=>url.includes('nufi_library_projects')?[current,other]:[{id:'studio:team-profile:joyce',payload:{fields:{agreedHours:'20',hoursPeriod:'week'}}}]);
 const html=ganttPanel(current,data);assert.match(html,/My task/);assert.doesNotMatch(html,/Secret acquisition|Private notes|data-schedule-entries/);assert.ok(data.planner.rows.get('z:mine').finish>data.planner.rows.get('a:private').finish);
});
test('unavailable workload never falls back to misleading capacity forecasts',async()=>{const data={};await loadPlanner(data,async()=>{throw Error('offline');});assert.equal(data.planner.unavailable,true);});
