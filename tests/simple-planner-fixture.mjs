import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHmac} from 'node:crypto';
import {handleLibraryWork} from '../server/library-work.mjs';
import {ndaDocument} from './nda-fixture.mjs';
const root=path.resolve(import.meta.dirname,'../public'),key='p'.repeat(64),admin='00000000-0000-4000-8000-000000000001',joyce='00000000-0000-4000-8000-000000000002';
const claims=Buffer.from(JSON.stringify({role:'admin',id:admin,expires:Date.now()/1000+3600})).toString('base64url');
const cookie='__Host-nufi-library-work='+claims+'.'+createHmac('sha256',key).update('library-work:v1:'+claims).digest('base64url');
const projects=[{id:'00000000-0000-4000-8000-000000000003',name:'Supplement launch - local preview',creator_id:joyce,revision:1,weeks:1,status:'In progress',studio:{type:'blank',launchDate:'2026-11-30'},entries:[{id:'a',title:'Confirm supplier costs',assignee:joyce,kind:'Task',week:0,status:'In progress',estimatedHours:8,remainingHours:4,due:'2026-11-25',notes:'Get the full cost per product, including packaging and delivery.'},{id:'b',title:'Set prices and margins',assignee:joyce,kind:'Task',week:0,status:'To do',estimatedHours:8,dependsOn:['a'],due:'2026-11-27',notes:'Prepare prices for approval.'},{id:'c',title:'Prepare launch content',assignee:joyce,kind:'Task',week:0,status:'To do',estimatedHours:4,due:'2026-11-27',notes:'Draft the launch email and product introductions.'}]}];
const profiles=[{id:'studio:team-profile:'+joyce,revision:1,payload:{kind:'settings',fields:{role:'Content creator',agreedHours:'20',hoursPeriod:'week'}}}];
const api=async(endpoint,o={})=>{
 if(endpoint.includes('nufi_library_projects')){if(o.method==='PATCH'){const p=projects[0];if(p.revision!==Number(new URL(endpoint,'http://fixture').searchParams.get('revision')?.slice(3)))throw Error('Stale revision');Object.assign(p,o.payload);return [p];}return projects;}
 if(o.method&&o.method!=='GET')throw Error('Unrelated writes refused by local fixture');
 if(endpoint.includes('nufi_members'))return [{user_id:admin}];
 if(endpoint.includes('nufi_library_nda_agreements'))return [ndaDocument];
 if(endpoint.includes('nufi_library_nda_acceptances'))return [{id:'fixture-nda'}];
 if(endpoint.includes('nufi_library_staff'))return [{id:joyce,name:'Joyce'}];
 if(endpoint.includes('nufi_studio_items'))return profiles;
 return [];
};
http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://fixture.test');
 if(url.pathname==='/content-library/'){
  let body='';for await(const chunk of req)body+=chunk;
  return handleLibraryWork({method:req.method,body,headers:{cookie,host:'fixture.test',origin:'https://fixture.test'}},res,{params:url.searchParams,env:{NUFI_LIBRARY_CATALOGUE_KEY:key},apiFactory:()=>api,fetcher:async()=>{throw Error('No external requests');},load:async()=>({records:[],files:{}})});
 }
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep))throw Error('Invalid path');res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')||file.endsWith('.mjs')?'text/javascript':'application/octet-stream');res.end(await fs.readFile(file));
}catch(e){res.statusCode=500;res.end('Local fixture: '+e.message);}}).listen(4324,'127.0.0.1',()=>console.log('Planner fixture ready on http://127.0.0.1:4324/content-library/?work=1&studio=project&project='+projects[0].id));
