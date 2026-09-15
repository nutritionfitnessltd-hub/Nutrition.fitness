import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {matches,textMatches} from '../public/knowledge-centre/search-core.mjs';
const articles=JSON.parse(fs.readFileSync('src/knowledge-centre/articles.json','utf8'));
test('Agreed 50-topic register and editorial priorities are preserved',()=>{
 assert.equal(articles.length,50);
 assert.deepEqual(Object.fromEntries(['cost','problems','confidence','comparisons','reviews'].map(c=>[c,articles.filter(a=>a.category===c).length])),{cost:15,problems:20,confidence:5,comparisons:5,reviews:5});
 assert.equal(articles.filter(a=>a.priority<=10).length,10);
 assert.ok(articles.every(a=>a.status==='draft'&&!a.publishedAt));
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
test('Each result has a working local article route and draft disclosure',()=>{
 for(const a of articles){const html=fs.readFileSync(`dist/knowledge-centre/${a.slug}/index.html`,'utf8');assert.ok(html.includes('This guide is in preparation.'));assert.ok(html.includes('noindex,nofollow'));}
 const html=fs.readFileSync('dist/knowledge-centre/index.html','utf8');assert.equal((html.match(/data-article-id=/g)||[]).length,50);assert.ok(html.includes('Full articles and individual photography are still to be added.'));
});
