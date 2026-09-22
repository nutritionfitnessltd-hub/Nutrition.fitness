import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FORM_ROUTES,normalPath,formRoute} from '../public/form-modals.mjs';
import {compileLaunchLayout} from '../src/launch-layout.mjs';
const base='https://nutrition.fitness/recipes/';
test('only known, same-origin form routes can be embedded',()=>{
 for(const route of Object.keys(FORM_ROUTES)){
  assert.equal(formRoute(route,base),FORM_ROUTES[route]);
  assert.equal(formRoute(route+'?utm_source=qa',base),FORM_ROUTES[route]);
 }
 for(const url of ['https://example.org/get-started/','//example.org/contact/','javascript:alert(1)','data:text/html,hello','/api/leads','/recipes/','/meal-planner/','/account/admin/'])assert.equal(formRoute(url,base),null);
 assert.equal(formRoute('/get-started',base),FORM_ROUTES['/get-started/']);
 assert.equal(formRoute('/contact/', 'not a URL'),null);
 assert.equal(normalPath('/'),'/');
});
test('every form route keeps a real page and a meaningful modal title',()=>{
 for(const [route,spec]of Object.entries(FORM_ROUTES)){
  assert.match(route,/^\/[a-z/-]+\/$/);assert.ok(spec.title.length>4);assert.ok(spec.label.length>4);assert.ok(spec.selector);
 }
 assert.equal(FORM_ROUTES['/get-started/'].remember,true);
 assert.equal(FORM_ROUTES['/contact/'].remember,true);
 assert.equal(FORM_ROUTES['/account/'],undefined);
 for(const route of ['/login/','/register/','/forgot-password/','/reset-password/','/account/','/admin/'])assert.equal(formRoute(route,base),null);
});
test('all shared page layouts load one modal controller and one stylesheet without changing the page content',()=>{
 const input='<head></head><body><div class="preview-bar">preview</div><header class="site-header">navigation</header><main id="main"><p>Approved page content</p></main></body>';
 for(const route of ['/',...Object.keys(FORM_ROUTES),'/knowledge-centre/example/','/shop/plain-whey/']){
  const html=compileLaunchLayout(input,route);
  assert.equal((html.match(/src="\/form-modals.mjs"/g)||[]).length,1);
  assert.equal((html.match(/href="\/form-modals.css"/g)||[]).length,1);
  assert.match(html,/<p>Approved page content<\/p>/);
 }
});
test('modal layer never implements a second submission or stores personal form data',()=>{
 const source=readFileSync(new URL('../public/form-modals.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/fetch\(|localStorage|sessionStorage|\/api\/|innerHTML\s*=/);
 assert.match(source,/e\.origin!==location\.origin/);
 assert.match(source,/e\.source!==active\.frame\.contentWindow/);
 assert.match(source,/entry\.body\.append\(node\)/); // Moves existing form, preserving its handlers.
});
