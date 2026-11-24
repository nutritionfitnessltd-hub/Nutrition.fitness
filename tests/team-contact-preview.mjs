// Local-only profile preview with fictional contact and onboarding details.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {handleLibraryWork} from '../server/library-work.mjs';
const admin={role:'admin',id:'00000000-0000-4000-8000-000000000001'},person={id:'00000000-0000-4000-8000-000000000002',name:'Example colleague',email:'old@example.test',code_hash:'fixture',access_revision:1};
const receipt={id:'00000000-0000-4000-8000-000000000003',actor_id:person.id,actor_role:'staff',full_name:'Example Colleague',postal_address:'123 Example Street\nExample Town\nAB1 2CD',identity_received:true};
const root=path.resolve(import.meta.dirname,'../public');
const api=async(endpoint,o={})=>{
 if(endpoint.includes('nufi_library_staff')){if(o.method==='PATCH'){const q=new URL(endpoint,'http://fixture').searchParams;if(q.get('id')!=='eq.'+person.id||q.get('access_revision')!=='eq.'+person.access_revision)return [];Object.assign(person,o.payload);return [person];}return [{id:admin.id,name:'Administrator',email:'admin@example.test'},person];}
 if(endpoint.includes('nufi_library_nda_acceptances'))return [receipt];
 return [];
};
http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://fixture.test');
 if(u.pathname==='/content-library/'){
  let body='';for await(const chunk of req)body+=chunk;
  return handleLibraryWork({method:req.method,body,headers:{host:'fixture.test',origin:'https://fixture.test'}},res,{params:u.searchParams,copyActor:admin,apiFactory:()=>api,env:{NUFI_LIBRARY_CATALOGUE_KEY:'fixture-key'},load:async()=>({records:[],files:{}}),fetcher:async()=>{throw Error('No external requests');}});
 }
 const file=path.resolve(root,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(root+path.sep))throw Error('Invalid path');res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')||file.endsWith('.mjs')?'text/javascript':'application/octet-stream');res.end(await fs.readFile(file));
}catch{res.statusCode=404;res.end('Local preview unavailable');}}).listen(0,'127.0.0.1',function(){console.log('http://127.0.0.1:'+this.address().port+'/content-library/?work=1&studio=team&person='+person.id);});
