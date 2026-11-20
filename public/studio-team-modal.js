import './studio-team-photo.js';
let profile;
const parse=html=>new DOMParser().parseFromString(html,'text/html');
const directoryUrl=()=>{const u=new URL(location.href);u.searchParams.delete('person');u.searchParams.delete('worker');u.searchParams.delete('saved');return u;};
function alertIn(state,message){state.error.textContent=message;state.error.hidden=false;state.error.focus();}
function renderProfile(state,doc){
  const main=doc.querySelector('main');if(!main)throw Error('The profile could not be opened. Please try again.');
  main.querySelector('footer')?.remove();main.querySelectorAll('script').forEach(s=>s.remove());
  state.body.replaceChildren(...main.childNodes);state.dirty=false;state.back.hidden=Boolean(state.body.querySelector('[data-team-profile]'));
  const title=state.body.querySelector('h1,h2');if(title){title.id='team-modal-title';state.dialog.setAttribute('aria-labelledby',title.id);}
  state.body.querySelectorAll('[data-welcome-copy]').forEach(b=>b.hidden=false);
  state.dialog.scrollTop=0;state.close.focus();
}
async function loadProfile(state,href){
  const u=new URL(href,location.href);if(u.origin!==location.origin)throw Error('This profile link is unavailable.');
  state.url=u.href;state.error.hidden=true;
  const response=await fetch(u,{credentials:'same-origin'}),doc=parse(await response.text());
  if(!response.ok)throw Error(doc.querySelector('[role=alert]')?.textContent||'The profile could not be opened.');
  renderProfile(state,doc);
  if(u.searchParams.get('brief')==='1'){
    const heading=state.body.querySelector('h1');if(heading)heading.textContent='Assign work';
    const input=state.body.querySelector('textarea[name=message]');if(input){input.placeholder='Describe the task, the result you need and any deadline. The brief will be queued in James HQ.';input.focus();}
  }
}
function closeProfile(state){if(state.busy)return;if(state.dirty&&!confirm('Discard your unsaved profile changes?'))return;state.dialog.close();}
async function refreshDirectory(){
  const response=await fetch(directoryUrl(),{credentials:'same-origin'});if(!response.ok)return;
  const fresh=parse(await response.text()).querySelector('.team-directory'),old=document.querySelector('.team-directory');if(fresh&&old)old.replaceWith(fresh);
}
async function openProfile(link){
  const dialog=document.createElement('dialog');dialog.className='team-profile-modal';dialog.setAttribute('aria-label','Team profile');
  const header=document.createElement('div');header.className='team-modal-bar';const label=document.createElement('span');label.textContent='Your team';
  const back=document.createElement('button');back.type='button';back.textContent='Back to profile';back.hidden=true;back.className='team-modal-back';const close=document.createElement('button');close.type='button';close.textContent='Close';close.setAttribute('aria-label','Close profile');header.append(label,back,close);
  const error=document.createElement('p');error.hidden=true;error.tabIndex=-1;error.className='team-modal-error';error.setAttribute('role','alert');
  const body=document.createElement('div');body.className='team-modal-body';body.textContent='Opening profile…';dialog.append(header,error,body);document.body.append(dialog);
  const state={dialog,body,error,close,back,opener:link,dirty:false,busy:false,url:link.href};profile=state;
  back.addEventListener('click',async()=>{if(state.busy||state.dirty&&!confirm('Discard your unsaved changes?'))return;try{await loadProfile(state,link.href);}catch(e){alertIn(state,e.message);}});
  close.addEventListener('click',()=>closeProfile(state));dialog.addEventListener('cancel',e=>{e.preventDefault();closeProfile(state);});
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeProfile(state);}});
  dialog.addEventListener('input',()=>state.dirty=true);
  dialog.addEventListener('change',()=>state.dirty=true);
  dialog.addEventListener('close',()=>{clearInterval(state.poll);dialog.remove();document.body.classList.remove('team-profile-open');profile=null;(link.isConnected?link:[...document.querySelectorAll('[data-team-open]')].find(a=>a.href===link.href)||document.querySelector('[data-team-open]'))?.focus();});
  document.body.classList.add('team-profile-open');dialog.showModal();
  try{await loadProfile(state,link.href);}catch(e){alertIn(state,e.message);}
  state.poll=setInterval(async()=>{
    if(!dialog.open||state.busy||state.dirty||!state.body.querySelector('[data-worker-updates="conversation"]'))return;
    try{const response=await fetch(state.url,{credentials:'same-origin'});if(!response.ok)return;const doc=parse(await response.text()),fresh=doc.querySelector('[data-worker-updates="conversation"]'),current=state.body.querySelector('[data-worker-updates="conversation"]');if(fresh&&current&&!state.dirty&&!state.busy)current.replaceWith(fresh);}catch{}
  },20000);
}
document.addEventListener('click',async event=>{
  const copy=event.target.closest?.('[data-welcome-copy]');
  if(copy&&profile?.dialog.contains(copy)){
    const form=copy.closest('form');try{await navigator.clipboard.writeText('To: '+form.querySelector('[data-welcome-to]').value+'\nSubject: '+form.querySelector('[data-welcome-subject]').value+'\n\n'+form.querySelector('[data-welcome-message]').value);form.querySelector('[data-welcome-status]').textContent='Welcome message copied.';}catch{form.querySelector('[data-welcome-message]').select();}return;
  }
  const link=event.target.closest?.('a');if(!link||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  if(link.matches('[data-team-open]')){event.preventDefault();if(!profile)void openProfile(link);return;}
  if(profile&&profile.dialog.contains(link)&&(link.hasAttribute('data-team-load')||new URL(link.href).searchParams.get('studio')==='team')){
    event.preventDefault();if(profile.dirty&&!confirm('Discard your unsaved changes before opening this view?'))return;
    try{await loadProfile(profile,link.href);}catch(e){alertIn(profile,e.message);}
  }
});
document.addEventListener('submit',async event=>{
  const state=profile,form=event.target;if(!state?.dialog.contains(form)||event.defaultPrevented||event.submitter?.hasAttribute('data-account-preview'))return;
  event.preventDefault();if(state.busy)return;
  const method=(form.getAttribute('method')||'GET').toUpperCase(),body=new URLSearchParams(new FormData(form));
  const action=new URL(form.getAttribute('action')||state.url,location.href);
  if(method==='GET')for(const [key,value]of body)action.searchParams.set(key,value);
  state.busy=true;state.error.hidden=true;const buttons=[...state.dialog.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
  try{
    const response=await fetch(action,{method,body:method==='GET'?undefined:body,credentials:'same-origin'}),doc=parse(await response.text());
    if(!response.ok){alertIn(state,doc.querySelector('[role=alert]')?.textContent||'Could not save. Your entries are still here.');return;}
    state.dirty=false;
    if(method==='POST')await refreshDirectory();
    const returnsToTeam=Boolean(doc.querySelector('.team-directory'));
    if(returnsToTeam){state.busy=false;state.dialog.close();}
    else{state.url=response.url;renderProfile(state,doc);}
  }catch(e){alertIn(state,e.message||'Could not save. Your entries are still here.');}
  finally{state.busy=false;buttons.forEach(b=>b.disabled=false);if(state.dialog.open&&state.error.hidden)state.close.focus();}
});
window.addEventListener('beforeunload',e=>{if(profile?.dirty){e.preventDefault();e.returnValue='';}});
