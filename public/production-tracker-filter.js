const selector='[data-tracker-project]';
const legacyKey=panel=>'nufi:hide-completed:'+panel.dataset.trackerActor+':'+panel.dataset.trackerProject;
const key=(panel,group)=>legacyKey(panel)+':course:'+encodeURIComponent(group.dataset.trackerGroupKey||'');
function apply(panel){
 for(const group of panel.querySelectorAll('[data-tracker-group]')){
  const toggle=group.querySelector('[data-hide-completed]');if(!toggle)continue;
  if(!toggle.dataset.ready){try{const saved=localStorage.getItem(key(panel,group));toggle.checked=(saved===null?localStorage.getItem(legacyKey(panel)):saved)==='1';}catch{}toggle.dataset.ready='true';}
  const rows=[...group.querySelectorAll('[data-tracker-completed]')];let hidden=0;
  for(const row of rows){row.hidden=toggle.checked&&row.dataset.trackerCompleted==='true';if(row.hidden)hidden++;}
  const empty=group.querySelector('[data-tracker-group-empty]');if(empty)empty.hidden=!(toggle.checked&&rows.length&&rows.every(row=>row.hidden));
  const status=group.querySelector('[data-tracker-visible]'),text=toggle.checked?`${rows.length-hidden} shown · ${hidden} completed hidden`:`${rows.length} items`;
  if(status&&status.textContent!==text)status.textContent=text;
 }
}
function refresh(){if(document)document.querySelectorAll(selector).forEach(apply);}
document.addEventListener('change',event=>{if(!event.target.matches('[data-hide-completed]'))return;const panel=event.target.closest(selector),group=event.target.closest('[data-tracker-group]');if(!panel||!group)return;try{localStorage.setItem(key(panel,group),event.target.checked?'1':'0');}catch{}apply(panel);});
refresh();
new MutationObserver(refresh).observe(document.body,{childList:true,subtree:true});
