import test from 'node:test';
import assert from 'node:assert/strict';
import {Writable} from 'node:stream';
import {imageBytes,saveArticleImage,sendArticleImage} from '../server/studio-article-images.mjs';
import {articleImage,articleImageEditor,articlePage} from '../server/studio-articles.mjs';
import {readerDocument} from '../server/article-reader.mjs';
import {library} from '../server/studio-pages.mjs';

// A real 1x1 lossless WebP, also decoded by the browser verification.
const image='data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';
function fixture(){
 const record={id:'test:article',kind:'article',title:'Before',status:'Approved',revision:2,fields:{body:'Before',imageUrl:'/assets/photos/knowledge-1.jpg',imageCredit:'Original photographer'},approval:{by:'admin'}};
 const data={actor:{role:'staff',id:'test-staff'},assigned:new Set([record.id]),byId:new Map([[record.id,record]]),items:[record],projects:[],people:[]};
 const form={action:'content-save',revision:'2',title:'Updated article',fields:JSON.stringify({...record.fields,body:'Unsaved article changes'}),imageUpload:image,uploadAlt:'A useful description',uploadCredit:'Our team'};
 return {record,data,form,params:new URLSearchParams({id:record.id}),env:{BLOB_READ_WRITE_TOKEN:'test-only'}};
}
test('image decoder accepts WebP and rejects non-images, corrupt sizes and excessive dimensions',()=>{
 assert.deepEqual([imageBytes(image).width,imageBytes(image).height],[1,1]);
 for(const invalid of ['data:image/svg+xml;base64,PHN2Zz4=',image+'invalid','data:image/webp;base64,'+'A'.repeat(900001)])assert.throws(()=>imageBytes(invalid));
 const bytes=Buffer.from(image.split(',')[1],'base64');bytes.writeUInt32LE(2000,21);
 assert.throws(()=>imageBytes('data:image/webp;base64,'+bytes.toString('base64')));
});
test('one save keeps article edits, saves a private asset, and uses it for both hero and thumbnail',async()=>{
 const {record,data,form,params,env}=fixture();let document,stored;
 const api=async(path,options)=>{assert.equal(path,'/rest/v1/rpc/nufi_studio_save');assert.equal(options.payload.expected,2);document=options.payload.document;return [{revision:3}];};
 await saveArticleImage(params,form,data,api,env,{store:async(path,bytes,options)=>{stored=path;assert.equal(options.access,'private');assert.equal(options.contentType,'image/webp');assert.equal(bytes.length,34);}});
 assert.equal(document.fields.body,'Unsaved article changes');assert.equal(document.title,'Updated article');assert.equal(document.fields.imageAlt,'A useful description');assert.equal(document.fields.imageCredit,'Our team');assert.equal(document.fields.imageCreditUrl,'');assert.equal(document.status,'Draft');assert.equal(document.approval,undefined);
 assert.equal(document.articleImage.pathname,stored);assert.equal(record.articleImage,undefined);assert.equal(record.fields.body,'Before');
 const src=articleImage(document);assert.match(src,/studio=article-image/);
 const escaped=src.replaceAll('&','&amp;');data.items=[document];data.byId.set(document.id,document);
 assert.ok(readerDocument(document,articleImage(document)).includes('src="'+escaped+'"'));
 assert.ok(library(new URLSearchParams({kind:'article',bucket:'drafts'}),data).includes('src="'+escaped+'"'));
 assert.match(articleImageEditor(document),/data-article-upload/);
});
test('unauthorised, stale and malformed saves are rejected before storing an image',async()=>{
 for(const scenario of ['permission','revision','fields','image','storage']){
  const f=fixture();let writes=0;
  if(scenario==='permission')f.data.assigned.clear();if(scenario==='revision')f.form.revision='1';if(scenario==='fields')f.form.fields='invalid';if(scenario==='image')f.form.imageUpload='data:text/plain;base64,dGVzdA==';if(scenario==='storage')f.env={};
  await assert.rejects(saveArticleImage(f.params,f.form,f.data,async()=>{writes++;return [];},f.env,{store:async()=>{writes++;}}));assert.equal(writes,0,scenario);
 }
});
test('concurrent save conflicts delete only the new upload and preserve the previous image',async()=>{
 const f=fixture();f.record.articleImage={pathname:'nutrition-library/article-images/v1/11111111-1111-1111-1111-111111111111.webp',type:'image/webp'};let stored,removed;
 await assert.rejects(saveArticleImage(f.params,f.form,f.data,async()=>[],f.env,{store:async path=>{stored=path;},remove:async path=>{removed=path;}}),e=>e.status===409||e.statusCode===409);
 assert.equal(removed,stored);assert.notEqual(removed,f.record.articleImage.pathname);
});
test('image endpoint serves only the record-owned private image with no public cache',async()=>{
 const f=fixture();f.record.articleImage={pathname:'nutrition-library/article-images/v1/11111111-1111-1111-1111-111111111111.webp',type:'image/webp'};
 const chunks=[],headers={},res=new Writable({write(chunk,enc,cb){chunks.push(chunk);cb();}});res.setHeader=(k,v)=>headers[k]=v;
 await sendArticleImage({method:'GET'},res,f.params,f.data,async path=>{assert.equal(path,f.record.articleImage.pathname);return {stream:new Response(imageBytes(image).bytes).body};});
 assert.equal(headers['Content-Type'],'image/webp');assert.equal(headers['Cache-Control'],'private, no-store');assert.equal(Buffer.concat(chunks).length,34);
 f.record.articleImage.pathname='other-private-file.webp';await assert.rejects(sendArticleImage({method:'GET'},res,f.params,f.data),/unavailable/);
});
