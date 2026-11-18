document.querySelectorAll('[data-review-preview]').forEach(link=>link.addEventListener('click',event=>{
 if(event.ctrlKey||event.metaKey||event.shiftKey||event.button!==0)return;
 window.open(link.href,'_blank','popup,width=1200,height=900,scrollbars=yes,resizable=yes,noopener');
 event.preventDefault();
}));
document.querySelector('[data-request-changes]')?.addEventListener('click',()=>{
 const panel=document.querySelector('[data-review-feedback]');panel.hidden=!panel.hidden;
 if(!panel.hidden){document.querySelector('[data-review-schedule]').hidden=true;panel.querySelector('textarea').focus();}
});
document.querySelector('[data-open-schedule]')?.addEventListener('click',()=>{
 const panel=document.querySelector('[data-review-schedule]');panel.hidden=!panel.hidden;
 if(!panel.hidden){document.querySelector('[data-review-feedback]').hidden=true;panel.querySelector('input[type=date]').focus();}
});
