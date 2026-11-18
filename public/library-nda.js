document.querySelector('[data-nda-print]')?.addEventListener('click',()=>window.print());
const form=document.querySelector('.nda-accept');
if(form?.querySelector('[data-nda-id]')){
 const field=name=>form.elements.namedItem(name),pad=form.querySelector('canvas'),ctx=pad.getContext('2d'),method=field('signature_method');
 let strokes=[],current=null,uploading=false,uploadSequence=0;
 const draw=()=>{ctx.clearRect(0,0,720,180);ctx.strokeStyle='#103441';ctx.lineWidth=2;ctx.lineCap='round';ctx.lineJoin='round';for(const points of strokes){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();}field('signature_strokes').value=JSON.stringify(strokes);};
 const point=e=>{const r=pad.getBoundingClientRect();return [Math.round(Math.max(0,Math.min(720,(e.clientX-r.left)*720/r.width))*10)/10,Math.round(Math.max(0,Math.min(180,(e.clientY-r.top)*180/r.height))*10)/10];};
 pad.addEventListener('pointerdown',e=>{if(strokes.length>=40)return;pad.setPointerCapture(e.pointerId);current=[point(e)];strokes.push(current);draw();});
 pad.addEventListener('pointermove',e=>{if(current&&current.length<1000&&strokes.reduce((n,s)=>n+s.length,0)<3000){current.push(point(e));draw();}});
 const finish=()=>{if(current?.length<2)strokes=strokes.filter(s=>s!==current);current=null;draw();};
 pad.addEventListener('pointerup',finish);pad.addEventListener('pointercancel',finish);
 form.querySelector('[data-nda-clear]').addEventListener('click',()=>{strokes=[];current=null;draw();});
 const setMethod=()=>{form.querySelector('[data-nda-draw]').hidden=method.value!=='drawn';form.querySelector('[data-nda-type]').hidden=method.value!=='typed';field('signature_name').required=method.value==='typed';};method.addEventListener('change',setMethod);setMethod();
 const picker=form.querySelector('[data-nda-id]'),drop=form.querySelector('[data-nda-drop]'),status=form.querySelector('[data-nda-upload-status]'),preview=form.querySelector('[data-nda-id-preview]'),remove=form.querySelector('[data-nda-remove-id]');
 const reset=()=>{field('identity_image').value='';preview.hidden=true;preview.removeAttribute('src');remove.hidden=true;};
 async function upload(file){
  const seq=++uploadSequence;reset();uploading=true;status.textContent='Preparing your ID photo…';
  try{
   if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>12*1024*1024)throw new Error('Choose a JPG, PNG or WebP photo smaller than 12 MB.');
   const bitmap=await createImageBitmap(file);
   try{
    const scale=Math.min(1,2400/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
    if(canvas.width<200||canvas.height<200||Math.max(canvas.width,canvas.height)<500)throw new Error('Choose a larger photo so the ID is readable.');
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
    let data='';for(const quality of [.9,.82,.72,.62]){data=canvas.toDataURL('image/webp',quality);if(data.length<=2650000)break;}
    if(!data.startsWith('data:image/webp;')||data.length>2650000)throw new Error('This image is too large. Try a smaller photo.');
    if(seq!==uploadSequence)return;field('identity_image').value=data;preview.src=data;preview.hidden=false;remove.hidden=false;status.textContent='ID photo ready. Check that the name and photo are readable before signing.';
   }finally{bitmap.close();}
  }catch(e){if(seq===uploadSequence){reset();status.textContent=e.message||'The photo could not be prepared. Try another image.';}}
  finally{if(seq===uploadSequence)uploading=false;}
 }
 picker.addEventListener('change',()=>upload(picker.files[0]));drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('is-dragging');});drop.addEventListener('dragleave',()=>drop.classList.remove('is-dragging'));
 drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('is-dragging');upload(e.dataTransfer.files[0]);});
 remove.addEventListener('click',()=>{uploadSequence++;uploading=false;reset();picker.value='';status.textContent='No ID uploaded.';});
 form.addEventListener('submit',e=>{const errors=[];if(uploading||!field('identity_image').value)errors.push('Upload your ID photo before signing.');if(method.value==='drawn'&&!strokes.some(s=>s.length>1))errors.push('Draw your signature or choose Type signature.');if(errors.length){e.preventDefault();status.textContent=errors.join(' ');status.scrollIntoView({block:'center'});}});
}
