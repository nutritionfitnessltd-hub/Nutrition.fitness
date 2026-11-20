function showPhoto(editor,source){
  const preview=editor.querySelector('[data-team-photo-preview]');
  const image=source||preview.dataset.defaultPortrait;
  const avatar=document.createElement(image?'img':'span');avatar.className='team-person-avatar';
  if(image){avatar.src=image;avatar.alt='';avatar.width=avatar.height=80;}
  else{avatar.classList.add('team-initials');avatar.setAttribute('aria-hidden','true');avatar.textContent=preview.dataset.name.trim().split(/\s+/).slice(0,2).map(s=>s[0]||'').join('').toUpperCase();}
  preview.replaceChildren(avatar);
  const field=editor.querySelector('[name=portrait]');field.value=source;field.dispatchEvent(new Event('input',{bubbles:true}));
  editor.querySelector('[data-team-photo-remove]').hidden=!source;
}
document.addEventListener('change',async event=>{
  const input=event.target;if(!input.matches('[data-team-photo-file]'))return;
  const file=input.files[0];if(!file)return;
  const editor=input.closest('[data-team-photo]'),status=editor.querySelector('[data-team-photo-status]'),form=editor.closest('form');
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024){status.textContent='Choose a JPG, PNG or WebP image smaller than 8 MB.';input.value='';return;}
  form.dataset.photoLoading='true';status.textContent='Preparing photo…';
  const remove=editor.querySelector('[data-team-photo-remove]');remove.disabled=true;input.disabled=true;
  let bitmap;
  try{
    bitmap=await createImageBitmap(file);const canvas=document.createElement('canvas');canvas.width=canvas.height=384;
    const context=canvas.getContext('2d'),side=Math.min(bitmap.width,bitmap.height);
    context.fillStyle='#ffffff';context.fillRect(0,0,384,384);
    context.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,384,384);
    let image=canvas.toDataURL('image/jpeg',.82);
    if(image.length>120000)image=canvas.toDataURL('image/jpeg',.6);
    if(image.length>120000)throw Error('Choose a smaller photo.');
    showPhoto(editor,image);status.textContent='Photo ready. Save profile to keep it.';
  }catch(error){status.textContent=error.message==='Choose a smaller photo.'?error.message:'This photo could not be read. Please choose another image.';}
  finally{bitmap?.close();delete form.dataset.photoLoading;input.disabled=false;remove.disabled=false;input.value='';}
});
document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-team-photo-remove]');if(!button)return;
  const editor=button.closest('[data-team-photo]');showPhoto(editor,'');editor.querySelector('[data-team-photo-status]').textContent='Default photo selected. Save profile to keep it.';
});
document.addEventListener('submit',event=>{
  if(event.target.matches('[data-team-profile-form][data-photo-loading]')){event.preventDefault();event.stopImmediatePropagation();event.target.querySelector('[data-team-photo-status]').textContent='Please wait while the photo is prepared.';}
},true);
