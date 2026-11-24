import {HttpError} from './platform.mjs';
import {canAccess,canEditContent,canReadContent} from './library-permissions.mjs';
import {saveRecord} from './studio-store.mjs';
import {url} from './studio-ui.mjs';
export const libraryAssetCategories=['Images & files','Packaging & labels','Marketing & social','Books & guides','Supporting documents'];
export function uploadDestination(f,data){
 const destination=f.destination||'task';
 if(!['task','library','product','sharepoint'].includes(destination))throw new HttpError(400,'Choose an upload destination.');
 if(['library','product'].includes(destination)&&!canAccess(data.actor,'library'))throw new HttpError(403,'Content Library access is required for this destination.');
 if(destination==='product'){
  const product=data.byId.get(f.productId);
  if(product?.kind!=='product'||!canEditContent(data,product.id))throw new HttpError(403,'Choose a product you can edit.');
 }
 if(destination==='library'&&!libraryAssetCategories.includes(f.category||'Images & files'))throw new HttpError(400,'Choose a library category.');
 if(destination==='sharepoint'){
  let folder;try{folder=new URL(f.folderUrl);}catch{throw new HttpError(400,'Paste the SharePoint folder link.');}
  if(folder.protocol!=='https:'||folder.hostname!=='nutritionfitness.sharepoint.com'||folder.username||folder.password)throw new HttpError(400,'Choose a folder in the nutrition.fitness SharePoint site.');
 }
 return {destination,...(destination==='product'?{productId:f.productId}:{}),...(destination==='library'?{category:f.category||'Images & files'}:{}),...(destination==='sharepoint'?{folderUrl:f.folderUrl}:{})};
}
export async function saveLibraryUpload(task,file,target,data,api){
 const id='studio:product:'+file.id,[existing]=await api('/rest/v1/nufi_studio_items?id=eq.'+encodeURIComponent(id)+'&select=payload,revision',{service:true});
 if(existing){if(existing.payload.fields?.taskFileId!==file.id||existing.payload.fields?.taskThreadId!==task.threadId)throw new HttpError(409,'This file belongs to another asset.');return id;}
 const record={id,title:file.name,kind:'asset',status:'Draft',shared:true,createdBy:data.actor.id,comments:[],fields:{productAsset:true,productIds:target.productId?[target.productId]:[],assetRole:target.destination==='product'?'product':'advert',type:target.category==='Packaging & labels'?'Packaging & labels':file.type.startsWith('image/')?'Photography':file.type.startsWith('video/')?'Video':'Other',category:target.category||'Supporting document',channel:'Unspecified',altText:file.name,taskThreadId:task.threadId,taskFileId:file.id,url:'https://team.nutrition.fitness'+url('task-asset-file',{id,file:file.id}).replaceAll('&amp;','&')}};
 await saveRecord(api,data.actor,record,0);return id;
}
async function graphToken(env,fetcher){
 const tenant=env.SHAREPOINT_TENANT_ID||env.EXCHANGE_TENANT_ID,client=env.SHAREPOINT_CLIENT_ID||env.EXCHANGE_CLIENT_ID,secret=env.SHAREPOINT_CLIENT_SECRET||env.EXCHANGE_CLIENT_SECRET;
 if(!tenant||!client||!secret)throw new HttpError(503,'The SharePoint upload connection is not configured. Your private upload is retained; choose another destination or ask an administrator to connect SharePoint.');
 const r=await fetcher('https://login.microsoftonline.com/'+encodeURIComponent(tenant)+'/oauth2/v2.0/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:client,client_secret:secret,grant_type:'client_credentials',scope:'https://graph.microsoft.com/.default'}),signal:AbortSignal.timeout(15000)}),j=await r.json();
 if(!r.ok||!j.access_token)throw new HttpError(503,'SharePoint authentication failed. Your private upload is retained for retry.');return j.access_token;
}
export async function copyUploadToSharePoint(task,file,target,env,fetchBlob,fetcher=fetch){
 const token=await graphToken(env,fetcher),headers={Authorization:'Bearer '+token};
 const share='u!'+Buffer.from(target.folderUrl).toString('base64url');
 const resolved=await fetcher('https://graph.microsoft.com/v1.0/shares/'+share+'/driveItem?$select=id,name,webUrl,parentReference,folder',{headers,signal:AbortSignal.timeout(15000)}),folder=await resolved.json();
 if(!resolved.ok)throw new HttpError(resolved.status===403?403:400,'SharePoint cannot open this folder. Check the folder link and the application’s file permissions. The private upload is retained for retry.');
 let address;try{address=new URL(folder.webUrl);}catch{}
 if(!folder.folder||!folder.id||!folder.parentReference?.driveId||address?.hostname!=='nutritionfitness.sharepoint.com'||!decodeURIComponent(address.pathname).toLowerCase().startsWith('/sites/nutrition.fitness/'))throw new HttpError(400,'Choose a folder in the nutrition.fitness SharePoint site.');
 const blob=await fetchBlob(file.pathname,{access:'private',token:env.BLOB_READ_WRITE_TOKEN});if(!blob?.stream)throw new HttpError(404,'The uploaded file is unavailable.');
 const dot=file.name.lastIndexOf('.'),unique=(dot>0?file.name.slice(0,dot):file.name)+' - '+file.id+(dot>0?file.name.slice(dot):'');
 const endpoint='https://graph.microsoft.com/v1.0/drives/'+encodeURIComponent(folder.parentReference.driveId)+'/items/'+encodeURIComponent(folder.id)+':/'+encodeURIComponent(unique)+':/content';
 const saved=await fetcher(endpoint,{method:'PUT',headers:{...headers,'Content-Type':file.type,'Content-Length':String(file.bytes)},body:blob.stream,duplex:'half',signal:AbortSignal.timeout(90000)}),item=await saved.json();
 if(!saved.ok||!item.id||item.size!==file.bytes||new URL(item.webUrl).hostname!=='nutritionfitness.sharepoint.com')throw new HttpError(503,'SharePoint did not confirm the saved file. The private upload is retained; retry saving without uploading again.');
 return {id:item.id,url:item.webUrl,folder:folder.webUrl};
}
export function readableUploadedAsset(data,id){const r=data.byId.get(id);if(!canReadContent(data,r)||!r.fields?.taskFileId||!r.fields?.taskThreadId)throw new HttpError(403,'This asset is unavailable.');return r;}


