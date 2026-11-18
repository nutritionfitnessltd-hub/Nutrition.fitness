const panel=document.querySelector('[data-article-upload]');
if(panel){
 const input=panel.querySelector('[data-article-file]'),drop=panel.querySelector('.article-image-drop'),preview=panel.querySelector('[data-article-preview]'),status=panel.querySelector('[role=status]'),hidden=panel.querySelector('[name=imageUpload]'),form=panel.closest('form');
 let busy=false,sequence=0;
 const originalImage=preview.getAttribute('src');
 form.addEventListener('submit',e=>{if(busy){e.preventDefault();e.stopImmediatePropagation();status.textContent='Please wait while the image is prepared.';}},true);
 async function choose(files){
  const mine=++sequence;hidden.value='';busy=false;
  preview.hidden=!originalImage;if(originalImage)preview.src=originalImage;else preview.removeAttribute('src');
  if(files.length!==1){status.textContent='Choose one image at a time.';return;}
  const file=files[0];
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024){status.textContent='Choose a JPG, PNG or WebP image up to 10 MB.';return;}
  busy=true;status.textContent='Preparing image…';let bitmap;
  try{
   bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
   if(bitmap.width*bitmap.height>40000000)throw Error('Choose an image smaller than 40 megapixels.');
   const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
   let image;for(const quality of [.86,.72,.58,.42]){image=canvas.toDataURL('image/webp',quality);if(image.length<860000)break;}
   if(!image.startsWith('data:image/webp;base64,')||image.length>=860000)throw Error('This image is too detailed to upload. Choose a smaller image.');
   if(mine!==sequence)return;
   hidden.value=image;preview.src=image;preview.hidden=false;panel.querySelector('[name=uploadAlt]').value='';panel.querySelector('[name=uploadCredit]').value='';
   status.textContent=file.name+' is ready. Save draft to use it for the article and thumbnail.';
  }catch(error){if(mine===sequence)status.textContent=error.message||'This image could not be opened. Choose another image.';}
  finally{bitmap?.close();if(mine===sequence)busy=false;}
 }
 input.addEventListener('change',()=>{if(input.files.length)choose(input.files);});
 for(const event of ['dragenter','dragover'])drop.addEventListener(event,e=>{e.preventDefault();drop.classList.add('is-dragging');});
 for(const event of ['dragleave','drop'])drop.addEventListener(event,e=>{e.preventDefault();drop.classList.remove('is-dragging');});
 drop.addEventListener('drop',e=>choose(e.dataTransfer.files));
}
