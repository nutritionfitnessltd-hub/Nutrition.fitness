import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildMealPlan, generateMealPlan, mealPlanOptions, recipeCandidates, refreshMealPlan, packKey } from '../server/studio-mealplans.mjs';
import { generateMealPhoto, mealPhotoPrompt, sendMealPhoto } from '../server/studio-mealplan-images.mjs';
import { createPage, itemPage } from '../server/studio-pages.mjs';
import { handleStudio } from '../server/studio.mjs';
import { changeStudio } from '../server/studio-actions.mjs';

const recipe=(id,title,name,quantity,unit='g')=>({id,kind:'recipe',status:'Approved',title,revision:0,fields:{recipeText:'Original source',servings:2,category:id==='breakfast'?'Breakfast':'Main',ingredients:[{name,quantity,unit}],instructions:['Cook as directed in the original recipe.'],imageUrl:'/assets/cookbook/recipe-001.webp'}});
const recipes=[recipe('breakfast','Greek yoghurt','Greek yoghurt',400),recipe('chicken','Lemon chicken','Chicken breast',400),recipe('lunch','Chicken salad','Chicken breast',200),recipe('salmon','Salmon traybake','Salmon fillet',300)];
const data=()=>({actor:{role:'admin',id:randomUUID()},items:structuredClone(recipes),byId:new Map(recipes.map(r=>[r.id,r])),assigned:new Set(),projects:[],people:[],tasks:[],index:{records:recipes,files:{}}});
const options=(values={})=>mealPlanOptions({brief:'Mediterranean-inspired meals',...values});
const proposal=(days=7)=>({introduction:'A Mediterranean-inspired menu.',days:Array.from({length:days},(_,i)=>({day:i+1,breakfast:'breakfast',lunch:'lunch',dinner:'chicken'})),generatedRecipes:[],notes:''});
const aiResponse=fields=>({ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({title:'Mediterranean menu',fields,notes:'Review the menu.'})}]}]})});
const newRecipe={id:'new-beans',title:'Lemon beans',servings:2,ingredients:[{name:'White beans',quantity:400,unit:'g',note:''}],instructions:['Warm the beans with lemon.']};
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.body=v;}});

