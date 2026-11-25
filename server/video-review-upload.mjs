import {head,get} from '@vercel/blob';
import {generateClientTokenFromReadWriteToken} from '@vercel/blob/client';
import {createHash} from 'node:crypto';
import {HttpError} from './platform.mjs';
import {videoReviewPath} from './production-video.mjs';
export async function videoUploadAction(input,env,index,{stat=head,read=get,issue=generateClientTokenFromReadWriteToken}={}){
 if(!index.records.some(r=>r.id===input.sourceId&&r.group==='Courses'))throw new HttpError(404,'Choose an existing course source.');
 if(!/^[a-f0-9]{64}$/.test(input.sha256||'')||!Number.isSafeInteger(input.bytes)||input.bytes<=0||input.bytes>250*1024*1024)throw new HttpError(400,'Supply the checked video hash and size.');
 if(!env.BLOB_READ_WRITE_TOKEN)throw new HttpError(503,'Private video storage is not configured.');
 const pathname=videoReviewPath(input.sha256),options={token:env.BLOB_READ_WRITE_TOKEN};
 if(input.action==='video-upload-token')return {pathname,access:'private',clientToken:await issue({...options,pathname,allowedContentTypes:['video/mp4'],maximumSizeInBytes:input.bytes,validUntil:Date.now()+15*60*1000,addRandomSuffix:false,allowOverwrite:false})};
 const metadata=await stat(pathname,options);if(metadata.size!==input.bytes)throw new HttpError(409,'The uploaded video size does not match this export.');
 const result=await read(pathname,{...options,access:'private'});if(!result?.stream)throw new HttpError(409,'The uploaded video is unavailable.');
 const hash=createHash('sha256');let bytes=0;for await(const chunk of result.stream){bytes+=chunk.length;hash.update(chunk);}
 if(bytes!==input.bytes||hash.digest('hex')!==input.sha256)throw new HttpError(409,'The uploaded video hash does not match this export.');
 return {pathname,verified:true,sha256:input.sha256,bytes};
}
export async function requireVideoCopy(file,env,stat=head){
 const metadata=await stat(videoReviewPath(file.sha256),{token:env.BLOB_READ_WRITE_TOKEN}).catch(()=>null);
 if(metadata?.size!==file.bytes)throw new HttpError(409,'Upload and verify the private in-app video copy before saving this export.');
}
