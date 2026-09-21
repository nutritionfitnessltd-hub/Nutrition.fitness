import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRecipesHandler} from '../api/recipes.js';
import {createAdminHandler} from '../api/admin.js';
import {loadAccountRecipes,accountRecipe} from '../public/recipe-access.mjs';
import {RECIPES} from '../public/recipes-data.mjs';
const free=JSON.parse(readFileSync(new URL('../data/cookbooks/high-protein-kitchen.json',import.meta.url))).recipes;
const imported=JSON.parse(readFileSync(new URL('../data/cookbooks/recipe-library.json',import.meta.url))).recipes;
const heldSource=imported.find(r=>RECIPES.find(p=>p.id===r.id)?.publicationStatus==='held');
const user={id:'11111111-1111-4111-a111-111111111111',email:'fixture@example.com',email_confirmed_at:'2026-09-21T12:00:00Z'};
const env={SITE_URL:'https://nutrition.fitness',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_ANON_KEY:'fixture-public',SUPABASE_SERVICE_ROLE_KEY:'fixture-private',NUFI_ACCOUNT_MANAGEMENT_READY:'true',NUFI_RECIPE_CONTENT_READY:'true',NUFI_RECIPE_ACCESS_MODE:'registered',NUFI_PASSWORD_AUTH_READY:'true',NUFI_RECOVERY_ENCRYPTION_KEY:Buffer.alloc(32,1).toString('base64'),NUFI_AUTH_CAPTCHA_READY:'true',TURNSTILE_SITE_KEY:'fixture-site',TURNSTILE_SECRET_KEY:'fixture-secret'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status});
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(data){this.data=data;return this;}});
const request=(url,cookie='__Host-nufi-access=fixture-access')=>({method:'GET',url,headers:{cookie}});

test('public recipe changes remain free and are scoped to free IDs',async()=>{
 const calls=[],res=response();
 const fetcher=async(url)=>{calls.push(url);return json([{content_type:'recipe',id:free[0].id,version:1,payload:{name:'Reviewed original recipe',publicationStatus:'published'}}]);};
 await createRecipesHandler({env,fetcher})(request(`/api/recipes?id=${free[0].id}`,''),res);
 assert.equal(res.code,200);assert.equal(res.data.access,'free');assert.equal(res.data.recipe.name,'Reviewed original recipe');
 assert.deepEqual(res.data.recipe.ingredients,free[0].ingredients);assert.equal(calls.length,1);
 assert.match(calls[0],new RegExp(`id=in\\.\\(${free[0].id}\\)`));
 assert.doesNotMatch(calls[0],/nufi_private_recipe_content/);
});

test('verified password-only account can read a held recipe explicitly released by an administrator',async()=>{
 const calls=[],res=response();
 const fetcher=async(url)=>{calls.push(url);if(url.endsWith('/auth/v1/user'))return json(user);
  if(url.includes('/nufi_members?'))return json([{user_id:user.id,first_name:'Fixture',role:'member',status:'active'}]);
  if(url.includes('/nufi_private_recipe_content?'))return json([{id:heldSource.id,publication_status:'held',payload:{...heldSource,publicationStatus:'held'}}]);
  if(url.includes('/nufi_content?'))return json([{content_type:'recipe',id:heldSource.id,version:2,payload:{publicationStatus:'published',nutrition:null,nutritionStatus:'review-needed'}}]);
  throw new Error('Unexpected request');};
 await createRecipesHandler({env,fetcher})(request(`/api/recipes?id=${heldSource.id}`),res);
 assert.equal(res.code,200);assert.equal(res.data.recipe.publicationStatus,'published');assert.equal(res.data.recipe.contentVersion,2);assert.equal(res.data.recipe.nutrition,null);
 assert.ok(calls.findIndex(u=>u.endsWith('/auth/v1/user'))<calls.findIndex(u=>u.includes('/nufi_private_recipe_content?')));
 await loadAccountRecipes({fetcher:async()=>json({access:'verified-account',recipes:[res.data.recipe]})});
 assert.equal(accountRecipe(heldSource.id).locked,false);
 await loadAccountRecipes({fetcher:async()=>{throw new Error('offline');}});
});

test('guest cannot use recipe overlays to bypass account authentication',async()=>{
 let calls=0;const res=response();await createRecipesHandler({env,fetcher:async()=>{calls++;throw new Error('must not run');}})(request(`/api/recipes?id=${heldSource.id}`,''),res);
 assert.equal(res.code,401);assert.equal(calls,0);assert.equal(res.data.recipe,undefined);
});

test('a demoted administrator cannot use the legacy onboarding endpoint through the bootstrap allowlist',async()=>{
 let privileged=0;const res=response();const fetcher=async url=>{if(url.endsWith('/auth/v1/user'))return json(user);if(url.includes('/nufi_members?'))return json([{user_id:user.id,role:'member',status:'active'}]);privileged++;throw new Error('must not run');};
 await createAdminHandler({env:{...env,NUFI_ADMIN_USER_IDS:user.id},fetcher})(request('/api/admin'),res);
 assert.equal(res.code,403);assert.equal(privileged,0);
});

test('guest sees published free edits but public responses can never grant account content',async()=>{
 let updated=free.map((r,i)=>i? r:{...r,name:'An updated free recipe'});
 await loadAccountRecipes({fetcher:async url=>url.includes('accessible')?json({},401):json({access:'free',recipes:updated})});
 assert.equal(accountRecipe(free[0].id).name,'An updated free recipe');
 updated=[...free.slice(1),{...heldSource,locked:false}];
 await loadAccountRecipes({fetcher:async url=>url.includes('accessible')?json({},401):json({access:'free',recipes:updated})});
 assert.equal(accountRecipe(heldSource.id),undefined);
 assert.equal(accountRecipe(free[0].id),undefined);
});
