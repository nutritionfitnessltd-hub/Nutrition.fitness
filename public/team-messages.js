const pollUrl='/content-library/?work=1&studio=messages&poll=1';
const thread=document.querySelector('[data-message-thread]');
const embedded=document.body.hasAttribute('data-messages-embedded'),readDisplayed=[];
let stopped=false,busy=false,suspended=embedded;
async function updateUnread(){
 if(stopped||busy||document.hidden||suspended)return;busy=true;
 try{
  const response=await fetch(pollUrl,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});
  if([401,403].includes(response.status)){stopped=true;return;}
  if(!response.ok)return;const data=await response.json();
  for(const badge of document.querySelectorAll('[data-message-unread]')){badge.hidden=!data.unread;badge.textContent=String(data.unread);badge.setAttribute('aria-label',data.unread+' unread messages'+(data.mentions?', '+data.mentions+' mentions':''));}
  if(embedded)parent.postMessage({type:'team-message-unread',unread:data.unread,mentions:data.mentions},location.origin);
  if(thread){
   const current=data.threads.find(x=>x.id===thread.dataset.messageThread);
   if(!current){thread.replaceChildren(Object.assign(document.createElement('p'),{textContent:'Your access to this conversation has changed. Open Messages to continue.'}));stopped=true;return;}
   if(current.revision!==Number(thread.dataset.threadRevision)){
    const notice=thread.querySelector('[data-message-arrived]');notice.hidden=false;
    // Refresh only the message history; keep the live composer and its draft intact.
    if(!thread.querySelector('.message-stream details[open]')&&!thread.querySelector('[data-uploading="1"]'))try{
     const response=await fetch(location.href,{headers:{Accept:'text/html'},signal:AbortSignal.timeout(12000)});
     if(response.ok){const doc=new DOMParser().parseFromString(await response.text(),'text/html'),fresh=doc.querySelector('[data-message-thread]'),stream=fresh?.querySelector('.message-stream');
      if(fresh?.dataset.messageThread===thread.dataset.messageThread&&stream){
       thread.querySelector('.message-stream').replaceChildren(...stream.childNodes);thread.dataset.threadRevision=fresh.dataset.threadRevision;
       if(embedded)for(const link of thread.querySelectorAll('.message-stream a[href]')){const u=new URL(link.href,location.href);if(u.origin===location.origin&&!u.searchParams.has('file')){u.searchParams.set('panel','1');link.href=u.href;}}
       const ids=fresh.querySelector('[data-message-read] input[name="messageIds"]'),read=thread.querySelector('[data-message-read] input[name="messageIds"]');const newlyDisplayed=ids&&read&&ids.value!==read.value;if(ids&&read)read.value=ids.value;
       notice.hidden=true;if(newlyDisplayed)for(const mark of readDisplayed)mark();
      }
     }
    }catch{}
   }
  }
 }catch{}finally{busy=false;}
}
for(const form of document.querySelectorAll('[data-message-create]')){
 form.addEventListener('submit',()=>{form.elements.members.value=JSON.stringify([...form.querySelectorAll('[data-message-member]:checked')].map(x=>x.name.slice(7)));});
 const type=form.elements.kind,title=form.elements.title;
 if(type?.tagName==='SELECT'){const toggle=()=>{title.closest('label').hidden=type.value==='direct';title.required=type.value==='group';};type.addEventListener('change',toggle);toggle();}else if(title)title.required=true;
}
for(const form of document.querySelectorAll('[data-message-compose],[data-message-first]')){
 const body=form.elements.body;
 body.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();form.requestSubmit();}});
 const draftKey='team-message-draft:'+document.body.dataset.messageActor+':'+(thread?.dataset.messageThread||form.dataset.draftPerson)+':'+(form.elements.parentId?.value||'');
 try{
  const draft=JSON.parse(sessionStorage.getItem(draftKey)||'null');
  if(draft&&document.getElementById('message-'+draft.messageId))sessionStorage.removeItem(draftKey);
  else if(draft&&!body.value){body.value=draft.body||'';if(draft.messageId)form.elements.messageId.value=draft.messageId;for(const box of form.querySelectorAll('[data-staged-file]'))box.checked=(draft.files||[]).includes(box.value);if(form.elements.files)form.elements.files.value=JSON.stringify(draft.files||[]);}
 }catch{}
 const keepDraft=()=>{try{if(body.value||form.querySelector('[data-staged-file]:checked'))sessionStorage.setItem(draftKey,JSON.stringify({body:body.value,messageId:form.elements.messageId.value,files:[...form.querySelectorAll('[data-staged-file]:checked')].map(x=>x.value)}));else sessionStorage.removeItem(draftKey);}catch{}};
 form.addEventListener('input',keepDraft);form.addEventListener('change',keepDraft);form.addEventListener('submit',keepDraft);addEventListener('pagehide',keepDraft);
 form.querySelector('[data-message-mention]')?.addEventListener('change',event=>{if(!event.target.value)return;const at=body.selectionStart;body.setRangeText('@'+event.target.value+' ',at,body.selectionEnd,'end');body.focus();event.target.value='';});
 for(const box of form.querySelectorAll('[data-staged-file]'))box.addEventListener('change',()=>{if(form.elements.files)form.elements.files.value=JSON.stringify([...form.querySelectorAll('[data-staged-file]:checked')].map(x=>x.value));});
 form.addEventListener('submit',event=>{if(form.dataset.uploading==='1'){event.preventDefault();return;}if(form.elements.files)form.elements.files.value=JSON.stringify([...form.querySelectorAll('[data-staged-file]:checked')].map(x=>x.value));});
 if(form.querySelector('[data-message-upload]'))import('/team-message-upload.js');
}
for(const form of document.querySelectorAll('[data-message-read]')){
 const mark=async event=>{
  event?.preventDefault();try{
   const response=await fetch(form.action,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(form))),signal:AbortSignal.timeout(12000)});
   if(!response.ok)return;const result=await response.json();if(thread&&result.revision)thread.dataset.threadRevision=String(result.revision);form.hidden=true;updateUnread();
  }catch{}
 };form.addEventListener('submit',mark);readDisplayed.push(mark);if(!document.hidden&&!suspended)mark();
}
if(embedded){
 for(const link of document.querySelectorAll('a[href]')){
  const u=new URL(link.href,location.href);
  if(u.origin===location.origin&&u.pathname==='/content-library/'&&u.searchParams.get('studio')==='messages'&&!u.searchParams.has('file')){u.searchParams.set('panel','1');link.href=u.href;}
  else if(!u.searchParams.has('file')){link.target='_blank';link.rel='noopener';}
 }
 for(const form of document.forms){const u=new URL(form.action,location.href);if(u.origin!==location.origin||u.searchParams.get('studio')!=='messages')continue;u.searchParams.set('panel','1');form.action=u.href;if(form.method==='get'){const input=document.createElement('input');input.type='hidden';input.name='panel';input.value='1';form.append(input);}}
 const focusable=()=>[...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,summary')].filter(x=>!x.disabled&&!x.closest('[hidden]')&&(!x.closest('details:not([open])')||x.tagName==='SUMMARY'));
 addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==parent)return;
  if(event.data?.type==='team-message-panel-visibility'){suspended=event.data.visible!==true;if(!suspended){updateUnread();for(const mark of readDisplayed)mark();}}
  if(event.data?.type==='team-message-panel-focus-last')focusable().at(-1)?.focus();
 });
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();parent.postMessage({type:'team-message-panel-close'},location.origin);}
  if(event.key==='Tab'&&matchMedia('(max-width:760px)').matches){const items=focusable();if(event.shiftKey&&document.activeElement===items[0]||!event.shiftKey&&document.activeElement===items.at(-1)){event.preventDefault();parent.postMessage({type:'team-message-panel-focus',edge:event.shiftKey?'before':'after'},location.origin);}}
 });
}
updateUnread();const timer=setInterval(updateUnread,20000);
addEventListener('pagehide',()=>clearInterval(timer));document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateUnread();});
