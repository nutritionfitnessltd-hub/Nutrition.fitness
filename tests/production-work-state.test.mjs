import test from 'node:test';
import assert from 'node:assert/strict';
import {productionWorkState} from '../server/production-work-state.mjs';
test('draft existence alone never proves a worker is running',()=>{
 assert.equal(productionWorkState({sourceId:'s',status:'Imogen working',working:false},null).label,'Unconfirmed');
});
test('current work, blocked and stopped checkpoints have clear execution labels',()=>{
 const row={sourceId:'s',status:'Imogen working',working:true};
 for(const [status,label] of [['working','Running'],['blocked','Blocked'],['paused','Stopped'],['error','Blocked']])assert.equal(productionWorkState(row,{currentSourceId:'catalogue:s',status,updatedAt:new Date().toISOString()}).label,label);
});
test('stale working checkpoints do not imply running',()=>{
 assert.equal(productionWorkState({sourceId:'s',working:false},{currentSourceId:'s',status:'working',updatedAt:'2020-01-01'}).label,'Unconfirmed');
});
test('later reported stop wins over an older checkpoint',()=>{
 assert.equal(productionWorkState({sourceId:'s',working:true},{currentSourceId:'s',status:'working',updatedAt:'2026-11-24T10:00:00Z'},{workState:'Stopped',at:'2026-11-24T11:00:00Z'}).label,'Stopped');
});
test('production completion is distinct from review approval',()=>{
 for(const status of ['Awaiting review','Approved','Saved to SharePoint'])assert.equal(productionWorkState({status},null).label,'Completed');
 assert.equal(productionWorkState({status:'To do'},null).label,'Not started');
});

test('a checked completion supersedes an older stale or stopped runner checkpoint',()=>{
 const row={sourceId:'s',status:'Awaiting review',working:false,completedAt:'2026-11-24T12:40:56Z'};
 for(const status of ['working','stopped','blocked'])assert.equal(productionWorkState(row,{currentSourceId:'s',status,updatedAt:'2026-11-24T12:20:00Z'}).label,'Completed');
 assert.equal(productionWorkState(row,{currentSourceId:'s',status:'blocked',updatedAt:'2026-11-24T13:00:00Z'}).label,'Blocked');
});
