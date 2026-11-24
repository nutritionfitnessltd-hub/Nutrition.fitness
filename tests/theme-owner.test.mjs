import test from 'node:test';
import assert from 'node:assert/strict';
import {draftDocument,draftWorker} from '../supabase/functions/content-worker-bridge/worker-drafts.mjs';
import {contentWorker,workerContent} from '../server/studio-worker-content.mjs';
test('themes default to Martina in the editor and her saved work, while explicit owners remain intact',()=>{
 const theme={id:'theme',kind:'theme',title:'Seasonal month',status:'Draft',fields:{}};
 assert.equal(contentWorker(theme),'martina');assert.equal(contentWorker({...theme,workerId:'nina'}),'nina');assert.equal(contentWorker({...theme,workerId:'none'}),'');
 const data={actor:{role:'admin'},items:[theme],byId:new Map([[theme.id,theme]])};assert.deepEqual(workerContent(data,'martina'),[theme]);assert.equal(workerContent(data,'nina').length,0);
});
test('Martina can deliver and revise theme drafts without approving or publishing them',()=>{
 const input={id:'seasonal-month',revision:0,kind:'theme',title:'Seasonal month',body:'Month plan',fields:{workerId:'martina'}};
 const doc=draftDocument(input,null,'worker:content-manager:');assert.equal(doc.kind,'theme');assert.equal(doc.workerId,'martina');assert.equal(doc.status,'Draft');assert.equal(draftWorker({...input,fields:{}}),'martina');
 const updated=draftDocument({...input,revision:1,body:'Revised month plan'},{payload:{...doc,status:'Approved',approval:{revision:1}},revision:1},'worker:content-manager:');assert.equal(updated.status,'Draft');assert.equal(updated.approval,undefined);
 assert.throws(()=>draftDocument({...input,revision:2},{payload:doc,revision:1},'worker:content-manager:'),e=>e.status===409);
});
