import {upload} from '@vercel/blob/client';
const types={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',zip:'application/zip',mp4:'video/mp4',webm:'video/webm',mp3:'audio/mpeg'};
const base64=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('The selected file could not be read.'));reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(file);});
for(const panel of document.querySelectorAll('[data-task-upload]')){
 const picker=panel.querySelector('[data-task-file]'),button=panel.querySelector('[data-task-upload-button]'),cancel=panel.querySelector('[data-task-upload-cancel]'),status=panel.querySelector('[data-task-upload-status]'),progress=panel.querySelector('progress'),destination=panel.querySelector('[name=destination]');
 let uploaded,index=0,pathname,controller,idle;
 const chosen=()=>Object.fromEntries(['destination','productId','category','folderUrl','collectionId','themeId'].map(k=>[k,panel.querySelector('[name='+k+']')?.value||'']));
 destination.addEventListener('change',()=>{for(const [kind,selector] of [['library','[data-library-destination]'],['product','[data-product-destination]'],['sharepoint','[data-sharepoint-destination]']])panel.querySelector(selector).hidden=destination.value!==kind;const placement=panel.querySelector('[data-content-destination]');if(placement)placement.hidden=!['library','product'].includes(destination.value);});
 picker.addEventListener('change',()=>{uploaded=null;index=0;pathname=null;button.textContent='Upload files';status.textContent='';});
 cancel.addEventListener('click',()=>controller?.abort());
 function watchdog(){clearTimeout(idle);idle=setTimeout(()=>controller.abort('stalled'),45000);}
 async function jsonRequest(body,signal){const response=await fetch(panel.dataset.saveUrl,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body),signal});const result=await response.json().catch(()=>null);if(!response.ok)throw new Error(result?.error||'The server did not confirm this upload. Please retry.');return result;}
 function showSaved(file){
  if(!file?.id)throw new Error('The file saved, but the saved attachment could not be confirmed. Reload this task to check it.');
  const section=panel.closest('section'),list=section.querySelector('[data-task-attachment-list]');if(list.querySelector('[data-file-id="'+CSS.escape(file.id)+'"]'))return;
  section.querySelector('[data-task-no-attachments]')?.remove();const row=document.createElement('li'),link=document.createElement('a'),address=new URL(panel.dataset.saveUrl,location.href);address.searchParams.set('file',file.id);row.dataset.fileId=file.id;link.href=address.href;link.textContent=file.name;row.append(link);
  if(file.assetId){const asset=document.createElement('a'),address=new URL('/content-library/',location.href);address.searchParams.set('work','1');address.searchParams.set('studio','product-asset');address.searchParams.set('id',file.assetId);asset.href=address.href;asset.textContent='Open asset';row.append(' · ',asset);}
  if(file.sharepoint?.url){const destination=document.createElement('a');destination.href=file.sharepoint.url;destination.target='_blank';destination.rel='noopener';destination.textContent='Open in SharePoint';row.append(' · ',destination);}list.append(row);
 }
 button.addEventListener('click',async()=>{
  const files=Array.from(picker.files),target=chosen();
  if(!files.length){status.textContent='Choose at least one file.';return;}
  if(target.destination==='product'&&!target.productId){status.textContent='Choose a product first.';return;}
  if(target.destination==='sharepoint'&&!target.folderUrl){status.textContent='Paste the destination SharePoint folder link first.';return;}
  for(const file of files){if(!types[file.name.split('.').at(-1).toLowerCase()]||!file.size||file.size>250*1024*1024){status.textContent='Choose supported files up to 250 MB each. Check '+file.name;return;}}
  const controls=[...panel.querySelectorAll('input,select')];for(const el of controls)el.disabled=true;button.disabled=true;cancel.hidden=false;progress.hidden=false;
  try{for(;index<files.length;index++){
   const file=files[index],ext=file.name.split('.').at(-1).toLowerCase();pathname||=panel.dataset.prefix+crypto.randomUUID()+'.'+ext;
   controller=new AbortController();watchdog();
   if(!uploaded){
    progress.removeAttribute('value');status.textContent='Uploading '+file.name+' ('+(index+1)+' of '+files.length+', '+(file.size/1024/1024).toFixed(1)+' MB)…';
    if(file.size<=2*1024*1024){uploaded=await jsonRequest({action:'task-file-upload',pathname,bytes:file.size,data:await base64(file)},controller.signal);}
    else{
     uploaded=await Promise.race([upload(pathname,file,{access:'private',contentType:types[ext],handleUploadUrl:panel.dataset.uploadUrl,multipart:file.size>5*1024*1024,abortSignal:controller.signal,onUploadProgress:event=>{watchdog();progress.value=event.percentage;status.textContent=file.name+': '+Math.round(event.percentage)+'% ('+(event.loaded/1024/1024).toFixed(1)+' of '+(file.size/1024/1024).toFixed(1)+' MB)';}}),new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(new Error('The upload stopped responding. Check your connection and retry.')),{once:true}))]);
    }
   }
   clearTimeout(idle);controller=new AbortController();const saveTimer=setTimeout(()=>controller.abort(),target.destination==='sharepoint'?110000:45000);
   status.textContent=target.destination==='sharepoint'?'Saving to the selected SharePoint folder…':'Saving to '+({task:'this task',library:'Content Library',product:'the selected product'}[target.destination])+'…';progress.removeAttribute('value');
   try{const result=await jsonRequest({action:'task-file-save',pathname:uploaded.pathname,name:file.name,...target},controller.signal);showSaved(result.file);}finally{clearTimeout(saveTimer);}
   uploaded=null;pathname=null;status.textContent='Saved '+(index+1)+' of '+files.length+' files.';
  }status.textContent='Saved '+files.length+' file'+(files.length===1?'':'s')+' successfully.';picker.value='';index=0;button.textContent='Upload files';progress.hidden=true;}
  catch(error){status.textContent=(uploaded?'The file is uploaded privately. Retry saving it without uploading again. ':'')+(controller?.signal.aborted?'Upload cancelled or timed out. Check the destination and connection, then retry.':error.message||'Upload failed. Please retry.');button.textContent=uploaded?'Retry saving file':'Retry upload';}
  finally{clearTimeout(idle);button.disabled=false;cancel.hidden=true;for(const el of controls)el.disabled=false;}
 });
}



