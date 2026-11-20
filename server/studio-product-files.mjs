import {get,head} from '@vercel/blob';
import {handleUpload} from '@vercel/blob/client';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {HttpError} from './platform.mjs';
import {readable,editable,saveRecord} from './studio-store.mjs';
import {requireAccess} from './library-permissions.mjs';
import {cleanText} from './studio-model.mjs';
import {isProductAsset,productStoragePrefix} from './studio-products.mjs';

export const productFileTypes={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',zip:'application/zip',mp4:'video/mp4',webm:'video/webm',mp3:'audio/mpeg'};
const maximumSizeInBytes=250*1024*1024;
function filePath(r,pathname){
 const prefix=productStoragePrefix(r.id),tail=typeof pathname==='string'&&pathname.startsWith(prefix)?pathname.slice(prefix.length):'';
 const match=/^([a-f0-9-]{36})\.([a-z0-9]+)$/.exec(tail);
 if(!match||!productFileTypes[match[2]])throw new HttpError(400,'Choose a supported file for this asset.');
 return {id:match[1],type:productFileTypes[match[2]]};
}
function uploadRecord(data,id,env){
 requireAccess(data.actor,'library','edit');const r=editable(data,id);
 if(!isProductAsset(r))throw new HttpError(400,'Save a product asset before uploading its files.');
 if(!env.BLOB_READ_WRITE_TOKEN)throw new HttpError(503,'File uploads are unavailable in this workspace. You can add a team folder link in Edit details.');
 return r;
}
function checkFileLimit(r){if((r.productFiles||[]).length>=20)throw new HttpError(400,'Use up to 20 files per asset. Add another asset for more files.');}
export async function productUploadToken(req,params,data,env,generate=handleUpload){
 const r=uploadRecord(data,params.get('id'),env);
 checkFileLimit(r);
 if(req.body?.type!=='blob.generate-client-token')throw new HttpError(400,'Choose a file to upload.');
 return generate({request:req,body:req.body,token:env.BLOB_READ_WRITE_TOKEN,onBeforeGenerateToken:async pathname=>{
  const {type}=filePath(r,pathname);
  return {allowedContentTypes:[type],maximumSizeInBytes,validUntil:Date.now()+15*60*1000,addRandomSuffix:false,allowOverwrite:false};
 }});
}
export async function attachProductFile(params,f,data,api,env,inspect=head){
 const r=uploadRecord(data,params.get('id'),env),expected=filePath(r,f.pathname);
 if((r.productFiles||[]).some(file=>file.pathname===f.pathname))return;
 checkFileLimit(r);
 const name=cleanText(f.name||'',200).replace(/[\\/]/g,'-');if(!name)throw new HttpError(400,'Give the file a name.');
 if(!['Finished export','Editable original','Thumbnail','Supporting document'].includes(f.slot))throw new HttpError(400,'Choose the file purpose.');
 const blob=await inspect(f.pathname,{token:env.BLOB_READ_WRITE_TOKEN});
 if(blob.pathname!==f.pathname||blob.contentType!==expected.type||blob.size<=0||blob.size>maximumSizeInBytes||!new URL(blob.url).hostname.endsWith('.private.blob.vercel-storage.com'))throw new HttpError(400,'This private upload could not be verified.');
 if(f.slot==='Thumbnail'&&!expected.type.startsWith('image/'))throw new HttpError(400,'Use a JPG, PNG or WebP thumbnail.');
 const next=structuredClone(r);delete next.revision;delete next.updatedAt;delete next.approval;next.status='Draft';
 next.productFiles=[...(next.productFiles||[]),{...expected,pathname:f.pathname,name,type:expected.type,bytes:blob.size,slot:f.slot,uploadedAt:new Date().toISOString()}];
 await saveRecord(api,data.actor,next,r.revision);
}
export async function sendProductFile(req,res,params,data,env,fetchFile=get){
 if(req.method!=='GET')throw new HttpError(405,'Use GET to open a file.');
 const r=readable(data,params.get('id')),file=isProductAsset(r)&&(r.productFiles||[]).find(f=>f.id===params.get('file'));
 if(!file||filePath(r,file.pathname).type!==file.type)throw new HttpError(404,'File unavailable.');
 const range=req.headers?.range;
 if(range&&!/^bytes=(?:\d+-\d*|-\d+)$/.test(range))throw new HttpError(416,'Choose a valid file range.');
 const result=await fetchFile(file.pathname,{access:'private',token:env.BLOB_READ_WRITE_TOKEN,...(range?{headers:{Range:range}}:{})});if(!result?.stream)throw new HttpError(404,'File unavailable.');
 const inline=params.get('inline')==='1'&&/^(image\/(jpeg|png|webp)|video\/(mp4|webm))$/.test(file.type);
 res.statusCode=200;res.setHeader('Content-Type',file.type);res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");
 const contentRange=result.headers?.get('content-range');
 if(contentRange){res.statusCode=206;res.setHeader('Content-Range',contentRange);}
 if(result.headers?.get('content-length'))res.setHeader('Content-Length',result.headers.get('content-length'));
 res.setHeader('Accept-Ranges','bytes');
 res.setHeader('Content-Disposition',(inline?'inline':'attachment')+"; filename*=UTF-8''"+encodeURIComponent(file.name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16)));
 await pipeline(Readable.fromWeb(result.stream),res);
}
