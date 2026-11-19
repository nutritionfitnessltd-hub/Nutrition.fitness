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
const api=async(endpoint,options={})=>{
 if(options.method&&options.method!=='GET')throw Error('Fixture refuses saves');
 if(endpoint.includes('nufi_members'))return [{user_id:admin}];
 if(endpoint.includes('nufi_library_nda_agreements'))return [ndaDocument];
 if(endpoint.includes('nufi_library_nda_acceptances'))return [{id:'fixture-acceptance'}];
 return [];
};
const fetcher=async(endpoint,options)=>{
 if(endpoint!=='https://api.openai.com/v1/responses')throw Error('External requests are disabled');
 const input=JSON.parse(JSON.parse(options.body).input);
 return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({summary:input.title+' could introduce members to practical meal ideas and give them a useful first experience of Nutrition.fitness. A small, focused recipe book could help people decide whether the wider service suits them. Test interest with a sample before committing to a full collection, and check whether a free download or a low-cost book best matches the intended audience.'})}]}]}),{headers:{'Content-Type':'application/json'}});
};
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
}).listen(4309,'127.0.0.1',()=>console.log('Idea AI fixture ready'));
