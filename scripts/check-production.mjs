/** Read-only smoke check of the public production site after a main-branch deploy.
 * No protection bypass, account requests, credentials or customer data are used. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
// The published www hostname is verified; the separate apex certificate issue is unchanged.
const origin='https://www.nutrition.fitness';
const digest=value=>createHash('sha256').update(value).digest('hex');
const files=['launch.css','launch.mjs','launch-config.mjs','recipes-data.mjs','recipe-display.mjs','form-modals.css','form-modals.mjs','finder-personality.css','finder-personality.mjs'];
const expected=Object.fromEntries(await Promise.all(files.map(async file=>[file,digest(await readFile(new URL('../public/'+file,import.meta.url)))])));
let last='Deployment not verified';
for(let attempt=1;attempt<=18;attempt++){
 try{
  const stamp=Date.now();
  const get=async path=>{const response=await fetch(`${origin}/${path}?verify=${stamp}`,{signal:AbortSignal.timeout(15000),headers:{'Cache-Control':'no-cache'}});if(!response.ok)throw new Error(`HTTP ${response.status} for ${path||'homepage'}`);return response.text();};
  const html=await get('');
  if(!html.includes('class="launch-widget launch-banner"')||!html.includes('2026-11-01T09:00:00.000Z'))throw new Error('Production still serves the previous homepage.');
  if(!html.includes('src="/form-modals.mjs"')||!html.includes('href="/form-modals.css"'))throw new Error('Production modal presentation is not loaded yet.');
  if(!(html.indexOf('</header>')<html.indexOf('class="launch-widget launch-banner"')&&html.indexOf('class="launch-widget launch-banner"')<html.indexOf('<main id="main">')))throw new Error('Production banner is not between navigation and hero.');
  for(const file of files)if(digest(await get(file))!==expected[file])throw new Error(`Production ${file} is not the tested version.`);
  const quiz=await get('get-started/');
  if(!quiz.includes('finder-branded')||!quiz.includes('finder-free-note'))throw new Error('Quiz personality is not published yet.');
  const recipes=await get('recipes/');
  if(!recipes.includes('All 100 recipes'))throw new Error('Recipe library not updated yet.');
  const book=await get('shop/high-protein-kitchen/');
  if(!book.includes('high-protein-kitchen-cover.webp')||!book.includes('143 pages'))throw new Error('Book listing not updated yet.');
  const report={status:'passed',url:origin,verifiedAt:new Date().toISOString(),sourceCommit:process.env.GITHUB_SHA||null,assets:expected};
  await mkdir('test-results',{recursive:true});await writeFile('test-results/production-smoke.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));process.exit(0);
 }catch(error){last=error.message;console.log(`Production check ${attempt}/18: ${last}`);if(attempt<18)await new Promise(resolve=>setTimeout(resolve,10000));}
}
throw new Error(`Production was not verified: ${last}`);
