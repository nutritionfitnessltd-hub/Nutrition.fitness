import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {RECIPES,RECIPE_BY_ID,COOKBOOKS} from '../public/recipes-data.mjs';
import {buildExperience,recipeCard,recipeSources} from '../src/experience.mjs';
import {bookPage} from '../src/cookbook-pages.mjs';
import * as C from '../public/meal-core.mjs';

const original=JSON.parse(await readFile(new URL('../data/cookbooks/high-protein-kitchen.json',import.meta.url),'utf8'));
let library={books:[],recipes:[]};
try{library=JSON.parse(await readFile(new URL('../data/cookbooks/recipe-library.json',import.meta.url),'utf8'));}
catch(error){if(error.code!=='ENOENT')throw error;}
const imported=library.recipes;
const html=new Map();
await buildExperience({page:async(url,title,body)=>{if(url.startsWith('/recipes/'))html.set(url,body);}});

test('the website contains every source record and keeps existing recipe objects unchanged',()=>{
 assert.equal(RECIPES.length,original.recipes.length+imported.length);
 assert.equal(new Set(RECIPES.map(r=>r.id)).size,RECIPES.length);
 for(const source of [...original.recipes,...imported])assert.deepEqual(RECIPE_BY_ID[source.id],source,source.id);
});

test('book filters count recipes once in each book where they appear',()=>{
 assert.equal(COOKBOOKS.length,library.books.length+1);
 for(const book of COOKBOOKS){
  const members=RECIPES.filter(r=>recipeSources(r).some(source=>source.id===book.id));
  assert.equal(book.recipeCount,members.length,book.title);
  assert.ok(html.get('/recipes/').includes(`value="${book.id}"`),book.title);
 }
 assert.equal(COOKBOOKS.find(b=>b.id==='high-protein-kitchen').recipeCount,100);
});

test('every catalogue page has its own method, source and usable planner link',()=>{
 for(const r of RECIPES){
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
  const card=recipeCard(r);
  if(r.image){assert.ok((await stat(new URL('../public'+r.image,import.meta.url))).size>1000,r.id);assert.ok(card.includes(`src="${r.image}"`),r.id);}
  else assert.match(card,/Photo not supplied/);
 }
});

test('all imported recipes can be saved, planned, shopped for and logged',{skip:!imported.length},()=>{
 for(const r of imported){
  const s=C.newState('2026-09-14');
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
 const s=C.newState('2026-09-14'),meal=C.addMeal(s,{recipeId:r.id,date:'2026-09-14',slot:r.category});
 C.logMeal(s,meal.id,1,'2026-09-14');
 const before=C.clone(s.logs),changed=C.clone(r);
 changed.servings*=2;
 C.saveRecipe(s,changed);
 assert.equal(C.findRecipe(s,r.id).nutritionStatus,'review-needed');
 assert.deepEqual(s.logs,before);
 assert.deepEqual(recipeSources(RECIPE_BY_ID[r.id]),recipeSources(r));
});

test('the original book opens only its own 100 recipes and category totals',()=>{
 assert.match(bookPage(),/href="\/recipes\/\?book=high-protein-kitchen">Explore all 100 recipes/);
 assert.match(bookPage(),/book=high-protein-kitchen&amp;category=Breakfast/);
});