test('all four durations have complete days; invalid or missing choices are rejected',()=>{
  for(const days of [7,14,21,28]){
    const plan=buildMealPlan(proposal(days),recipes,options({days}));
    assert.equal(plan.days.length,days);assert.equal(plan.days.flatMap(d=>d.meals).length,days*3);
    assert.equal(plan.shoppingList.at(-1).week,days/7);
  }
  for(const days of [0,8,29,'oops'])assert.throws(()=>options({days}),/7, 14, 21 or 28/);
  for(const servings of [0,1.5,13])assert.throws(()=>options({servings}),/people/);
  assert.throws(()=>mealPlanOptions({}),/Describe/);
  assert.throws(()=>buildMealPlan(proposal(6),recipes,options()),/every requested day/);
  const p=proposal();p.days[3].day=3;assert.throws(()=>buildMealPlan(p,recipes,options()),/repeated days/);
});
test('pack reuse scales recipe yield and calculates actual packs without merging incompatible cuts',()=>{
  const plan=buildMealPlan(proposal(),recipes,options({servings:2,chickenPackGrams:600}));
  assert.equal(plan.reuseLinks.length,6);assert.equal(plan.reuseLinks[0].grams,600);
  assert.match(plan.reuseLinks[0].note,/1 × 600 g pack; 0 g left/);
  assert.equal(plan.shoppingList.find(i=>i.name==='Chicken breast').quantity,4200);
  assert.equal(packKey('Smoked salmon fillet'),'');assert.equal(packKey('Chicken thigh'),'');assert.equal(packKey('Cooked chicken breast'),'');
  const off=buildMealPlan(proposal(),recipes,options({reuse:'off'}));assert.equal(off.reuseLinks.length,0);
  const unmeasured=structuredClone(recipes);unmeasured[1].fields.ingredients[0].quantity=null;
  const noClaims=buildMealPlan(proposal(),unmeasured,options());assert.equal(noClaims.reuseLinks.length,0);assert.match(noClaims.reviewNotes.join(' '),/No pack savings/);
});
test('cook-once lunches reserve portions, avoid double counting and work across week boundaries',()=>{
  const plan=buildMealPlan(proposal(14),recipes,options({days:14,reuse:'leftovers',servings:2}));
  assert.equal(plan.days[0].meals[2].cookServings,4);
  assert.equal(plan.days[1].meals[1].cookServings,0);
  assert.equal(plan.days[7].meals[1].leftoverFromDay,7);
  assert.equal(plan.days[13].meals[2].cookServings,2);
  assert.equal(plan.shoppingList.filter(i=>i.name==='Chicken breast').reduce((sum,i)=>sum+i.quantity,0),11000);
  assert.equal(plan.shoppingList.find(i=>i.week===1&&i.name==='Chicken breast').quantity,5800);
});
test('shared packs support counted breasts and explicit per-piece weights without guessing grams',()=>{
 const rs=structuredClone(recipes);rs[1].fields.ingredients=[{name:'Chicken breast',quantity:2,unit:'',note:'125g per breast'}];rs[2].fields.ingredients=[{name:'Chicken breast',quantity:2,unit:'',note:'125g per breast'}];
 const plan=buildMealPlan(proposal(),rs,options({servings:2}));assert.equal(plan.reuseLinks[0].grams,500);
 rs[1].fields.ingredients[0].note='';rs[2].fields.ingredients[0].note='';
 const counted=buildMealPlan(proposal(),rs,options({servings:2,chickenPackGrams:600}));assert.equal(counted.reuseLinks[0].grams,0);assert.match(counted.reuseLinks[0].note,/4 pieces/);assert.match(counted.reuseLinks[0].note,/Weigh/);assert.doesNotMatch(counted.reuseLinks[0].note,/600 g pack/);
});
test('recipe IDs, exclusions and library priority are enforced on model output',()=>{
  const bad=proposal();bad.days[0].dinner='invented';assert.throws(()=>buildMealPlan(bad,recipes,options()),/outside/);
  assert.throws(()=>buildMealPlan(proposal(),recipes,options({exclude:'chicken'})),/outside/);
  const p=proposal();p.generatedRecipes=[newRecipe];p.days[0].dinner=newRecipe.id;
  assert.throws(()=>buildMealPlan(p,recipes,options()),/new recipes/);
  const plan=buildMealPlan(p,recipes,options({recipeMode:'extend',reuse:'off'}));
  assert.equal(plan.generatedRecipes.length,1);assert.equal(plan.generatedRecipes[0].fields.nutrition,null);
  p.days.forEach(d=>{d.dinner=newRecipe.id;d.lunch=newRecipe.id;});
  assert.throws(()=>buildMealPlan(p,recipes,options({recipeMode:'extend'})),/too many new recipes/);
  const incomplete={...newRecipe,ingredients:[]};p.generatedRecipes=[incomplete];assert.throws(()=>buildMealPlan(p,recipes,options({recipeMode:'extend'})),/missing/);
  const d=data();d.items.push({...recipes[0],id:'archived',status:'Archived'});assert.equal(recipeCandidates(d).length,4);
  d.actor.role='staff';d.items[0].status='Draft';assert.equal(recipeCandidates(d).length,3);
});
test('AI receives real recipe IDs, quantities, requested duration and reuse constraints',async()=>{
  let request;
  const plan=await generateMealPlan({env:{OPENAI_API_KEY:'test-only'},data:data(),options:options({days:28}),fetcher:async(_,init)=>{request=JSON.parse(init.body);return aiResponse(proposal(28));}});
  const input=JSON.parse(request.input);assert.equal(input.context.recipes.length,4);
  assert.equal(input.context.recipes[1].ingredients[0].quantity,400);
  assert.match(input.request,/exactly 28/);assert.match(input.request,/NEXT day/);assert.match(input.request,/ONLY supplied/);
  assert.equal(plan.fields.days.length,28);assert.equal(request.store,false);
  assert.deepEqual(request.text.format.schema.$defs.recipeId.enum,['r1','r2','r3','r4']);
  assert.equal(request.text.format.schema.properties.fields.properties.days.items.properties.dinner.$ref,'#/$defs/recipeId');
});
test('creation form and saved menu offer all durations, source photos and accessible weekly navigation',()=>{
  const d=data(),form=createPage(new URLSearchParams({template:'mealplan'}),d);
  for(const n of [7,14,21,28])assert.match(form,new RegExp('value="'+n+'"'));
  assert.match(form,/name="reuse"/);assert.match(form,/name="recipeMode"/);assert.match(form,/name="images"/);
  const record={id:'studio:plan',kind:'mealplan',title:'Mediterranean menu',status:'Draft',revision:1,fields:buildMealPlan(proposal(28),recipes,options({days:28}))};d.byId.set(record.id,record);
  const html=itemPage(new URLSearchParams({id:record.id,week:'4'}),d);
  assert.match(html,/Day 28/);assert.doesNotMatch(html,/<h2>Day 1<\/h2>/);assert.match(html,/Week 4 shopping list/);assert.match(html,/value="28" selected/);assert.match(html,/assets\/cookbook\/recipe-001.webp/);
});
test('creation route persists the entire plan and failed drafting keeps inputs without writes',async()=>{
  const d=data(),id=randomUUID(),saved=[];
  const api=async(path,opts)=>{if(path.includes('rpc/nufi_studio_save')){saved.push(opts.payload);return [{revision:1}];}return [];};
  const args={params:new URLSearchParams({studio:'create',template:'mealplan'}),actor:d.actor,api,load:async()=>d.index,env:{OPENAI_API_KEY:'test'},fetcher:async()=>aiResponse(proposal(14))};
  const res=response();await handleStudio({method:'POST',body:{action:'mealplan-generate',id,brief:'Mediterranean',days:'14',servings:'2',reuse:'ingredients'}},res,args);
  assert.equal(res.statusCode,303);assert.equal(saved.length,1);assert.equal(saved[0].document.fields.days.length,14);assert.equal(saved[0].document.status,'Draft');assert.equal(saved[0].document.approval,undefined);
  const fail=response();await handleStudio({method:'POST',body:{action:'mealplan-generate',id:randomUUID(),brief:'Mediterranean',days:'14'}},fail,{...args,fetcher:async()=>aiResponse(proposal(7))});
  assert.equal(fail.statusCode,400);assert.match(fail.body,/Mediterranean/);assert.match(fail.body,/value="14" selected/);assert.equal(saved.length,1);
});
test('manual edits recalculate shopping quantities and cannot forge image paths or bypass day counts',async()=>{
  const d=data(),p=proposal();p.generatedRecipes=[newRecipe];p.days[0].dinner='new-beans';
  const fields=buildMealPlan(p,recipes,options({recipeMode:'extend',reuse:'off'}));
  const old=structuredClone(fields);fields.servings=2;fields.shoppingList=[];fields.generatedRecipes[0].fields.imageAsset={pathname:'fake'};
  const fresh=refreshMealPlan(fields,d,old);assert.ok(fresh.shoppingList.length);assert.equal(fresh.generatedRecipes[0].fields.imageAsset,undefined);
  assert.equal(fresh.shoppingList.find(i=>i.name==='White beans').quantity,400);
  const r={id:'studio:plan',kind:'mealplan',title:'Plan',revision:1,status:'Draft',fields:old};d.byId.set(r.id,r);
  let write;
  await changeStudio(new URLSearchParams({id:r.id}),{action:'content-save',revision:1,title:'Plan',fields:JSON.stringify(fields)},d,async(_,o)=>{write=o.payload.document;return [1];});
  assert.ok(write.fields.shoppingList.length);
  fields.days.pop();assert.throws(()=>refreshMealPlan(fields,d,old),/every requested day/);
});
test('a four-week shopping list over 500 entries remains editable and is recalculated',async()=>{
 const d=data(),fields=buildMealPlan(proposal(28),recipes,options({days:28}));fields.shoppingList=Array.from({length:579},()=>({name:'Derived shopping row'}));
 const r={id:'studio:long-plan',kind:'mealplan',title:'Plan',revision:1,status:'Draft',fields};d.byId.set(r.id,r);let saved;
 await changeStudio(new URLSearchParams({id:r.id}),{action:'content-save',revision:1,title:r.title,fields:JSON.stringify(fields)},d,async(_,o)=>{saved=o.payload.document;return [1];});
 assert.ok(saved.fields.shoppingList.length);assert.ok(saved.fields.shoppingList.every(i=>i.name!=='Derived shopping row'));
});

