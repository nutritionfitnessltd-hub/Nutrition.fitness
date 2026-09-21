/**
 * Prepared recipe API. This file alone does not restrict existing public pages.
 * See docs/RECIPE-ACCESS-PREPARATION.md before enabling or deploying the feature.
 */
import {readFileSync} from 'node:fs';
import {HttpError,reply,fail} from '../server/platform.mjs';
import {authorizeRestrictedRecipes,PRIVATE_RECIPE_COUNT,readPrivateRows,validRecipeId} from '../server/recipe-access.mjs';

// Only the original free book is imported into this function's source bundle.
const source=JSON.parse(readFileSync(new URL('../data/cookbooks/high-protein-kitchen.json',import.meta.url),'utf8'));
const FREE_RECIPES=source.recipes;
const FREE_BY_ID=new Map(FREE_RECIPES.map(recipe=>[recipe.id,recipe]));
if (FREE_RECIPES.length!==100 || FREE_BY_ID.size!==100) throw new Error('Expected the original 100 free recipes.');
const FREE_IDS=new Set(FREE_BY_ID.keys());

function query(req) {
  const params=new URL(req.url||'/api/recipes','https://nutrition.fitness').searchParams;
  for (const key of params.keys()) {
    if (!['id','scope'].includes(key) || params.getAll(key).length!==1) throw new HttpError(400,'Check the recipe request.');
  }
  const id=params.get('id'),scope=params.get('scope')||'free';
  if ((id!==null && !validRecipeId(id)) || !['free','accessible'].includes(scope) ||
      (id!==null && params.has('scope'))) throw new HttpError(400,'Choose one recipe or a catalogue scope.');
  return {id,scope};
}

export function createRecipesHandler({env=process.env,fetcher=fetch,now=Date.now}={}) {
  return async(req,res)=>{
    try {
      if (req.method!=='GET') {
        res.setHeader('Allow','GET');
        throw new HttpError(405,'Use GET to read recipes.');
      }
      const {id,scope}=query(req);
      if (id && FREE_BY_ID.has(id)) return reply(res,200,{recipe:FREE_BY_ID.get(id),access:'free'});
      if (!id && scope==='free') return reply(res,200,{recipes:FREE_RECIPES,access:'free'});

      // Identity and entitlement are checked before reading any private payload.
      const {api,evidence}=await authorizeRestrictedRecipes(req,res,{env,fetcher,now});
      const endpoint='/rest/v1/nufi_private_recipe_content?select=id,payload,publication_status'+
        (id?`&id=eq.${encodeURIComponent(id)}&limit=1`:'&order=id.asc&limit=1000');
      const rows=await api(endpoint,{service:true});
      const recipes=readPrivateRows(rows,FREE_IDS,{expectedId:id,expectedCount:id?null:PRIVATE_RECIPE_COUNT});
      if (id && !recipes.length) throw new HttpError(404,'That recipe was not found.');
      if (id && recipes[0].publicationStatus!=='published') {
        throw new HttpError(409,'This recipe is being checked and is not available to cook yet.');
      }
      return reply(res,200,id?{recipe:recipes[0],access:evidence}:
        {recipes:[...FREE_RECIPES,...recipes.filter(recipe=>recipe.publicationStatus==='published')],
          unavailable:recipes.filter(recipe=>recipe.publicationStatus==='held').map(recipe=>({id:recipe.id,name:recipe.name,reason:'source-review'})),
          access:evidence});
    } catch(error) {
      return fail(res,error);
    }
  };
}

export default createRecipesHandler();
