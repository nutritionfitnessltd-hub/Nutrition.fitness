// Local UI fixture only. No real accounts, credentials or external writes.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,createHmac} from 'node:crypto';
import {handleLibraryWork} from '../server/library-work.mjs';
import {ndaDocument,welcomeFixture} from './nda-fixture.mjs';
const root=path.resolve(import.meta.dirname,'../dist'),key='a'.repeat(64);
const person={id:'00000000-0000-4000-8000-000000000002',name:'Sample team member',email:'member@example.test',access:{work:true},code_hash:createHash('sha256').update('local-fixture-password-only').digest('hex')};
const sign=value=>createHmac('sha256',key).update('library-work:v1:'+value).digest('base64url');
const claims=Buffer.from(JSON.stringify({role:'staff',id:person.id,generation:sign(person.code_hash),expires:Date.now()/1000+3600})).toString('base64url');
const cookie='__Host-nufi-library-work='+claims+'.'+sign(claims);
const receipt={id:'00000000-0000-4000-8000-000000000003',actor_role:'staff',actor_id:person.id,full_name:person.name,email:person.email,document_text:ndaDocument.document_text,document_hash:ndaDocument.document_hash,agreement_version:ndaDocument.version,accepted_at:'2026-11-19T10:00:00Z',identity_basis:'Authenticated staff account',signature_method:'typed',signature_name:person.name};
const api=async(endpoint,options={})=>{
 const welcome=welcomeFixture(endpoint);if(welcome)return welcome;
 if(options.method&&options.method!=='GET'){
  if(endpoint.includes('nufi_library_staff')&&options.method==='PATCH'&&Object.keys(options.payload).join()==='name'){person.name=options.payload.name;return [person];}
  throw Error('Fixture refuses other writes');
 }
 if(endpoint.includes('nufi_library_staff'))return [person];
 if(endpoint.includes('nufi_library_nda_agreements'))return [ndaDocument];
 if(endpoint.includes('nufi_library_nda_acceptances'))return [receipt];
 return [];
};
http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://fixture.test');
  if(url.pathname==='/content-library/'){
   let body='';for await(const chunk of req)body+=chunk;
   return handleLibraryWork({method:req.method,body,headers:{cookie,host:'fixture.test',origin:'https://fixture.test'}},res,{params:url.searchParams,env:{NUFI_LIBRARY_CATALOGUE_KEY:key},apiFactory:()=>api,load:async()=>({records:[],files:{}})});
  }
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep))throw Error('Invalid path');
  res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')||file.endsWith('.mjs')?'text/javascript':'application/octet-stream');res.end(await fs.readFile(file));
 }catch{res.statusCode=404;res.end('Fixture file unavailable');}
}).listen(4308,'127.0.0.1',()=>console.log('My account fixture ready'));
