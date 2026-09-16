import fs from 'node:fs/promises';
import path from 'node:path';
import {compileLaunchLayout,renderFinder} from '../src/launch-layout.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'dist');
const routes=JSON.parse(await fs.readFile(path.join(out,'routes.json'),'utf8'));
for(const route of [...routes,{url:'/404/',file:'404.html'}]){
 const file=path.join(out,route.file);let html=await fs.readFile(file,'utf8');
 html=compileLaunchLayout(html,route.url);
 if(route.url==='/'){
  const old='<a class="button hero-button" href="/nufi/">Meet NUFI+ <svg><use href="#i-arrow"></use></svg></a>';
  if(!html.includes(old))throw new Error('Approved homepage CTA contract changed.');
  html=html.replace(old,`<a class="button hero-button" href="/get-started/">Find my programme <svg><use href="#i-arrow"></use></svg></a><p class="launch-microcopy">Plus your first month of NUFI+, free.</p><a class="launch-secondary" href="/nufi/">Meet NUFI+ first →</a>`);
 }
 if(route.url==='/get-started/'){
  html=html.replace(/<main id="main">[\s\S]*?<\/main>/,`<main id="main">${renderFinder()}</main>`).replace('data-page="onboarding"','data-page="programme-finder"').replace('<title>Start with you | Nutrition.Fitness</title>','<title>Find your programme. One free month of NUFI+ | Nutrition.Fitness</title>');
 }
 await fs.writeFile(file,html);
}
console.log(`Compiled launch chrome for ${routes.length+1} pages; programme finder and 1 November countdown ready.`);
