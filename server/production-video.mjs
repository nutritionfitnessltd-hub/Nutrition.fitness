import {get,head} from '@vercel/blob';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {HttpError} from './platform.mjs';
import {readable} from './studio-store.mjs';
import {productionFileUrl} from './production-file-links.mjs';
export function checkedVideo(record,sha){
 return (record.fields?.production?.files||[]).find(f=>f.bytes>0&&/^[a-f0-9]{64}$/.test(f.sha256||'')&&(!sha||sha===f.sha256)&&/\.mp4(?:$|\?)/i.test(productionFileUrl(f.url))&&new URL(f.url).hostname==='nutritionfitness.sharepoint.com');
}

export const videoReviewPath=sha=>'nutrition-library/video-review/v1/'+sha+'.mp4';
export function videoRange(value,size){
 if(!value)return null;const m=/^bytes=(\d*)-(\d*)$/.exec(value);if(!m||!m[1]&&!m[2])return false;
 let start=m[1]?Number(m[1]):Math.max(0,size-Number(m[2])),end=m[1]?(m[2]?Number(m[2]):size-1):size-1;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)return false;
 end=Math.min(end,size-1);return {start,end,length:end-start+1};
}
export async function productionVideoSource(req,res,params,data,env={},fetchFile=get,headFile=head){
 if(!['GET','HEAD'].includes(req.method))throw new HttpError(405,'Use GET to play a video.');
 const r=readable(data,params.get('id')),sha=params.get('sha'),file=checkedVideo(r,sha);
 if(!/^[a-f0-9]{64}$/.test(sha||'')||Number(params.get('revision'))!==r.revision||!file)throw new HttpError(409,'This export has changed. Reopen the project before watching.');
 if(!env.BLOB_READ_WRITE_TOKEN)throw new HttpError(503,'Private video playback is not configured.');
 const range=videoRange(req.headers?.range||req.headers?.Range,file.bytes);
 res.setHeader('Cache-Control','private, no-store');res.setHeader('Accept-Ranges','bytes');res.setHeader('X-Content-Type-Options','nosniff');
 if(range===false){res.statusCode=416;res.setHeader('Content-Range','bytes */'+file.bytes);return res.end();}
 const pathname=videoReviewPath(sha),options={token:env.BLOB_READ_WRITE_TOKEN};
 let metadata;try{metadata=await headFile(pathname,options);}catch{throw new HttpError(503,'This video is being prepared for in-app playback. Please try again shortly.');}
 if(metadata?.size!==file.bytes||!metadata.url?.includes('.private.blob.vercel-storage.com/'))throw new HttpError(409,'The private video copy does not match this saved export.');
 const length=range?.length||file.bytes;
 if(req.method==='HEAD'){res.statusCode=range?206:200;res.setHeader('Content-Type','video/mp4');res.setHeader('Content-Length',String(length));if(range)res.setHeader('Content-Range','bytes '+range.start+'-'+range.end+'/'+file.bytes);return res.end();}
 const expected=range?'bytes '+range.start+'-'+range.end+'/'+file.bytes:'';
 const result=await fetchFile(pathname,{...options,access:'private',...(range?{headers:{Range:'bytes='+range.start+'-'+range.end}}:{})});
 if(!result?.stream)throw new HttpError(503,'This video could not be loaded. Please try again.');
 if(range&&result.headers?.get('content-range')!==expected){await result.stream.cancel();throw new HttpError(503,'The video stream could not confirm the requested playback range.');}
 res.statusCode=range?206:200;res.setHeader('Content-Type','video/mp4');res.setHeader('Content-Length',String(length));res.setHeader('Content-Disposition','inline');res.setHeader('ETag','"'+sha+'"');if(range)res.setHeader('Content-Range',expected);
 await pipeline(Readable.fromWeb(result.stream),res);
}
