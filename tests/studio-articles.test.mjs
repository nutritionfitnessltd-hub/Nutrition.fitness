import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {articleHtml,articleImage,articleUrl} from '../server/studio-articles.mjs';
import {itemPage,library} from '../server/studio-pages.mjs';
import {readerDocument,articlePresentation} from '../server/article-reader.mjs';
const articles=JSON.parse(fs.readFileSync(new URL('../src/knowledge-centre/articles.json',import.meta.url)));
test('all website articles retain their full readable text, headings, tables and source links',()=>{
 for(const a of articles){
  const html=articleHtml(a.bodyHtml),text=s=>s.replace(/<[^>]*>/g,'').replaceAll('&amp;','&').replaceAll('&#39;',"'").replaceAll('&quot;','"').trim();
  assert.equal(text(html),text(a.bodyHtml),a.slug);
  assert.equal((html.match(/<h2>/g)||[]).length,(a.bodyHtml.match(/<h2>/g)||[]).length);
  assert.equal((html.match(/<table>/g)||[]).length,(a.bodyHtml.match(/<table>/g)||[]).length);
 }
});
test('imported markup cannot introduce scripts, event handlers or unsafe links',()=>{
 const html=articleHtml('<p onclick="alert(1)">Hello &amp; welcome</p><script>alert(1)</script><img src=x onerror="alert(1)"><a href="javascript:alert(1)">bad</a><a href="/recipes/">safe</a>');
 assert.doesNotMatch(html,/<script|<img|onclick=|onerror=|href="javascript:/);assert.match(html,/Hello &amp; welcome/);assert.match(html,/href="https:\/\/nutrition-fitness-website-2.vercel.app\/recipes\/"/);
 assert.equal(articleUrl('javascript:alert(1)'), '');assert.equal(articleUrl('data:text/html,test'),'');
 assert.equal(articleImage({kind:'article',fields:{imageUrl:'https://untrusted.example/photo'}}),'');
});
test('published articles open as reading pages with notes collapsed and editing limited by role',()=>{
 const a=articles[0],r={id:'website-article:'+a.slug,kind:'article',title:a.title,status:'Approved',publication:{status:'published'},fields:{bodyFormat:'html',body:a.bodyHtml,shortAnswer:a.shortAnswer,imageUrl:'/assets/photos/knowledge-1.jpg',sources:a.sources,salesUse:a.salesUse}};
 const data={actor:{role:'staff',access:{library:true,edit:false}},assigned:new Set([r.id]),items:[r],byId:new Map([[r.id,r]]),projects:[],people:[]};
 const html=itemPage(new URLSearchParams({id:r.id}),data);assert.match(html,/<iframe[^>]+data-article-reader/);assert.match(html,/Open full-width preview/);assert.match(html,/Sales &amp; sharing notes|Sales & sharing notes/);assert.doesNotMatch(html,/<form|Edit article|<details[^>]* open/);
 const reader=readerDocument(r,articleImage(r));assert.match(reader,/The short answer/);assert.match(reader,/Sources and checks/);assert.match(reader,/In this guide/);assert.match(reader,/knowledge-centre\/knowledge-centre.css/);assert.doesNotMatch(reader,/Sales &amp; sharing notes/);
 assert.match(library(new URLSearchParams({bucket:'published',kind:'article'}),data),/knowledge-1.jpg/);
 assert.doesNotMatch(library(new URLSearchParams({bucket:'drafts',kind:'article'}),data),new RegExp(a.slug));
 data.actor.role='admin';assert.match(itemPage(new URLSearchParams({id:r.id}),data),/Edit article/);
 assert.match(itemPage(new URLSearchParams({id:r.id,tab:'edit'}),data),/studio-editor-form/);
});
