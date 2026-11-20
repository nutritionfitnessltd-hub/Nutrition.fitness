import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Writable} from 'node:stream';
import {studioData} from '../server/studio-store.mjs';
import {issues} from '../server/studio-model.mjs';
import {handleStudio} from '../server/studio.mjs';
import {authorizeStudioRequest} from '../server/library-permissions.mjs';
import {changeProducts,productsPage,productPage,creativesPage,productAssetPage,productStoragePrefix} from '../server/studio-products.mjs';
import {productUploadToken,attachProductFile,sendProductFile} from '../server/studio-product-files.mjs';
import {reviewWindowDocument} from '../server/studio-review.mjs';
import {changeStudio} from '../server/studio-actions.mjs';

const admin={role:'admin',id:randomUUID()},staff={role:'staff',id:randomUUID(),name:'Designer'};
const params=(section,id,extra={})=>new URLSearchParams({studio:section,id,...extra});
function fixture(){
 const rows=new Map(),projects=[],tasks=[];
 const api=async(path,options={})=>{
  if(path.includes('rpc/nufi_studio_save')){const p=options.payload,old=rows.get(p.item);if((old?.revision||0)!==p.expected)return [];const row={id:p.item,payload:structuredClone(p.document),revision:p.expected+1,updated_at:new Date().toISOString()};rows.set(row.id,row);return [row];}
  if(path.includes('nufi_studio_items?'))return [...rows.values()];
  if(path.includes('nufi_library_projects?'))return projects;
  if(path.includes('nufi_library_tasks?'))return tasks;
  return [];
 };
 const load=async()=>({records:[],files:{}}),data=(actor=admin)=>studioData(api,actor,load);
 const save=(section,id,f,actor=admin)=>data(actor).then(d=>changeProducts(params(section,id),f,d,api));
 const product=async(title='Daily nutrition')=>{const id=randomUUID();await save('product','new',{action:'product-save',id,revision:'0',title,category:'Supplements',stage:'In development',ingredients:'Verified ingredients go here'});return 'studio:product:'+id;};
 const asset=async(productId,title='Launch creative')=>{const id=randomUUID();await save('product-asset','new',{action:'product-asset-save',id,revision:'0',title,type:'Ad copy',assetRole:'advert',channel:'Instagram',campaign:'Launch',body:'Your everyday routine.',['product_'+productId]:'1'});return 'studio:product:'+id;};
 return {rows,projects,tasks,api,load,data,save,product,asset};
}
function response(){const chunks=[],headers={};return {headers,statusCode:200,setHeader(k,v){headers[k]=v;},end(x=''){chunks.push(String(x));this.body=chunks.join('');}};}

test('product and creative save, reload, filter, review and link as one record',async()=>{
 const f=fixture(),p=await f.product(),a=await f.asset(p),p2=await f.product('Training kit');let d=await f.data();
 assert.match(productsPage(params('products',''),d),/Daily nutrition/);
 assert.match(productPage(params('product',p,{tab:'creatives'}),d),/Launch creative/);
 assert.match(creativesPage(params('product-creatives','',{channel:'Instagram',campaign:'Launch'}),d),/Launch creative/);
 assert.doesNotMatch(creativesPage(params('product-creatives','',{channel:'YouTube'}),d),/<h2>Launch creative/);
 await f.save('product-asset',a,{action:'product-asset-status',revision:'1',status:'Approved'});
 assert.equal(f.rows.get(a).payload.status,'Approved');
 await f.save('product',p2,{action:'product-asset-link',productId:p2,assetId:a,assetRole:'advert'});
 assert.equal(f.rows.size,3);assert.equal(f.rows.get(a).payload.status,'Draft');assert.equal(f.rows.get(a).payload.approval,undefined);
 assert.deepEqual(f.rows.get(a).payload.fields.productIds,[p,p2]);
 await assert.rejects(f.save('product-asset',a,{action:'product-asset-status',revision:'1',status:'Approved'}),e=>e.status===409);
});

