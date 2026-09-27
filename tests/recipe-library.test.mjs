import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {RECIPES,RECIPE_BY_ID,COOKBOOKS,RECIPE_BOOKS} from '../public/recipes-data.mjs';
import {buildExperience,recipeCard,recipeSources} from '../src/experience.mjs';
import {bookPage} from '../src/cookbook-pages.mjs';
import * as C from '../public/meal-core.mjs';
import {loadAccountRecipes} from '../public/recipe-access.mjs';

const original=JSON.parse(await readFile(new URL('../data/cookbooks/high-protein-kitchen.json',import.meta.url),'utf8'));
let library={books:[],recipes:[]};
try{library=JSON.parse(await readFile(new URL('../data/cookbooks/recipe-library.json',import.meta.url),'utf8'));}
catch(error){if(error.code!=='ENOENT')throw error;}
const imported=library.recipes;
const publication=JSON.parse(await readFile(new URL('../data/cookbooks/recipe-publication-status.json',import.meta.url),'utf8'));
const collection=JSON.parse(await readFile(new URL('../data/cookbooks/collection-assignments.json',import.meta.url),'utf8'));
const html=new Map();
await buildExperience({page:async(url,title,body)=>{if(url.startsWith('/recipes/'))html.set(url,body);}});

test('the website contains every source record and keeps existing recipe objects unchanged',()=>{
 assert.equal(RECIPES.length,original.recipes.length+imported.length);
 assert.equal(new Set(RECIPES.map(r=>r.id)).size,RECIPES.length);
 for(const source of original.recipes)assert.deepEqual(RECIPE_BY_ID[source.id],source,source.id);
 for(const source of imported){assert.equal(RECIPE_BY_ID[source.id].id,source.id);assert.equal(RECIPE_BY_ID[source.id].name,source.name);assert.equal(RECIPE_BY_ID[source.id].locked,true);}
});

test('source provenance still counts recipes once in every original book',()=>{
 assert.equal(COOKBOOKS.length,library.books.length+1);
 for(const book of COOKBOOKS){
  const members=[...original.recipes,...imported].filter(r=>recipeSources(r).some(source=>source.id===book.id));
  assert.equal(book.recipeCount,members.length,book.title);
 }
 assert.equal(COOKBOOKS.find(b=>b.id==='high-protein-kitchen').recipeCount,100);
});

test('principal recipe book assignments match the finished collection without changing source provenance',()=>{
 assert.deepEqual(RECIPE_BOOKS.map(book=>book.title),['The High Protein Kitchen','Breakfast, Sorted','Proper Everyday Food','The Big Night In','Air Fryer Favourites','Snack Happy','Blend & Go','More Plants, Please']);
 assert.equal(Object.keys(collection.assignments).length,imported.length);
 for(const recipe of imported)assert.equal(RECIPE_BY_ID[recipe.id].collectionBookId,collection.assignments[recipe.id],recipe.id);
 for(const recipe of original.recipes)assert.equal(RECIPE_BY_ID[recipe.id].collectionBookId,undefined,recipe.id);
 const held=new Set(publication.heldRecipeIds);
 for(const book of RECIPE_BOOKS.slice(1)){
  const ids=imported.filter(recipe=>collection.assignments[recipe.id]===book.id).map(recipe=>recipe.id);
  assert.equal(book.recipeCount,ids.length,book.title);
  assert.equal(book.heldRecipeCount,ids.filter(id=>held.has(id)).length,book.title);
  assert.equal(book.publishedRecipeCount,collection.publishedCounts[book.id],book.title);
 }
 assert.equal(RECIPE_BOOKS[0].recipeCount,100);
});

