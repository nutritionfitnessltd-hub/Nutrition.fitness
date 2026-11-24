// Keep one real task form: move it into a native dialog, then restore it on close.
let active;
function taskTitle(source){return source.dataset.taskTitle||source.querySelector('summary strong')?.textContent||'Task';}
function closeTask(state){
 if(state.busy)return;
 if(state.dirty&&!confirm('Discard your unsaved task changes?'))return;
 state.dialog.close();
}
function openTask(source,opener=source.querySelector('summary')){
 if(active)return;
 const summary=source.querySelector(':scope > summary'),content=document.createElement('div');content.className='task-modal-body';
 const nodes=[...source.childNodes].filter(n=>n!==summary),placeholder=document.createComment('Task details return here');source.append(placeholder);
 content.append(...nodes);
 const dialog=document.createElement('dialog');dialog.className='task-edit-modal';dialog.setAttribute('aria-labelledby','task-dialog-title');
 const bar=document.createElement('header');bar.className='task-modal-bar';
 const title=document.createElement('h2');title.id='task-dialog-title';title.textContent=source.hasAttribute('data-task-add-modal')?'Add task':taskTitle(source);
 const close=document.createElement('button');close.type='button';close.textContent='Close';close.setAttribute('aria-label','Close task');bar.append(title,close);
 const error=document.createElement('p');error.className='task-modal-error';error.role='alert';error.tabIndex=-1;error.hidden=true;
 dialog.append(bar,error,content);document.body.append(dialog);
 const state={dialog,source,content,nodes,placeholder,opener,dirty:false,busy:false,error};active=state;
 const editor=content.querySelector('.project-task-edit');if(editor)editor.open=true;
 if(content.querySelector('form [name=action][value="task-save"]'))dialog.classList.add('task-editable');
 content.addEventListener('input',()=>state.dirty=true);content.addEventListener('change',()=>state.dirty=true);
 close.addEventListener('click',()=>closeTask(state));
 dialog.addEventListener('cancel',event=>{event.preventDefault();closeTask(state);});
 dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeTask(state);});
 dialog.addEventListener('close',()=>{for(const node of nodes)source.insertBefore(node,placeholder);placeholder.remove();source.open=false;dialog.remove();active=null;document.body.classList.remove('task-modal-open');if(opener?.isConnected)opener.focus();});
 document.body.classList.add('task-modal-open');dialog.showModal();close.focus();
}
function enhance(){
 document.querySelectorAll('.project-task-row').forEach(source=>{
  const summary=source.querySelector(':scope > summary');if(!summary||summary.dataset.taskModal)return;
  summary.dataset.taskModal='1';summary.setAttribute('aria-haspopup','dialog');
  summary.addEventListener('click',event=>{event.preventDefault();openTask(source,summary);});
 });
 document.querySelectorAll('form [name=action][value="task-add"]').forEach(input=>{
  const source=input.closest('details'),summary=source?.querySelector(':scope > summary');if(!source||!summary)return;
  source.open=false;source.setAttribute('data-task-add-modal','');summary.textContent='Add task';summary.setAttribute('aria-haspopup','dialog');
  summary.addEventListener('click',event=>{event.preventDefault();openTask(source,summary);});
  const link=[...document.querySelectorAll('a[href]')].find(a=>{const u=new URL(a.href);return u.origin===location.origin&&u.searchParams.get('add')==='1';});
  if(link){source.hidden=true;link.setAttribute('aria-haspopup','dialog');link.addEventListener('click',event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();openTask(source,link);});}
  if(new URL(location.href).searchParams.get('add')==='1')openTask(source,link||summary);
 });
}
document.addEventListener('submit',async event=>{
 const state=active,form=event.target;if(!state||!state.dialog.contains(form))return;
 const action=form.querySelector('[name=action]')?.value;if(!['task-save','task-add','task-delete','task-restore'].includes(action))return;
 event.preventDefault();if(state.busy)return;
 if(action==='task-delete'&&!confirm('Delete this task? You can restore it from deleted tasks.'))return;
 const payload=new URLSearchParams(new FormData(form));if(event.submitter?.name)payload.set(event.submitter.name,event.submitter.value);
 state.busy=true;state.error.hidden=true;state.dialog.setAttribute('aria-busy','true');const buttons=[...state.dialog.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
 try{
  const response=await fetch(form.getAttribute('action')||location.href,{method:'POST',body:payload,credentials:'same-origin'}),html=await response.text(),doc=new DOMParser().parseFromString(html,'text/html');
  const destination=new URL(response.url);
  if(!response.ok)throw Error(doc.querySelector('[role=alert]')?.textContent||'Could not save this task. Your changes are still here.');
  if(destination.origin!==location.origin||!doc.querySelector('.project-document,.project-dashboard'))throw Error('Please check your session and try again. Your changes are still here.');
  state.dirty=false;destination.searchParams.delete('add');destination.hash='';location.assign(destination.href);
 }catch(error){state.error.textContent=error.message||'Could not save this task. Your changes are still here.';state.error.hidden=false;state.error.focus();state.busy=false;state.dialog.removeAttribute('aria-busy');buttons.forEach(b=>b.disabled=false);}
},true);
window.addEventListener('beforeunload',event=>{if(active?.dirty&&!active.busy){event.preventDefault();event.returnValue='';}});
enhance();
