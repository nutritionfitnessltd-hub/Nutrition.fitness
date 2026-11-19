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
const record={id:'worker:fixture-newsletter',kind:'communication',workerId:'nina',title:'Monthly member newsletter',status:'Draft',fields:{subject:'A little update',emailHtml:'<html><body><h1>nutrition.fitness</h1><p>A useful update for members.</p><img src="https://files.leadconnectorhq.com/file/6aff3863d50d9db796fbe691/newsletter-image-0.png" alt="You know us."><a href="{{UNSUBSCRIBE_URL}}">Unsubscribe</a></body></html>'}};
let connection={},syncState={},campaign;
const api=async(endpoint,options={})=>{
 if(endpoint.includes('nufi_library_display')){if(options.method==='POST'){connection=options.payload.payload;return [{payload:connection}];}return connection.enabled!==undefined?[{payload:connection}]:[];}
 if(endpoint.includes('nufi_claim_newsletter'))return [{state:structuredClone(syncState)}];
 if(endpoint.includes('nufi_newsletter_sync')){if(options.method==='PATCH'){syncState=structuredClone(options.payload.state);return [{state:syncState}];}return Object.keys(syncState).length?[{item_id:record.id,state:syncState,updated_at:new Date().toISOString()}]:[];}
 if(endpoint.includes('nufi_studio_items'))return [{id:record.id,revision:1,payload:record}];
 if(options.method&&options.method!=='GET')throw Error('Fixture refuses unrelated saves');
 if(endpoint.includes('nufi_members'))return [{user_id:admin}];
 if(endpoint.includes('nufi_library_nda_agreements'))return [ndaDocument];
 if(endpoint.includes('nufi_library_nda_acceptances'))return [{id:'fixture-acceptance'}];
 return [];
};
const fetcher=async(endpoint,options={})=>{
 if(!endpoint.startsWith('https://services.leadconnectorhq.com/emails/locations/C0BGBoXIG8FVn9G5mmA3/campaigns/emails'))throw Error('External requests disabled');
 if(options.method==='POST')campaign={id:'fixture-draft',status:'draft',...JSON.parse(options.body)};
 if(options.method==='PATCH')campaign={...campaign,...JSON.parse(options.body)};
 return new Response(JSON.stringify(endpoint.includes('includeContent')?campaign:options.method==='POST'||options.method==='PATCH'?{id:campaign.id}:{campaigns:[],total:0}),{status:200});
};
http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://fixture.test');
  if(url.pathname==='/content-library/'){
   let body='';for await(const chunk of req)body+=chunk;
   return handleLibraryWork({method:req.method,body,headers:{cookie,host:'fixture.test',origin:'https://fixture.test'}},res,{params:url.searchParams,env:{NUFI_LIBRARY_CATALOGUE_KEY:key,NUFI_GHL_SEAL_KEY:'b'.repeat(64),CRON_SECRET:'fixture-cron'},apiFactory:()=>api,fetcher,load:async()=>({records:[],files:{}})});
  }
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep))throw Error('Invalid path');
  res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')||file.endsWith('.mjs')?'text/javascript':'application/octet-stream');res.end(await fs.readFile(file));
 }catch{res.statusCode=404;res.end('Fixture file unavailable');}
}).listen(4311,'127.0.0.1',()=>console.log('Newsletter sync fixture ready'));
