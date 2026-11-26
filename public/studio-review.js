import './studio-video-modal.js';
import './studio-newsletters.js';
import './studio-launch-pack.js';
document.addEventListener('click',event=>{
 const link=event.target.closest?.('[data-review-preview]');if(!link)return;
 if(event.ctrlKey||event.metaKey||event.shiftKey||event.button!==0)return;
 const win=window.open(link.href,'_blank','popup,width=1200,height=900,scrollbars=yes,resizable=yes');
 if(win){win.opener=null;event.preventDefault();}
});
document.querySelector('[data-request-changes]')?.addEventListener('click',()=>{
 const panel=document.querySelector('[data-review-feedback]');panel.hidden=!panel.hidden;
 if(!panel.hidden){const schedule=document.querySelector('[data-review-schedule]');if(schedule)schedule.hidden=true;panel.querySelector('textarea').focus();}
});
const publication=document.querySelector('[data-publication-dialog]');
if(publication){
 publication.querySelector('[data-assign-approved]')?.addEventListener('click',()=>{publication.close();const panel=document.querySelector('[data-staff-task]');if(panel){panel.hidden=false;panel.querySelector('select')?.focus();}});
 publication.querySelector('[data-keep-approved]')?.addEventListener('click',()=>publication.close());
 document.querySelector('[data-open-publication]')?.addEventListener('click',()=>publication.showModal());
 publication.querySelector('[data-show-publication-schedule]')?.addEventListener('click',()=>{
  const schedule=publication.querySelector('[data-publication-schedule]');schedule.hidden=false;schedule.querySelector('input').focus();
 });
 if(publication.hasAttribute('data-open-on-load'))publication.showModal();
}

document.querySelector('[data-create-staff-task]')?.addEventListener('click',()=>{const panel=document.querySelector('[data-staff-task]');panel.hidden=!panel.hidden;if(!panel.hidden)panel.querySelector('select')?.focus();});

// Load the existing guarded editor only when Edit is chosen.
const editDialog=document.querySelector('[data-review-edit-dialog]');
if(editDialog){
 const frame=editDialog.querySelector('[data-review-edit-frame]');let opener,discarding=false;
 const finishClose=()=>{discarding=false;editDialog.close();frame.removeAttribute('src');opener?.focus();};
 const close=()=>{
  const form=frame.contentDocument?.querySelector('#studio-editor-form');
  if(form?.dataset.saving==='true')return;
  if(form?.dataset.dirty==='true'){
   if(!confirm('Discard your unsaved changes?'))return;
   discarding=true;frame.contentWindow.postMessage({type:'nufi-review-discard'},location.origin);return;
  }
  finishClose();
 };
 document.addEventListener('click',event=>{
  const link=event.target.closest?.('[data-review-edit]');
  if(!link||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||event.button!==0)return;
  const target=new URL(link.href,location.href);if(target.origin!==location.origin)return;
  event.preventDefault();opener=link;frame.src=target.href;editDialog.showModal();
 });
 editDialog.querySelector('[data-review-edit-close]').addEventListener('click',close);
 editDialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==frame.contentWindow)return;
  if(event.data?.type==='nufi-review-discarded'&&discarding){finishClose();return;}
  if(event.data?.type!=='nufi-review-saved')return;
  if(event.data.id!==new URL(location.href).searchParams.get('id'))return;
  editDialog.close();location.reload();
 });
}
