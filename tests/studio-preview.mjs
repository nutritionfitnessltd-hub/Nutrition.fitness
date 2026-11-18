// An isolated HTTP fixture: all saves are in memory; no production services or login cookies.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { handleStudio } from '../server/studio.mjs';
import { blankFields } from '../server/studio-model.mjs';
const root=path.resolve(import.meta.dirname,'../dist');
const actor={role:'admin',id:'00000000-0000-4000-8000-000000000001'};
const make=(id,kind,title,fields)=>({id,kind,title,status:'Draft',fields:{...blankFields(kind),...fields},files:[]});
const records=[
 make('training:copy','campaign','Stronger — programme landing copy',{headline:'Strength you can put to use.',body:'A clear whole-body training plan, with useful coaching and room for real life.',channel:'website',audience:'prospective',assetIds:['training:cover']}),
 make('training:cover','asset','Stronger programme cover',{url:'/assets/cookbook/recipe-061.webp',thumbnailUrl:'/assets/cookbook/recipe-061.webp'}),
 make('training:course','course','Learning the basics',{introduction:'An introduction to your training.',lessonIds:['training:lesson-two','training:lesson-one']}),
 make('training:lesson-one','lesson','First lesson',{body:'First lesson content'}),
 make('training:lesson-two','lesson','Second lesson',{body:'Second lesson content',videoUrl:'https://example.test/video',script:'This is the recorded narration.',durationSeconds:125})
];
records.push({id:'catalogue:challenge',kind:'Challenge guide',group:'Challenges',title:'Six-week challenge',fields:{collection:'Six-week challenge'},files:[]});
const index={records,files:{}},saved=new Map();
const api=async(endpoint,opts={})=>{
 if(endpoint.includes('rpc/nufi_studio_save')){
  const p=opts.payload,old=saved.get(p.item);
  if((old?.revision||0)!==p.expected)return [];
  const row={id:p.item,payload:p.document,revision:p.expected+1,updated_at:new Date().toISOString()};saved.set(row.id,row);return [row];
 }
 if(endpoint.includes('nufi_studio_items'))return [...saved.values()];
 return [];
};
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://127.0.0.1');
  if(u.pathname==='/content-library/'){
   let raw='';for await(const chunk of req)raw+=chunk;req.body=raw?Object.fromEntries(new URLSearchParams(raw)):undefined;
   return handleStudio(req,res,{params:u.searchParams,actor,api,load:async()=>index,env:{}});
  }
  if(u.pathname.startsWith('/api/')){res.writeHead(503,{'Content-Type':'application/json'});return res.end('{"error":"Local fixture service unavailable"}');}
  let file=path.resolve(root,'.'+decodeURIComponent(u.pathname));
  if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  if((await fs.stat(file)).isDirectory())file=path.join(file,'index.html');
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(await fs.readFile(file));
 }catch{res.writeHead(404);res.end('Fixture file unavailable');}
}).listen(Number(process.env.STUDIO_TEST_PORT||4298),'127.0.0.1',()=>console.log('Local studio fixture ready'));
