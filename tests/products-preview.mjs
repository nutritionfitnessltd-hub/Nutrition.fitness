// Local-only visual fixture. Saves remain in memory; no external storage or database calls.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {handleStudio} from '../server/studio.mjs';
import {blankFields} from '../server/studio-model.mjs';
import {productStoragePrefix} from '../server/studio-products.mjs';
const root=path.resolve(import.meta.dirname,'../dist'),actor={role:'admin',id:'00000000-0000-4000-8000-000000000001'};
const productId='studio:product:00000000-0000-4000-8000-000000000002',assetId='studio:product:00000000-0000-4000-8000-000000000003',creativeId='studio:product:00000000-0000-4000-8000-000000000004';
const records=[
 {id:productId,kind:'product',title:'Creatine — example product',status:'Draft',fields:{...blankFields('product'),category:'Supplements',stage:'In development',sku:'TEST-001',description:'Local test product for reviewing the workspace layout.',variants:'Unflavoured',supplier:'Example supplier'}},
 {id:assetId,kind:'asset',title:'Product photograph',status:'Approved',fields:{...blankFields('asset'),productAsset:true,productIds:[productId],assetRole:'product',type:'Photography',channel:'Unspecified'},productFiles:[{id:'fixture-photo',pathname:productStoragePrefix(assetId)+'00000000-0000-4000-8000-000000000005.webp',type:'image/webp',name:'creatine.webp',bytes:56310,slot:'Thumbnail'}]},
 {id:creativeId,kind:'asset',title:'Everyday routine — launch advert',status:'In review',fields:{...blankFields('asset'),productAsset:true,productIds:[productId],assetRole:'advert',type:'Ad copy',channel:'Instagram',campaign:'Product launch',dimensions:'1080 Ã— 1080',headline:'Make it part of your routine.',body:'Example creative copy for testing the review flow. Not approved product claims.',sourceUrl:'https://www.canva.com/',url:'https://nutritionfitness.sharepoint.com/'},productFiles:[{id:'fixture-photo',pathname:productStoragePrefix(creativeId)+'00000000-0000-4000-8000-000000000006.webp',type:'image/webp',name:'creatine.webp',bytes:56310,slot:'Thumbnail'}]}
];
const saved=new Map(records.map(r=>[r.id,{id:r.id,payload:r,revision:1,updated_at:new Date().toISOString()}]));
const api=async(endpoint,options={})=>{
 if(endpoint.includes('rpc/nufi_studio_save')){const p=options.payload,old=saved.get(p.item);if((old?.revision||0)!==p.expected)return [];const row={id:p.item,payload:p.document,revision:p.expected+1,updated_at:new Date().toISOString()};saved.set(row.id,row);return [row];}
 if(endpoint.includes('nufi_studio_items'))return [...saved.values()];
 return [];
};
const mime={'.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://127.0.0.1');
  if(u.pathname==='/content-library/'){
   if(u.searchParams.get('studio')==='product-file'&&saved.get(u.searchParams.get('id'))?.payload.productFiles?.some(f=>f.id===u.searchParams.get('file'))){res.setHeader('Content-Type','image/webp');return res.end(await fs.readFile(path.join(root,'assets/products/creatine.webp')));}
   let raw='';for await(const chunk of req)raw+=chunk;req.body=raw?(req.headers['content-type']?.includes('application/json')?JSON.parse(raw):Object.fromEntries(new URLSearchParams(raw))):undefined;
   return handleStudio(req,res,{params:u.searchParams,actor,api,load:async()=>({records:[],files:{}}),env:{}});
  }
  const file=path.resolve(root,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(root+path.sep))throw new Error('Invalid path');
  const bytes=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(bytes);
 }catch{if(res.headersSent)return res.end();res.writeHead(404);res.end('Local fixture unavailable');}
});
server.listen(Number(process.env.PRODUCT_TEST_PORT||0),'127.0.0.1',()=>console.log('Products preview: http://127.0.0.1:'+server.address().port+'/content-library/?work=1&studio=products'));
