import test from 'node:test';
import assert from 'node:assert/strict';
import {workerControls} from '../server/worker-controls.mjs';
test('worker controls preserve routine identity, version, prompt and pause state',()=>{
 const state={queueEnabled:true,organisationVersion:7,employee:{instructions:'Use verified sources <script>bad</script>'},routines:[{id:'existing-duty',version:4,title:'Weekly recipes\nSave three drafts',cadence:'weekly',time:'09:00',weekday:1,priority:'Normal',enabled:true,nextRunAt:'2026-11-23T09:00:00Z'}],tasks:[{title:'Three recipes',status:'needs_input'}]};
 const html=workerControls('nigel',state);for(const text of ['Save worker prompt','Save schedule &amp; brief','Pause schedule','Run once','existing-duty','needs_input','Weekly recipes'])assert.ok(html.includes(text),text);
 assert.doesNotMatch(html,/<script>/);assert.match(html,/name="version" value="4"/);assert.match(html,/name="worker" value="nigel"/);
 state.routines[0].enabled=false;assert.match(workerControls('nigel',state),/Resume schedule/);
 assert.match(workerControls('nigel',null),/unavailable/);
});
