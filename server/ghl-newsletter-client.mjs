import {HttpError} from './platform.mjs';
export const ghlLocation='C0BGBoXIG8FVn9G5mmA3';
export const ghlCampaignUrl=id=>'https://app.gohighlevel.com/v2/location/'+ghlLocation+'/marketing/emails/campaigns/'+encodeURIComponent(id);
const root='/emails/locations/'+ghlLocation+'/campaigns/emails';
const identifier=id=>{if(typeof id!=='string'||! /^[a-zA-Z0-9_-]{1,100}$/.test(id))throw new HttpError(400,'Invalid GHL draft identifier.');return id;};
const contentKeys=new Set(['name','editorType','editorContent','subject','previewText','fromName','fromEmail']);
function draftBody(input){
 if(Object.keys(input).some(k=>!contentKeys.has(k))||input.editorType!=='html'||typeof input.editorContent!=='string')throw new HttpError(400,'Only draft email content can be synced.');
 return input;
}
export function ghlClient(token,fetcher=fetch){
 if(typeof token!=='string'||token.length<20||token.length>2000||/[\s\x00-\x1f]/.test(token))throw new HttpError(400,'Provide the GHL private integration token.');
 async function request(path,method='GET',payload,key){
  const multipart=payload instanceof FormData;
  let response;try{response=await fetcher('https://services.leadconnectorhq.com'+path,{method,redirect:'error',headers:{Authorization:'Bearer '+token,Version:'v3',Accept:'application/json',...(!multipart?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{})},body:payload===undefined?undefined:multipart?payload:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});}catch{throw new HttpError(503,'GHL did not confirm the request. The next sync will check its saved state.');}
  const result=await response.json().catch(()=>null);
  if(!response.ok){
   // Validation diagnostics only. Never retain credentials, request HTML or headers.
   const raw=[400,409,422].includes(response.status)?result?.message||result?.error_description||result?.error||'':'';
   const detail=(Array.isArray(raw)?raw.join('; '):typeof raw==='string'?raw:'').replaceAll(token,'[redacted]').replace(/pit-[a-z]+-[a-f0-9-]+/gi,'[redacted]').replace(/<[^>]*>/g,'').replace(/[\x00-\x1f]/g,' ').slice(0,240);
   const error=new HttpError(response.status===401||response.status===403?403:response.status===409?409:503,'GHL returned HTTP '+response.status+(detail?': '+detail:'. Check the connection and draft before retrying.'));
   error.upstreamStatus=response.status;throw error;
  }
  if(!result||typeof result!=='object')throw new HttpError(503,'GHL returned an incomplete response.');
  return result;
 }
 // There is intentionally no generic request, recipient, send, schedule or test-send API.
 return {
  check:()=>request(root+'?limit=1&offset=0'),
  get:id=>request(root+'/'+identifier(id)+'?includeContent=true'),
  create:(body,key)=>{draftBody(body);return request(root,'POST',{name:body.name,editorType:body.editorType,editorContent:body.editorContent},key);},
  update:(id,body)=>request(root+'/'+identifier(id),'PATCH',draftBody(body)),
  upload:async(source,name)=>{
   const body=new FormData();body.set('name',name);
   if(typeof source==='string'){body.set('hosted','true');body.set('fileUrl',source);}
   else{body.set('hosted','false');body.set('file',new Blob([source.bytes],{type:source.type}),name);}
   const r=await request('/medias/upload-file','POST',body);
   if(!trustedGhlImage(r.url))throw new HttpError(503,'GHL did not return a trusted image address.');
   return r.url;
  }
 };
}
export function trustedGhlImage(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&['files.leadconnectorhq.com','storage.googleapis.com','assets.cdn.filesafe.space'].includes(u.hostname);}catch{return false;}}
