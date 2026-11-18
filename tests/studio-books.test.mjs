import test from 'node:test';
import assert from 'node:assert/strict';
import {bookFile,bookPage} from '../server/studio-books.mjs';
import {library,itemPage} from '../server/studio-pages.mjs';
const path='nutrition-library/books/v1/'+'a'.repeat(64);
const r={id:'book:fixture',kind:'ebook',title:'Fixture book',status:'Draft',fields:{bookType:'Recipe book',pageCount:12,chapters:[],recipeIds:[]},bookAssets:{front:{pathname:path+'.webp',name:'front.webp',type:'image/webp'},back:{pathname:path+'.webp',name:'back.webp',type:'image/webp'},digital:{pathname:path+'.pdf',name:'reading.pdf',type:'application/pdf'}}};
const data=role=>({actor:{role},items:[r],byId:new Map([[r.id,r]]),assigned:new Set(),projects:[],people:[]});
test('draft books show front/back covers, existing PDF and missing print edition separately',()=>{
 const d=data('admin'),html=itemPage(new URLSearchParams({id:r.id}),d);
 for(const text of ['Front cover','Back cover','Reading PDF','Print PDF','Not available yet','Draft'])assert.ok(html.includes(text));
 assert.ok(!html.includes('asset=print'));assert.match(html,/asset=digital/);
 assert.match(html,/<iframe class="studio-book-reader"/);assert.match(html,/Open full screen/);
 assert.ok(html.indexOf('<iframe')<html.indexOf('Book details &amp; files'));
 assert.doesNotMatch(html,/<details[^>]* open|<form|<summary>Contents|Linked recipes/);
 const cards=library(new URLSearchParams({bucket:'drafts',kind:'ebook'}),d);
 assert.match(cards,/studio=book-file&amp;id=book%3Afixture&amp;asset=front/);assert.doesNotMatch(cards,/amp;amp/);
 const published=library(new URLSearchParams({bucket:'published',kind:'ebook'}),d);assert.doesNotMatch(published,/Fixture book/);
});
test('private book PDFs require admin or assignment, and only stored hash paths are allowed',()=>{
 const p=asset=>new URLSearchParams({id:r.id,asset});
 const d=data('staff');assert.equal(bookFile(p('front'),d).type,'image/webp');
 assert.throws(()=>bookFile(p('digital'),d),e=>e.status===403);
 assert.doesNotMatch(bookPage(r,d),/asset=digital/);
 d.assigned.add(r.id);assert.equal(bookFile(p('digital'),d).type,'application/pdf');
 assert.throws(()=>bookFile(p('print'),d),e=>e.status===404);
 assert.throws(()=>bookFile(p('../digital'),d),e=>e.status===404);
 const bad={...r,bookAssets:{digital:{...r.bookAssets.digital,pathname:'https://example.com/private.pdf'}}};d.byId.set(r.id,bad);
 assert.throws(()=>bookFile(p('digital'),d),e=>e.status===404);
});
