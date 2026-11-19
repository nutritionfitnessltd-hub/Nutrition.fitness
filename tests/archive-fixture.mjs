// Isolated archive UI fixture. Contains no real accounts or files and refuses writes.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHmac} from 'node:crypto';
import {handleLibraryWork} from '../server/library-work.mjs';
import {ndaDocument} from './nda-fixture.mjs';
const root=path.resolve(import.meta.dirname,'../dist'),key='a'.repeat(64),admin='00000000-0000-4000-8000-000000000001';
const payload=Buffer.from(JSON.stringify({role:'admin',id:admin,expires:Math.floor(Date.now()/1000)+3600})).toString('base64url');
const cookie='__Host-nufi-library-work='+payload+'.'+createHmac('sha256',key).update('library-work:v1:'+payload).digest('base64url');
const source=(id,title,group,collection,kind='Source document')=>({id:'catalogue:'+id,title,group,kind,status:'reference',fields:{collection,body:'Original source content for '+title+'.'},files:[]});
const records=[source('welcome','Welcome to the course','Courses','Nutrition foundations','Lesson'),source('workbook','Course workbook','Courses','Nutrition foundations','Workbook'),source('recipes','Everyday recipes','Recipes','Everyday recipes','Recipe book'),source('programme','Strength at home','Programs','Strength at home'),source('challenge','Daily movement challenge','Challenges','Daily movement'),source('guide','Healthy habits guide','E-Books','Healthy habits'),source('article','Building healthy routines','Articles','Healthy routines')];
const archived={id:'studio:archived-article',kind:'article',title:'Earlier healthy habits draft',status:'Archived',fields:{body:'An archived working draft.'}};
const api=async(endpoint,options={})=>{
 if(options.method&&options.method!=='GET')throw Error('Archive fixture refuses writes');
 if(endpoint.includes('nufi_members'))return [{user_id:admin}];
 if(endpoint.includes('nufi_library_nda_agreements'))return [ndaDocument];
 if(endpoint.includes('nufi_library_nda_acceptances'))return [{id:'fixture-acceptance'}];
 if(endpoint.includes('nufi_studio_items'))return [{id:archived.id,payload:archived,revision:1,updated_at:new Date().toISOString()}];
 return [];
};
http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://fixture.test');
  if(url.pathname==='/content-library/')return handleLibraryWork({method:'GET',headers:{cookie,host:'fixture.test'}},res,{params:url.searchParams,apiFactory:()=>api,env:{NUFI_LIBRARY_CATALOGUE_KEY:key},load:async()=>({records,files:{}})});
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep))throw Error('Invalid path');
  res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')||file.endsWith('.mjs')?'text/javascript':'application/octet-stream');res.end(await fs.readFile(file));
 }catch{res.statusCode=404;res.end('Fixture file unavailable');}
}).listen(4307,'127.0.0.1',()=>console.log('Archive fixture ready'));
