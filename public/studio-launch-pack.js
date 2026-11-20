document.addEventListener('click',async event=>{
 const button=event.target.closest?.('[data-launch-copy]');if(!button)return;
 const row=button.closest('.launch-copy'),value=row?.querySelector('[data-launch-text]')?.value,status=row?.querySelector('[data-launch-status]');
 if(!value||!status)return;
 try{await navigator.clipboard.writeText(value);status.textContent='Copied';}
 catch{status.textContent='Copy was blocked. Select and copy the text below.';const field=row.querySelector('[data-launch-text]');field.hidden=false;field.readOnly=true;field.focus();field.select();}
});
