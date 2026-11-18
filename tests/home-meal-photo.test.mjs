import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=path=>readFileSync(new URL('../'+path,import.meta.url));
const home=read('src/home.html').toString();
const original='<img src="/assets/chicken-bowl.webp" alt="A bowl of chicken, avocado, greens and edamame" width="210" height="276" loading="lazy" decoding="async">';
const replacement='<img src="/assets/cookbook/recipe-061.webp" alt="Easy chicken stir-fry from The High Protein Kitchen" width="1400" height="933" loading="lazy" decoding="async">';

test('homepage meal photo uses the unchanged photograph supplied with cookbook recipe 61',()=>{
 const catalogue=JSON.parse(read('data/cookbooks/high-protein-kitchen.json'));
 const recipe=catalogue.recipes.find(r=>r.id==='easy-chicken-stir-fry');
 const audit=JSON.parse(read('data/cookbooks/import-audit.json')).find(r=>r.id===recipe.id);
 assert.equal(recipe.sourceBook,'high-protein-kitchen');
 assert.equal(recipe.sourceRecipeNumber,61);
 assert.equal(recipe.sourceImagePage,91);
 assert.equal(recipe.image,'/assets/cookbook/recipe-061.webp');
 assert.equal(recipe.sourceSha256,catalogue.source.sha256);
 const bytes=read('public'+recipe.image);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),audit.imageSha256);
 assert.equal(audit.imageSha256,'08d052958b67cb60897d5c585f6c4d101189b13b45512cda79672f53d8a3c3f3');
 const meals=home.match(/<section class="nf-home-feature nf-home-feature--meals"[\s\S]*?<\/section>/)?.[0];
 assert.ok(meals?.includes(replacement));
 assert.ok(!meals.includes('/assets/chicken-bowl.webp'));
});

test('homepage meal action opens the planner and preserves the supplied photo',()=>{
 assert.equal(home.split(replacement).length-1,1);
 assert.match(home, /href="\/meal-planner\/">See your meal plan/);
});
