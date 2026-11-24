import {createHash} from 'node:crypto';
import {get,head} from '@vercel/blob';
import {handleUpload} from '@vercel/blob/client';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {HttpError} from './platform.mjs';
import {taskContext,canUpdateTask,threadFor} from './task-messages.mjs';
import {esc,url} from './studio-ui.mjs';
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
 (files.length?'<ul class="task-message-list">'+files.map(file=>'<li><a href="'+url('task',{...task.values,file:file.id})+'">'+esc(file.name)+'</a><small> · '+esc((file.bytes/1024/1024).toFixed(1))+' MB · '+esc(file.uploadedByName||'Team member')+'</small></li>').join('')+'</ul>':'<p>No attachments yet.</p>')+
 (canUpdateTask(task,data.actor)&&data.taskUploadsReady?'<div data-product-upload data-prefix="'+taskStoragePrefix(task)+'" data-upload-url="'+destination+'" data-save-url="'+destination+'" data-save-action="task-file-save"><label>Files<input type="file" multiple data-product-file accept=".jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx,.pptx,.zip,.mp4,.webm,.mp3"></label><input type="hidden" name="fileSlot" value="Supporting file"><p class="meta">Images, PDF and Office documents, ZIP, audio or video. Up to 250 MB per file and 50 files per task.</p><button type="button" class="primary" data-product-upload-button>Upload files</button><progress hidden max="100" value="0" aria-label="Upload progress"></progress><p role="status" aria-live="polite" data-product-upload-status></p></div><script type="module" src="/product-upload.js"></script>':canUpdateTask(task,data.actor)?'<p class="meta">Uploads are unavailable in this view.</p>':'')+'</section>';
}
export async function taskUploadToken(req,params,data,api,env,generate=handleUpload){
 const task=writable(params,data,env),thread=await threadFor(task,api);
 if((thread.payload.fields.files||[]).length>=50)throw new HttpError(400,'Use up to 50 files per task.');
 if(req.body?.type!=='blob.generate-client-token')throw new HttpError(400,'Choose a file to upload.');
 return generate({request:req,body:req.body,token:env.BLOB_READ_WRITE_TOKEN,onBeforeGenerateToken:async pathname=>({allowedContentTypes:[filePath(task,pathname).type],maximumSizeInBytes:limit,validUntil:Date.now()+15*60*1000,addRandomSuffix:false,allowOverwrite:false})});
}
export async function attachTaskFile(params,f,data,api,env,inspect=head){
 const task=writable(params,data,env),expected=filePath(task,f.pathname),thread=await threadFor(task,api),files=thread.payload.fields.files||[];
 if(files.some(file=>file.pathname===f.pathname))return;
 if(files.length>=50)throw new HttpError(400,'Use up to 50 files per task.');
 const name=String(f.name||'').trim().replace(/[\\/\u0000-\u001f]/g,'-').slice(0,200);if(!name)throw new HttpError(400,'Give the file a name.');
 const blob=await inspect(f.pathname,{token:env.BLOB_READ_WRITE_TOKEN});
 if(blob.pathname!==f.pathname||blob.contentType!==expected.type||blob.size<=0||blob.size>limit||!new URL(blob.url).hostname.endsWith('.private.blob.vercel-storage.com'))throw new HttpError(400,'This private upload could not be verified.');
 const document={...thread.payload,fields:{...thread.payload.fields,files:[...files,{...expected,pathname:f.pathname,name,bytes:blob.size,uploadedAt:new Date().toISOString(),uploadedBy:data.actor.id,uploadedByName:data.actor.name||'Administrator'}]}};
 const saved=await api('/rest/v1/rpc/nufi_studio_save',{service:true,method:'POST',payload:{item:task.threadId,expected:thread.revision,document,editor_name:'task-file:'+data.actor.id}});
 if(!saved.length)throw new HttpError(409,'The task changed while uploading. Retry saving the uploaded file.');
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

