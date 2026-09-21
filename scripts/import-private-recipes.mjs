/**
 * Operator import for a previously verified, dedicated Nutrition.Fitness project.
 * Dry-run by default. Full content is read from a private local file, never emitted
 * into this repository, a browser bundle, an SQL seed or command output.
 */
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {validRecipeId} from '../server/recipe-access.mjs';

const COLLECTIONS=new Set(['breakfast-sorted','proper-everyday-food','big-night-in',
  'air-fryer-favourites','snack-happy','blend-and-go','more-plants-please']);
const sha=value=>createHash('sha256').update(value).digest('hex');
// Postgres jsonb can reorder object keys. Compare content, not serializer order.
const canonical=value=>Array.isArray(value)?value.map(canonical):
  value!==null && typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
export const privateRecipeHash=value=>sha(JSON.stringify(canonical(value)));

export function preparePrivateRecipes(input,freeIds,{expectedCount=499,assignments={}}={}) {
  if (!Array.isArray(input?.recipes) || input.recipes.length!==expectedCount) {
    throw new Error(`Expected exactly ${expectedCount} private recipes.`);
  }
  const seen=new Set();
  const rows=input.recipes.map(recipe=>{
    if (!validRecipeId(recipe?.id) || freeIds.has(recipe.id) || seen.has(recipe.id)) {
      throw new Error('A private recipe identifier is invalid, duplicated, or belongs to the original free book.');
    }
    if (!['published','held'].includes(recipe.publicationStatus)) {
      throw new Error(`Recipe ${recipe.id} has no reviewed publication status. Apply the private editorial overlay before importing.`);
    }
    if (typeof recipe.name!=='string' || !recipe.name.trim() ||
        !Array.isArray(recipe.ingredients) || !recipe.ingredients.length ||
        !Array.isArray(recipe.steps) || !recipe.steps.length ||
        !recipe.steps.every(step=>typeof step==='string' && step.trim()) ||
        !Object.hasOwn(recipe,'nutrition') || (recipe.nutrition!==null &&
          (typeof recipe.nutrition!=='object' || Array.isArray(recipe.nutrition))) ||
        !/^[a-f0-9]{64}$/.test(recipe.sourceSha256||'')) {
      throw new Error(`Private recipe ${recipe.id} is incomplete. No content was uploaded.`);
    }
    const collection=assignments[recipe.id]??null;
    if (collection!==null && !COLLECTIONS.has(collection)) throw new Error(`Unrecognised collection for ${recipe.id}.`);
    seen.add(recipe.id);
    return {id:recipe.id,collection_id:collection,publication_status:recipe.publicationStatus,payload:recipe,
      source_sha256:recipe.sourceSha256,content_sha256:privateRecipeHash(recipe)};
  });
  for (const key of Object.keys(assignments)) if (!seen.has(key)) throw new Error('Collection assignments include an unknown recipe.');
  return rows;
}

export function privateImportTarget(env) {
  const expected=env.NUFI_RECIPE_IMPORT_PROJECT_REF;
  if (!/^[a-z0-9]{20}$/.test(expected||'')) throw new Error('Set the verified Nutrition.Fitness project reference before importing.');
  let url;
  try {url=new URL(env.SUPABASE_URL);} catch {throw new Error('A valid SUPABASE_URL is required.');}
  if (url.protocol!=='https:' || url.hostname!==`${expected}.supabase.co` ||
      url.port || url.username || url.password || !['','/'].includes(url.pathname) || url.search || url.hash) {
    throw new Error('SUPABASE_URL does not match the verified Nutrition.Fitness project reference.');
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY || env.NUFI_RECIPE_IMPORT_TARGET!=='nutrition-fitness-private-recipes') {
    throw new Error('The server credential and explicit private recipe import target are required.');
  }
  return {origin:url.origin,credential:env.SUPABASE_SERVICE_ROLE_KEY};
}

