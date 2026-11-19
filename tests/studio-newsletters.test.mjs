import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {isNewsletter,newsletterDocument,newsletterPreview,sendNewsletter} from '../server/studio-newsletters.mjs';
import {itemPage} from '../server/studio-pages.mjs';
import {handleStudio} from '../server/studio.mjs';
import {changeStudio} from '../server/studio-actions.mjs';
const admin={role:'admin',id:'test-admin'};
const r={id:'worker:test',kind:'communication',title:'Welcome newsletter',status:'Draft',revision:4,newsletterAssetsId:'newsletter-artwork:11111111-1111-1111-1111-111111111111',fields:{subject:'Hello',body:'Plain-text message',plainText:'Plain-text alternative',emailHtml:'<html><head><style>@media(max-width:660px){.card{display:block;width:100%}}</style></head><body><!--[if mso]><table><![endif]--><table width="640" style="background:#FAF6EF"><tr><td><img src="{{HERO_IMAGE_URL}}" alt="Approved artwork"><h1>Hi {{FIRST_NAME_OR_THERE}}</h1></td></tr></table><a href="{{UNSUBSCRIBE_URL}}">Unsubscribe</a></body></html>',designPackUrl:'https://chatgpt.com/library?file_id=test'}};
const data=(actor=admin)=>({actor,items:[r],byId:new Map([[r.id,r]]),assigned:new Set([r.id]),people:[],projects:[],index:{records:[],files:{}}});
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.body=v;}});
test('workspace loads when the serverless runtime disables require of ESM',()=>{
  const run=spawnSync(process.execPath,['--no-experimental-require-module','--input-type=module','-e',"await import('./server/library-reader.mjs')"],{cwd:new URL('..',import.meta.url),encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
});
test('saved newsletters open on their HTML design, with source tools and separate plain text',()=>{
  const html=itemPage(new URLSearchParams({id:r.id}),data());
  for(const label of ['Newsletter','Desktop','Mobile','Copy HTML','Download HTML','Plain-text version','Edit HTML &amp; text'])assert.ok(html.includes(label),label);
  assert.match(html,/<iframe[^>]*sandbox=""/);
  assert.ok(!html.includes('Coaching message'));
  assert.match(itemPage(new URLSearchParams({id:r.id,tab:'edit'}),data()),/Back to design/);
  const ordinary={...r,fields:{subject:'SMS',body:'Keep going'}};
  assert.equal(isNewsletter(ordinary),false);
  assert.doesNotMatch(itemPage(new URLSearchParams({id:r.id}),{...data(),items:[ordinary],byId:new Map([[r.id,ordinary]])}),/newsletter-canvas/);
});
test('preview resolves only artwork belonging to this draft and preserves responsive email styling',()=>{
  const assets={itemId:r.id,images:{HERO_IMAGE_URL:'data:image/png;base64,aGVsbG8='}};
  const html=newsletterDocument(r,assets);
  assert.match(html,/src="data:image\/png;base64,aGVsbG8="/);
  assert.match(html,/@media\(max-width:660px\)/);assert.match(html,/background:#FAF6EF/);assert.match(html,/Hi there/);
  assert.doesNotMatch(newsletterDocument(r,{...assets,itemId:'another'}),/data:image/);
  assert.match(r.fields.emailHtml,/\{\{HERO_IMAGE_URL\}\}/);
});
test('email preview rejects executable HTML, SVG, remote CSS, injected CSS and forms',()=>{
  const html=newsletterDocument({...r,fields:{emailHtml:`<script>alert(1)</script><base href="https://evil.test"><meta http-equiv="refresh" content="0;url=https://evil.test"><iframe src="https://evil.test"></iframe><form action="https://evil.test"><input></form><svg onload="alert(1)"></svg><img src="data:image/svg+xml;base64,aA==" onerror="alert(1)"><a href="javascript:alert(1)">Link</a><style>@import 'https://evil.test';.x{background:url(https://evil.test);position:fixed;color:red}</style><p style="background:expression(alert(1));color:blue" onclick="alert(1)">Text</p>`}});
  assert.doesNotMatch(html,/<script|<base|<meta|<iframe|<form|<input|<svg|onerror|onclick|javascript:|@import|url\(|expression\(|position:fixed|data:image\/svg/);
  assert.match(html,/color:red/);assert.match(html,/color:blue/);
});
test('source download is exact, keeps Outlook comments and merge tags, and never loads artwork',async()=>{
  const res=response();await sendNewsletter({method:'GET'},res,r,'newsletter-html',{},()=>assert.fail('No artwork request'));
  assert.equal(res.body,r.fields.emailHtml);assert.equal(res.statusCode,200);
  assert.equal(res.headers['Content-Disposition'],'attachment; filename="Welcome-newsletter.html"');
  assert.equal(res.headers['Cache-Control'],'private, no-store');assert.match(res.headers['Content-Security-Policy'],/sandbox/);
  await assert.rejects(sendNewsletter({method:'POST'},response(),r,'newsletter-html',{}),e=>e.status===405);
});
test('private preview loads the saved artwork reference and forbids scripts or form submission',async()=>{
  let key;const res=response();await sendNewsletter({method:'GET'},res,r,'newsletter-preview',{},async(_env,id)=>{key=id;return {itemId:r.id,images:{HERO_IMAGE_URL:'data:image/png;base64,aA=='}};});
  assert.equal(key,r.newsletterAssetsId);assert.match(res.body,/data:image\/png/);
  assert.match(res.headers['Content-Security-Policy'],/script-src 'none'/);assert.match(res.headers['Content-Security-Policy'],/form-action 'none'/);
});
test('both HTML endpoints enforce assigned-content permissions and never save a record',async()=>{
  const api=async(path,opts)=>{assert.ok(!opts?.method||opts.method==='GET');return path.startsWith('/rest/v1/nufi_studio_items?')?[{id:r.id,payload:r,revision:4}]:[];};
  for(const route of ['newsletter-html','newsletter-preview']){
    const res=response();await handleStudio({method:'GET'},res,{params:new URLSearchParams({studio:route,id:r.id}),actor:admin,api,load:async()=>({records:[],files:{}}),env:{}});assert.equal(res.statusCode,200);
    const denied=response();await handleStudio({method:'GET'},denied,{params:new URLSearchParams({studio:route,id:r.id}),actor:{role:'staff',id:'outsider'},api,load:async()=>({records:[],files:{}}),env:{}});assert.equal(denied.statusCode,403);assert.ok(!denied.body.includes('Plain-text message'));
  }
});
test('editing HTML preserves artwork, text and workflow status; stale saves fail',async()=>{
  let saved;const fields={...r.fields,emailHtml:r.fields.emailHtml.replace('Hi ','Welcome ')};
  const form={action:'content-save',title:r.title,revision:'4',fields:JSON.stringify(fields),intent:'preview'};
  const api=async(_path,opts)=>{saved=opts.payload.document;return [{revision:5}];};
  await changeStudio(new URLSearchParams({id:r.id}),form,data(),api);
  assert.equal(saved.newsletterAssetsId,r.newsletterAssetsId);assert.equal(saved.fields.body,r.fields.body);assert.equal(saved.fields.plainText,r.fields.plainText);assert.equal(saved.status,'Draft');
  assert.equal(saved.fields.emailHtml,fields.emailHtml);
  await assert.rejects(changeStudio(new URLSearchParams({id:r.id}),{...form,revision:'3'},data(),api),e=>e.status===409);
});
