import './studio-newsletters.js';
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
document.querySelector('[data-open-schedule]')?.addEventListener('click',()=>{
 const panel=document.querySelector('[data-review-schedule]');panel.hidden=!panel.hidden;
 if(!panel.hidden){document.querySelector('[data-review-feedback]').hidden=true;panel.querySelector('input[type=date]').focus();}
});
