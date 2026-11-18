/** Check the final generated site, including pages built by later pipeline stages. */
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {LAUNCH} from '../public/launch-config.mjs';
const dist=path.resolve(import.meta.dirname,'../dist');
async function htmlFiles(dir){
 const entries=await readdir(dir,{withFileTypes:true});
 const results=await Promise.all(entries.map(e=>e.isDirectory()?htmlFiles(path.join(dir,e.name)):e.name.endsWith('.html')?[path.join(dir,e.name)]:[]));
 return results.flat();
}
const files=await htmlFiles(dist);
assert.ok(files.length>0,'Build the site before checking its banner.');
for(const file of files){
 const html=await readFile(file,'utf8'),name=path.relative(dist,file);
 const banner=html.indexOf('class="launch-widget launch-banner"'),main=html.search(/<main\b[^>]*\bid="main"[^>]*>/);
 if(Date.now()>=Date.parse(LAUNCH.at)){
  assert.equal(banner,-1,`${name}: an expired launch banner must not be shown`);
  assert.ok(main>=0,`${name}: main content is missing`);
  assert.ok(!html.includes('class="preview-bar"'),`${name}: obsolete preview strip`);
  continue;
 }
 assert.equal((html.match(/class="launch-widget launch-banner"/g)||[]).length,1,`${name}: exactly one launch banner required`);
 assert.ok(banner>html.indexOf('</header>')&&banner<main,`${name}: banner must be below navigation and above main content`);
 assert.equal((html.match(/id="launch-heading"/g)||[]).length,1,`${name}: duplicate launch heading`);
 assert.equal((html.match(/src="\/launch.mjs"/g)||[]).length,1,`${name}: launch script missing or duplicated`);
 assert.ok(html.slice(banner,main).includes(`datetime="${LAUNCH.at}"`),`${name}: incorrect launch date`);
 assert.ok(!html.includes('class="preview-bar"'),`${name}: obsolete preview strip`);
}
console.log(`Verified date-appropriate launch visibility on all ${files.length} generated pages.`);
