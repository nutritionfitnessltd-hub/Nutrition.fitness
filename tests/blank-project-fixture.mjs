// Isolated idea AI UI fixture. No real account, API key or external requests.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHmac} from 'node:crypto';
import {handleLibraryWork} from '../server/library-work.mjs';
import {ndaDocument} from './nda-fixture.mjs';
const root=path.resolve(import.meta.dirname,'../dist'),key='a'.repeat(64),admin='00000000-0000-4000-8000-000000000001';
const claims=Buffer.from(JSON.stringify({role:'admin',id:admin,expires:Date.now()/1000+3600})).toString('base64url');
const cookie='__Host-nufi-library-work='+claims+'.'+createHmac('sha256',key).update('library-work:v1:'+claims).digest('base64url');
const owner='00000000-0000-4000-8000-000000000002',assignee='00000000-0000-4000-8000-000000000003';
const projects=[];
const api=async(endpoint,options={})=>{
 if(endpoint.includes('nufi_studio_create_project')){const p=options.payload.project;if(!projects.some(x=>x.id===p.id))projects.push({...p,status:'Planning',revision:1});return [];}
 if(endpoint.includes('nufi_library_projects')){
  if(options.method==='PATCH'){const id=new URL('http://fixture.test'+endpoint).searchParams.get('id').slice(3),p=projects.find(x=>x.id===id);Object.assign(p,options.payload);return [p];}return projects;
 }
 if(options.method&&options.method!=='GET')throw Error('Fixture refuses unrelated saves');
 if(endpoint.includes('nufi_members'))return [{user_id:admin}];
 if(endpoint.includes('nufi_library_nda_agreements'))return [ndaDocument];
 if(endpoint.includes('nufi_library_nda_acceptances'))return [{id:'fixture-acceptance'}];
 if(endpoint.includes('nufi_library_staff'))return [{id:owner,name:'Kasia'},{id:assignee,name:'Joyce'}];
 if(endpoint.includes('nufi_studio_items'))return [{id:'newsletter',revision:1,payload:{id:'newsletter',kind:'communication',title:'Monthly newsletter',status:'Draft',fields:{emailHtml:'<p>Monthly news</p>'}}}];
 return [];
};
const fetcher=async()=>{throw Error('External requests disabled');};
http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://fixture.test');
  if(url.pathname==='/content-library/'){
   let body='';for await(const chunk of req)body+=chunk;
   return handleLibraryWork({method:req.method,body,headers:{cookie,host:'fixture.test',origin:'https://fixture.test'}},res,{params:url.searchParams,env:{NUFI_LIBRARY_CATALOGUE_KEY:key,OPENAI_API_KEY:'fixture-only'},apiFactory:()=>api,fetcher,load:async()=>({records:[],files:{}})});
  }
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep))throw Error('Invalid path');
  res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')||file.endsWith('.mjs')?'text/javascript':'application/octet-stream');res.end(await fs.readFile(file));
 }catch{res.statusCode=404;res.end('Fixture file unavailable');}
}).listen(4310,'127.0.0.1',()=>console.log('Project flow fixture ready'));
