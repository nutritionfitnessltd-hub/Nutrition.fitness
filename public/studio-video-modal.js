let active;
function openVideo(link){
 if(active)return;
 const dialog=document.createElement('dialog');dialog.className='production-video-modal';dialog.setAttribute('aria-labelledby','video-review-title');
 const header=document.createElement('header'),title=document.createElement('h2'),close=document.createElement('button');title.id='video-review-title';title.textContent=link.dataset.videoTitle||'Video review';close.type='button';close.textContent='Close';close.setAttribute('aria-label','Close video');header.append(title,close);
 const video=document.createElement('video');video.controls=true;video.playsInline=true;video.preload='metadata';video.src=link.dataset.videoSrc;video.setAttribute('aria-label',title.textContent);video.setAttribute('controlslist','nodownload');
 const footer=document.createElement('footer'),status=document.createElement('p'),accessLink=document.createElement('a');accessLink.className='btn';accessLink.textContent='Open video in SharePoint';accessLink.href=link.href;accessLink.target='_blank';accessLink.rel='noopener noreferrer';accessLink.hidden=false;status.role='status';status.textContent='Watch the video to the end to enable approval.';
 const original=link.closest('.tracker-file-actions')?.querySelector('[data-video-approval-source] form'),form=original?.cloneNode(true),approve=form?.querySelector('button'),sourceCheck=form?.querySelector('[data-video-source-check]');
 if(approve){approve.disabled=true;approve.setAttribute('aria-describedby','video-review-status');}else status.textContent='This video is available to watch. Approval is not available for this export.';
 const external=document.createElement('div'),help=document.createElement('p'),externalLabel=document.createElement('label'),externalCheck=document.createElement('input');external.className='video-external-review';help.textContent='If this player won’t load, watch in SharePoint and return here.';externalCheck.type='checkbox';externalCheck.disabled=true;externalLabel.hidden=true;externalLabel.append(externalCheck,document.createTextNode(' I watched this saved video in SharePoint.'));external.append(help,accessLink,externalLabel);
 const method=document.createElement('input'),watched=document.createElement('input');method.type=watched.type='hidden';method.name='videoPlaybackMethod';method.value='inline';watched.name='videoWatched';watched.value='';if(form)form.append(method,watched);
 status.id='video-review-status';footer.append(status,external);if(form)footer.append(form);dialog.append(header,video,footer);document.body.append(dialog);
 const state={dialog,video,form,approve,busy:false,finished:false,inlineFinished:false,externalOpened:false};active=state;
 const end=()=>{if(state.busy)return;dialog.close();};close.addEventListener('click',end);dialog.addEventListener('cancel',event=>{if(state.busy)event.preventDefault();});
 dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)end();});
 dialog.addEventListener('close',()=>{video.pause();video.removeAttribute('src');video.load();dialog.remove();document.body.classList.remove('video-review-open');active=null;link.focus();});
 const enableApproval=()=>{state.finished=state.inlineFinished||state.externalOpened&&externalCheck.checked;method.value=state.inlineFinished?'inline':'sharepoint';watched.value=state.finished?'yes':'';if(!approve||state.busy)return;approve.disabled=!state.finished||Boolean(sourceCheck&&!sourceCheck.checked);status.textContent=state.finished?(approve.disabled?'Confirm the source check below to enable approval.':'Ready to approve this saved video.'):(state.externalOpened?'Watch in SharePoint, then return and confirm below.':'Watch the video to the end to enable approval.');};
 accessLink.addEventListener('click',()=>{state.externalOpened=true;if(form){externalLabel.hidden=false;externalCheck.disabled=false;}enableApproval();});externalCheck.addEventListener('change',enableApproval);
 sourceCheck?.addEventListener('change',enableApproval);
 video.addEventListener('ended',()=>{state.inlineFinished=true;enableApproval();});
 video.addEventListener('error',()=>{state.inlineFinished=false;enableApproval();status.textContent=state.finished?'Ready to approve this saved video.':'This video won’t play here. Open it in SharePoint, then return to approve.';});
 if(form)form.addEventListener('submit',async event=>{
  event.preventDefault();if(!state.finished||state.busy||approve.disabled||sourceCheck&&!sourceCheck.checked)return;
  state.busy=true;close.disabled=true;approve.disabled=true;status.textContent='Saving approval…';
  try{
   const response=await fetch(form.getAttribute('action'),{method:'POST',body:new URLSearchParams(new FormData(form)),credentials:'same-origin'}),html=await response.text(),doc=new DOMParser().parseFromString(html,'text/html');
   if(!response.ok)throw Error(doc.querySelector('[role=alert]')?.textContent||doc.querySelector('[data-review-status]')?.textContent||'Approval could not be saved. Reopen the current export and try again.');
   if(doc.querySelector('[data-review-status]')?.textContent.trim()!=='Approved.')throw Error('Approval was not confirmed. Please check your session and reopen this export.');
   location.reload();
  }catch(error){state.busy=false;close.disabled=false;enableApproval();status.textContent=error.message;}
 });
 document.body.classList.add('video-review-open');dialog.showModal();close.focus();
}
document.addEventListener('click',event=>{
 const link=event.target.closest?.('[data-production-video]');if(!link||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
 event.preventDefault();openVideo(link);
});
