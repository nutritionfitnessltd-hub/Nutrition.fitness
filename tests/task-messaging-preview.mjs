// Local-only task discussion preview. Storage and email delivery are mocked.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {handleStudio} from '../server/studio.mjs';
import {taskFixture} from './task-messaging-fixture.mjs';
const f=taskFixture(),root=path.resolve(import.meta.dirname,'../public');
http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://fixture.test');
 if(u.pathname==='/fixture/mail'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(f.requests.filter(r=>r.url.endsWith('/sendMail')).map(r=>JSON.parse(r.options.body).message.subject)));}
 if(u.pathname==='/content-library/'){
  if(u.searchParams.get('as'))res.setHeader('Set-Cookie','fixture-role='+u.searchParams.get('as')+'; Path=/');
  const role=u.searchParams.get('as')||/fixture-role=(staff|owner)/.exec(req.headers.cookie||'')?.[1],actor=role==='staff'?f.staff:role==='owner'?f.owner:f.admin;
  let body='';for await(const chunk of req)body+=chunk;
  return handleStudio({method:req.method,body},res,{params:u.searchParams,actor,api:f.api,load:f.load,env:f.env,fetcher:f.fetcher});
 }
 const file=path.resolve(root,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(root+path.sep))throw Error('Invalid path');
 res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')||file.endsWith('.mjs')?'text/javascript':'application/octet-stream');res.end(await fs.readFile(file));
}catch{res.statusCode=404;res.end('Local preview unavailable');}}).listen(0,'127.0.0.1',function(){const base='http://127.0.0.1:'+this.address().port;console.log(base+'/content-library/?work=1&studio=project&project='+f.project.id);console.log(base+'/content-library/?work=1&studio=task&task='+f.assignment.id+'&as=staff');});
