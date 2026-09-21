import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePrivateRecipes,privateImportTarget,privateRecipeHash,importPrivateRecipes} from '../scripts/import-private-recipes.mjs';

const env={SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-server-secret',
  NUFI_RECIPE_IMPORT_PROJECT_REF:'abcdefghijklmnopqrst',NUFI_RECIPE_IMPORT_TARGET:'nutrition-fitness-private-recipes'};
const recipe={id:'private-fixture',name:'Fixture recipe',publicationStatus:'published',ingredients:[{name:'Ingredient',quantity:1,unit:'g'}],
  steps:['A method step.'],nutrition:null,nutritionStatus:'review-needed',sourceSha256:'a'.repeat(64)};
const prepare=(recipes=[recipe],assignments={})=>preparePrivateRecipes({recipes},new Set(['original-free']),{expectedCount:recipes.length,assignments});
const json=(data,status=200)=>new Response(JSON.stringify(data),{status});

test('private import preserves every recipe field and unknown nutrition',()=>{
  const input={...recipe,sourceNutritionPrinted:{protein:'21.g'},sourceWarnings:['Printed value needs review.']};
  const rows=prepare([input],{'private-fixture':'snack-happy'});
  assert.equal(rows.length,1);assert.deepEqual(rows[0].payload,input);assert.equal(rows[0].payload.nutrition,null);
  assert.equal(rows[0].collection_id,'snack-happy');assert.equal(rows[0].source_sha256,input.sourceSha256);
  assert.equal(rows[0].publication_status,'published');
  assert.equal(rows[0].content_sha256,privateRecipeHash(input));
});

test('unreviewed source is refused and explicit editorial holds retain the complete private record',()=>{
  assert.throws(()=>prepare([{...recipe,publicationStatus:undefined}]),/editorial overlay/);
  const held=prepare([{...recipe,publicationStatus:'held'}]);
  assert.equal(held[0].publication_status,'held');assert.deepEqual(held[0].payload.steps,recipe.steps);
});

test('default count requires all499 imported recipes',()=>{
  assert.throws(()=>preparePrivateRecipes({recipes:[recipe]},new Set()),/exactly 499/);
});

test('all seven approved book assignments survive preparation and verified import',async()=>{
  const books=['breakfast-sorted','proper-everyday-food','big-night-in','air-fryer-favourites',
    'snack-happy','blend-and-go','more-plants-please'];
  const recipes=books.map((book,i)=>({...recipe,id:`assigned-fixture-${i}`}));
  const assignments=Object.fromEntries(recipes.map((entry,i)=>[entry.id,books[i]]));
  const rows=prepare(recipes,assignments);
  assert.deepEqual(rows.map(row=>row.collection_id),books);
  let stored=[];
  const result=await importPrivateRecipes(rows,{env,fetcher:async(url,options)=>{
    if (options.method==='POST') {
      stored=JSON.parse(options.body);
      return new Response(null,{status:201});
    }
    return json(stored);
  }});
  assert.deepEqual(result,{verified:7});
  assert.deepEqual(Object.fromEntries(stored.map(row=>[row.id,row.collection_id])),assignments);
  assert.throws(()=>prepare([recipe],{[recipe.id]:'the-big-night-in'}),/Unrecognised collection/);
});

test('original free IDs, duplicates, malformed records and unknown assignments are rejected',()=>{
  assert.throws(()=>prepare([{...recipe,id:'original-free'}]),/original free/);
  assert.throws(()=>prepare([recipe,recipe]),/duplicated/);
  assert.throws(()=>prepare([{...recipe,id:'../private'}]),/identifier/);
  assert.throws(()=>prepare([{...recipe,nutrition:'invented'}]),/incomplete/);
  assert.throws(()=>prepare([{...recipe,steps:[]}]),/incomplete/);
  assert.throws(()=>prepare([{...recipe,sourceSha256:'wrong'}]),/incomplete/);
  assert.throws(()=>prepare([recipe],{'private-fixture':'old-canva-volume'}),/Unrecognised collection/);
  assert.throws(()=>prepare([recipe],{'missing-recipe':'snack-happy'}),/unknown recipe/);
});

