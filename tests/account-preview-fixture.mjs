// Local-only account preview fixture. No real accounts, credentials or network writes.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHmac} from 'node:crypto';
import {handleLibraryWork} from '../server/library-work.mjs';
import {ndaDocument} from './nda-fixture.mjs';
const root=path.resolve(import.meta.dirname,'../dist'),key='p'.repeat(64),admin='00000000-0000-4000-8000-000000000001';
const person={id:'00000000-0000-4000-8000-000000000002',name:'Preview team member',email:'preview@example.test',code_hash:null,access:{work:true,edit:true},access_revision:1};
const article={id:'working-copy:article',kind:'article',title:'Working copy test article',status:'Draft',parent:null,fields:{body:'An assigned article for testing copied edits.',shortAnswer:'A test article.'},comments:[]};
const items=new Map([[article.id,{id:article.id,payload:article,revision:1,updated_at:new Date().toISOString()}]]);
const payload=Buffer.from(JSON.stringify({role:'admin',id:admin,expires:Math.floor(Date.now()/1000)+3600})).toString('base64url');
const cookie='__Host-nufi-library-work='+payload+'.'+createHmac('sha256',key).update('library-work:v1:'+payload).digest('base64url');
const api=async(endpoint,options={})=>{
 if(options.method&&options.method!=='GET'){
  if(!endpoint.includes('rpc/nufi_studio_save')||!options.payload.item.startsWith('studio:account-preview:'))throw Error('Fixture refuses live writes');
  const p=options.payload,current=items.get(p.item);if((current?.revision||0)!==p.expected)return [];
  const row={id:p.item,payload:structuredClone(p.document),revision:p.expected+1};items.set(p.item,row);return [structuredClone(row)];
 }
 if(endpoint.includes('nufi_members'))return [{user_id:admin}];
 if(endpoint.includes('nufi_library_nda_agreements'))return [ndaDocument];
 if(endpoint.includes('nufi_library_nda_acceptances'))return [{id:'fixture-acceptance'}];
 if(endpoint.includes('nufi_library_staff'))return [person];
 if(endpoint.includes('nufi_library_tasks'))return [{id:'00000000-0000-4000-8000-000000000003',title:'Review the test article',record_id:article.id,record_title:article.title,staff_id:person.id,status:'To do',revision:1}];
 if(endpoint.includes('nufi_studio_items')){
  const id=new URL(endpoint,'https://fixture.test').searchParams.get('id');return structuredClone(id?.startsWith('eq.')?[items.get(id.slice(3))].filter(Boolean):[...items.values()]);
 }
 return [];
};
http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://fixture.test');
  if(u.pathname==='/content-library/'){
   let body='';for await(const chunk of req)body+=chunk;
   return handleLibraryWork({method:req.method,body,headers:{cookie,host:'fixture.test',origin:'https://fixture.test'}},res,{params:u.searchParams,apiFactory:()=>api,env:{NUFI_LIBRARY_CATALOGUE_KEY:key},load:async()=>({records:[],files:{}})});
  }
  const file=path.resolve(root,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(root+path.sep))throw Error('Invalid path');
  res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')||file.endsWith('.mjs')?'text/javascript':'application/octet-stream');res.end(await fs.readFile(file));
 }catch{res.statusCode=404;res.end('Fixture file unavailable');}
}).listen(4305,'127.0.0.1',()=>console.log('Account working copy fixture ready'));
