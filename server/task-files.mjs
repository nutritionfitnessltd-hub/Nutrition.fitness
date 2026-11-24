import {uploadDestination,saveLibraryUpload,copyUploadToSharePoint,readableUploadedAsset,libraryAssetCategories} from './task-upload-destinations.mjs';
import {canEditContent,canAccess} from './library-permissions.mjs';
import {createHash} from 'node:crypto';
import {get,head,put} from '@vercel/blob';
import {handleUpload} from '@vercel/blob/client';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {HttpError} from './platform.mjs';
import {taskContext,canUpdateTask,threadFor} from './task-messages.mjs';
import {esc,url,select,input} from './studio-ui.mjs';
const types={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',zip:'application/zip',mp4:'video/mp4',webm:'video/webm',mp3:'audio/mpeg'};
const limit=250*1024*1024;
export const taskStoragePrefix=task=>'nutrition-library/task-assets/v1/'+createHash('sha256').update(task.key).digest('hex')+'/';
function filePath(task,pathname){
 const prefix=taskStoragePrefix(task),tail=typeof pathname==='string'&&pathname.startsWith(prefix)?pathname.slice(prefix.length):'';
 const match=/^([a-f0-9-]{36})\.([a-z0-9]+)$/.exec(tail);
 if(!match||!types[match[2]])throw new HttpError(400,'Choose a supported task attachment.');
 return {id:match[1],type:types[match[2]]};
}
function writable(params,data,env){
 const task=taskContext(params,data);
 if(!canUpdateTask(task,data.actor))throw new HttpError(403,'You cannot upload files to this task.');
 if(!env.BLOB_READ_WRITE_TOKEN)throw new HttpError(503,'File uploads are unavailable in this workspace.');
 return task;
}
export function taskAttachmentPanel(task,thread,data){
 const files=thread.payload.fields.files||[],destination=url('task',task.values);
 return '<section id="task-attachments"><h2>Attachments</h2><p class="meta">Files saved with this task, available to its participants and administrators.</p>'+
 (files.length?'<ul class="task-message-list" data-task-attachment-list>'+files.map(file=>'<li><a href="'+url('task',{...task.values,file:file.id})+'">'+esc(file.name)+'</a><small> · '+esc((file.bytes/1024/1024).toFixed(1))+' MB · '+esc(file.uploadedByName||'Team member')+'</small>'+(file.assetId?' · <a href="'+url('product-asset',{id:file.assetId})+'">Open asset</a>':file.sharepoint?' · <a href="'+esc(file.sharepoint.url)+'" target="_blank" rel="noopener">Open in SharePoint</a>':'')+'</li>').join('')+'</ul>':'<p data-task-no-attachments>No attachments yet.</p><ul class="task-message-list" data-task-attachment-list></ul>')+
 (canUpdateTask(task,data.actor)&&data.taskUploadsReady?'<div data-task-upload data-prefix="'+taskStoragePrefix(task)+'" data-upload-url="'+destination+'" data-save-url="'+destination+'" data-save-action="task-file-save">'+select('destination','Save asset to',{task:'This task only',...(canAccess(data.actor,'library')?{library:'Content Library',product:'A product'}:{}),sharepoint:'SharePoint folder'},'task')+'<div data-library-destination hidden>'+select('category','Asset category',Object.fromEntries(libraryAssetCategories.map(x=>[x,x])),'Images & files')+'</div><div data-product-destination hidden>'+select('productId','Product',{'':'Choose a product',...Object.fromEntries(data.items.filter(r=>r.kind==='product'&&canEditContent(data,r.id)).map(r=>[r.id,r.title]))},'')+'</div><div data-sharepoint-destination hidden>'+input('folderUrl','SharePoint folder link','','url','placeholder="https://nutritionfitness.sharepoint.com/…"')+'<p class="meta">Paste the exact destination folder link. SharePoint must grant this workspace application access to that folder.</p></div><label>Files<input type="file" multiple data-task-file accept=".jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx,.pptx,.zip,.mp4,.webm,.mp3"></label><input type="hidden" name="fileSlot" value="Supporting file"><p class="meta">Images, PDF and Office documents, ZIP, audio or video. Up to 250 MB per file and 50 files per task.</p><button type="button" class="primary" data-task-upload-button>Upload files</button><button type="button" data-task-upload-cancel hidden>Cancel upload</button><progress hidden max="100" value="0" aria-label="Upload progress"></progress><p role="status" aria-live="polite" data-task-upload-status></p></div><script type="module" src="/task-upload.js"></script>':canUpdateTask(task,data.actor)?'<p class="meta">Uploads are unavailable in this view.</p>':'')+'</section>';
}
export async function taskUploadToken(req,params,data,api,env,generate=handleUpload){
 const task=writable(params,data,env),thread=await threadFor(task,api);
 if((thread.payload.fields.files||[]).length>=50)throw new HttpError(400,'Use up to 50 files per task.');
 if(req.body?.type!=='blob.generate-client-token')throw new HttpError(400,'Choose a file to upload.');
 return generate({request:req,body:req.body,token:env.BLOB_READ_WRITE_TOKEN,onBeforeGenerateToken:async pathname=>({allowedContentTypes:[filePath(task,pathname).type],maximumSizeInBytes:limit,validUntil:Date.now()+15*60*1000,addRandomSuffix:false,allowOverwrite:false})});
}
export async function attachTaskFile(params,f,data,api,env,inspect=head,fetchBlob=get,fetcher=fetch){
 const task=writable(params,data,env),target=uploadDestination(f,data),expected=filePath(task,f.pathname),thread=await threadFor(task,api),files=thread.payload.fields.files||[];
 const prior=files.find(file=>file.pathname===f.pathname);if(prior)return {saved:true,file:prior};
 if(files.length>=50)throw new HttpError(400,'Use up to 50 files per task.');
 const name=String(f.name||'').trim().replace(/[\\/\u0000-\u001f]/g,'-').slice(0,200);if(!name)throw new HttpError(400,'Give the file a name.');
 const blob=await inspect(f.pathname,{token:env.BLOB_READ_WRITE_TOKEN});
 if(blob.pathname!==f.pathname||blob.contentType!==expected.type||blob.size<=0||blob.size>limit||!new URL(blob.url).hostname.endsWith('.private.blob.vercel-storage.com'))throw new HttpError(400,'This private upload could not be verified.');
 const file={...expected,pathname:f.pathname,name,bytes:blob.size,uploadedAt:new Date().toISOString(),uploadedBy:data.actor.id,uploadedByName:data.actor.name||'Administrator',destination:target.destination};
 if(['library','product'].includes(target.destination))file.assetId=await saveLibraryUpload(task,file,target,data,api);
 if(target.destination==='sharepoint')file.sharepoint=await copyUploadToSharePoint(task,file,target,env,fetchBlob,fetcher);
 const document={...thread.payload,fields:{...thread.payload.fields,files:[...files,file]}};
 const saved=await api('/rest/v1/rpc/nufi_studio_save',{service:true,method:'POST',payload:{item:task.threadId,expected:thread.revision,document,editor_name:'task-file:'+data.actor.id}});
 if(!saved.length)throw new HttpError(409,'The task changed while uploading. Retry saving the uploaded file.');
 return {saved:true,file};
}
export async function sendTaskFile(req,res,params,data,api,env,fetchFile=get){
 if(req.method!=='GET')throw new HttpError(405,'Use GET to open a task file.');
 const task=taskContext(params,data),thread=await threadFor(task,api),file=(thread.payload.fields.files||[]).find(f=>f.id===params.get('file'));
 if(!file||filePath(task,file.pathname).type!==file.type)throw new HttpError(404,'Task file unavailable.');
 const result=await fetchFile(file.pathname,{access:'private',token:env.BLOB_READ_WRITE_TOKEN});if(!result?.stream)throw new HttpError(404,'Task file unavailable.');
 res.statusCode=200;res.setHeader('Content-Type','application/octet-stream');res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");
 res.setHeader('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(file.name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16)));
 await pipeline(Readable.fromWeb(result.stream),res);
}


export async function uploadSmallTaskFile(params,f,data,api,env,save=put){
 const task=writable(params,data,env),expected=filePath(task,f.pathname);
 if(typeof f.data!=='string'||f.data.length>2800000||!/^[A-Za-z0-9+/]*={0,2}$/.test(f.data))throw new HttpError(400,'Choose a file up to 2 MB for this upload method.');
 const bytes=Buffer.from(f.data,'base64');
 if(!bytes.length||bytes.length>2*1024*1024||bytes.length!==Number(f.bytes))throw new HttpError(400,'The upload size could not be verified.');
 try{return await save(f.pathname,bytes,{access:'private',contentType:expected.type,token:env.BLOB_READ_WRITE_TOKEN,addRandomSuffix:false,allowOverwrite:false,abortSignal:AbortSignal.timeout(30000)});}catch(error){const existing=await head(f.pathname,{token:env.BLOB_READ_WRITE_TOKEN}).catch(()=>null);if(existing?.size===bytes.length&&existing.contentType===expected.type)return existing;throw error;}
}
export async function taskTransportData(params,actor,api){
 const data={actor,projects:[],tasks:[],items:[],byId:new Map(),assigned:new Set()};
 if(params.get('task'))data.tasks=await api('/rest/v1/nufi_library_tasks?id=eq.'+encodeURIComponent(params.get('task'))+'&select=*',{service:true});
 else if(params.get('project'))data.projects=await api('/rest/v1/nufi_library_projects?id=eq.'+encodeURIComponent(params.get('project'))+'&select=*',{service:true});
 taskContext(params,data);return data;
}
export async function sendUploadedAsset(req,res,params,data,api,env,fetchFile=get){
 if(req.method!=='GET')throw new HttpError(405,'Use GET to open an asset.');
 const asset=readableUploadedAsset(data,params.get('id')),[row]=await api('/rest/v1/nufi_studio_items?id=eq.'+encodeURIComponent(asset.fields.taskThreadId)+'&select=payload,revision',{service:true});
 const file=row?.payload.fields?.files?.find(f=>f.id===asset.fields.taskFileId&&f.assetId===asset.id);
 if(!file)throw new HttpError(404,'Asset file unavailable.');
 const task={key:row.payload.fields.taskKey};if(filePath(task,file.pathname).type!==file.type)throw new HttpError(404,'Asset file unavailable.');
 const result=await fetchFile(file.pathname,{access:'private',token:env.BLOB_READ_WRITE_TOKEN});if(!result?.stream)throw new HttpError(404,'Asset file unavailable.');
 res.statusCode=200;res.setHeader('Content-Type','application/octet-stream');res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(file.name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16)));await pipeline(Readable.fromWeb(result.stream),res);
}