test('product validation rejects unsafe links and retains submitted values in the form',async()=>{
 const f=fixture(),res=response();
 await handleStudio({method:'POST',body:{action:'product-save',id:randomUUID(),revision:'0',title:'Test <script>',category:'Supplements',stage:'Idea',folderUrl:'javascript:alert(1)'}},res,{params:params('product','new'),actor:admin,api:f.api,load:f.load,env:{}});
 assert.equal(res.statusCode,400);assert.match(res.body,/Test &lt;script&gt;/);assert.equal(f.rows.size,0);
 const p=await f.product();await assert.rejects(f.save('product',p,{action:'product-save',id:p,revision:'1',title:'Date',category:'Supplements',stage:'Idea',launchDate:'2026-02-31'}),e=>e.status===400);
});

test('assigned product grants linked assets without granting another linked product',async()=>{
 const f=fixture(),p=await f.product('Assigned product'),secret=await f.product('Other team product'),a=await f.asset(p);
 await f.save('product',secret,{action:'product-asset-link',productId:secret,assetId:a,assetRole:'advert'});f.tasks.push({record_id:p});
 const d=await f.data(staff);assert.ok(d.byId.has(p));assert.ok(d.byId.has(a));assert.ok(!d.byId.has(secret));
 assert.doesNotMatch(productAssetPage(params('product-asset',a),d),/Other team product/);
 await f.save('product-asset',a,{action:'product-asset-save',id:a,revision:'2',title:'Updated',type:'Ad copy',assetRole:'advert',channel:'Email',body:'New copy',['product_'+p]:'1'},staff);
 assert.deepEqual(f.rows.get(a).payload.fields.productIds,[p,secret]);
 await assert.rejects(f.save('product-asset','new',{action:'product-asset-save',id:randomUUID(),revision:'0',title:'No access',type:'Ad copy',assetRole:'advert',channel:'Email',['product_'+secret]:'1'},staff),e=>e.status===403);
 await assert.rejects(f.save('product','new',{action:'product-save',id:randomUUID(),revision:'0'},staff),e=>e.status===403);
});

test('legacy assets keep their identity when linked and edited; project progress uses real tasks',async()=>{
 const f=fixture(),p=await f.product(),id='training:cover';f.rows.set(id,{id,revision:1,payload:{id,kind:'asset',title:'Old image',status:'Draft',fields:{type:'Image',brief:'Keep this'}}});
 await f.save('product',p,{action:'product-asset-link',productId:p,assetId:id,assetRole:'product'});
 await f.save('product-asset',id,{action:'product-asset-save',id,revision:'2',title:'Renamed',type:'Photography',assetRole:'product',channel:'Unspecified',['product_'+p]:'1'});
 assert.equal(f.rows.size,2);assert.equal(f.rows.get(id).payload.title,'Renamed');
 const project={id:randomUUID(),name:'Launch project',creator_id:admin.id,entries:[{status:'Done'},{status:'In progress'}]};f.projects.push(project);
 await f.save('product',p,{action:'product-project-link',revision:'1',projectId:project.id});
 const html=productPage(params('product',p,{tab:'work'}),await f.data());assert.match(html,/1 \/ 2/);assert.match(html,/value="1" max="2"/);assert.match(html,/Launch project/);
});

test('generic content mutations cannot bypass product association checks',async()=>{
 const f=fixture(),p=await f.product(),a=await f.asset(p),d=await f.data();
 await assert.rejects(changeStudio(params('item',a),{action:'content-save',revision:'1',title:'Bypass',fields:JSON.stringify({productAsset:true,productIds:['unassigned']})},d,f.api),e=>e.status===400);
 await assert.rejects(changeStudio(params('new',''),{action:'content-create',id:randomUUID(),kind:'asset',title:'Bypass',fields:JSON.stringify({productAsset:true,productIds:['unassigned']})},d,f.api),e=>e.status===400);
 assert.equal(f.rows.size,2);
});

test('creative approval needs content and the review shows the finished asset without editing controls',async()=>{
 const f=fixture(),p=await f.product(),a=await f.asset(p),d=await f.data(),r=d.byId.get(a);
 assert.deepEqual(issues(r,d.items),[]);assert.ok(issues({...r,fields:{...r.fields,body:''}},d.items).length);
 const html=reviewWindowDocument(params('review-preview',a),d);
 assert.match(html,/Your everyday routine\./);assert.match(html,/product-space/);assert.doesNotMatch(html,/data-product-upload|name="status"|data-open-schedule/);
 const res=response();await handleStudio({method:'GET'},res,{params:params('item',a),actor:admin,api:f.api,load:f.load,env:{}});assert.equal(res.statusCode,303);assert.match(res.headers.Location,/studio=product-asset/);
});

