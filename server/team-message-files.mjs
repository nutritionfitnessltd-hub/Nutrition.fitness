import {get,head,put} from '@vercel/blob';
import {handleUpload} from '@vercel/blob/client';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {HttpError,uuid} from './platform.mjs';
import {readThread,membership,mutateThread,visibleMessages} from './team-message-store.mjs';
const types={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',zip:'application/zip',mp4:'video/mp4',webm:'video/webm',mp3:'audio/mpeg'};
export const teamFileLimit=250*1024*1024;
export const teamFilePrefix=(id,actor)=>'nutrition-library/human-messages/v1/'+uuid(id)+'/'+uuid(actor.id)+'/';
function pathInfo(id,actor,path){
 const prefix=teamFilePrefix(id,actor),tail=typeof path==='string'&&path.startsWith(prefix)?path.slice(prefix.length):'';
 const m=/^([a-f0-9-]{36})\.([a-z0-9]+)$/.exec(tail);
 if(!m||!types[m[2]])throw new HttpError(400,'Choose a supported private attachment.');
 return {id:uuid(m[1]),type:types[m[2]]};
}
export async function uploadTeamFile(req,id,actor,people,api,env,generate=handleUpload){
 if(!env.BLOB_READ_WRITE_TOKEN)throw new HttpError(503,'Private file uploads are not connected.');
 const row=await readThread(api,id);membership(row,actor,people);
 if(row.payload.files.length>=200)throw new HttpError(400,'This conversation has reached 200 attachments. Start a follow-up conversation.');
 return generate({request:req,body:req.body,token:env.BLOB_READ_WRITE_TOKEN,onBeforeGenerateToken:async pathname=>({allowedContentTypes:[pathInfo(id,actor,pathname).type],maximumSizeInBytes:teamFileLimit,validUntil:Date.now()+15*60*1000,addRandomSuffix:false,allowOverwrite:false})});
}
export async function uploadSmallTeamFile(id,actor,people,api,env,f,save=put){
 membership(await readThread(api,id),actor,people);
 if(!env.BLOB_READ_WRITE_TOKEN)throw new HttpError(503,'Private file uploads are not connected.');
 const expected=pathInfo(id,actor,f.pathname);
 if(typeof f.data!=='string'||f.data.length>2800000||!/^[A-Za-z0-9+/]*={0,2}$/.test(f.data))throw new HttpError(400,'Use a file up to 2 MB with this upload method.');
 const bytes=Buffer.from(f.data,'base64');if(!bytes.length||bytes.length>2*1024*1024||bytes.length!==Number(f.bytes))throw new HttpError(400,'The upload size could not be verified.');
 return save(f.pathname,bytes,{access:'private',contentType:expected.type,token:env.BLOB_READ_WRITE_TOKEN,addRandomSuffix:false,allowOverwrite:false});
}
export async function attachTeamFile(id,actor,people,api,env,f,inspect=head){
 const info=pathInfo(id,actor,f.pathname);
 const name=String(f.name||'').trim().replace(/[\\/\u0000-\u001f\u007f]/g,'-').slice(0,200);if(!name)throw new HttpError(400,'Give this file a name.');
 const blob=await inspect(f.pathname,{token:env.BLOB_READ_WRITE_TOKEN});
 if(blob.pathname!==f.pathname||blob.contentType!==info.type||blob.size<=0||blob.size>teamFileLimit||!new URL(blob.url).hostname.endsWith('.private.blob.vercel-storage.com'))throw new HttpError(400,'This private upload could not be verified.');
 return mutateThread(api,id,actor,people,row=>{
  const prior=row.payload.files.find(x=>x.id===info.id);
  if(prior){if(prior.pathname!==f.pathname||prior.uploadedBy!==actor.id)throw new HttpError(403,'Attachment unavailable.');return {unchanged:true,file:prior};}
  if(row.payload.files.length>=200)throw new HttpError(400,'This conversation has reached 200 attachments.');
  const file={...info,name,pathname:f.pathname,bytes:blob.size,uploadedBy:actor.id,at:new Date().toISOString()};row.payload.files.push(file);return {file};
 });
}
export async function sendTeamFile(req,res,id,actor,people,api,env,fileId,fetchFile=get){
 if(req.method!=='GET')throw new HttpError(405,'Use GET to download an attachment.');
 const row=await readThread(api,id),messages=visibleMessages(row,actor,people),file=row.payload.files.find(x=>x.id===uuid(fileId));
 if(!file||!messages.some(m=>m.id===file.messageId&&!m.deletedAt&&m.files.includes(file.id)))throw new HttpError(404,'This attachment is unavailable.');
 pathInfo(id,{id:file.uploadedBy},file.pathname);
 const result=await fetchFile(file.pathname,{access:'private',token:env.BLOB_READ_WRITE_TOKEN});if(!result?.stream)throw new HttpError(404,'This attachment is unavailable.');
 res.statusCode=200;res.setHeader('Content-Type','application/octet-stream');res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");
 res.setHeader('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(file.name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16)));
 await pipeline(Readable.fromWeb(result.stream),res);
}
