import test from 'node:test';
import assert from 'node:assert/strict';
import {accessFor,accessFromForm,canReadContent,canEditContent,canReviewContent,authorizeStudioRequest} from '../server/library-permissions.mjs';
import {brandPage,sendBrandFile} from '../server/studio-brand.mjs';
import {brandMediaPage} from '../server/team-workspace.mjs';
const actor={role:'staff',id:'joyce',access:{library:true,shared_library:true,work:true,studio:true,edit:true,originals:true,sources:true}};
const data={actor,assigned:new Set(['assigned'])};
test('shared library permission defaults off for existing and legacy accounts',()=>{
 assert.equal(accessFor({role:'staff',access:null}).shared_library,false);
 assert.equal(accessFor({role:'staff',access:{library:true}}).shared_library,false);
 assert.equal(accessFor({...actor,access:{shared_library:true}}).shared_library,false);
 assert.equal(accessFromForm({accessVersion:'1',access_library:'1',access_shared_library:'1'}).shared_library,true);
});
test('Joyce can read approved and explicitly shared material without editing it',()=>{
 for(const kind of ['article','recipe','asset','communication','programme','product']){
  const r={id:'shared:'+kind,kind,status:'Approved'};
  assert.equal(canReadContent(data,r),true);assert.equal(canEditContent(data,r.id),false);assert.equal(canReviewContent(data,r),false);
 }
 assert.equal(canReadContent(data,{id:'brand',kind:'asset',status:'Draft',fields:{shared:true}}),true);
 assert.equal(canReadContent(data,{id:'assigned',kind:'article',status:'Draft'}),true);
 assert.equal(canEditContent(data,'assigned'),true);
});
test('private drafts, internal settings and approval powers remain restricted',()=>{
 for(const r of [{id:'private',kind:'article',status:'Draft'},{id:'private-review',kind:'article',status:'In review'},{id:'archived',kind:'asset',status:'Archived',shared:true},{id:'internal',kind:'settings',status:'Approved'},{id:'worker',kind:'worker-request',status:'Approved'}])assert.equal(canReadContent(data,r),false);
 assert.equal(canReadContent({...data,actor:{...actor,access:{library:true}}},{id:'approved',kind:'article',status:'Approved'}),false);
 for(const section of ['team','settings','standards'])assert.throws(()=>authorizeStudioRequest(actor,section,'GET'),e=>e.status===403);
});
test('shared brand page exposes official materials without editing controls',()=>{
 const html=brandMediaPage({...data,byId:new Map()});
 assert.match(html,/Download SVG/);assert.match(html,/Download PNG/);assert.match(html,/Open full guide/);assert.match(html,/DM Sans/);
 assert.doesNotMatch(html,/standards-save|Save guidance|Additional guidance/);
 assert.match(brandPage({actor:{role:'admin'},byId:new Map()}),/standards-save/);
 authorizeStudioRequest(actor,'brand-file','GET');
 assert.throws(()=>authorizeStudioRequest(actor,'brand-file','POST',{action:'standards-save'}),e=>e.status===403);
});
test('brand files stay restricted to the exact official allowlist',async()=>{
 for(const file of ['logo-svg','logo-png','guide']){
  const res={setHeader(){},end(bytes){this.bytes=bytes;}};
  await sendBrandFile({method:'GET'},res,new URLSearchParams({file}),actor);
  assert.ok(res.bytes.length>100);
 }
 await assert.rejects(()=>sendBrandFile({method:'GET'},{},new URLSearchParams({file:'../platform.mjs'}),actor),e=>e.status===404);
 await assert.rejects(()=>sendBrandFile({method:'GET'},{},new URLSearchParams({file:'logo-svg'}),{...actor,access:{library:true}}),e=>e.status===403);
 await assert.rejects(()=>sendBrandFile({method:'POST'},{},new URLSearchParams({file:'logo-svg'}),actor),e=>e.status===405);
});
