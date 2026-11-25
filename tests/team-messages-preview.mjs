// Loopback-only preview: fictional people, in-memory conversations/files, no email.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createConversation,changeConversation,announcementsId} from '../server/team-message-store.mjs';
import {handleStudio} from '../server/studio.mjs';
import {messageFixture} from './team-messages-fixture.mjs';
const f=messageFixture(),root=path.resolve(import.meta.dirname,'../public'),blobs=new Map();
const group=await createConversation(f.api,f.admin,f.people,{conversationId:crypto.randomUUID(),kind:'group',title:'Launch planning',members:JSON.stringify([f.staff.id,f.other.id])});
const direct=await createConversation(f.api,f.staff,f.people,{kind:'direct',members:JSON.stringify([f.admin.id])});
await changeConversation(f.api,announcementsId,f.admin,f.people,f.send('Welcome to Team announcements. Use this space for updates everyone needs to see.'));
const first=await changeConversation(f.api,group,f.admin,f.people,f.send('The launch checklist is ready. @Sam Taylor could you check the lesson dates before Friday?'));
await changeConversation(f.api,group,f.staff,f.people,f.send('Yes, I will check them this afternoon.',{parentId:first.message.id}));
await changeConversation(f.api,group,f.other,f.people,f.send('I have finished the image review. The two remaining layouts are linked to the project.'));
await changeConversation(f.api,direct,f.admin,f.people,f.send('Thanks for checking the draft. Can we catch up tomorrow?'));
const fileStore={put:async(path,bytes,options)=>{blobs.set(path,{pathname:path,size:bytes.length,contentType:options.contentType,bytes,url:'https://preview.private.blob.vercel-storage.com/file'});return blobs.get(path);},head:async p=>blobs.get(p),get:async p=>({stream:new Response(blobs.get(p)?.bytes).body})};
http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://fixture.test');
 if(u.pathname==='/content-library/'){
  const role=u.searchParams.get('as')||/message-role=(staff|other|outsider)/.exec(req.headers.cookie||'')?.[1]||'admin';
  if(u.searchParams.has('as'))res.setHeader('Set-Cookie','message-role='+role+'; Path=/; SameSite=Lax');
  const actor=f[role]||f.admin;let raw='';for await(const chunk of req)raw+=chunk;
  const body=req.headers['content-type']?.includes('application/json')?JSON.parse(raw||'{}'):raw;
  return handleStudio({method:req.method,headers:req.headers,body},res,{params:u.searchParams,actor,api:f.api,load:async()=>({records:[],files:{}}),env:{BLOB_READ_WRITE_TOKEN:'local-fixture-only'},taskFileStore:fileStore});
 }
 const file=path.resolve(root,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(root+path.sep))throw Error('Invalid path');
 res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')||file.endsWith('.mjs')?'text/javascript':'application/octet-stream');res.end(await fs.readFile(file));
}catch{res.statusCode=404;res.end('Local preview unavailable.');}}).listen(0,'127.0.0.1',function(){console.log(JSON.stringify({base:'http://127.0.0.1:'+this.address().port,group,direct,announcement:announcementsId}));});
