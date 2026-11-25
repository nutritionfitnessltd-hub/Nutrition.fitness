// Filters stay scoped to the signed-in viewer and survive live worker refreshes.
export function startTeamWorkFilters({doc=document,storage=null,Observer=MutationObserver}={}){
 const scope=doc.querySelector('[data-work-filter-scope]');if(!scope)return;
 if(!storage)try{storage=globalThis.localStorage;}catch{}
 const key='nufi:team-work-filters:'+scope.dataset.workFilterScope;
 let value={};try{value=JSON.parse(storage.getItem(key)||'{}')||{};}catch{}
 let applying=false;
 const apply=()=>{if(applying)return;applying=true;try{
  const section=doc.querySelector('[data-work-filter-scope]'),form=section?.querySelector('[data-team-work-filters]');if(!form)return;
  for(const name of ['type','state','owner']){const input=form.elements.namedItem(name);input.value=value[name]||'';if(input.selectedIndex<0){input.value='';value[name]='';}}
  let shown=0;for(const row of section.querySelectorAll('[data-work-id]')){
   const visible=(!value.type||row.dataset.workType===value.type)&&(!value.state||row.dataset.workState===value.state)&&(!value.owner||row.dataset.workOwner===value.owner);
   row.hidden=!visible;if(visible)shown++;
  }
  const empty=section.querySelector('[data-work-filter-empty]');if(empty)empty.hidden=shown>0;
 }finally{applying=false;}};
 doc.addEventListener('change',event=>{const form=event.target.closest?.('[data-team-work-filters]');if(!form)return;value=Object.fromEntries(['type','state','owner'].map(name=>[name,form.elements.namedItem(name).value]));try{storage.setItem(key,JSON.stringify(value));}catch{}apply();});
 doc.addEventListener('submit',event=>{if(event.target.matches?.('[data-team-work-filters]'))event.preventDefault();});
 doc.addEventListener('reset',event=>{if(!event.target.matches?.('[data-team-work-filters]'))return;value={};try{storage.removeItem(key);}catch{}queueMicrotask(apply);});
 const observer=new Observer(apply);observer.observe(scope.parentElement,{childList:true,subtree:true});apply();return {apply,observer};
}
if(typeof document!=='undefined')startTeamWorkFilters();
