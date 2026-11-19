document.querySelector('[data-course-script-copy]')?.addEventListener('click',async()=>{
 const text=document.querySelector('[data-course-script]')?.value,status=document.querySelector('[data-course-copy-status]');
 try{if(!text)throw Error('Script unavailable');await navigator.clipboard.writeText(text);status.textContent=' Script copied';}
 catch{status.textContent=' Could not copy. Check clipboard permission and try again.';}
});
