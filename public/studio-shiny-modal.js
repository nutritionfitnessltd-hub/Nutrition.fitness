// Keep idea creation and editing on the whiteboard. Normal links remain a fallback.
let active;
const boardUrl=()=>{const u=new URL(location.href);u.searchParams.delete('id');u.searchParams.delete('new');return u;};
const ideaUrl=href=>{const u=new URL(href,location.href);return u.origin===location.origin&&u.pathname==='/content-library/'&&u.searchParams.get('studio')==='shiny-things'?u:null;};
const parse=html=>new DOMParser().parseFromString(html,'text/html');

function showError(state,message){
  state.error.textContent=message;state.error.hidden=false;state.error.focus();
}
function render(state,doc){
  const main=doc.querySelector('main');
  if(!main)throw Error('The idea could not be opened. Please try again.');
  main.querySelector('footer')?.remove();
  state.body.replaceChildren(...main.childNodes);
  const heading=state.body.querySelector('h1');
  if(heading){heading.id='shiny-modal-title';state.dialog.setAttribute('aria-labelledby',heading.id);}
  state.dirty=false;
  state.body.querySelector('input:not([type=hidden]),textarea,select')?.focus();
}
async function refreshBoard(doc){
  let fresh=doc?.querySelector('.shiny-notice-workspace');
  if(!fresh){const response=await fetch(boardUrl(),{credentials:'same-origin'});if(!response.ok)throw Error('Your changes were saved. Close this note and refresh the board to see them.');fresh=parse(await response.text()).querySelector('.shiny-notice-workspace');}
  const current=document.querySelector('.shiny-notice-workspace');
  if(fresh&&current)current.replaceWith(fresh);
}
function requestClose(state){
  if(state.busy)return;
  if(state.dirty&&!confirm('Discard your unsaved idea changes?'))return;
  state.controller?.abort();state.dialog.close();
}
async function openIdea(link){
  const dialog=document.createElement('dialog');dialog.className='shiny-idea-modal';dialog.setAttribute('aria-label','Idea');
  const bar=document.createElement('div');bar.className='shiny-modal-bar';
  const label=document.createElement('span');label.textContent='A little space for your idea';
  const close=document.createElement('button');close.type='button';close.textContent='Close';close.setAttribute('aria-label','Close idea');bar.append(label,close);
  const error=document.createElement('p');error.className='shiny-modal-error';error.setAttribute('role','alert');error.tabIndex=-1;error.hidden=true;
  const body=document.createElement('div');body.className='shiny-modal-body';body.textContent='Opening your note…';
  dialog.append(bar,error,body);document.body.append(dialog);
  const state={dialog,body,error,opener:link,dirty:false,busy:false,controller:new AbortController()};active=state;
  close.addEventListener('click',()=>requestClose(state));
  dialog.addEventListener('cancel',event=>{event.preventDefault();requestClose(state);});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)requestClose(state);}});
  dialog.addEventListener('input',()=>state.dirty=true);
  dialog.addEventListener('close',()=>{state.controller?.abort();dialog.remove();if(active===state)active=null;document.body.classList.remove('shiny-modal-open');(link.isConnected?link:document.querySelector('.shiny-notice-workspace .studio-heading a'))?.focus();});
  document.body.classList.add('shiny-modal-open');dialog.showModal();
  try{const response=await fetch(link.href,{credentials:'same-origin',signal:state.controller.signal});const doc=parse(await response.text());if(!response.ok)throw Error(doc.querySelector('[role=alert]')?.textContent||'The idea could not be opened. Please try again.');if(dialog.open)render(state,doc);}
  catch(error){if(error.name!=='AbortError')showError(state,error.message);}
}

document.addEventListener('click',event=>{
  const link=event.target.closest?.('a');if(!link||event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  if(!link.closest('.shiny-notice-workspace,.shiny-idea-modal'))return;
  const url=ideaUrl(link.href);if(!url)return;
  if(active&&link.closest('.shiny-idea-modal')&&!url.searchParams.has('id')&&!url.searchParams.has('new')){event.preventDefault();requestClose(active);return;}
  if(!url.searchParams.has('id')&&!url.searchParams.has('new'))return;
  event.preventDefault();if(!active)void openIdea(link);
});
document.addEventListener('submit',async event=>{
  const state=active,form=event.target;
  if(!state||!state.dialog.contains(form)||!form.querySelector('input[name=action]')?.value.startsWith('idea-'))return;
  event.preventDefault();if(state.busy)return;
  state.busy=true;state.error.hidden=true;state.dialog.setAttribute('aria-busy','true');
  const buttons=[...state.dialog.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
  try{
    const payload=new URLSearchParams(new FormData(form));
    const response=await fetch(form.getAttribute('action'),{method:'POST',body:payload,credentials:'same-origin'});
    const doc=parse(await response.text());
    if(!response.ok){showError(state,doc.querySelector('[role=alert]')?.textContent||'Could not save. Your edits are still here.');return;}
    state.dirty=false;
    const returnsToBoard=Boolean(doc.querySelector('.shiny-notice-workspace'));
    await refreshBoard(doc);
    if(returnsToBoard){state.busy=false;state.dialog.close();}
    else if(new URL(response.url).searchParams.get('studio')==='project'){
      state.body.replaceChildren();const title=document.createElement('h1');title.textContent='Project created';const link=document.createElement('a');link.className='btn primary';link.href=response.url;link.textContent='Open project';state.body.append(title,link);
    }else render(state,doc);
  }catch(error){showError(state,error.message||'Could not save. Your edits are still here.');}
  finally{state.busy=false;state.dialog.removeAttribute('aria-busy');buttons.forEach(b=>b.disabled=false);}
});
window.addEventListener('beforeunload',event=>{if(active?.dirty){event.preventDefault();event.returnValue='';}});