test('canonical verification tolerates Postgres jsonb key reordering without losing values',()=>{
  const reordered={sourceSha256:recipe.sourceSha256,nutritionStatus:recipe.nutritionStatus,nutrition:null,publicationStatus:'published',
    steps:recipe.steps,ingredients:[{unit:'g',quantity:1,name:'Ingredient'}],name:recipe.name,id:recipe.id};
  assert.equal(privateRecipeHash(recipe),privateRecipeHash(reordered));
  assert.notEqual(privateRecipeHash(recipe),privateRecipeHash({...reordered,nutrition:{protein:0}}));
  assert.notEqual(privateRecipeHash({...recipe,steps:['First','Second']}),privateRecipeHash({...recipe,steps:['Second','First']}));
});

test('target identity and explicit import purpose must match before any network request',async()=>{
  assert.equal(privateImportTarget(env).origin,'https://abcdefghijklmnopqrst.supabase.co');
  const bad=[{}, {...env,NUFI_RECIPE_IMPORT_PROJECT_REF:'differentprojectrefx'},
    {...env,SUPABASE_URL:'http://abcdefghijklmnopqrst.supabase.co'},
    {...env,SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co.attacker.invalid'},
    {...env,SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co/rest/v1'},
    {...env,SUPABASE_SERVICE_ROLE_KEY:''},{...env,NUFI_RECIPE_IMPORT_TARGET:''}];
  for (const config of bad) {
    let calls=0;
    await assert.rejects(importPrivateRecipes(prepare(),{env:config,fetcher:async()=>{calls++;throw new Error('must not run');}}));
    assert.equal(calls,0);
  }
});

test('import batches are bounded and verified by exact stored payload; existing rows are not overwritten',async()=>{
  const recipes=Array.from({length:26},(_,i)=>({...recipe,id:`private-fixture-${i}`})),rows=prepare(recipes),calls=[];
  let stored=[];
  const fetcher=async(url,options)=>{
    calls.push({url,options});
    if (options.method==='POST') {stored=JSON.parse(options.body);return new Response(null,{status:201});}
    return json(stored.map(row=>({id:row.id,collection_id:row.collection_id,publication_status:row.publication_status,payload:Object.fromEntries(Object.entries(row.payload).reverse())})));
  };
  assert.deepEqual(await importPrivateRecipes(rows,{env,fetcher}),{verified:26});
  assert.equal(calls.length,4);assert.equal(JSON.parse(calls[0].options.body).length,25);assert.equal(JSON.parse(calls[2].options.body).length,1);
  assert.equal(calls[0].options.headers.Prefer,'resolution=ignore-duplicates,return=minimal');
  for (const call of calls) {
    assert.match(call.url,/^https:\/\/abcdefghijklmnopqrst\.supabase\.co\/rest\/v1\/nufi_private_recipe_content\?/);
    assert.equal(call.options.headers.Authorization,'Bearer test-server-secret');
  }
});

test('conflicting existing private content stops verification without retrying or overwriting',async()=>{
  let calls=0;
  await assert.rejects(importPrivateRecipes(prepare(),{env,fetcher:async(url,options)=>{
    calls++;return options.method==='POST'?new Response(null,{status:201}):json([{id:recipe.id,collection_id:null,publication_status:'published',payload:{...recipe,steps:['An existing editorial change.']}}]);
  }}),/differs from the private source/);
  assert.equal(calls,2);
});

test('failed write or incomplete verification never reports successful import',async()=>{
  for (const response of [json({},503),json([],200),json([{id:'wrong',payload:recipe,collection_id:null}],200)]) {
    let calls=0;
    await assert.rejects(importPrivateRecipes(prepare(),{env,fetcher:async(url,options)=>{
      calls++;if (options.method==='POST') return response.status===503?response:new Response(null,{status:201});
      return response;
    }}));
    assert.ok(calls<=2);
  }
});
