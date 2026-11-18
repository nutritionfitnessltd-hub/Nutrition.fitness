const dialog=document.querySelector('[data-review-dialog]');
let opener;
const wire=root=>{
 root.querySelector('[data-review-close]')?.addEventListener('click',()=>dialog?.open?dialog.close():location.assign('/content-library/?work=1&studio=review'));
 root.querySelector('[data-request-changes]')?.addEventListener('click',()=>{const panel=root.querySelector('[data-review-feedback]');panel.hidden=false;panel.querySelector('textarea').focus();panel.scrollIntoView({block:'nearest'});});
 root.querySelectorAll('[data-review-form]').forEach(form=>form.addEventListener('submit',async event=>{
  if(!dialog?.open)return;
  event.preventDefault();const status=root.querySelector('[data-review-status]');
  const body=new URLSearchParams(new FormData(form));form.querySelectorAll('button').forEach(b=>b.disabled=true);status.textContent='Saving…';
  try{
   const target=new URL(form.action);target.searchParams.set('fragment','1');
   const response=await fetch(target,{method:'POST',body,headers:{'Accept':'text/html'},credentials:'same-origin'});
   const html=await response.text();
   if(!html.includes('data-review-content'))throw new Error('Your session may have expired. Keep your feedback and reopen the manager.');
   dialog.querySelector('[data-review-mount]').innerHTML=html;wire(dialog);
   if(response.ok){dialog.dataset.changed='true';dialog.querySelector('[data-review-status]')?.focus();}
  }catch(e){status.textContent=e.message||'Could not save. Your feedback is still here.';form.querySelectorAll('button').forEach(b=>b.disabled=false);}
 }));
};
if(dialog){
 document.querySelectorAll('[data-review-preview]').forEach(link=>link.addEventListener('click',async event=>{
  if(event.ctrlKey||event.metaKey||event.shiftKey||event.button!==0)return;
  event.preventDefault();opener=link;dialog.showModal();const mount=dialog.querySelector('[data-review-mount]');mount.textContent='Loading preview…';
  try{const target=new URL(link.href);target.searchParams.set('fragment','1');const response=await fetch(target,{credentials:'same-origin'});const html=await response.text();if(!response.ok||!html.includes('data-review-content'))throw new Error('Preview unavailable. Close this window and reopen the item.');mount.innerHTML=html;wire(dialog);dialog.querySelector('[data-review-close]')?.focus();}
  catch(e){mount.textContent=e.message;const close=document.createElement('button');close.textContent='Close';close.onclick=()=>dialog.close();mount.append(close);}
 }));
 dialog.addEventListener('close',()=>{opener?.focus();if(dialog.dataset.changed==='true')location.reload();});
}else wire(document);
