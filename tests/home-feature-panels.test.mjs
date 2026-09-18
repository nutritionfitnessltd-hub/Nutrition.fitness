import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {compileLaunchLayout} from '../src/launch-layout.mjs';
const home=readFileSync(new URL('../src/home.html',import.meta.url),'utf8');
const panels=home.match(/<!-- Homepage feature panels:[\s\S]*?<!-- End homepage feature panels\. -->\n/)[0];
test('only the two requested homepage feature panels change from production 20bb88e',()=>{
 assert.equal(createHash('sha256').update(home.replace(panels,'')).digest('hex'),'e7c37538b36825e0dab60781697387e27b62ae2d322ad0fc0ef606e785009ef1');
 assert.equal((panels.match(/<section /g)||[]).length,2);
 for(const id of ['recipes','shop'])assert.equal((panels.match(new RegExp(`id="${id}"`,'g'))||[]).length,1);
});
test('panels retain one genuine action each and no hand-made pouch or text-image overlays',()=>{
 assert.equal((panels.match(/class="nf-home-feature__action"/g)||[]).length,2);
 assert.match(panels,/href="\/recipes\/"/);assert.match(panels,/href="\/shop\/"/);
 assert.doesNotMatch(panels,/home-powder-pack|class="product-copy"|<br|note-small-habits.webp|note-proper-food.webp/);
 assert.match(panels,/Packaging preview/);
 for(const [,src] of panels.matchAll(/<img[^>]+src="([^"]+)"/g))assert.ok(existsSync(new URL('../public'+src,import.meta.url)));
});
test('feature geometry is owned by a scoped component, not fixed overlay offsets',()=>{
 const css=readFileSync(new URL('../public/home-feature-panels.css',import.meta.url),'utf8');
 assert.match(css,/grid-template-areas/);assert.match(css,/object-fit:contain/);assert.match(css,/'Kalam',cursive/);
 assert.doesNotMatch(css,/!important|position:absolute|pointer-events:none/);
});
test('new panel stylesheet is not loaded on other pages',()=>{
 const template='<head></head><body><div class="preview-bar"></div><header class="site-header">nav</header><main id="main">Original</main></body>';
 for(const route of ['/','/recipes/','/shop/','/get-started/','/coaches/','/knowledge-centre/']){
  assert.equal(compileLaunchLayout(template,route).includes('href="/home-feature-panels.css"'),route==='/');
 }
});
