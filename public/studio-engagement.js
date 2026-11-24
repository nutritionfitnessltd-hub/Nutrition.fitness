function toggle(group,hidden){if(!group)return;group.hidden=hidden;group.querySelectorAll('input,select,textarea').forEach(input=>input.disabled=hidden);}
function sync(root=document){
 root.querySelectorAll('[data-engagement-editor]').forEach(editor=>{
  const owner=editor.querySelector('[name=engagementType]')?.value==='owner_director';
  toggle(editor.querySelector('[data-contract-terms]'),owner);const note=editor.querySelector('[data-owner-arrangement]');if(note)note.hidden=!owner;
 });
 root.querySelectorAll('[data-director-ids]').forEach(fieldset=>{
  const assignee=fieldset.closest('form')?.querySelector('[name=assignee]');
  const person=assignee?(assignee.value||fieldset.dataset.projectOwner):fieldset.dataset.taskPerson;
  const owner=JSON.parse(fieldset.dataset.directorIds||'[]').includes(person);
  toggle(fieldset.querySelector('[data-task-effort-fields]'),owner);const note=fieldset.querySelector('[data-owner-task]');if(note)note.hidden=!owner;
 });
}
document.addEventListener('change',event=>{if(event.target.matches('[name=engagementType],[name=assignee]'))sync();});
new MutationObserver(records=>{if(records.some(r=>r.addedNodes.length))sync();}).observe(document.body,{childList:true,subtree:true});
sync();
