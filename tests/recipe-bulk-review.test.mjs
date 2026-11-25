import test from 'node:test';
import assert from 'node:assert/strict';
import {bulkRecipeReview,recipeStagingPage} from '../server/recipe-staging.mjs';
import {library} from '../server/studio-pages.mjs';
import {recipeCandidates} from '../server/studio-mealplans.mjs';
function fixture(){
 const records=['one','two'].map(id=>({id:'recipe-stage:'+id,kind:'recipe',title:'Recipe '+id,status:'Draft',revision:2,source:{needsChecking:true},fields:{servings:2,ingredients:['Source ingredient'],instructions:['Source method'],recipeStaging:{batchId:'test',book:'Book',page:2,matchStatus:'missing',photoReview:'pending',imageKey:'a'.repeat(16)}}}));
 const data={actor:{role:'admin',id:'owner'},items:records,byId:new Map(records.map(r=>[r.id,r])),assigned:new Set(),people:[],projects:[],index:{records:[]}},saved=[];
 const api=async(path,{payload})=>{assert.equal(payload.expected,2);saved.push(payload.document);return [{revision:3}];};
 return {data,saved,api,form:{operation:'approve',contentChecked:'yes','pick:recipe-stage:one':'2','pick:recipe-stage:two':'2'}};
}
test('review page uses independently associated checkboxes and a recoverable bin',()=>{
 const f=fixture(),html=recipeStagingPage(new URLSearchParams(),f.data);
 assert.match(html,/id="recipe-bulk-review"/);assert.equal((html.match(/form="recipe-bulk-review"/g)||[]).length,2);assert.match(html,/Approve recipes/);assert.match(html,/Delete selected/);assert.match(html,/name="contentChecked"/);assert.match(html,/view=bin/);
 const staff=structuredClone(f.data);staff.actor={role:'staff',id:'assigned',access:{library:true,edit:true}};staff.assigned=new Set(staff.byId.keys());assert.doesNotMatch(recipeStagingPage(new URLSearchParams(),staff),/Approve recipes/);
});
test('bulk approval requires explicit source and picture confirmation and saves current approved revisions',async()=>{
 const f=fixture();await assert.rejects(bulkRecipeReview({...f.form,contentChecked:''},f.data,f.api),/Confirm/);assert.equal(f.saved.length,0);
 assert.deepEqual(await bulkRecipeReview(f.form,f.data,f.api),{saved:2,failed:0});
 for(const r of f.saved){assert.equal(r.status,'Approved');assert.equal(r.approval.revision,3);assert.equal(r.approval.by,'owner');assert.equal(r.source.needsChecking,false);assert.equal(r.fields.recipeStaging.reviewStatus,'accepted');assert.equal(r.fields.recipeStaging.photoReview,'usable');assert.equal(r.publication,undefined);assert.deepEqual(r.fields.ingredients,['Source ingredient']);assert.equal(r.reviewFeedback[0].sourceChecked,true);}
});
test('accepted recipes leave staging and enter the library without publishing',async()=>{
 const f=fixture();assert.equal(recipeCandidates(f.data).length,0);await bulkRecipeReview(f.form,f.data,f.api);f.data.items=f.saved;f.data.byId=new Map(f.saved.map(r=>[r.id,r]));
 assert.doesNotMatch(recipeStagingPage(new URLSearchParams(),f.data),/Recipe one/);assert.match(library(new URLSearchParams({kind:'recipe',bucket:'checked'}),f.data),/Recipe one/);assert.equal(recipeCandidates(f.data).length,2);
});
test('all records are validated before writes: stale, missing pictures, incomplete recipes and foreign selections fail',async()=>{
 for(const change of [f=>{f.form['pick:recipe-stage:two']='1';},f=>{delete f.data.items[1].fields.recipeStaging.imageKey;},f=>{f.data.items[1].fields.instructions=[];},f=>{f.data.items[1].kind='article';}]){
  const f=fixture();change(f);await assert.rejects(bulkRecipeReview(f.form,f.data,f.api));assert.equal(f.saved.length,0);
 }
 const f=fixture();f.data.actor={role:'staff',id:'other',access:{library:true,edit:true}};await assert.rejects(bulkRecipeReview(f.form,f.data,f.api),/Administrator/);assert.equal(f.saved.length,0);
});
test('delete is reversible and restores an unchecked draft without approval',async()=>{
 const f=fixture();await bulkRecipeReview({...f.form,operation:'archive'},f.data,f.api);assert.ok(f.saved.every(r=>r.status==='Archived'&&r.fields.recipeStaging.deletedBy==='owner'));
 f.data.items=f.saved.map(r=>({...r,revision:2}));f.data.byId=new Map(f.data.items.map(r=>[r.id,r]));f.saved.length=0;
 const bin=recipeStagingPage(new URLSearchParams({view:'bin'}),f.data);assert.match(bin,/Restore selected/);assert.match(bin,/Recipe one/);assert.doesNotMatch(bin,/Approve recipes/);
 await bulkRecipeReview({...f.form,operation:'restore'},f.data,f.api);assert.ok(f.saved.every(r=>r.status==='Draft'&&r.source.needsChecking&&r.fields.recipeStaging.photoReview==='pending'&&!r.approval));
});
test('concurrent save failures report partial outcomes and never overwrite the changed recipe',async()=>{
 const f=fixture();const result=await bulkRecipeReview(f.form,f.data,async(path,options)=>{if(options.payload.item.endsWith('two'))throw Error('Conflict');return f.api(path,options);});assert.deepEqual(result,{saved:1,failed:1});assert.equal(f.saved.length,1);
});
test('all-recipes filter survives bulk and single forms and pagination',()=>{
 const f=fixture();f.data.items=Array.from({length:25},(_,i)=>({...f.data.items[0],id:'recipe-stage:'+i}));f.data.byId=new Map(f.data.items.map(r=>[r.id,r]));
 const html=recipeStagingPage(new URLSearchParams({match:''}),f.data);
 assert.match(html,/action="[^"]*&amp;match=" id="recipe-bulk-review"/);
 assert.match(html,/action="[^"]*&amp;match=" class="studio-form"/);
 assert.match(html,/href="[^"]*page=2&amp;match="/);
});
