import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {taskFixture} from './task-messaging-fixture.mjs';
import {taskContext,threadFor} from '../server/task-messages.mjs';
import {taskStoragePrefix,uploadSmallTaskFile,attachTaskFile,sendUploadedAsset,taskTransportData} from '../server/task-files.mjs';
import {uploadDestination,copyUploadToSharePoint} from '../server/task-upload-destinations.mjs';
import {PassThrough} from 'node:stream';
test('small uploads use a scoped task read and store only the verified bytes',async()=>{
 const f=taskFixture(),params=f.params(),data=await taskTransportData(params,f.staff,f.api),pathname=taskStoragePrefix(taskContext(params,data))+randomUUID()+'.jpeg';
 const blob=await uploadSmallTaskFile(params,{pathname,bytes:5,data:Buffer.from('image').toString('base64')},data,f.api,{BLOB_READ_WRITE_TOKEN:'fixture'},async(path,bytes,options)=>{assert.equal(path,pathname);assert.equal(bytes.toString(),'image');assert.equal(options.access,'private');return {pathname:path};});
 assert.equal(blob.pathname,pathname);
 await assert.rejects(()=>uploadSmallTaskFile(params,{pathname,bytes:6,data:'aW1hZ2U='},data,f.api,{BLOB_READ_WRITE_TOKEN:'fixture'},async()=>{throw Error('must not upload');}),e=>e.status===400);
});
test('library and product destinations create one shared Draft asset and retain the task link',async()=>{
 for(const destination of ['library','product']){
  const f=taskFixture(),data=f.data(f.admin),product={id:'product:one',kind:'product',title:'Protein',fields:{}};data.items=[product];data.byId.set(product.id,product);
  const task=taskContext(f.params(),data),pathname=taskStoragePrefix(task)+randomUUID()+'.pdf',env={BLOB_READ_WRITE_TOKEN:'fixture'},inspect=async()=>({pathname,contentType:'application/pdf',size:10,url:'https://fixture.private.blob.vercel-storage.com/'+pathname});
  await attachTaskFile(f.params(),{pathname,name:'Artwork.pdf',destination,category:'Packaging & labels',productId:product.id},data,f.api,env,inspect);
  const thread=await threadFor(task,f.api),file=thread.payload.fields.files[0],asset=f.rows.get(file.assetId).payload;
  assert.equal(asset.status,'Draft');assert.equal(asset.shared,true);assert.equal(asset.fields.taskFileId,file.id);assert.deepEqual(asset.fields.productIds,destination==='product'?[product.id]:[]);
  data.byId.set(asset.id,asset);const response=new PassThrough(),chunks=[];response.setHeader=()=>{};response.on('data',chunk=>chunks.push(chunk));
  await sendUploadedAsset({method:'GET'},response,new URLSearchParams({id:asset.id}),data,f.api,env,async()=>({stream:new Blob(['asset bytes']).stream()}));assert.equal(Buffer.concat(chunks).toString(),'asset bytes');
  await attachTaskFile(f.params(),{pathname,name:'Artwork.pdf',destination,productId:product.id},data,f.api,env,inspect);assert.equal(f.rows.get(task.threadId).payload.fields.files.length,1);
 }
});
test('destination selection enforces product editing and the SharePoint tenant',()=>{
 const f=taskFixture(),data=f.data(f.staff);assert.throws(()=>uploadDestination({destination:'product',productId:'unknown'},data),e=>e.status===403);
 assert.throws(()=>uploadDestination({destination:'sharepoint',folderUrl:'https://evil.example/folder'},data),e=>e.status===400);
 assert.throws(()=>uploadDestination({destination:'library'},data),e=>e.status===403);
});
test('SharePoint saves to the resolved folder and does not report completion on permission failure',async()=>{
 const f=taskFixture(),task=taskContext(f.params(),f.data()),file={id:randomUUID(),name:'Artwork.pdf',bytes:5,type:'application/pdf',pathname:'private'},target={folderUrl:'https://nutritionfitness.sharepoint.com/sites/Nutrition.fitness/Shared%20Documents/Content%20Library'},env={EXCHANGE_TENANT_ID:'tenant',EXCHANGE_CLIENT_ID:'client',EXCHANGE_CLIENT_SECRET:'fixture'};
 const requests=[],fetcher=async(url,options)=>{requests.push({url,options});if(url.includes('/token'))return Response.json({access_token:'fixture'});if(url.includes('/shares/'))return Response.json({id:'folder',folder:{},webUrl:target.folderUrl,parentReference:{driveId:'drive'}});return Response.json({id:'file',size:5,webUrl:target.folderUrl+'/Artwork.pdf'});};
 const result=await copyUploadToSharePoint(task,file,target,env,async()=>({stream:new Blob(['image']).stream()}),fetcher);assert.equal(result.id,'file');assert.match(requests.at(-1).url,/drives\/drive\/items\/folder:/);assert.match(requests.at(-1).url,new RegExp(file.id));
 await assert.rejects(()=>copyUploadToSharePoint(task,file,target,env,async()=>{throw Error('must not read file');},async url=>url.includes('/token')?Response.json({access_token:'fixture'}):new Response('{}',{status:403})),e=>e.status===403);
});