test('recipe browsing uses food filters and branded book names without publishing source-volume controls',()=>{
 const catalogue=html.get('/recipes/');
 for(const control of ['search','book','category','sort'])assert.match(catalogue,new RegExp(`data-recipe-${control}`));
 assert.match(catalogue,/Book<select data-recipe-book><option value="">All books<\/option>/);
 for(const book of RECIPE_BOOKS){const label=book.title.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll("'",'&#39;').replaceAll('<','&lt;').replaceAll('>','&gt;');assert.ok(catalogue.includes(`<option value="${book.id}">${label}</option>`),book.title);}
 const bookSelect=catalogue.match(/<select data-recipe-book>[\s\S]*?<\/select>/)?.[0]||'';
 assert.ok(bookSelect,'Book selector markup');
 assert.doesNotMatch(bookSelect,/DAGz[A-Za-z0-9_-]+|High-Protein|Med-Carb|Volume \d/);
 assert.match(catalogue,new RegExp(`data-catalogue-count="${RECIPES.length}"`));
 assert.match(catalogue,/data-original-recipes hidden/);
 assert.match(catalogue,/<nav class="food-access-nav" aria-label="Recipe access">[\s\S]*?href="\/recipes\/" data-access-all aria-current="page">All recipes<\/a>[\s\S]*?href="\/recipes\/\?book=high-protein-kitchen" data-access-free>100 free recipes<\/a>/);
 assert.match(catalogue,/data-all-recipes>Browse the full collection/);
 for(const r of RECIPES)assert.doesNotMatch(recipeCard(r),/Volume \d|Explore The High Protein Kitchen/);
 for(const r of imported){
  const page=html.get(`/recipes/${r.id}/`);
  assert.doesNotMatch(page,/Also in these books|href="\/recipes\/\?book=DAG/);
  assert.match(page,/Create a free account to unlock this recipe|We’re checking this recipe/);
  assert.doesNotMatch(page,/data-recipe-detail|data-ingredients|data-method|data-cook-mode/);
 }
});

test('every original free recipe keeps its method, source and usable planner link',()=>{
 for(const r of original.recipes){
  const page=html.get(`/recipes/${r.id}/`);
  assert.ok(page,r.id);
  assert.ok(page.includes(`data-recipe-detail="${r.id}"`),r.id);
  assert.ok(page.includes(`/meal-planner/add/?recipe=${r.id}`),r.id);
  assert.equal((page.match(/<li>/g)||[]).length,r.steps.length,r.id);
  const schema=JSON.parse(page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(schema.name,r.name);
  assert.deepEqual(schema.recipeInstructions.map(step=>step.text),r.steps);
  if(!r.nutrition||r.nutritionStatus==='review-needed')assert.equal(schema.nutrition,undefined);
  else assert.equal(schema.nutrition.proteinContent,`${r.nutrition.protein} g`);
 }
});

test('imported recipe photographs are local files and never substituted at render time',{skip:!imported.length},async()=>{
 for(const r of imported){
  const card=recipeCard(RECIPE_BY_ID[r.id]);
  if(r.image){assert.ok((await stat(new URL('../public'+r.image,import.meta.url))).size>1000,r.id);assert.ok(card.includes(`src="${r.image}"`),r.id);}
  else assert.match(card,/Photo not supplied/);
 }
});

test('previously saved personal copies of imported recipes can still be planned, shopped for and logged',{skip:!imported.length},()=>{
 for(const r of imported){
  const s=C.newState('2026-09-14');
  s.overrides.push(C.recipe(r));
  assert.equal(C.recipe(r).id,r.id);
  const meal=C.addMeal(s,{recipeId:r.id,date:'2026-09-14',slot:r.category,servings:r.servings});
  const shopping=C.shoppingList(s);
  for(const ingredient of r.ingredients)assert.ok(shopping.some(row=>row.name===ingredient.name&&row.unit===ingredient.unit),`${r.id}: ${ingredient.name}`);
  C.logMeal(s,meal.id,1,'2026-09-14');
  assert.deepEqual(C.importState(C.exportState(s)).logs[0].nutrition,C.portionNutrition(r,1),r.id);
  const saved=C.saveRecipe(s,C.clone(r));
  assert.deepEqual(saved.nutrition,r.nutrition,r.id);
  assert.equal(saved.nutritionStatus,r.nutritionStatus,r.id);
 }
});

test('editing an imported recipe preserves historical food and original book membership',{skip:!imported.length},()=>{
 const r=imported.find(x=>x.nutrition&&x.nutritionStatus==='source-estimate')||imported[0];
 const s=C.newState('2026-09-14');s.overrides.push(C.recipe(r));const meal=C.addMeal(s,{recipeId:r.id,date:'2026-09-14',slot:r.category});
 C.logMeal(s,meal.id,1,'2026-09-14');
 const before=C.clone(s.logs),changed=C.clone(r);
 changed.servings*=2;
 C.saveRecipe(s,changed);
 assert.equal(C.findRecipe(s,r.id).nutritionStatus,'review-needed');
 assert.deepEqual(s.logs,before);
 assert.equal(RECIPE_BY_ID[r.id].id,r.id);assert.equal(RECIPE_BY_ID[r.id].locked,true);
});

test('the original book opens only its own 100 recipes and category totals',()=>{
 assert.match(bookPage(),/href="\/recipes\/\?book=high-protein-kitchen">Explore all 100 recipes/);
 assert.match(bookPage(),/book=high-protein-kitchen&amp;category=Breakfast/);
});


test('the public catalogue carries exactly 100 full records and 499 metadata-only account previews',()=>{
 assert.equal(RECIPES.filter(C.isRecipeAvailable).length,100);
 assert.equal(RECIPES.filter(r=>r.access==='account').length,499);
 const allowed=new Set(['id','name','category','image','servings','servingLabel','prepMinutes','cookMinutes','waitMinutes','nutrition','nutritionStatus','collectionBookId','access','locked','publicationStatus']);
 for(const source of imported){
  const preview=RECIPE_BY_ID[source.id];
  assert.ok(Object.keys(preview).every(key=>allowed.has(key)),source.id);
  for(const key of ['ingredients','steps','notes','quote','description','sourceWarnings','sourceNutrition','sourceNutritionPrinted','nutritionSource','sourceBooks'])assert.equal(preview[key],undefined,source.id+': '+key);
  const page=html.get(`/recipes/${source.id}/`);
  assert.ok(page.includes(`data-recipe-locked="${source.id}"`));
  assert.doesNotMatch(page,/recipeIngredient|recipeInstructions|application\/ld\+json|data-recipe-yield|data-ingredients|data-method|data-recipe-detail/);
  assert.ok(!page.includes(`/meal-planner/add/?recipe=${source.id}`));
  for(const step of source.steps.filter(step=>step.length>35))assert.ok(!page.includes(step.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll("'",'&#39;').replaceAll('<','&lt;').replaceAll('>','&gt;')),source.id+' leaked method');
 }
 assert.equal(RECIPES.filter(r=>r.publicationStatus==='held').length,18);
 assert.equal(publication.nutritionReviewRecipeIds.length,39);
 for(const id of publication.nutritionReviewRecipeIds){assert.equal(RECIPE_BY_ID[id].nutrition,null,id);assert.equal(RECIPE_BY_ID[id].nutritionStatus,'review-needed',id);}
});

test('guest operations reject locked content while old plan IDs and immutable logs survive',()=>{
 const r=imported[0],s=C.newState('2026-09-14');
 s.plans[0].entries.push({id:'old-account-meal',recipeId:r.id,date:'2026-09-14',slot:r.category,servings:1,notes:'Keep this meal'});
 s.logs.push({id:'old-log',entryId:'old-account-meal',planId:s.activePlan,recipeId:r.id,name:r.name,date:'2026-09-14',slot:r.category,servings:1,nutrition:{protein:12,calories:200,carbs:30,fat:5},nutritionSource:'Previously logged snapshot',reviewNeeded:false,loggedAt:'2026-09-14T12:00:00Z'});
 s.favourites.push(r.id);s.collections.push({id:'saved',name:'Saved meals',recipes:[r.id]});
 const saved=C.importState(C.exportState(s));
 assert.deepEqual(saved.logs,s.logs);assert.equal(saved.plans[0].entries[0].recipeId,r.id);assert.deepEqual(saved.favourites,[r.id]);
 assert.throws(()=>C.addMeal(saved,{recipeId:r.id,date:'2026-09-14',slot:r.category}),/Account access|being checked/);
 assert.throws(()=>C.scaledIngredients(RECIPE_BY_ID[r.id],1),/Account access|being checked/);
 assert.throws(()=>C.saveRecipe(saved,r),/Account access|being checked/);
 assert.throws(()=>C.shoppingList(saved),/Shopping list incomplete/);
 const report=C.shoppingReport(saved);assert.equal(report.rows.length,0);assert.equal(report.unavailable[0].recipeId,r.id);
 assert.equal(C.dayTotals(saved,'2026-09-14').unknownPlanned,1);assert.equal(C.dayTotals(saved,'2026-09-14').eaten.protein,12);
 const logs=C.clone(saved.logs);C.editMeal(saved,'old-account-meal',{date:'2026-09-15'});assert.deepEqual(saved.logs,logs);
 saved.logs=[];assert.throws(()=>C.logMeal(saved,'old-account-meal',1,'2026-09-15'),/Account access|being checked/);
 C.editMeal(saved,'old-account-meal',{recipeId:original.recipes[0].id});assert.equal(C.shoppingReport(saved).unavailable.length,0);assert.ok(C.shoppingList(saved).length);
});

test('mixed shopping lists report every unavailable meal and retain all free ingredients',()=>{
 const s=C.newState('2026-09-14'),free=original.recipes[0],locked=imported[0];
 C.addMeal(s,{recipeId:free.id,date:'2026-09-14',slot:free.category});
 const expected=C.shoppingList(s);
 s.plans[0].entries.push({id:'old-private',recipeId:locked.id,date:'2026-09-14',slot:locked.category,servings:1,notes:''});
 assert.deepEqual(C.shoppingReport(s).rows,expected);
 assert.equal(C.shoppingReport(s).unavailable.length,1);
 assert.equal(C.shoppingReport(s,{dates:['2026-09-15']}).unavailable.length,0);
 assert.throws(()=>C.shoppingList(s),/Shopping list incomplete/);
});

test('only the successful server-authorised API response opens account content, and failure clears it',async()=>{
 const r=imported.find(recipe=>RECIPE_BY_ID[recipe.id].publicationStatus==='published'),payload={...r,publicationStatus:'published'};
 const s=C.newState('2026-09-14');
 for(const response of [new Response('{}',{status:503}),new Response('{}',{status:401}),new Response(JSON.stringify({access:'free',recipes:[payload]})),new Response(JSON.stringify({access:'verified-account',recipes:[{id:r.id}]}))]){
  const result=await loadAccountRecipes({fetcher:async()=>response});assert.equal(result.available,0);assert.equal(C.isRecipeAvailable(C.findRecipe(s,r.id)),false);
 }
 let options;
 const result=await loadAccountRecipes({fetcher:async(url,opts)=>{assert.equal(url,'/api/recipes?scope=accessible');options=opts;return new Response(JSON.stringify({access:'verified-account',recipes:[...original.recipes,payload]}));}});
 assert.equal(result.available,1);assert.equal(options.credentials,'same-origin');assert.equal(options.cache,'no-store');
 const entry=C.addMeal(s,{recipeId:r.id,date:'2026-09-14',slot:r.category});assert.ok(C.shoppingList(s).length);C.logMeal(s,entry.id,1,'2026-09-14');
 const before=C.exportState(s);assert.equal(s.overrides.length,0);
 await loadAccountRecipes({fetcher:async()=>{throw new Error('offline');}});
 assert.equal(C.isRecipeAvailable(C.findRecipe(s,r.id)),false);assert.equal(C.exportState(s),before);assert.throws(()=>C.shoppingList(s),/Shopping list incomplete/);
 const held=imported.find(recipe=>RECIPE_BY_ID[recipe.id].publicationStatus==='held');
 assert.equal((await loadAccountRecipes({fetcher:async()=>new Response(JSON.stringify({access:'verified-account',recipes:[{...held,publicationStatus:'published'}]}))})).available,0);
});
