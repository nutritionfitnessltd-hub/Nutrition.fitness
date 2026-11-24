let active;
function openVideo(link){
 if(active)return;
 const dialog=document.createElement('dialog');dialog.className='production-video-modal';dialog.setAttribute('aria-labelledby','video-review-title');
 const header=document.createElement('header'),title=document.createElement('h2'),close=document.createElement('button');title.id='video-review-title';title.textContent=link.dataset.videoTitle||'Video review';close.type='button';close.textContent='Close';close.setAttribute('aria-label','Close video');header.append(title,close);
 const video=document.createElement('video');video.controls=true;video.playsInline=true;video.preload='metadata';video.src=link.dataset.videoSrc;video.setAttribute('aria-label',title.textContent);video.setAttribute('controlslist','nodownload');
 const footer=document.createElement('footer'),status=document.createElement('p');status.role='status';status.textContent='Watch the video to the end to enable approval.';
 const original=link.closest('.tracker-file-actions')?.querySelector('[data-video-approval-source] form'),form=original?.cloneNode(true),approve=form?.querySelector('button');
 if(approve){approve.disabled=true;approve.setAttribute('aria-describedby','video-review-status');}else status.textContent='This video is available to watch. Approval is not available for this export.';
 status.id='video-review-status';footer.append(status);if(form)footer.append(form);dialog.append(header,video,footer);document.body.append(dialog);
 const state={dialog,video,form,approve,busy:false,finished:false};active=state;
 const end=()=>{if(state.busy)return;dialog.close();};close.addEventListener('click',end);dialog.addEventListener('cancel',event=>{if(state.busy)event.preventDefault();});
 dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)end();});
 dialog.addEventListener('close',()=>{video.pause();video.removeAttribute('src');video.load();dialog.remove();document.body.classList.remove('video-review-open');active=null;link.focus();});
 video.addEventListener('ended',()=>{if(approve){state.finished=true;approve.disabled=false;status.textContent='Video finished. You can now approve this saved version.';}});
 video.addEventListener('error',()=>{state.finished=false;if(approve)approve.disabled=true;status.textContent='The video could not load. Approval stays disabled. Close and reopen it to retry, or open the asset to check its SharePoint file.';});
 if(form)form.addEventListener('submit',async event=>{
  event.preventDefault();if(!state.finished||state.busy||approve.disabled)return;
  state.busy=true;close.disabled=true;approve.disabled=true;status.textContent='Saving approval…';
  try{
   const response=await fetch(form.getAttribute('action'),{method:'POST',body:new URLSearchParams(new FormData(form)),credentials:'same-origin'}),html=await response.text(),doc=new DOMParser().parseFromString(html,'text/html');
   if(!response.ok)throw Error(doc.querySelector('[role=alert]')?.textContent||'Approval could not be saved. Reopen the current export and try again.');
   if(doc.querySelector('[data-review-status]')?.textContent.trim()!=='Approved.')throw Error('Approval was not confirmed. Please check your session and reopen this export.');
   location.reload();
  }catch(error){status.textContent=error.message;state.busy=false;close.disabled=false;approve.disabled=false;}
 });
 document.body.classList.add('video-review-open');dialog.showModal();close.focus();
}
document.addEventListener('click',event=>{
 const link=event.target.closest?.('[data-production-video]');if(!link||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
 event.preventDefault();openVideo(link);
});
