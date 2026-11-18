import { randomUUID } from 'node:crypto';
import { mealPlanLengths, recipeCandidates } from './studio-mealplans.mjs';
import { recipeImage, recipePreview } from './studio-recipes.mjs';
import { esc, url, heading, button, hidden, input, textarea, select, form, badge } from './studio-ui.mjs';

export function mealPlanForm(data,values={},record=null){
  const count=recipeCandidates(data).length;
  const v={...record?.fields,...values},packs=v.packSizes||{};
  return '<section class="panel meal-plan-builder">'+heading(record?'Plan settings':'Create a meal plan','Describe the food you have in mind. Start with your Nutrition.fitness recipes.')+
    '<p class="meta">'+count+' complete library recipes available · Breakfast, lunch and dinner</p>'+
    form('mealplan-generate',hidden('id',record?.id||values.id||randomUUID())+(record?hidden('revision',record.revision):'')+
      textarea('brief','What would you like to eat?',v.brief||'',3)+
      '<p class="meta">For example: “Mediterranean-inspired meals, quick weekday dinners, plenty of vegetables.”</p>'+
      '<div class="studio-columns">'+select('days','Plan length',Object.fromEntries(mealPlanLengths.map(n=>[n,n+' days'])),(!Array.isArray(v.days)&&v.days)||v.durationDays||7)+input('servings','People',v.servings||1,'number','min="1" max="12" required')+'</div>'+
      select('reuse','Make the most of your food',{ingredients:'Use the same packs for dinner and the next day’s lunch',leftovers:'Cook extra dinner portions for the next day’s lunch',off:'Plan each meal independently'},v.reuse||'ingredients')+
      '<details><summary>Pack sizes (optional)</summary><p>Enter the packs you buy. We’ll show the amount used and any remainder where recipes share a compatible ingredient.</p><div class="studio-columns">'+input('chickenPackGrams','Chicken breast pack (g)',v.chickenPackGrams??packs.chicken??'','number','min="0" max="10000" step="any"')+input('salmonPackGrams','Salmon fillet pack (g)',v.salmonPackGrams??packs.salmon??'','number','min="0" max="10000" step="any"')+'</div></details>'+
      select('recipeMode','Recipe choices',{library:'Use our recipes only',extend:'Our recipes first; draft new recipes to fill gaps'},v.recipeMode||'library')+
      select('images','Recipe pictures',{existing:'Use existing recipe photographs',generated:'Existing photographs + optional natural-style generated images'},v.images||v.imagePreference||'existing')+
      '<p class="meta">New recipe images can be generated individually after reviewing the plan. Existing photographs are kept.</p>'+
      textarea('exclude','Ingredients to exclude (comma-separated)',v.exclude||'',2)+
      (!record&&data.actor.role!=='admin'?select('project','Project',Object.fromEntries(data.projects.map(p=>[p.id,p.name])),values.project||''):'')+
      (record?'<p>Regenerating replaces this draft’s menu. The previous saved version stays in version history.</p>':''),
      {section:record?'item':'create',...(record?{id:record.id}:{template:'mealplan'})},record?'Regenerate meal plan':'Create meal plan draft');
}
const imageUrl=(record,recipe)=>recipe.fields.imageAsset?url('mealplan-image',{id:record.id,recipe:recipe.id}).replaceAll('&amp;','&'):recipeImage(recipe);
export function mealPlanPage(params,data,record){
  const f=record.fields,canEdit=data.actor.role==='admin'||data.assigned.has(record.id);
  const recipes=new Map([...data.items,...(f.generatedRecipes||[])].map(r=>[r.id,r]));
  const weeks=Math.ceil(f.days.length/7),selected=Math.max(1,Math.min(weeks,Number(params.get('week'))||1));
  const totals=f.days.flatMap(d=>d.meals),libraryMeals=totals.filter(m=>!m.recipeId.startsWith('new-')).length;
  let out='<a class="back" href="'+url('library',{kind:'mealplan',bucket:'drafts'})+'">← Meal plans</a>'+heading(record.title,f.durationDays+' days · '+f.servings+' '+(f.servings===1?'person':'people'),canEdit?button('Edit & review',url('item',{id:record.id,tab:'edit'})):'')+
    '<p>'+badge(record.status)+' <span class="meta">'+libraryMeals+' of '+totals.length+' meals from your library</span></p><p class="prose">'+esc(f.introduction||f.brief)+'</p>'+
    '<nav class="tabs" aria-label="Meal plan weeks">'+Array.from({length:weeks},(_,i)=>'<a href="'+url('item',{id:record.id,week:i+1})+'"'+(i+1===selected?' aria-current="page"':'')+'>Week '+(i+1)+'</a>').join('')+'</nav><div class="meal-plan-days">';
  for(const day of f.days.slice((selected-1)*7,selected*7)){
    out+='<section class="panel meal-plan-day"><h2>Day '+day.day+'</h2><div class="meal-plan-meals">';
    for(const meal of day.meals){
      const r=recipes.get(meal.recipeId),photo=r&&imageUrl(record,r),generated=meal.recipeId.startsWith('new-');
      out+='<article class="meal-plan-meal">'+(photo?'<img src="'+esc(photo)+'" alt="'+esc(r.title)+'" loading="lazy">':'')+
        '<div><p class="meal-slot">'+esc(meal.slot)+'</p><h3>'+(r?'<a href="'+(generated?'#'+esc(r.id):url('item',{id:r.id}))+'">'+esc(r.title)+'</a>':'Recipe unavailable')+'</h3><small>'+esc(generated?'New recipe draft':'Nutrition.fitness recipe')+' · '+meal.servings+' portions</small>'+
        (meal.note?'<p class="meal-reuse-note">'+esc(meal.note)+'</p>':'')+'</div></article>';
    }
    out+='</div></section>';
  }
  out+='</div><section class="panel"><h2>Week '+selected+' shopping list</h2><p>Quantities cover the portions you will cook. Lunch leftovers are already included in dinner quantities.</p><ul class="meal-shopping">'+(f.shoppingList||[]).filter(i=>i.week===selected).map(i=>'<li><strong>'+esc(i.quantity===null?'Check amount':i.quantity+' '+i.unit)+'</strong> '+esc(i.name)+(i.optional?' (optional)':'')+(i.notes.length?'<small>'+esc(i.notes.join(' '))+'</small>':'')+'</li>').join('')+'</ul></section>';
  if(f.reuseLinks?.length)out+='<details class="panel"><summary>Ingredient &amp; leftover plan</summary><ul>'+f.reuseLinks.map(l=>'<li>'+esc(l.note)+'</li>').join('')+'</ul></details>';
  if(f.reuse!=='off')out+='<p class="meta">Keep raw ingredients chilled and follow pack use-by dates and storage instructions. For cooked leftovers, cool and refrigerate within 1–2 hours and eat within 48 hours; cool rice within 1 hour and use within 24 hours. Reheat only once, until steaming hot throughout. <a href="https://www.food.gov.uk/safety-hygiene/chilling" target="_blank" rel="noopener">Food Standards Agency storage guidance</a>.</p>';
  if(f.generatedRecipes?.length)out+='<section><h2>New recipe drafts</h2>'+f.generatedRecipes.map(r=>'<section id="'+esc(r.id)+'" class="panel">'+recipePreview(r)+
    (r.fields.imageAsset?'<figure><img class="meal-generated-photo" src="'+esc(imageUrl(record,r))+'" alt="'+esc(r.title)+'"><figcaption>AI-generated serving suggestion. Review against the ingredients and method.</figcaption></figure>':canEdit&&f.imagePreference==='generated'?form('mealplan-image-generate',hidden('revision',record.revision)+hidden('recipe',r.id),{section:'item',id:record.id},'Generate a natural-style food image'):'')+'</section>').join('')+'</section>';
  out+='<details class="panel"><summary>Notes to check</summary><p>'+esc(f.notes||'')+'</p><ul>'+(f.reviewNotes||[]).map(n=>'<li>'+esc(n)+'</li>').join('')+'</ul></details>';
  if(canEdit)out+='<details class="panel"><summary>Change the plan settings</summary>'+mealPlanForm(data,{},record)+'</details>';
  return out;
}
