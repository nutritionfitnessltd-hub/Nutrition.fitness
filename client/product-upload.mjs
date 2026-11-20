import {upload} from '@vercel/blob/client';
const types={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',zip:'application/zip',mp4:'video/mp4',webm:'video/webm',mp3:'audio/mpeg'};
for(const panel of document.querySelectorAll('[data-product-upload]')){
 const picker=panel.querySelector('[data-product-file]'),button=panel.querySelector('[data-product-upload-button]'),status=panel.querySelector('[data-product-upload-status]'),progress=panel.querySelector('progress'),slot=panel.querySelector('[name=fileSlot]');
 let uploaded;
 picker.addEventListener('change',()=>{uploaded=null;button.textContent='Upload file';status.textContent='';});
 button.addEventListener('click',async()=>{
  const file=picker.files[0],ext=file?.name.split('.').at(-1).toLowerCase(),type=types[ext];
  if(!file||!type){status.textContent='Choose a supported image, document, audio or video file.';return;}
  if(!file.size||file.size>250*1024*1024){status.textContent='Choose a file up to 250 MB.';return;}
  if(slot.value==='Thumbnail'&&!type.startsWith('image/')){status.textContent='Choose an image for the thumbnail.';return;}
  button.disabled=true;picker.disabled=true;slot.disabled=true;progress.hidden=false;
  try{
   if(!uploaded){
    status.textContent='Uploading privately…';
    uploaded=await upload(panel.dataset.prefix+crypto.randomUUID()+'.'+ext,file,{access:'private',contentType:type,handleUploadUrl:'/content-library/?work=1&studio=product-upload&id='+encodeURIComponent(panel.dataset.id),multipart:file.size>5*1024*1024,onUploadProgress:e=>{progress.value=e.percentage;status.textContent='Uploading… '+Math.round(e.percentage)+'%';}});
   }
   status.textContent='Saving the file to this asset…';
   const response=await fetch('/content-library/?work=1&studio=product-asset&id='+encodeURIComponent(panel.dataset.id),{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({action:'product-file-save',pathname:uploaded.pathname,name:file.name,slot:slot.value})});
   const result=await response.json();if(!response.ok)throw new Error(result.error||'The file could not be attached.');
   status.textContent='File saved. Opening the updated asset…';location.reload();
  }catch(error){status.textContent=(uploaded?'The file uploaded, but could not be attached. Retry without uploading again. ':'')+(error.message||'Upload failed. Please try again.');button.textContent=uploaded?'Retry saving file':'Retry upload';button.disabled=false;picker.disabled=false;slot.disabled=false;}
 });
}
