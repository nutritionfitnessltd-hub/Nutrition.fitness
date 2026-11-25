import test from 'node:test';
import assert from 'node:assert/strict';
import {Writable} from 'node:stream';
import {handleStudio} from '../server/studio.mjs';

const hash='a'.repeat(64),bytes=Buffer.from('private image fixture');
const book={id:'book:fixture',kind:'ebook',title:'Book',fields:{},bookAssets:{front:{pathname:'nutrition-library/books/v1/'+hash+'.webp',type:'image/webp',name:'front.webp'},digital:{pathname:'nutrition-library/books/v1/'+hash+'.pdf',type:'application/pdf',name:'reading.pdf'}}};
const article={id:'article:fixture',kind:'article',title:'Article',fields:{},articleImage:{pathname:'nutrition-library/article-images/v1/12345678-1234-1234-1234-123456789abc.webp',type:'image/webp'}};
const mealplan={id:'mealplan:fixture',kind:'mealplan',title:'Plan',fields:{generatedRecipes:[{id:'recipe',fields:{imageAsset:{pathname:'nutrition-library/meal-photos/v1/'+hash+'.webp',type:'image/webp'}}}]}};
function response(){const res=new Writable({write(chunk,encoding,done){this.chunks.push(Buffer.from(chunk));done();}});res.chunks=[];res.headers={};res.setHeader=(k,v)=>{res.headers[k]=v;};return res;}
const actors=[{role:'admin',id:'admin'},{role:'staff',id:'reader',access:{library:true,all_library:true}}];

test('concurrent book covers and PDFs read one record each without loading the workspace',async()=>{
 for(const actor of actors){
  let queries=0,reads=0;
  await Promise.all(Array.from({length:8},async(_,i)=>{
   const res=response();
   await handleStudio({method:'GET'},res,{params:new URLSearchParams({studio:'book-file',id:book.id,asset:i%2?'front':'digital'}),actor,env:{},
    api:async path=>{queries++;assert.match(path,/id=eq.book%3Afixture&select=id,payload,revision&limit=1$/);return [{id:book.id,payload:book,revision:1}];},
    load:()=>{throw Error('must not rebuild workspace');},
    readImageFile:async()=>{reads++;return {stream:new ReadableStream({start(c){c.enqueue(bytes);c.close();}})};}});
   assert.equal(res.statusCode,200);assert.deepEqual(Buffer.concat(res.chunks),bytes);assert.match(res.headers['Cache-Control'],/private/);
  }));
  assert.equal(queries,8);assert.equal(reads,8);
 }
});

test('uploaded article and meal plan images also avoid full workspace reads',async()=>{
 for(const [studio,record] of [['article-image',article],['mealplan-image',mealplan]]){
  const res=response();let queries=0;
  await handleStudio({method:'GET'},res,{params:new URLSearchParams({studio,id:record.id,recipe:'recipe'}),actor:actors[1],env:{},
   api:async()=>{queries++;return [{id:record.id,payload:record,revision:1}];},load:()=>{throw Error('must not rebuild workspace');},
   readImageFile:async()=>({stream:new ReadableStream({start(c){c.enqueue(bytes);c.close();}})})});
  assert.equal(res.statusCode,200);assert.equal(queries,1);assert.deepEqual(Buffer.concat(res.chunks),bytes);
 }
});

test('assigned-only readers retain workspace permission checks before fetching private files',async()=>{
 const res=response();let fetched=false,loaded=false;
 await handleStudio({method:'GET'},res,{params:new URLSearchParams({studio:'book-file',id:book.id,asset:'digital'}),actor:{role:'staff',id:'restricted',access:{library:true}},env:{},
  api:async path=>path.includes('id=eq.')?[{id:book.id,payload:book,revision:1}]:[],load:async()=>{loaded=true;return {records:[],files:{}};},
  readImageFile:async()=>{fetched=true;throw Error('unauthorized read');}});
 assert.equal(loaded,true);assert.equal(fetched,false);assert.ok([403,404].includes(res.statusCode));
});
