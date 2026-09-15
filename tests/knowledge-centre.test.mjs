import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {matches,textMatches} from '../public/knowledge-centre/search-core.mjs';
const articles=JSON.parse(fs.readFileSync('src/knowledge-centre/articles.json','utf8'));
test('Agreed 50-topic register and editorial priorities are preserved',()=>{
 assert.equal(articles.length,50);
 assert.deepEqual(Object.fromEntries(['cost','problems','confidence','comparisons','reviews'].map(c=>[c,articles.filter(a=>a.category===c).length])),{cost:15,problems:20,confidence:5,comparisons:5,reviews:5});
 assert.equal(articles.filter(a=>a.priority<=10).length,10);
 assert.ok(articles.every(a=>a.status==='published'&&a.publishedAt==='2026-09-15'));
});
test('Combined filters use OR within a facet and AND between facets',()=>{
 const result=articles.filter(a=>matches(a,{categories:['cost','comparisons'],topics:['supplements'],situations:['gym']}));
 assert.ok(result.length>0);
 assert.ok(result.every(a=>['cost','comparisons'].includes(a.category)&&a.topics.includes('supplements')&&a.situations.includes('gym')));
 assert.equal(articles.filter(a=>matches(a,{categories:['reviews'],topics:['workouts'],situations:['family']})).length,0);
});
test('Natural-language queries retain meaningful negatives and ignore punctuation',()=>{
 assert.ok(articles.filter(a=>textMatches(a,'Why am I NOT losing weight?')).some(a=>a.id===16));
 assert.ok(articles.filter(a=>textMatches(a,'How much does NUFI cost?')).some(a=>a.id===5));
 assert.equal(articles.filter(a=>textMatches(a,'zzzz-no-matches')).length,0);
 assert.equal(articles.filter(a=>textMatches(a,'   ')).length,50);
});
test('All 50 complete articles have answers, sources and working published routes',()=>{
 for(const a of articles){
  const html=fs.readFileSync(`dist/knowledge-centre/${a.slug}/index.html`,'utf8');
  assert.ok(a.bodyHtml.replace(/<[^>]+>/g,' ').trim().split(/\s+/).length>=500,a.slug);
  assert.ok(a.shortAnswer&&a.sources.length>0,a.slug);
  assert.ok(a.sources.every(s=>s.title&&/^https:\/\//.test(s.url)&&s.checkedAt),a.slug);
  assert.ok(html.includes('The short answer')&&html.includes('Sources and checks'),a.slug);
  assert.ok(!html.includes('This guide is in preparation.'),a.slug);
  assert.ok(html.includes('noindex,nofollow'),a.slug);
  assert.ok(!/\[ARTICLE_URL\]|\[ARTICLE_LINK/.test(html),a.slug);
 }
 const html=fs.readFileSync('dist/knowledge-centre/index.html','utf8');
 assert.equal((html.match(/data-article-id=/g)||[]).length,50);
 assert.ok(!html.includes('Content preview'));
});
test('Every article has a usable sales handoff without exposing internal notes in the public index',()=>{
 const index=JSON.parse(fs.readFileSync('dist/knowledge-centre/articles.json','utf8'));
 assert.equal(index.length,50);
 assert.ok(index.every(a=>!('salesUse' in a)&&!('bodyHtml' in a)));
 for(const a of articles){
  for(const key of ['buyerConcern','whenToSend','discoveryQuestion','emailSubject','emailBody','chatReply','nextStep'])assert.ok(a.salesUse[key],`${a.slug}: ${key}`);
  const url=`https://nutrition-fitness-website-2.vercel.app/knowledge-centre/${a.slug}/`;
  assert.ok(a.salesUse.emailBody.includes(url),a.slug);
  assert.ok(a.salesUse.chatReply.includes(url),a.slug);
 }
});

test('The Knowledge Centre uses the restored site shell and is included in its existing indexes',()=>{
 const home=fs.readFileSync('dist/index.html','utf8');
 const hub=fs.readFileSync('dist/knowledge-centre/index.html','utf8');
 const styles=html=>[...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(m=>m[0]);
 for(const stylesheet of styles(home))assert.ok(hub.includes(stylesheet),stylesheet);
 assert.equal(styles(hub).length,styles(home).length+1);
 assert.ok(hub.includes('src="/site.mjs"'));
 assert.ok(hub.includes('<body data-page="knowledge-centre" class="kc-page">'));
 assert.equal(hub.match(/<footer[\s\S]*?<\/footer>/)?.[0],home.match(/<footer[\s\S]*?<\/footer>/)?.[0]);
 assert.equal((hub.match(/<main\b/g)||[]).length,1);
 assert.ok(!hub.includes('{{MAIN}}')&&!hub.includes('/styles.css'));
 const routes=JSON.parse(fs.readFileSync('dist/routes.json','utf8'));
 const index=JSON.parse(fs.readFileSync('dist/search-index.json','utf8'));
 assert.equal(routes.filter(r=>r.url.startsWith('/knowledge-centre/')).length,51);
 assert.equal(index.filter(r=>r.url.startsWith('/knowledge-centre/')).length,51);
 assert.equal(new Set(routes.map(r=>r.url)).size,routes.length);
 for(const url of ['/','/journal/','/nufi/','/shop/','/get-started/']){
  assert.ok(routes.some(r=>r.url===url),url);
  assert.ok(index.some(r=>r.url===url),url);
 }
 for(const a of articles)assert.ok(index.some(r=>r.url===`/knowledge-centre/${a.slug}/`&&r.keywords.includes(a.summary)),a.slug);
});

test('Article links and section anchors resolve within the restored website',()=>{
 for(const a of articles){
  const route=`/knowledge-centre/${a.slug}/`;
  const html=fs.readFileSync(`dist${route}index.html`,'utf8');
  const main=html.match(/<main\b[\s\S]*?<\/main>/)?.[0]||'';
  for(const [,href] of main.matchAll(/<a\b[^>]*href="([^"]+)"/g)){
   const url=new URL(href.replaceAll('&amp;','&'),'https://nutrition-fitness-website-2.vercel.app'+route);
   if(url.origin!=='https://nutrition-fitness-website-2.vercel.app')continue;
   const file=path.join('dist',url.pathname,url.pathname.endsWith('/')?'index.html':'');
   assert.ok(fs.existsSync(file),`${a.slug}: ${href}`);
   if(url.hash){
    const target=fs.readFileSync(file,'utf8');
    assert.ok(target.includes(`id="${decodeURIComponent(url.hash.slice(1))}"`),`${a.slug}: ${href}`);
   }
  }
 }
});
