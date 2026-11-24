import test from 'node:test';
import assert from 'node:assert/strict';
import {studioData} from '../server/studio-store.mjs';
import {applyProgrammeResets} from '../server/studio-programme-reset.mjs';
const cutoff='2026-11-24T14:55:37Z';
const reset={id:'studio:programme-reset:20261124',kind:'settings',fields:{programmeReset:true,active:true,cutoff,recordIds:['legacy:programme']}};
test('previous generated programmes and their messages, social content, images and workouts are archived without touching other content',()=>{
 const records=new Map([[reset.id,reset]]);
 for(const kind of ['programme','programme-family','stage','structure','session','communication','campaign','asset','learning','review'])records.set('training:'+kind,{id:'training:'+kind,kind,status:'Draft',fields:{}});
 for(const [id,kind] of [['training:exercise','exercise'],['training:activity','activity'],['training:rule','rule'],['recipe:one','recipe'],['course:one','course'],['newsletter:one','communication'],['upload:one','asset'],['new:programme','programme']])records.set(id,{id,kind,status:'Draft',fields:{}});
 records.set('legacy:programme',{id:'legacy:programme',kind:'programme',status:'Draft'});
 applyProgrammeResets(records);
 for(const [id,r] of records)assert.equal(r.status==='Archived',id==='legacy:programme'||id.startsWith('training:')&&!['exercise','activity','rule'].includes(r.kind),id);
});
test('new drafts and deliberate later revisions survive; disabling the reset restores the original snapshot view',()=>{
 const old={id:'training:stronger',kind:'programme',status:'Draft',updatedAt:'2026-11-24T12:00:00Z'},later={...old,id:'training:build',updatedAt:'2026-11-25T12:00:00Z'};
 const records=new Map([[reset.id,reset],[old.id,old],[later.id,later]]);applyProgrammeResets(records);
 assert.equal(records.get(old.id).status,'Archived');assert.equal(old.status,'Draft');assert.equal(records.get(later.id).status,'Draft');
 const inactive=new Map([[reset.id,{...reset,fields:{...reset.fields,active:false}}],[old.id,old]]);applyProgrammeResets(inactive);assert.equal(inactive.get(old.id).status,'Draft');
});
test('admin and Joyce library reloads have no old active programmes and preserve recipes, courses and exercise records',async()=>{
 const source=[{id:'training:stronger',title:'Stronger',kind:'programme',status:'draft',fields:{}},{id:'training:message',kind:'communication',status:'draft',fields:{}},{id:'training:exercise',kind:'exercise',status:'draft',fields:{}}];
 const overlays=[reset,{id:'recipe:one',title:'Recipe',kind:'recipe',status:'Approved',fields:{}},{id:'course:one',title:'Course',kind:'course',status:'Draft',fields:{}}];
 const api=async path=>path.includes('nufi_studio_items')?overlays.map(payload=>({id:payload.id,payload,revision:1})):[];
 for(const actor of [{role:'admin',id:'owner'},{role:'staff',id:'joyce',access:{library:true,all_library:true}}]){
  const data=await studioData(api,actor,async()=>({records:source}));
  assert.equal(data.items.filter(r=>r.kind==='programme'&&r.status!=='Archived').length,0);
  assert.equal(data.byId.get('training:message').status,'Archived');assert.equal(data.byId.get('training:exercise').status,'Draft');assert.equal(data.byId.has('recipe:one'),true);assert.equal(data.byId.has('course:one'),true);
 }
 assert.equal(source[0].status,'draft');
});