test('save and mark checked recalculates the posted meal plan in the same revision',async()=>{
 const d=data(),fields=buildMealPlan(proposal(),recipes,options({reuse:'off'}));
 const r={id:'studio:checked-plan',kind:'mealplan',title:'Plan',revision:1,status:'Draft',fields};
 d.byId.set(r.id,r);d.items.push(r);
 const edited=structuredClone(fields);edited.servings=2;edited.shoppingList=[];
 const writes=[];
 await changeStudio(new URLSearchParams({id:r.id}),{action:'content-save',revision:1,title:'Checked menu',fields:JSON.stringify(edited),intent:'approve'},d,async(_,o)=>{writes.push(o.payload);return [{revision:2}];});
 assert.equal(writes.length,1);
 assert.equal(writes[0].document.status,'Approved');
 assert.equal(writes[0].document.approval.revision,2);
 assert.equal(writes[0].document.fields.servings,2);
 assert.ok(writes[0].document.fields.shoppingList.length);
 const html=itemPage(new URLSearchParams({id:r.id,tab:'edit'}),d);
 assert.match(html,/value="approve"/);assert.match(html,/Change the plan settings/);
 assert.doesNotMatch(html,/<h2>Review<\/h2>/);
});
test('photo generation uses a natural recipe-specific brief and private checked image bytes',async()=>{
  const r={title:newRecipe.title,fields:newRecipe};let payload,stored;
  assert.match(mealPhotoPrompt(r),/Soft window light/);assert.match(mealPhotoPrompt(r),/White beans/);
  const bytes=Buffer.from('RIFFxxxxWEBPtest');
  const asset=await generateMealPhoto({env:{OPENAI_API_KEY:'test',BLOB_READ_WRITE_TOKEN:'test-storage'},recipe:r,fetcher:async(_,o)=>{payload=JSON.parse(o.body);return {ok:true,json:async()=>({data:[{b64_json:bytes.toString('base64')}]})};},store:async(...args)=>{stored=args;}});
  assert.equal(payload.output_format,'webp');assert.equal(stored[2].access,'private');assert.equal(asset.generated,true);assert.match(asset.pathname,/meal-photos\/v1\/[a-f0-9]{64}\.webp/);
  await assert.rejects(generateMealPhoto({env:{},recipe:r}),/connection/);
  await assert.rejects(generateMealPhoto({env:{OPENAI_API_KEY:'test',BLOB_READ_WRITE_TOKEN:'test'},recipe:r,fetcher:async()=>({ok:true,json:async()=>({data:[{b64_json:'bm90LWltYWdl'}]})})}),/format/);
});
test('private generated images require an assigned editor and a stored allowlisted path',async()=>{
  const d=data();d.actor.role='staff';d.byId.set('plan',{id:'plan',kind:'mealplan',fields:{generatedRecipes:[]}});
  await assert.rejects(sendMealPhoto({method:'GET'},response(),new URLSearchParams({id:'plan',recipe:'new-x'}),d),e=>e.status===403);
  d.assigned.add('plan');await assert.rejects(sendMealPhoto({method:'GET'},response(),new URLSearchParams({id:'plan',recipe:'new-x'}),d),e=>e.status===404);
});
test('generated recipe photos use one escaped private image URL in menu cards and full recipe',()=>{
 const d=data(),p=proposal();p.generatedRecipes=[newRecipe];p.days[0].dinner=newRecipe.id;
 const fields=buildMealPlan(p,recipes,options({recipeMode:'extend',images:'generated',reuse:'off'}));
 fields.generatedRecipes[0].fields.imageAsset={pathname:'nutrition-library/meal-photos/v1/'+'a'.repeat(64)+'.webp',type:'image/webp'};
 const record={id:'studio:plan',kind:'mealplan',title:'Plan',status:'Draft',revision:1,fields};d.byId.set(record.id,record);
 const html=itemPage(new URLSearchParams({id:record.id}),d);
 assert.equal((html.match(/src="\/content-library\/\?work=1&amp;studio=mealplan-image&amp;id=studio%3Aplan&amp;recipe=new-beans"/g)||[]).length,2);
 assert.doesNotMatch(html,/amp;amp/);
});
