const pollUrl='/content-library/?work=1&studio=messages&poll=1';
const thread=document.querySelector('[data-message-thread]');
let stopped=false,busy=false;
async function updateUnread(){
 if(stopped||busy||document.hidden)return;busy=true;
 try{
  const response=await fetch(pollUrl,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});
  if([401,403].includes(response.status)){stopped=true;return;}
  if(!response.ok)return;const data=await response.json();
  for(const badge of document.querySelectorAll('[data-message-unread]')){badge.hidden=!data.unread;badge.textContent=String(data.unread);badge.setAttribute('aria-label',data.unread+' unread messages'+(data.mentions?', '+data.mentions+' mentions':''));}
  if(thread){
   const current=data.threads.find(x=>x.id===thread.dataset.messageThread);
   if(!current){thread.replaceChildren(Object.assign(document.createElement('p'),{textContent:'Your access to this conversation has changed. Open Messages to continue.'}));stopped=true;return;}
   if(current.revision!==Number(thread.dataset.threadRevision))thread.querySelector('[data-message-arrived]').hidden=false;
  }
 }catch{}finally{busy=false;}
}
for(const form of document.querySelectorAll('[data-message-create]')){
 form.addEventListener('submit',()=>{form.elements.members.value=JSON.stringify([...form.querySelectorAll('[data-message-member]:checked')].map(x=>x.name.slice(7)));});
 const type=form.elements.kind,title=form.elements.title;
 const toggle=()=>{title.closest('label').hidden=type.value==='direct';title.required=type.value==='group';};type.addEventListener('change',toggle);toggle();
}
for(const form of document.querySelectorAll('[data-message-compose]')){
 const body=form.elements.body;
 form.querySelector('[data-message-mention]')?.addEventListener('change',event=>{if(!event.target.value)return;const at=body.selectionStart;body.setRangeText('@'+event.target.value+' ',at,body.selectionEnd,'end');body.focus();event.target.value='';});
 for(const box of form.querySelectorAll('[data-staged-file]'))box.addEventListener('change',()=>{form.elements.files.value=JSON.stringify([...form.querySelectorAll('[data-staged-file]:checked')].map(x=>x.value));});
 form.addEventListener('submit',event=>{if(form.dataset.uploading==='1'){event.preventDefault();return;}form.elements.files.value=JSON.stringify([...form.querySelectorAll('[data-staged-file]:checked')].map(x=>x.value));});
 if(form.querySelector('[data-message-upload]'))import('/team-message-upload.js');
}
for(const form of document.querySelectorAll('[data-message-read]')){
 const mark=async event=>{
  event?.preventDefault();try{
   const response=await fetch(form.action,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(form))),signal:AbortSignal.timeout(12000)});
   if(!response.ok)return;const result=await response.json();if(thread&&result.revision)thread.dataset.threadRevision=String(result.revision);form.hidden=true;updateUnread();
  }catch{}
 };form.addEventListener('submit',mark);if(!document.hidden)mark();
}
updateUnread();const timer=setInterval(updateUnread,20000);
addEventListener('pagehide',()=>clearInterval(timer));document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateUnread();});
