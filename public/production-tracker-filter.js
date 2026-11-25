const selector='[data-tracker-project]';
const key=panel=>'nufi:hide-completed:'+panel.dataset.trackerActor+':'+panel.dataset.trackerProject;
function apply(panel){
  const toggle=panel.querySelector('[data-hide-completed]');if(!toggle)return;
  if(!toggle.dataset.ready){try{toggle.checked=localStorage.getItem(key(panel))==='1';}catch{}toggle.dataset.ready='true';}
  const rows=[...panel.querySelectorAll('[data-tracker-completed]')];let hidden=0;
  for(const row of rows){row.hidden=toggle.checked&&row.dataset.trackerCompleted==='true';if(row.hidden)hidden++;}
  for(const group of panel.querySelectorAll('[data-tracker-group]')){
    const items=[...group.querySelectorAll('[data-tracker-completed]')],empty=group.querySelector('[data-tracker-group-empty]');
    if(empty)empty.hidden=!(toggle.checked&&items.length&&items.every(row=>row.hidden));
  }
  const status=panel.querySelector('[data-tracker-visible]'),text=toggle.checked?`${rows.length-hidden} shown · ${hidden} completed hidden`:`${rows.length} items`;
  if(status&&status.textContent!==text)status.textContent=text;
}
function refresh(){if(document)document.querySelectorAll(selector).forEach(apply);}
document.addEventListener('change',event=>{if(!event.target.matches('[data-hide-completed]'))return;const panel=event.target.closest(selector);try{localStorage.setItem(key(panel),event.target.checked?'1':'0');}catch{}apply(panel);});
refresh();
new MutationObserver(refresh).observe(document.body,{childList:true,subtree:true});
