import { HttpError } from './platform.mjs';
import { cleanText } from './studio-model.mjs';
import { generateDraft } from './studio-ai.mjs';

export const mealPlanLengths=[7,14,21,28];
export const mealSlots=['breakfast','lunch','dinner'];
const fail=message=>{throw new HttpError(400,message);};
const normal=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export const ingredientName=i=>typeof i==='string'?i:i.name||i.sourceText||'';
export function mealPlanOptions(f={}){
  const days=Number(f.days??7),servings=Number(f.servings??1);
  if(!mealPlanLengths.includes(days))fail('Choose 7, 14, 21 or 28 days.');
  if(!Number.isInteger(servings)||servings<1||servings>12)fail('Choose between 1 and 12 people.');
  const brief=cleanText(f.brief||'',4000);if(!brief)fail('Describe the meals you would like.');
  const reuse=f.reuse||'ingredients',recipeMode=f.recipeMode||'library',images=f.images||'existing';
  if(!['off','ingredients','leftovers'].includes(reuse)||!['library','extend'].includes(recipeMode)||!['existing','generated'].includes(images))fail('Choose valid meal planning options.');
  const packs={};
  for(const key of ['chicken','salmon']){
    const grams=Number(f[key+'PackGrams']||0);
    if(!Number.isFinite(grams)||grams<0||grams>10000)fail('Enter pack sizes in grams, up to 10,000 g.');
    packs[key]=grams;
  }
  return {brief,days,servings,reuse,recipeMode,images,packs,exclude:cleanText(f.exclude||'',500)};
}
export function recipeCandidates(data){
  return data.items.filter(r=>r.kind==='recipe'&&r.status!=='Archived'&&Number(r.fields?.servings)>0&&
    r.fields?.ingredients?.length&&r.fields?.instructions?.some(s=>typeof s==='string'&&s.trim())&&
    (data.actor.role==='admin'||data.assigned.has(r.id)||r.status==='Approved'));
}
const excluded=(r,options)=>options.exclude.split(/[,;\n]/).map(normal).filter(Boolean).some(term=>normal([r.title,...r.fields.ingredients.map(ingredientName),(r.fields.allergens||[]).join(' ')].join(' ')).includes(term));
const matchesCuisine=(r,options)=>!/mediterranean|medateranitan|mediteranian|mediteranean/i.test(options.brief)||!/\b(asian|thai|teriyaki|burrito|cajun|mexican|taco|fajita|korean|chinese|japanese|bang bang|satay|tikka|tandoori|curry|sweet chilli)\b/i.test(r.title);

