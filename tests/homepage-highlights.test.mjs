import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SYSTEM} from '../src/system-content.mjs';
import {products} from '../src/data.mjs';
import {compileLaunchLayout} from '../src/launch-layout.mjs';
const html=readFileSync(new URL('../src/home.html',import.meta.url),'utf8');
const rows=html.match(/<!-- Homepage highlights:[\s\S]*?<!-- End homepage highlights\. -->\n/)[0];
test('only the former homepage coach section and its obsolete anchor change',()=>{
 const rest=html.replace(rows,'');
 // Approved pre-change home body, excluding the removed coach section and fixing its support link.
 assert.equal(createHash('sha256').update(rest).digest('hex'),'23011079c6c3e277b62c24bc4f183bd3bd0f607af94efd56da430c81ddd28597');
 assert.doesNotMatch(html,/id="coaches"|coach-card|jeff\.webp|steff\.webp|href="#coaches"/);
 assert.match(html,/href="\/coaches\/"/);
});
test('exactly one programmes row and one products row replace the coach section',()=>{
 assert.equal((html.match(/id="home-programmes"/g)||[]).length,1);
 assert.equal((html.match(/id="home-products"/g)||[]).length,1);
 assert.ok(html.indexOf('id="home-programmes"')<html.indexOf('id="home-products"'));
 assert.equal((rows.match(/<article class="home-programme-tile/g)||[]).length,3);
 assert.equal((rows.match(/<article class="home-product-tile/g)||[]).length,4);
 for(const name of ['core','build','fit']){
  const programme=SYSTEM.find(p=>p.name===name);assert.ok(programme);
  assert.ok(rows.includes(`/programmes/${name}/`));
  assert.ok(rows.includes(`/assets/photos/${programme.image}.jpg`));
 }
 for(const id of ['plain-whey','creatine','high-protein-kitchen']){
  assert.ok(products.some(p=>p.id===id));assert.ok(rows.includes(`/shop/${id}/`));
 }
 assert.ok(rows.includes('/shop/?category=shots'));
});
test('new rows retain handwritten asides, existing assets and honest product previews',()=>{
 assert.equal((rows.match(/class="home-showcase-note"/g)||[]).length,2);
 for(const [,src] of rows.matchAll(/<img[^>]+src="([^"]+)"/g))assert.ok(existsSync(new URL('../public'+src,import.meta.url)),src);
 assert.doesNotMatch(rows,/£|\b(?:Buy now|Add to basket|bestseller|in stock)\b/i);
 assert.match(rows,/Supplements are optional and sold separately/);
 const css=readFileSync(new URL('../public/home-highlights.css',import.meta.url),'utf8');
 assert.match(css,/'Kalam',cursive/);assert.doesNotMatch(css,/@import|url\(/);
});
test('highlight stylesheet is page-local rather than a sitewide redesign',()=>{
 const template='<head></head><body><div class="preview-bar"></div><header class="site-header">nav</header><main id="main">Approved body</main></body>';
 for(const route of ['/','/get-started/','/programmes/','/recipes/','/shop/','/coaches/','/knowledge-centre/']){
  const result=compileLaunchLayout(template,route);
  assert.equal(result.includes('href="/home-highlights.css"'),route==='/');
  assert.match(result,/Approved body/);
 }
 const builder=readFileSync(new URL('../scripts/build-knowledge-centre.mjs',import.meta.url),'utf8');
 assert.match(builder,/data-page-style="home"/);
});
