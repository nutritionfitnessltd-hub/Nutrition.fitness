import test from 'node:test';
import assert from 'node:assert/strict';
import {productionItemProgress,productionItemProgressHtml,latestProductionProgress} from '../server/production-item-progress.mjs';
const now=Date.now(),p={id:'project'};
const entry=(stage,worker='cloud')=>({stage,worker,updatedAt:new Date(now-1000).toISOString(),note:'Narration mapping outstanding'});
function data(items,projectId=p.id){return {backgroundControls:new Map([[p.id,{fields:{backgroundJob:{projectId,itemProgress:items}}}]])};}
test('each source shows its own saved stage and worker, including catalogue IDs',()=>{
 const d=data({C1:entry('editing','pc'),C2:entry('preparing')});
 assert.equal(productionItemProgress(p,d,'catalogue:C1',now).worker,'PC worker');
 assert.equal(productionItemProgress(p,d,'C2',now).label,'Preparation');
 assert.equal(productionItemProgress(p,d,'C3',now),null);
 assert.equal(productionItemProgress(p,data({C1:entry('qa')},'other'),'C1',now),null);
 const html=latestProductionProgress(p,d,[{sourceId:'C1'},{sourceId:'C2'}]);
 assert.match(html,/PC worker/);assert.match(html,/Cloud worker/);assert.doesNotMatch(html,/%|Approved/);
});
test('stale active checkpoints never claim current activity; queued and blocked stay honest',()=>{
 for(const stage of ['editing','preparing','qa']){
  const progress=productionItemProgress(p,data({C1:{...entry(stage),updatedAt:new Date(now-3600000).toISOString()}}),'C1',now);
  assert.match(productionItemProgressHtml(progress),/activity unconfirmed/);
 }
 assert.equal(productionItemProgress(p,data({C1:entry('blocked')}),'C1',now).label,'Blocked');
 for(const bad of [{stage:'bogus'},{worker:'imposter'},{updatedAt:'invalid'},{updatedAt:new Date(now+1000).toISOString()}])assert.equal(productionItemProgress(p,data({C1:{...entry('editing'),...bad}}),'C1',now),null);
});
test('saved notes are escaped and bounded and cannot become actions',()=>{
 const progress=productionItemProgress(p,data({C1:{...entry('ready-for-pc'),note:'<script>bad</script>'+'.'.repeat(2000)}}),'C1',now);
 assert.equal(progress.note.length,1200);const html=productionItemProgressHtml(progress);
 assert.match(html,/Ready for PC finishing/);assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
});
