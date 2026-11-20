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
