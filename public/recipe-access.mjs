/** Account content is kept in memory only and is never restored from browser flags. */
import {RECIPE_BY_ID} from './recipes-data.mjs';

let accountRecipes=new Map();
export const isRecipeAvailable=recipe=>!!recipe && recipe.locked!==true &&
  Array.isArray(recipe.ingredients) && recipe.ingredients.length>0 &&
  Array.isArray(recipe.steps) && recipe.steps.length>0;
export const accountRecipe=id=>accountRecipes.get(id);
export const recipeAccessMessage=recipe=>recipe?.publicationStatus==='held'
  ? 'This recipe is being checked and is not available to cook yet.'
  : 'Account access coming soon. The original 100 recipes remain free.';

/**
 * A cookie-backed, server-authorised response is the only source for new recipes.
 * An absent endpoint, expired session, unsupported entitlement or malformed response
 * leaves every preview locked. This function does not change any saved workspace.
 */
export async function loadAccountRecipes({fetcher=globalThis.fetch?.bind(globalThis)}={}) {
  accountRecipes=new Map();
  if(!fetcher)return {available:0,status:'unavailable'};
  try {
    const response=await fetcher('/api/recipes?scope=accessible',{
      credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},
      signal:AbortSignal.timeout(6000),
    });
    if(!response.ok)return {available:0,status:response.status===401?'guest':'unavailable'};
    const data=await response.json();
    if(!['verified-account','active-launch-trial'].includes(data.access)||!Array.isArray(data.recipes))return {available:0,status:'unavailable'};
    const next=new Map(),seen=new Set();
    for(const value of data.recipes) {
      const preview=RECIPE_BY_ID[value?.id];
      if(!preview||seen.has(value.id))return {available:0,status:'unavailable'};
      seen.add(value.id);
      if(preview.access!=='account')continue;
      if(preview.publicationStatus==='held'||value.publicationStatus!=='published'||!isRecipeAvailable(value))return {available:0,status:'unavailable'};
      next.set(value.id,{...value,access:'account',locked:false,...(preview.nutritionStatus==='review-needed'?{nutrition:null,nutritionStatus:'review-needed'}:{})});
    }
    accountRecipes=next;
    return {available:next.size,status:'authorised'};
  } catch {
    return {available:0,status:'unavailable'};
  }
}
