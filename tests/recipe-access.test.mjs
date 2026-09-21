import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRecipesHandler} from '../api/recipes.js';
import {activeLaunchTrial} from '../server/recipe-access.mjs';

const free=JSON.parse(readFileSync(new URL('../data/cookbooks/high-protein-kitchen.json',import.meta.url))).recipes;
const user={id:'11111111-1111-4111-a111-111111111111',email:'reader@example.com',email_confirmed_at:'2026-09-21T12:00:00Z',is_anonymous:false};
const env={SITE_URL:'https://nutrition.fitness',SUPABASE_URL:'https://test-project.supabase.co',
  SUPABASE_ANON_KEY:'public-test-only',SUPABASE_SERVICE_ROLE_KEY:'private-test-only',
  TURNSTILE_SITE_KEY:'site-test',TURNSTILE_SECRET_KEY:'secret-test',NUFI_EMAIL_OTP_READY:'true',
  NUFI_AUTH_CAPTCHA_READY:'true',NUFI_RECIPE_CONTENT_READY:'true',NUFI_RECIPE_ACCESS_MODE:'registered'};
const now=()=>Date.parse('2026-11-10T12:00:00Z');
const privateRecipe={id:'private-recipe-fixture',name:'Private recipe fixture',publicationStatus:'published',nutrition:null,nutritionStatus:'review-needed',
  ingredients:[{name:'A private ingredient',quantity:1,unit:'item'}],steps:['A private method.'],sourceSha256:'a'.repeat(64)};
const row={id:privateRecipe.id,payload:privateRecipe,publication_status:'published'};
const fullPrivate=Array.from({length:499},(_,i)=>{
  const recipe={...privateRecipe,id:`private-recipe-${i}`};return {id:recipe.id,payload:recipe,publication_status:'published'};
});
const active={eligible:true,entitlement:{status:'active',activated_at:'2026-11-01T09:00:00Z',expires_at:'2026-12-01T09:00:00Z'}};
const response=()=>({code:0,data:null,headers:{},setHeader(key,value){this.headers[key]=value;},status(code){this.code=code;return this;},json(data){this.data=data;return this;}});
const request=(query='',cookie='__Host-nufi-access=test-access')=>({method:'GET',url:`/api/recipes${query}`,headers:{cookie}});
const json=(data,status=200)=>new Response(JSON.stringify(data),{status});
function fixture({identity=user,status=active,rows=[row],authCode=200,storageCode=200}={}) {
  const calls=[];
  const fetcher=async(url,options)=>{
    calls.push({url,options});
    if (url.endsWith('/auth/v1/user')) return json(identity,authCode);
    if (url.endsWith('/rest/v1/rpc/nufi_trial_status')) return json(status);
    if (url.includes('/rest/v1/nufi_private_recipe_content?')) return json(rows,storageCode);
    throw new Error('Unexpected upstream request.');
  };
  return {calls,fetcher};
}
async function run({query=`?id=${privateRecipe.id}`,config=env,mock=fixture(),cookie,method='GET',body}={}) {
  const res=response(),req=request(query,cookie);
  req.method=method;req.body=body;
  await createRecipesHandler({env:config,fetcher:mock.fetcher,now})(req,res);
  return {...res,calls:mock.calls};
}

test('original 100 are always free without account configuration or upstream calls',async()=>{
  const r=await run({query:'',config:{}});
  assert.equal(r.code,200);assert.equal(r.data.access,'free');assert.equal(r.data.recipes.length,100);
  assert.deepEqual(r.data.recipes.map(recipe=>recipe.id),free.map(recipe=>recipe.id));assert.equal(r.calls.length,0);
  const single=await run({query:`?id=${free[0].id}`,config:{NUFI_RECIPE_ACCESS_MODE:'unexpected'}});
  assert.equal(single.code,200);assert.deepEqual(single.data.recipe,free[0]);assert.equal(single.calls.length,0);
});

for (const mode of [undefined,'','free','true','Membership']) {
  test(`restricted data fails closed for missing or invalid mode ${String(mode)}`,async()=>{
    const r=await run({config:{...env,NUFI_RECIPE_ACCESS_MODE:mode}});
    assert.equal(r.code,503);assert.equal(r.data.recipe,undefined);assert.equal(r.calls.length,0);
  });
}

for (const key of ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','SITE_URL',
  'TURNSTILE_SITE_KEY','TURNSTILE_SECRET_KEY','NUFI_EMAIL_OTP_READY','NUFI_AUTH_CAPTCHA_READY','NUFI_RECIPE_CONTENT_READY']) {
  test(`restricted data fails closed when ${key} is absent`,async()=>{
    const r=await run({config:{...env,[key]:undefined}});
    assert.equal(r.code,503);assert.equal(r.calls.length,0);assert.equal(r.data.recipe,undefined);
  });
}

