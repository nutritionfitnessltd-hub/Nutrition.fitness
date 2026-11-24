import test from 'node:test';
import assert from 'node:assert/strict';
import {accessFor,accessFromForm,canReadContent,canEditContent,canReviewContent} from '../server/library-permissions.mjs';
import {studioData,editable} from '../server/studio-store.mjs';
import {accountPreview,workingCopy} from '../server/account-preview.mjs';

const actor={role:'staff',id:'joyce',name:'Joyce',access:{library:true,shared_library:true,all_library:true,edit:true,studio:true,work:true}};
test('all company library reading is explicit and depends on library access',()=>{
 assert.equal(accessFor({role:'staff',access:null}).all_library,false);
 assert.equal(accessFor({role:'staff',access:{library:true}}).all_library,false);
 assert.equal(accessFor({role:'staff',access:{all_library:true}}).all_library,false);
 assert.equal(accessFromForm({accessVersion:'1',access_library:'1',access_all_library:'1'}).all_library,true);
});
test('all-company readers can read every content category and status without receiving edit or review access',()=>{
 const data={actor,assigned:new Set(['assigned']),byId:new Map()};
 for(const kind of ['recipe','mealplan','programme','programme-family','stage','structure','session','exercise','activity','rule','review','course','lesson','learning','article','ebook','leadmagnet','challenge','communication','campaign','workflow','asset','product']){
  for(const status of ['Draft','In review','Changes requested','Approved','Archived']){
   const r={id:'other:'+kind,kind,status,createdBy:'another-person',fields:{}};
   assert.equal(canReadContent(data,r),true,kind+' '+status);
   assert.equal(canEditContent(data,r.id),false);
   assert.equal(canReviewContent(data,r),false);
  }
 }
 for(const kind of ['settings','worker-request','account-preview','notification'])assert.equal(canReadContent(data,{id:'internal',kind,status:'Draft'}),false);
 assert.equal(canEditContent(data,'assigned'),true);
 const source={id:'source',kind:'course',status:'Original material',sourceOnly:true};
 assert.equal(canReviewContent({...data,actor:{role:'admin'}},source),false);
});
test('reload includes company drafts while assignment and authorship remain the only staff editing grants',async()=>{
 const records=[{id:'other',kind:'ebook',title:'Company guide',status:'Draft',createdBy:'someone-else',fields:{}},{id:'own',kind:'campaign',title:'Joyce daily post',status:'Draft',createdBy:actor.id,fields:{}}];
 const api=async path=>path.includes('nufi_studio_items')?records.map(r=>({id:r.id,payload:r,revision:1})):[];
 const data=await studioData(api,actor,async()=>({records:[]}));
 assert.equal(data.items.length,2);
 assert.equal(data.assigned.has('other'),false);
 assert.throws(()=>editable(data,'other'),e=>e.status===403);
 assert.equal(canEditContent(data,'other'),false);
 assert.equal(editable(data,'own').id,'own');
 assert.equal(canEditContent(data,'own'),true);
 const restricted=await studioData(api,{...actor,access:{library:true,shared_library:true,edit:true}},async()=>({records:[]}));
 assert.equal(restricted.byId.has('other'),false);
});
test('an existing account preview picks up saved all-company access on refresh',async()=>{
 const owner={role:'admin',id:'owner'},person={id:'00000000-0000-4000-8000-000000000002',name:'Joyce',access:{library:true,shared_library:true,edit:true},access_revision:7},rows=new Map();
 const api=async(path,options={})=>{
  if(path.includes('nufi_library_staff'))return [person];
  if(options.method){const p=options.payload,row={id:p.item,payload:structuredClone(p.document),revision:(rows.get(p.item)?.revision||0)+1};rows.set(p.item,row);return [row];}
  const id=new URL(path,'https://fixture.test').searchParams.get('id')?.slice(3);return rows.has(id)?[structuredClone(rows.get(id))]:[];
 };
 const location=await accountPreview({staff:person.id,accessVersion:'1',accessRevision:'7',access_library:'1',access_shared_library:'1'},{actor:owner,api});
 const id=new URL(location,'https://fixture.test').searchParams.get('accountPreview');
 assert.equal((await workingCopy(api,owner,id)).actor.access.all_library,false);
 person.access={...person.access,all_library:true};person.access_revision++;
 assert.equal((await workingCopy(api,owner,id)).actor.access.all_library,true);
 assert.equal(rows.get(id).payload.staffAccessRevision,8);
});