// Only match interchangeable raw cuts. Smoked fish, mince and cooked meat are not the same pack.
export function packKey(name){
  const n=normal(name);
  if(/\b(smoked|cooked|canned|tinned|ground|mince|thigh|wing|whole|breaded)\b/.test(n))return '';
  if(/\bchicken\b/.test(n)&&/\bbreasts?\b/.test(n))return 'chicken';
  if(/\bsalmon\b/.test(n)&&/\bfillets?\b/.test(n))return 'salmon';
  return '';
}
function amount(i){
  if(!i||typeof i!=='object'||!Number.isFinite(i.quantity)||i.quantity<=0)return null;
  const unit=normal(i.unit),factor=unit==='kg'?1000:unit==='l'?1000:1;
  return {quantity:i.quantity*factor,unit:unit==='kg'?'g':unit==='l'?'ml':unit};
}
function proteinUse(r,key,servings){
  const parts=r.fields.ingredients.filter(i=>packKey(ingredientName(i)+' '+(i.note||''))===key).map(i=>{
    const a=amount(i);if(!a)return null;
    const perPiece=String(i.note||'').match(/(\d+(?:\.\d+)?)\s*g(?:\s+or\s+[\d.]+\s*oz)?\s+per\s+(?:breast|fillet)/i);
    if(a.unit==='g')return {quantity:a.quantity*servings/r.fields.servings,unit:'g'};
    if(['','each','breast','breasts','fillet','fillets'].includes(a.unit))return {quantity:a.quantity*servings/r.fields.servings*(perPiece?Number(perPiece[1]):1),unit:perPiece?'g':'pieces'};
    return null;
  }).filter(Boolean);
  if(!parts.length||new Set(parts.map(p=>p.unit)).size!==1)return null;
  return {quantity:parts.reduce((sum,p)=>sum+p.quantity,0),unit:parts[0].unit};
}
function sharedPack(a,b,servings){
  return ['chicken','salmon'].find(key=>proteinUse(a,key,servings)&&proteinUse(b,key,servings))||'';
}
function validateGenerated(recipes,options){
  if(!Array.isArray(recipes)||recipes.length>12||(options.recipeMode==='library'&&recipes.length))fail('The draft used new recipes when library recipes were requested.');
  const ids=new Set();
  return recipes.map(r=>{
    if(!/^new-[a-z0-9-]{1,60}$/.test(r.id)||ids.has(r.id))fail('The draft returned an invalid new recipe reference.');
    ids.add(r.id);
    if(!r.title?.trim()||!Number.isFinite(r.servings)||r.servings<=0||r.servings>12||!Array.isArray(r.ingredients)||!r.ingredients.length||!Array.isArray(r.instructions)||!r.instructions.length)fail('A new recipe is missing its yield, ingredients or method.');
    const ingredients=r.ingredients.map(i=>{
      if(!i||typeof i.name!=='string'||!i.name.trim()||typeof i.unit!=='string'||!(i.quantity===null||(Number.isFinite(i.quantity)&&i.quantity>0)))fail('Check the new recipe ingredient quantities.');
      return {name:cleanText(i.name,160),quantity:i.quantity,unit:cleanText(i.unit,30),note:cleanText(i.note||'',300)};
    });
    const recipe={id:r.id,title:cleanText(r.title,200),kind:'recipe',status:'Draft',fields:{servings:r.servings,ingredients,instructions:r.instructions.map(s=>cleanText(s,2000)),nutrition:null,allergens:[],allergenNote:'Check all ingredient labels and the requested exclusions before approval.',imageUrl:'',imageNote:'',recipeSource:'New AI-assisted recipe draft; review the method and quantities before publishing.'}};
    if(recipe.fields.instructions.some(s=>!s)||excluded(recipe,options))fail('A new recipe is incomplete or includes an excluded ingredient.');
    return recipe;
  });
}
export function buildMealPlan(proposal,candidates,options){
  const generated=validateGenerated(proposal.generatedRecipes||[],options);
  const available=candidates.filter(r=>!excluded(r,options)&&matchesCuisine(r,options));
  const byId=new Map([...available,...generated].map(r=>[r.id,r]));
  if(!Array.isArray(proposal.days)||proposal.days.length!==options.days)fail('The draft did not include every requested day. Try generating it again.');
  const days=proposal.days.map((d,index)=>{
    if(d.day!==index+1)fail('The draft has missing or repeated days.');
    const meals=mealSlots.map(slot=>{
      const id=d[slot];if(typeof id!=='string'||!byId.has(id))fail('The draft referenced a recipe outside the available library.');
      return {slot,recipeId:id,servings:options.servings,cookServings:options.servings,leftoverFromDay:0,note:''};
    });
    return {day:index+1,meals,recipeIds:meals.map(m=>m.recipeId)};
  });
  // Prioritising the library is enforced, not merely suggested in a prompt.
  if(available.length&&days.flatMap(d=>d.meals).filter(m=>m.recipeId.startsWith('new-')).length>Math.floor(options.days*3/4))fail('The draft used too many new recipes. Regenerate using the Nutrition.fitness library first.');
  const reuseLinks=[];
  for(let index=1;index<days.length;index++){
    const dinner=days[index-1].meals[2],lunch=days[index].meals[1],a=byId.get(dinner.recipeId),b=byId.get(lunch.recipeId);
    if(options.reuse==='leftovers'){
      lunch.recipeId=dinner.recipeId;lunch.cookServings=0;lunch.leftoverFromDay=index;
      dinner.cookServings+=options.servings;
      dinner.note=`Cook ${dinner.cookServings} portions; set aside ${options.servings} for tomorrow’s lunch.`;
      lunch.note=`Use the ${options.servings} portions set aside from Day ${index} dinner.`;
      reuseLinks.push({fromDay:index,toDay:index+1,type:'leftovers',ingredient:'',grams:0,note:dinner.note});
    }else if(options.reuse==='ingredients'){
      const key=sharedPack(a,b,options.servings);
      if(key){
        const first=proteinUse(a,key,options.servings),second=proteinUse(b,key,options.servings),measured=first.unit==='g'&&second.unit==='g',total=first.quantity+second.quantity,pack=options.packs[key],ingredient=key==='chicken'?'chicken breast':'salmon fillet';
        const quantities=first.unit===second.unit?`${Math.round(total*100)/100} ${first.unit}`:`${Math.round(first.quantity*100)/100} ${first.unit} for dinner and ${Math.round(second.quantity*100)/100} ${second.unit} for lunch`;
        const note=`Share ${quantities} of ${ingredient} between Day ${index} dinner and Day ${index+1} lunch.`+(measured&&pack?` ${Math.ceil(total/pack)} × ${pack} g pack${Math.ceil(total/pack)===1?'':'s'}; ${Math.round(Math.ceil(total/pack)*pack-total)} g left to use or freeze.`:measured?' Enter your pack size to calculate packets and any remainder.':' Weigh the pieces and check your pack size; the source does not confirm every piece’s weight.');
        lunch.note=note;reuseLinks.push({fromDay:index,toDay:index+1,type:'ingredients',ingredient:key,grams:measured?Math.round(total*100)/100:0,note});
      }
    }
    days[index].recipeIds=days[index].meals.map(m=>m.recipeId);
  }
  const used=new Set(days.flatMap(d=>d.recipeIds));
  if(available.length&&days.flatMap(d=>d.meals).filter(m=>m.recipeId.startsWith('new-')).length>Math.floor(options.days*3/4))fail('This menu needs more library recipes to keep your recipes first.');
  const fields={plannerVersion:1,brief:options.brief,durationDays:options.days,servings:options.servings,reuse:options.reuse,recipeMode:options.recipeMode,imagePreference:options.images,packSizes:options.packs,exclude:options.exclude,
    introduction:cleanText(proposal.introduction||'',2000),days,reuseLinks,generatedRecipes:generated.filter(r=>used.has(r.id)),shoppingList:[],notes:cleanText(proposal.notes||'',2000),
    reviewNotes:['Check ingredient labels and recipe suitability against the brief; the planner does not certify allergen safety.',...(options.reuse==='ingredients'&&!reuseLinks.length?['No compatible chicken or salmon packs were found across adjacent dinner and lunch choices. No pack savings are claimed.']:[])]};
  fields.shoppingList=mealPlanShopping(fields,byId);
  return fields;
}
// Recalculate derived quantities after manual editing; never trust posted shopping totals or image paths.
export function refreshMealPlan(fields,data,currentFields={}){
  const options=mealPlanOptions({...fields,days:fields.durationDays,images:fields.imagePreference,chickenPackGrams:fields.packSizes?.chicken,salmonPackGrams:fields.packSizes?.salmon});
  const proposal={introduction:fields.introduction,notes:fields.notes,generatedRecipes:(fields.generatedRecipes||[]).map(r=>({id:r.id,title:r.title,...r.fields})),days:(fields.days||[]).map(d=>{
    if(!Array.isArray(d.meals)||d.meals.length!==3||new Set(d.meals.map(m=>m.slot)).size!==3)fail('Each day needs breakfast, lunch and dinner.');
    return {day:d.day,...Object.fromEntries(d.meals.map(m=>[m.slot,m.recipeId]))};
  })};
  const refreshed=buildMealPlan(proposal,recipeCandidates(data),options);
  for(const recipe of refreshed.generatedRecipes){
    const old=currentFields.generatedRecipes?.find(r=>r.id===recipe.id);
    if(old?.fields.imageAsset&&JSON.stringify([old.title,old.fields.servings,old.fields.ingredients,old.fields.instructions])===JSON.stringify([recipe.title,recipe.fields.servings,recipe.fields.ingredients,recipe.fields.instructions])){
      recipe.fields.imageAsset=old.fields.imageAsset;recipe.fields.imageNote=old.fields.imageNote;
    }
  }
  return refreshed;
}
export function mealPlanShopping(fields,byId){
  const rows=new Map();
  for(const day of fields.days)for(const meal of day.meals){
    if(!meal.cookServings)continue;
    const r=byId.get(meal.recipeId);if(!r)fail('A planned recipe is unavailable.');
    for(const ingredient of r.fields.ingredients){
      const name=ingredientName(ingredient),a=amount(ingredient),week=Math.ceil(day.day/7),key=[week,normal(name),a?.unit??'unmeasured',ingredient.optional?'optional':'required'].join('|');
      if(!rows.has(key))rows.set(key,{week,name,quantity:a?0:null,unit:a?.unit||'',optional:Boolean(ingredient.optional),recipeIds:[],notes:[]});
      const row=rows.get(key);
      if(a)row.quantity+=a.quantity*meal.cookServings/r.fields.servings;
      else row.notes.push(`${meal.cookServings} portions of ${r.title}; source yield ${r.fields.servings}. Check this unmeasured ingredient.`);
      if(ingredient.note)row.notes.push(ingredient.note);
      if(!row.recipeIds.includes(r.id))row.recipeIds.push(r.id);
    }
  }
  return [...rows.values()].map(r=>({...r,quantity:r.quantity===null?null:Math.round(r.quantity*100)/100,notes:[...new Set(r.notes)]}));
}
export async function generateMealPlan({env,data,options,fetcher=fetch}){
  const candidates=recipeCandidates(data).filter(r=>!excluded(r,options)&&matchesCuisine(r,options));
  if(!candidates.length&&options.recipeMode==='library')fail('No complete library recipes match these exclusions. Add recipes or allow new recipe drafts.');
  const aliases=new Map(candidates.map((r,i)=>['r'+(i+1),r.id]));
  const recipes=candidates.map((r,i)=>({id:'r'+(i+1),title:r.title,status:r.status,category:r.fields.category||'',description:r.fields.description||'',servings:r.fields.servings,ingredients:r.fields.ingredients.map(i=>typeof i==='string'?i:{name:i.name,quantity:i.quantity,unit:i.unit,note:i.note||''}),allergens:r.fields.allergens||[]}));
  const newIds=options.recipeMode==='extend'?Array.from({length:12},(_,i)=>'new-'+(i+1)):[];
  const object=properties=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)}),string={type:'string'};
  const recipeId={$ref:'#/$defs/recipeId'};
  const fieldSchema=object({introduction:string,notes:string,days:{type:'array',minItems:options.days,maxItems:options.days,items:object({day:{type:'integer'},breakfast:recipeId,lunch:recipeId,dinner:recipeId})},generatedRecipes:{type:'array',maxItems:newIds.length,items:object({id:newIds.length?{type:'string',enum:newIds}:string,title:string,servings:{type:'number'},ingredients:{type:'array',items:object({name:string,quantity:{type:['number','null']},unit:string,note:string})},instructions:{type:'array',items:string}})}});
  fieldSchema.$defs={recipeId:{type:'string',enum:[...aliases.keys(),...newIds]}};
  const instructions=[
    `Create exactly ${options.days} consecutive days, numbered 1 to ${options.days}, with breakfast, lunch and dinner recipe IDs. Follow the brief and exclusions.`,
    'Give the plan a short descriptive title. Use Nutrition.fitness library recipes as your first choice. Choose recipes that fit the requested cuisine; do not rename unrelated recipes to pretend they fit. Avoid dishes explicitly named for a different cuisine. Vary meals across weeks.',
    options.recipeMode==='library'?'Use ONLY supplied recipe IDs. generatedRecipes must be [].':'Only fill genuine gaps with new complete recipes. If library recipes exist, at least 75% of all meal slots must use them. Return at most 12 generatedRecipes, using new-1 through new-12 as IDs. Each needs title, servings, ingredients:[{name,quantity:number|null,unit,note}], instructions:[string]. Unknown nutrition must stay absent. New recipes are drafts, never approved.',
    options.reuse==='ingredients'?'Where compatible with the brief, pair each dinner with the NEXT day’s lunch using the same raw chicken breast or salmon fillet ingredient. Prefer different recipes using the same cut and measured grams; do not confuse smoked, cooked, minced or other cuts. Keep variety, do not force meat into a vegetarian brief.':options.reuse==='leftovers'?'Plan next-day lunches from the previous dinner. The server will reserve extra portions and adjust the shopping list.':'Choose meals independently; no deliberate leftover or pack reuse.',
    'Return fields with introduction, days:[{day,breakfast:recipeId,lunch:recipeId,dinner:recipeId}], generatedRecipes:[], notes. Do not provide shopping quantities; these are calculated from the recipe ingredients. Use the short r-number IDs exactly; never invent recipe IDs or pretend generated dishes are library recipes.'
  ].join('\n');
  const draft=await generateDraft({env,record:{kind:'mealplan',title:'Meal plan',fields:{}},prompt:instructions+'\nUser brief: '+options.brief,standards:data.byId.get('studio:standards')?.fields.guidance,context:{options,recipes},fieldSchema,maxOutputTokens:18000,fetcher});
  for(const day of draft.fields.days||[])for(const slot of mealSlots)day[slot]=aliases.get(day[slot])||day[slot];
  return {title:draft.title,fields:buildMealPlan(draft.fields,candidates,options),notes:draft.notes};
}