test('guest cannot read one private recipe or the accessible catalogue',async()=>{
  for (const query of [`?id=${privateRecipe.id}`,'?scope=accessible']) {
    const r=await run({query,cookie:''});
    assert.equal(r.code,401);assert.equal(r.calls.length,0);assert.equal(r.data.recipe,undefined);assert.equal(r.data.recipes,undefined);
  }
});

test('forged cookie does not bypass the fresh identity check',async()=>{
  const r=await run({mock:fixture({identity:{},authCode:401})});
  assert.equal(r.code,401);assert.equal(r.calls.length,1);assert.equal(r.data.recipe,undefined);
});

for (const identity of [{...user,email_confirmed_at:null},{...user,is_anonymous:true},{...user,email:''}]) {
  test(`unverified or anonymous identity denied (${JSON.stringify(identity)})`,async()=>{
    const r=await run({mock:fixture({identity})});
    assert.equal(r.code,401);assert.equal(r.calls.length,1);assert.equal(r.data.recipe,undefined);
  });
}

test('registered mode reads private content only after verified authentication',async()=>{
  const r=await run();
  assert.equal(r.code,200);assert.deepEqual(r.data.recipe,privateRecipe);assert.equal(r.data.recipe.nutrition,null);
  assert.equal(r.data.access,'verified-account');assert.equal(r.calls.length,2);
  assert.match(r.calls[0].url,/\/auth\/v1\/user$/);
  assert.equal(r.calls[0].options.headers.Authorization,'Bearer test-access');
  assert.match(r.calls[1].url,/\/nufi_private_recipe_content\?select=id,payload,publication_status&id=eq.private-recipe-fixture&limit=1$/);
  assert.equal(r.calls[1].options.headers.Authorization,'Bearer private-test-only');
});

test('source-review holds keep stable IDs without delivering uncertain methods or ingredients',async()=>{
  const held={...row,publication_status:'held',payload:{...privateRecipe,publicationStatus:'held'}};
  const one=await run({mock:fixture({rows:[held]})});
  assert.equal(one.code,409);assert.equal(one.data.recipe,undefined);
  const all=await run({query:'?scope=accessible',mock:fixture({rows:[...fullPrivate.slice(0,-1),held]})});
  assert.equal(all.code,200);assert.equal(all.data.recipes.length,598);
  assert.deepEqual(all.data.unavailable,[{id:privateRecipe.id,name:privateRecipe.name,reason:'source-review'}]);
  assert.equal(all.data.recipes.some(recipe=>recipe.id===privateRecipe.id),false);
});

test('accessible catalogue combines the original free book with authorized private content',async()=>{
  const r=await run({query:'?scope=accessible',mock:fixture({rows:fullPrivate})});
  assert.equal(r.code,200);assert.equal(r.data.recipes.length,599);
  assert.deepEqual(r.data.recipes.slice(0,100),free);assert.deepEqual(r.data.recipes.at(-1),fullPrivate.at(-1).payload);
  assert.match(r.calls[1].url,/order=id.asc&limit=1000$/);
});

test('accessible catalogue does not pretend an empty or partial private import is complete',async()=>{
  for (const rows of [[],[row],fullPrivate.slice(0,498)]) {
    const r=await run({query:'?scope=accessible',mock:fixture({rows})});
    assert.equal(r.code,503);assert.equal(r.data.recipes,undefined);
  }
});

for (const mode of ['membership','membership-or-book']) {
  test(`${mode} accepts only the actual active trial reported by the server`,async()=>{
    const r=await run({config:{...env,NUFI_RECIPE_ACCESS_MODE:mode,NUFI_APP_ACCESS_READY:'true'}});
    assert.equal(r.code,200);assert.equal(r.data.access,'active-launch-trial');assert.equal(r.calls.length,3);
    assert.deepEqual(JSON.parse(r.calls[1].options.body),{actor:user.id});
    assert.equal(r.calls[1].options.headers.Authorization,'Bearer private-test-only');
  });
  test(`${mode} does not invent paid or purchased access from user metadata or GET body`,async()=>{
    const mock=fixture({identity:{...user,user_metadata:{member:true,paid:true,books:['all']},app_metadata:{plan:'nufi+'}},status:{eligible:true,entitlement:null}});
    const r=await run({mock,config:{...env,NUFI_RECIPE_ACCESS_MODE:mode,NUFI_APP_ACCESS_READY:'true'},body:{member:true,paid:true,now:'2026-11-10',actor:'another-user'}});
    assert.equal(r.code,403);assert.equal(r.calls.length,2);assert.equal(r.data.recipe,undefined);
  });
}

