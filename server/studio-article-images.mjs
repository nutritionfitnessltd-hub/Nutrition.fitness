import {randomUUID,createHash} from 'node:crypto';
import {get,put,del} from '@vercel/blob';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {HttpError} from './platform.mjs';
import {editable} from './studio-store.mjs';
import {validateFields,validateShape,cleanText} from './studio-model.mjs';
import {changeStudio} from './studio-actions.mjs';

export const articleImagePath=p=>typeof p==='string'&&/^nutrition-library\/article-images\/v1\/[a-f0-9-]{36}\.webp$/.test(p);
export function imageBytes(encoded){
 if(typeof encoded!=='string'||encoded.length>900000||!/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw new HttpError(400,'Choose a JPG, PNG or WebP image and try again.');
 const bytes=Buffer.from(encoded.slice(encoded.indexOf(',')+1),'base64');
 if(bytes.length<30||bytes.length>650000||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP'||bytes.readUInt32LE(4)+8!==bytes.length)throw new HttpError(400,'This image could not be read. Choose another image.');
 const chunk=bytes.toString('ascii',12,16);let width,height;
 if(chunk==='VP8X'){width=bytes.readUIntLE(24,3)+1;height=bytes.readUIntLE(27,3)+1;}
 else if(chunk==='VP8 '&&bytes.toString('hex',23,26)==='9d012a'){width=bytes.readUInt16LE(26)&16383;height=bytes.readUInt16LE(28)&16383;}
 else if(chunk==='VP8L'&&bytes[20]===47){const bits=bytes.readUInt32LE(21);width=(bits&16383)+1;height=((bits>>>14)&16383)+1;}
 if(!width||!height||width>1800||height>1800)throw new HttpError(400,'Choose a smaller image and try again.');
 return {bytes,width,height};
}
export async function saveArticleImage(params,f,data,api,env,{store=put,remove=del}={}){
 const r=editable(data,params.get('id'));
 if(r.kind!=='article')throw new HttpError(400,'Choose an article for this image.');
 if(r.revision!==Number(f.revision))throw new HttpError(409,'This article changed. Open the latest copy before saving your image.');
 let fields;try{fields=JSON.parse(f.fields);}catch{throw new HttpError(400,'The article fields could not be read.');}
 if(!fields||Array.isArray(fields)||typeof fields!=='object'||JSON.stringify(fields).length>500000)throw new HttpError(400,'Check the article fields and size.');
 validateFields(fields);validateShape('article',fields);if(!cleanText(f.title,200))throw new HttpError(400,'Add an article title.');
 const {bytes,width,height}=imageBytes(f.imageUpload);
 if(!env.BLOB_READ_WRITE_TOKEN)throw new HttpError(503,'Image storage is unavailable. Your image has not replaced the current one.');
 const pathname='nutrition-library/article-images/v1/'+randomUUID()+'.webp';
 const asset={pathname,type:'image/webp',bytes:bytes.length,width,height,sha256:createHash('sha256').update(bytes).digest('hex')};
 fields.imageAlt=cleanText(f.uploadAlt||f.title,500);fields.imageCredit=cleanText(f.uploadCredit||'',500);fields.imageCreditUrl='';
 const nextData={...data,byId:new Map(data.byId)};nextData.byId.set(r.id,{...r,workerImage:null,articleImage:asset});
 await store(pathname,bytes,{access:'private',contentType:'image/webp',addRandomSuffix:false,token:env.BLOB_READ_WRITE_TOKEN});
 try{return await changeStudio(params,{...f,fields:JSON.stringify(fields)},nextData,api);}
 catch(error){try{await remove(pathname,{token:env.BLOB_READ_WRITE_TOKEN});}catch{}throw error;}
}
export async function sendArticleImage(req,res,params,data,fetchFile=name=>get(name,{access:'private'})){
 if(req.method!=='GET')throw new HttpError(405,'Use GET to open an article image.');
 const r=data.byId.get(params.get('id')),asset=r?.kind==='article'&&r.articleImage;
 if(asset?.type!=='image/webp'||!articleImagePath(asset.pathname))throw new HttpError(404,'Article image unavailable.');
 const result=await fetchFile(asset.pathname);if(!result?.stream)throw new HttpError(404,'Article image unavailable.');
 res.setHeader('Content-Type','image/webp');res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.statusCode=200;await pipeline(Readable.fromWeb(result.stream),res);
}
