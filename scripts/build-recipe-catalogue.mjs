/** Build one deterministic browser mirror and an idempotent PostgreSQL seed from the supplied cookbook dataset. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const data=JSON.parse(await readFile(new URL('data/cookbooks/high-protein-kitchen.json',root),'utf8'));
if(data.recipes.length!==100||new Set(data.recipes.map(r=>r.id)).size!==100||new Set(data.recipes.map(r=>r.sourceRecipeNumber)).size!==100)throw new Error('The source catalogue must contain exactly 100 unique recipes.');
const json=JSON.stringify(data.recipes);
const mirror='/** Generated from data/cookbooks/high-protein-kitchen.json. All 100 source recipes; do not edit this mirror by hand. */\nexport const COOKBOOK_SOURCE = '+JSON.stringify(data.source)+';\nexport const RECIPES = '+json+';\nexport const RECIPE_BY_ID = Object.fromEntries(RECIPES.map(r=>[r.id,r]));\n';
await writeFile(new URL('public/recipes-data.mjs',root),mirror);
await mkdir(new URL('supabase/seeds/',root),{recursive:true});
const quoted=s=>"'"+s.replaceAll("'","''")+"'";
const src=JSON.stringify(data.source);
const seed=`-- Generated catalogue only. Never changes members, workspaces, personal recipe overrides or food logs.
-- Apply schema migrations first. This seed is safe to run again; edited catalogue rows are retained.
BEGIN;
INSERT INTO public.nufi_cookbooks(id,title,source_file,source_sha256,page_count,recipe_count)
VALUES ('high-protein-kitchen','The High Protein Kitchen',${quoted(data.source.filename)},${quoted(data.source.sha256)},143,100)
ON CONFLICT(id) DO UPDATE SET title=excluded.title, source_file=excluded.source_file,source_sha256=excluded.source_sha256,page_count=excluded.page_count,recipe_count=excluded.recipe_count;
INSERT INTO public.nufi_recipe_catalogue(id,book_id,recipe_number,source_page,name,category,servings,serving_label,nutrition,ingredients,method,source_sha256,payload)
SELECT value->>'id','high-protein-kitchen',(value->>'sourceRecipeNumber')::int,(value->>'sourcePage')::int,value->>'name',value->>'category',(value->>'servings')::numeric,value->>'servingLabel',value->'nutrition',value->'ingredients',value->'steps',value->>'sourceSha256',value
FROM jsonb_array_elements(${quoted(json)}::jsonb)
ON CONFLICT(id) DO UPDATE SET recipe_number=excluded.recipe_number,source_page=excluded.source_page,name=excluded.name,category=excluded.category,servings=excluded.servings,serving_label=excluded.serving_label,nutrition=excluded.nutrition,ingredients=excluded.ingredients,method=excluded.method,source_sha256=excluded.source_sha256,payload=excluded.payload
WHERE NOT public.nufi_recipe_catalogue.editor_override AND public.nufi_recipe_catalogue.payload IS DISTINCT FROM excluded.payload;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.nufi_recipe_catalogue WHERE book_id='high-protein-kitchen')<>100 THEN RAISE EXCEPTION 'Catalogue import incomplete: expected 100 recipes'; END IF;
END $$;
COMMIT;
`;
await writeFile(new URL('supabase/seeds/high-protein-kitchen.sql',root),seed);
const counts=Object.fromEntries(['Breakfast','Lunch','Dinner','Snacks','Drinks'].map(c=>[c,data.recipes.filter(r=>r.category===c).length]));
const manifest={bookId:'high-protein-kitchen',source:data.source,datasetSha256:createHash('sha256').update(json).digest('hex'),recipes:100,categories:counts,ingredients:data.recipes.reduce((n,r)=>n+r.ingredients.length,0),methodSteps:data.recipes.reduce((n,r)=>n+r.steps.length,0),photos:data.recipes.filter(r=>r.image).length,missingPhotos:data.recipes.filter(r=>!r.image).map(r=>({id:r.id,page:r.sourcePage})),preservedSourceNotes:data.recipes.filter(r=>r.sourceWarnings?.length).map(r=>({id:r.id,page:r.sourcePage,notes:r.sourceWarnings}))};
await writeFile(new URL('data/cookbooks/catalogue-manifest.json',root),JSON.stringify(manifest,null,2)+'\n');
console.log(`Recipe catalogue: ${manifest.recipes} recipes, ${manifest.photos} original photographs. Source values preserved.`);
