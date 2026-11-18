// Optional browser fixture. No production credentials or writes.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {handleStudio} from '../server/studio.mjs';
import {draftDocument} from '../server/worker-drafts.mjs';
const root=path.resolve(import.meta.dirname,'..'),source=process.env.WORKER_PREVIEW_DATA;
const drafts=source?JSON.parse(await fs.readFile(source,'utf8')):[{id:'sample-article',kind:'article',title:'Example worker draft',body:'A draft to check.',revision:0}];
const saved=new Map(drafts.map(d=>{const payload=draftDocument({...d,revision:0},null,'worker:content-manager:');return [payload.id,{id:payload.id,payload,revision:1,updated_at:new Date().toISOString()}];}));
const releases=[];
const actor={role:'admin',id:'00000000-0000-4000-8000-000000000001'},api=async(p,o={})=>{
 if(p.includes('rpc/nufi_studio_save')){const v=o.payload,current=saved.get(v.item);if((current?.revision||0)!==v.expected)return [];const row={id:v.item,payload:v.document,revision:v.expected+1,updated_at:new Date().toISOString()};saved.set(v.item,row);return [row];}
 if(p.includes('rpc/nufi_studio_release')){const v=o.payload,r=saved.get(v.item);if(r?.revision!==v.expected||r.payload.status!=='Approved')throw Error('Not approved');const row={item_id:v.item,source_revision:v.expected,environment:v.target};releases.push(row);return [row];}
 if(p.includes('nufi_studio_items'))return [...saved.values()];if(p.includes('nufi_studio_releases'))return releases;return [];
};
const mime={'.css':'text/css','.mjs':'text/javascript','.js':'text/javascript','.webp':'image/webp','.jpg':'image/jpeg','.woff2':'font/woff2','.svg':'image/svg+xml'};
http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');if(u.pathname==='/content-library/'){
 let raw='';for await(const c of req)raw+=c;req.body=raw?Object.fromEntries(new URLSearchParams(raw)):{};
 return handleStudio(req,res,{params:u.searchParams,actor,api,load:async()=>({records:[],files:{}}),env:{}});
 }const file=path.resolve(root,'public','.'+decodeURIComponent(u.pathname));if(!file.startsWith(path.join(root,'public')+path.sep))throw Error();res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));}catch{res.statusCode=404;res.end('Fixture content unavailable.');}}).listen(4304,'127.0.0.1',()=>console.log('Worker browser fixture: http://localhost:4304/content-library/?work=1&studio=library&bucket=drafts&kind=article'));
