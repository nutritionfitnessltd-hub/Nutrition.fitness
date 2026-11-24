const dialog=document.querySelector('[data-people-task-modal]');
if(dialog){
 const trigger=document.querySelector('[data-new-people-task]');let opener=trigger;
 const open=()=>{dialog.showModal();dialog.querySelector('input[name=title]')?.focus();};
 trigger?.addEventListener('click',()=>open());
 dialog.querySelectorAll('[data-people-task-close]').forEach(b=>b.addEventListener('click',()=>{dialog.close();opener?.focus();}));
 if(dialog.hasAttribute('data-open-on-load'))open();
 const repeat=dialog.querySelector('[name=repeat]');
 const refresh=()=>{if(!repeat)return;dialog.querySelector('[data-repeat-options]').hidden=repeat.value==='none';dialog.querySelector('[data-weekly-days]').hidden=repeat.value!=='weekly';dialog.querySelector('[data-custom-interval]').hidden=repeat.value!=='custom';dialog.querySelector('[name=due]').required=repeat.value!=='none';};
 repeat?.addEventListener('change',refresh);refresh();
 const f=dialog.querySelector('form');let dirty=false;f.addEventListener('input',()=>dirty=true);dialog.addEventListener('cancel',event=>{if(dirty&&!confirm('Discard your unsaved task changes?'))event.preventDefault();});
 f.addEventListener('submit',()=>{f.querySelector('button.primary').disabled=true;});
}
