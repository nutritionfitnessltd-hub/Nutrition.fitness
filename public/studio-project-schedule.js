// Checkbox choices submit directly; no hidden JSON or client-side date rewriting.
document.addEventListener('change',event=>{
 if(!event.target.matches('[data-task-prerequisite]'))return;
 const fieldset=event.target.closest('fieldset');
 const count=fieldset?.querySelector('[data-dependency-count]');
 if(count)count.textContent=fieldset.querySelectorAll('[data-task-prerequisite]:checked').length;
});