export async function importPrivateRecipes(rows,{env=process.env,fetcher=fetch}={}) {
  const {origin,credential}=privateImportTarget(env);
  const headers={apikey:credential,Authorization:`Bearer ${credential}`,'Content-Type':'application/json'};
  let verified=0;
  for (let offset=0;offset<rows.length;offset+=25) {
    const batch=rows.slice(offset,offset+25);
    // Existing rows are not overwritten. The verification below flags conflicts.
    const response=await fetcher(`${origin}/rest/v1/nufi_private_recipe_content?on_conflict=id`,{
      method:'POST',headers:{...headers,Prefer:'resolution=ignore-duplicates,return=minimal'},
      body:JSON.stringify(batch),signal:AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Private recipe import stopped after ${verified} verified rows (HTTP ${response.status}).`);
    const ids=batch.map(row=>row.id).join(',');
    const check=await fetcher(`${origin}/rest/v1/nufi_private_recipe_content?select=id,payload,collection_id,publication_status&`+
      `id=in.(${ids})`,{headers,signal:AbortSignal.timeout(30000)});
    if (!check.ok) throw new Error(`Private recipe verification stopped after ${verified} rows (HTTP ${check.status}).`);
    const stored=await check.json();
    if (!Array.isArray(stored) || stored.length!==batch.length || new Set(stored.map(row=>row.id)).size!==batch.length) {
      throw new Error(`Private recipe verification was incomplete after ${verified} rows.`);
    }
    const byId=new Map(stored.map(row=>[row.id,row]));
    for (const row of batch) {
      const actual=byId.get(row.id);
      if (!actual || privateRecipeHash(actual.payload)!==row.content_sha256 || actual.collection_id!==row.collection_id ||
          actual.publication_status!==row.publication_status) {
        throw new Error(`Stored recipe ${row.id} differs from the private source. Existing rows were retained; review before retrying.`);
      }
    }
    verified+=batch.length;
  }
  return {verified};
}

async function main(args) {
  if (args.includes('--help')) {
    console.log('Usage: node scripts/import-private-recipes.mjs /private/recipe-library.json [--assignments /private/recipe-books.json] [--apply]\nDry-run is the default. --apply requires the verified project reference, explicit import target and server credential from the environment.');
    return;
  }
  let path,assignmentPath,apply=false;
  for (let i=0;i<args.length;i++) {
    if (args[i]==='--apply' && !apply) apply=true;
    else if (args[i]==='--assignments' && !assignmentPath && args[i+1]) assignmentPath=args[++i];
    else if (!args[i].startsWith('-') && !path) path=args[i];
    else throw new Error('Unknown or duplicate argument. Use --help for the import contract.');
  }
  if (!path) throw new Error('Supply the private recipe JSON file. Use --help for details.');
  const [source,free,assignments]=await Promise.all([
    readFile(path,'utf8').then(JSON.parse),
    readFile(new URL('../data/cookbooks/high-protein-kitchen.json',import.meta.url),'utf8').then(JSON.parse),
    assignmentPath?readFile(assignmentPath,'utf8').then(JSON.parse):Promise.resolve({}),
  ]);
  if (!assignments || typeof assignments!=='object' || Array.isArray(assignments)) throw new Error('Assignments must map recipe IDs to collection IDs.');
  const rows=preparePrivateRecipes(source,new Set(free.recipes.map(recipe=>recipe.id)),{assignments});
  const report={mode:apply?'import':'dry-run',recipes:rows.length,
    published:rows.filter(row=>row.publication_status==='published').length,
    held:rows.filter(row=>row.publication_status==='held').length,
    assignedToBooks:rows.filter(row=>row.collection_id).length,
    nutritionForReview:rows.filter(row=>row.payload.nutrition===null).length,
    datasetSha256:sha(JSON.stringify(rows.map(row=>row.payload)))};
  if (apply) Object.assign(report,await importPrivateRecipes(rows));
  console.log(JSON.stringify(report,null,2));
}

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
}