test('private upload tokens restrict ownership, format, size and overwrite',async()=>{
 const f=fixture(),p=await f.product(),a=await f.asset(p),d=await f.data(),pathname=productStoragePrefix(a)+randomUUID()+'.png',env={BLOB_READ_WRITE_TOKEN:'test-only'};
 const result=await productUploadToken({body:{type:'blob.generate-client-token'}},params('product-upload',a),d,env,async options=>options.onBeforeGenerateToken(pathname));
 assert.deepEqual(result.allowedContentTypes,['image/png']);assert.equal(result.maximumSizeInBytes,250*1024*1024);assert.equal(result.allowOverwrite,false);assert.ok(result.validUntil>Date.now());
 await assert.rejects(productUploadToken({body:{type:'blob.generate-client-token'}},params('product-upload',a),d,env,async o=>o.onBeforeGenerateToken(productStoragePrefix(p)+randomUUID()+'.png')),e=>e.status===400);
 await assert.rejects(productUploadToken({body:{type:'blob.upload-completed'}},params('product-upload',a),d,env),e=>e.status===400);
 await assert.rejects(productUploadToken({body:{type:'blob.generate-client-token'}},params('product-upload',a),await f.data(staff),env),e=>e.status===403);
 assert.doesNotThrow(()=>authorizeStudioRequest(staff,'product-upload','POST',{type:'blob.generate-client-token'}));
 assert.throws(()=>authorizeStudioRequest({...staff,access:{library:true,edit:false}},'product-upload','POST',{type:'blob.generate-client-token'}),e=>e.status===403);
});

test('uploads verify storage metadata, attach once, reset approval and remain authenticated',async()=>{
 const f=fixture(),p=await f.product(),a=await f.asset(p),pathname=productStoragePrefix(a)+randomUUID()+'.png',env={BLOB_READ_WRITE_TOKEN:'test-only'};
 await f.save('product-asset',a,{action:'product-asset-status',revision:'1',status:'Approved'});
 const details={pathname,name:'Product thumbnail.png',slot:'Thumbnail'},metadata={pathname,contentType:'image/png',size:128,url:'https://example.private.blob.vercel-storage.com/'+pathname};
 await assert.rejects(attachProductFile(params('product-asset',a),details,await f.data(),f.api,env,async()=>({...metadata,contentType:'text/html'})),e=>e.status===400);
 await assert.rejects(attachProductFile(params('product-asset',a),details,await f.data(),f.api,env,async()=>({...metadata,url:'https://example.com/file.png'})),e=>e.status===400);
 await attachProductFile(params('product-asset',a),details,await f.data(),f.api,env,async()=>metadata);
 await attachProductFile(params('product-asset',a),details,await f.data(),f.api,env,async()=>{throw new Error('No second head required');});
 const r=(await f.data()).byId.get(a);assert.equal(r.productFiles.length,1);assert.equal(r.status,'Draft');assert.equal(r.approval,undefined);
 const image=productAssetPage(params('product-asset',a),await f.data());assert.match(image,/data-prefix="nutrition-library\/product-assets\/v1\/[a-f0-9]{64}\//);assert.doesNotMatch(image,/private.blob.vercel-storage.com/);
 const req={method:'GET',headers:{range:'bytes=0-3'}},chunks=[],res=new Writable({write(chunk,enc,cb){chunks.push(chunk);cb();}});res.headers={};res.setHeader=(k,v)=>res.headers[k]=v;
 const fileParams=params('product-file',a,{file:r.productFiles[0].id,inline:'1'});
 await assert.rejects(sendProductFile(req,res,fileParams,await f.data(staff),env,async()=>{throw new Error('No storage request allowed');}),e=>e.status===403);
 await sendProductFile(req,res,fileParams,await f.data(),env,async(path,options)=>{assert.equal(path,pathname);assert.equal(options.access,'private');assert.equal(options.headers.Range,'bytes=0-3');return {stream:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data'));c.close();}}),headers:new Headers({'content-range':'bytes 0-3/128','content-length':'4'})};});
 assert.equal(res.statusCode,206);assert.equal(res.headers['Cache-Control'],'private, no-store');assert.equal(res.headers['X-Content-Type-Options'],'nosniff');assert.equal(Buffer.concat(chunks).toString(),'data');
});
