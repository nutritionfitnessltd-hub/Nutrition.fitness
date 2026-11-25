import {upload} from '@vercel/blob/client';
const types={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',zip:'application/zip',mp4:'video/mp4',webm:'video/webm',mp3:'audio/mpeg'};
const base64=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('This file could not be read.'));reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(file);});
for(const panel of document.querySelectorAll('[data-message-upload]')){
 const form=panel.closest('form'),button=panel.querySelector('button'),picker=panel.querySelector('input[type=file]'),status=panel.querySelector('[role=status]'),progress=panel.querySelector('progress');
 let current;const completed=new WeakSet();
 const json=async body=>{const response=await fetch(form.action,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(45000)}),result=await response.json().catch(()=>null);if(!response.ok)throw Error(result?.error||'The upload could not be confirmed.');return result;};
 const sync=()=>{form.elements.files.value=JSON.stringify([...form.querySelectorAll('[data-staged-file]:checked')].map(x=>x.value));};
 button.addEventListener('click',async()=>{
  const files=[...picker.files];if(!files.length){status.textContent='Choose files first.';return;}
  if(files.filter(file=>!completed.has(file)).length+JSON.parse(form.elements.files.value).length>5){status.textContent='Attach up to five files per message.';return;}
  for(const file of files){const ext=file.name.split('.').pop().toLowerCase();if(!types[ext]||!file.size||file.size>250*1024*1024){status.textContent='Choose a supported file up to 250 MB.';return;}}
  button.disabled=true;form.dataset.uploading='1';progress.hidden=false;
  try{
   for(const file of files){
    if(completed.has(file))continue;
    if(!current||current.file!==file)current={file,path:panel.dataset.prefix+crypto.randomUUID()+'.'+file.name.split('.').pop().toLowerCase(),uploaded:false};
    status.textContent='Uploading '+file.name+'…';
    if(!current.uploaded){
     const type=types[file.name.split('.').pop().toLowerCase()];
     if(file.size<=2*1024*1024)await json({action:'message-file-upload',pathname:current.path,data:await base64(file),bytes:file.size});
     else await upload(current.path,file,{access:'private',handleUploadUrl:form.action,contentType:type,onUploadProgress:({percentage})=>{progress.value=percentage;}});
     current.uploaded=true;
    }
    const {file:saved}=await json({action:'message-file-save',pathname:current.path,name:file.name});
    if(!saved?.id)throw Error('The attachment could not be confirmed.');
    if(!panel.querySelector('[value="'+CSS.escape(saved.id)+'"]')){
     const li=document.createElement('li'),label=document.createElement('label'),box=document.createElement('input'),span=document.createElement('span');label.className='check';box.type='checkbox';box.dataset.stagedFile='';box.value=saved.id;box.checked=true;box.addEventListener('change',sync);span.textContent=saved.name;label.append(box,span);li.append(label);panel.querySelector('ul').append(li);
    }sync();completed.add(file);current=null;
   }
   picker.value='';status.textContent='Files attached. Send your message when ready.';
  }catch(error){status.textContent=error.message+' Your message has not been sent. Retry attaching this file.';}
  finally{button.disabled=false;form.dataset.uploading='0';progress.hidden=true;}
 });
}
