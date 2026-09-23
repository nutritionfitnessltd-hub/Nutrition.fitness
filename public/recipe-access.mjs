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
    if(!response.ok){
      // Free catalogue edits are available to everyone; denied account access
      // never makes an account recipe eligible through the public endpoint.
      try {
        const freeResponse=await fetcher('/api/recipes',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal:AbortSignal.timeout(6000)});
        const freeData=freeResponse.ok?await freeResponse.json():null;
        if(freeData?.access==='free'&&Array.isArray(freeData.recipes)){
          const next=new Map();
          for(const value of freeData.recipes){
            const source=RECIPE_BY_ID[value?.id];
            if(!source||source.access==='account'||!isRecipeAvailable(value)||next.has(value.id))throw new Error('Invalid free catalogue');
            next.set(value.id,{...value,collectionBookId:source.collectionBookId||'high-protein-kitchen',access:'free',locked:false});
          }
          if(next.size===100)accountRecipes=next;
        }
      }catch{/* The original free source remains available when updates cannot be read. */}
      return {available:0,status:response.status===401?'guest':'unavailable'};
    }
    const data=await response.json();
    if(!['verified-account','active-launch-trial'].includes(data.access)||!Array.isArray(data.recipes))return {available:0,status:'unavailable'};
    const next=new Map(),seen=new Set();
    for(const value of data.recipes) {
      const preview=RECIPE_BY_ID[value?.id];
      if(!preview||seen.has(value.id))return {available:0,status:'unavailable'};
      seen.add(value.id);
      if(!isRecipeAvailable(value))return {available:0,status:'unavailable'};
      if(preview.access!=='account'){next.set(value.id,{...value,collectionBookId:preview.collectionBookId||'high-protein-kitchen',access:'free',locked:false});continue;}
      if(value.publicationStatus!=='published')return {available:0,status:'unavailable'};
      if(preview.publicationStatus==='held'&&(!Number.isSafeInteger(value.contentVersion)||value.contentVersion<1))return {available:0,status:'unavailable'};
      // A reviewed publication from the protected API can release a source hold.
      // A static preview, local flag or malformed payload never supplies access.
      next.set(value.id,{...value,collectionBookId:preview.collectionBookId,access:'account',locked:false,...(preview.nutritionStatus==='review-needed'&&!value.nutritionReviewed?{nutrition:null,nutritionStatus:'review-needed'}:{})});
    }
    accountRecipes=next;
    return {available:[...next.values()].filter(r=>r.access==='account').length,status:'authorised'};
  } catch {
    return {available:0,status:'unavailable'};
  }
}
