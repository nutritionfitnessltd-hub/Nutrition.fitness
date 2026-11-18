import {HttpError} from './platform.mjs';
import {get} from '@vercel/blob';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
export const workerImagePath=p=>typeof p==='string'&&/^content-manager\/[a-f0-9-]{36}\.(jpg|png|webp)$/.test(p);
export async function sendWorkerImage(res,record,env,fetcher=fetch){
 const image=record.workerImage;let stream,type;
 if(image?.bucket==='worker-content'&&workerImagePath(image.path)&&['image/jpeg','image/png','image/webp'].includes(image.type)){
  const result=await fetcher(env.SUPABASE_URL+'/storage/v1/object/authenticated/worker-content/'+image.path,{headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY},signal:AbortSignal.timeout(15000)});
  if(!result.ok)throw new HttpError(404,'Image unavailable.');stream=result.body;type=image.type;
 }else if(record.articleImage?.type==='image/webp'&&/^nutrition-library\/article-images\/v1\/[a-f0-9-]{36}\.webp$/.test(record.articleImage.pathname)){
  const result=await get(record.articleImage.pathname,{access:'private'});stream=result?.stream;type='image/webp';
 }
 if(!stream)throw new HttpError(404,'Image unavailable.');
 res.setHeader('Content-Type',type);res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.statusCode=200;await pipeline(Readable.fromWeb(stream),res);
}
