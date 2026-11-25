const bulk=document.querySelector('#recipe-bulk-review');
if(bulk){
 const confirmation=bulk.querySelector('[name="contentChecked"]');
 const picks=[...document.querySelectorAll('[data-recipe-pick]')],page=bulk.querySelector('[data-recipe-select-page]');
 const update=()=>{
  const selected=picks.filter(p=>p.checked).length;
  bulk.querySelector('[data-recipe-selected]').textContent=selected+' selected';
  page.checked=picks.length>0&&selected===picks.length;page.indeterminate=selected>0&&selected<picks.length;page.disabled=!picks.length;
  bulk.querySelectorAll('button[name="operation"]').forEach(button=>{button.disabled=!selected||(button.value==='approve'&&!confirmation?.checked);});
  picks.forEach(p=>p.closest('article').classList.toggle('recipe-is-selected',p.checked));
 };
 picks.forEach(p=>p.addEventListener('change',()=>{if(confirmation)confirmation.checked=false;update();}));
 confirmation?.addEventListener('change',update);
 page.addEventListener('change',()=>{if(confirmation)confirmation.checked=false;picks.forEach(p=>{p.checked=page.checked;});update();});
 bulk.querySelector('[data-recipe-clear]').addEventListener('click',()=>{picks.forEach(p=>{p.checked=false;});if(confirmation)confirmation.checked=false;update();});
 window.addEventListener('pageshow',update);update();
}
