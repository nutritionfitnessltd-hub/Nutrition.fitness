// Local-only UI fixture: simulated accounts and in-memory storage. No production credentials.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {handleStudio} from '../server/studio.mjs';
const root=path.resolve('dist'),id='00000000-0000-4000-8000-000000000001',peer='00000000-0000-4000-8000-000000000002';
const rows=new Map([id,peer].map(id=>['studio:team-profile:'+id,{id:'studio:team-profile:'+id,payload:{id:'studio:team-profile:'+id,kind:'settings',fields:{team:'Content'}},revision:1}]));
const people=[{id,name:'James'},{id:peer,name:'Team colleague'}];
const api=async(endpoint,opts={})=>{
 if(endpoint.includes('nufi_studio_save')){const p=opts.payload,old=rows.get(p.item);if((old?.revision||0)!==p.expected)return [];const row={id:p.item,payload:p.document,revision:p.expected+1,updated_at:new Date().toISOString()};rows.set(p.item,row);return [row];}
 if(endpoint.includes('nufi_studio_items'))return [...rows.values()];
 if(endpoint.includes('nufi_library_staff'))return people;
 return [];
};
http.createServer(async(req,res)=>{
 try{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/content-library/'){
 let body='';for await(const chunk of req)body+=chunk;
 return handleStudio({method:req.method,body,headers:{}},res,{params:url.searchParams,actor:{role:'staff',id,name:'James'},api,load:async()=>({records:[],files:{}}),env:{}});
 }
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep))throw Error('Invalid path');
 res.setHeader('Content-Type',file.endsWith('.css')?'text/css':(file.endsWith('.js')||file.endsWith('.mjs'))?'text/javascript':'application/octet-stream');res.end(await fs.readFile(file));
 }catch(e){res.statusCode=500;res.end(e.message);}
}).listen(4310,'127.0.0.1',()=>console.log('Shiny visibility fixture on http://127.0.0.1:4310/content-library/?work=1&studio=shiny-things'));