test('trial eligibility, expiry, future start and invalid dates all deny private content',async()=>{
  const invalid=[{eligible:true,entitlement:null},
    {...active,entitlement:{...active.entitlement,status:'expired'}},
    {...active,entitlement:{...active.entitlement,expires_at:'2026-11-10T12:00:00Z'}},
    {...active,entitlement:{...active.entitlement,activated_at:'2026-11-11T09:00:00Z'}},
    {...active,entitlement:{...active.entitlement,activated_at:'2026-10-01T09:00:00Z'}},
    {...active,entitlement:{...active.entitlement,expires_at:'not-a-date'}}];
  for (const status of invalid) {
    assert.equal(activeLaunchTrial(status,now()),false);
    const r=await run({mock:fixture({status}),config:{...env,NUFI_RECIPE_ACCESS_MODE:'membership',NUFI_APP_ACCESS_READY:'true'}});
    assert.equal(r.code,403);assert.equal(r.calls.length,2);assert.equal(r.data.recipe,undefined);
  }
});

test('launch trial cannot grant access before release readiness or launch date',async()=>{
  const disabled=await run({config:{...env,NUFI_RECIPE_ACCESS_MODE:'membership'}});
  assert.equal(disabled.code,503);assert.equal(disabled.calls.length,1);
  const mock=fixture(),r=response();
  await createRecipesHandler({env:{...env,NUFI_RECIPE_ACCESS_MODE:'membership',NUFI_APP_ACCESS_READY:'true'},fetcher:mock.fetcher,now:()=>Date.parse('2026-10-31T12:00:00Z')})(request(`?id=${privateRecipe.id}`),r);
  assert.equal(r.code,503);assert.equal(mock.calls.length,1);
});

test('client query flags, malformed identifiers and duplicate parameters cannot select access',async()=>{
  for (const query of ['?id=constructor','?id=../private','?id=private-recipe-fixture&member=true',
    '?scope=accessible&mode=registered','?scope=accessible&scope=free','?id=first&id=second','?id=first&scope=accessible']) {
    const r=await run({query});assert.equal(r.code,400);assert.equal(r.calls.length,0);assert.equal(r.data.recipe,undefined);
  }
});

test('private storage failure or malformed payload never becomes a successful response',async()=>{
  const failures=[fixture({storageCode:500}),fixture({rows:{payload:privateRecipe}}),
    fixture({rows:[{...row,payload:{...privateRecipe,id:'different-id'}}]}),
    fixture({rows:[{...row,payload:{...privateRecipe,steps:[]}}]}),
    fixture({rows:[{...row,publication_status:'held'}]})];
  for (const mock of failures) {const r=await run({mock});assert.equal(r.code,503);assert.equal(r.data.recipe,undefined);}
});

test('bulk storage cannot overwrite original free IDs or return duplicate private IDs',async()=>{
  for (const rows of [
    [...fullPrivate.slice(0,-1),{id:free[0].id,payload:{...free[0],publicationStatus:'published'},publication_status:'published'}],
    [...fullPrivate.slice(0,-1),fullPrivate[0]],
  ]) {
    const r=await run({query:'?scope=accessible',mock:fixture({rows})});
    assert.equal(r.code,503);assert.equal(r.data.recipes,undefined);
  }
});

test('unknown private ID is a 404 only after authorization',async()=>{
  const r=await run({mock:fixture({rows:[]})});assert.equal(r.code,404);assert.equal(r.calls.length,2);
});

test('every response avoids shared caching and never returns session credentials',async()=>{
  const results=[await run(),await run({query:'',config:{}}),await run({cookie:''}),await run({config:{}})];
  for (const r of results) {
    assert.equal(r.headers['Cache-Control'],'no-store, private');assert.equal(r.headers.Vary,'Cookie');
    assert.equal(r.headers['Content-Type'],'application/json; charset=utf-8');
    assert.doesNotMatch(JSON.stringify(r.data),/test-access|private-test-only|secret-test|reader@example\.com/);
  }
});

test('the endpoint never accepts writes',async()=>{
  const r=await run({method:'POST',body:{id:privateRecipe.id,access:'free'}});
  assert.equal(r.code,405);assert.equal(r.headers.Allow,'GET');assert.equal(r.calls.length,0);
});
