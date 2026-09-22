import {FoodStore} from './food-store.mjs';

/** Keep legacy planner recovery controls available in the new account area. */
export async function mountAccountSync(host,expectedUserId){
 if(!host)return;
 host.innerHTML='<details class="nf-card"><summary>Saved plan &amp; sync</summary><div class="nf-card-body"><p class="nf-hint" data-sync-status role="status">Checking your saved plan…</p><div class="nf-form-actions"><button type="button" class="nf-btn nf-secondary" data-sync-export disabled>Download my backup</button><button type="button" class="nf-btn nf-secondary" data-sync-retry disabled>Retry sync</button><button type="button" class="nf-btn nf-secondary" data-sync-reload disabled>Load account copy</button><button type="button" class="nf-btn nf-secondary" data-sync-guest hidden>Import this browser’s guest plan</button></div><p class="nf-hint">Your guest plan stays separate. Importing it replaces the plan in this account, so download a backup first.</p></div></details>';
 const get=s=>host.querySelector(s),status=get('[data-sync-status]');
 const report=message=>{status.textContent=message;};
 try{
  const store=new FoodStore();await store.init();
  if(!store.member||store.member.id!==expectedUserId)throw new Error('Your account changed or could not be confirmed. Reload before managing this plan.');
  const render=()=>report(store.status);store.subscribe(render);render();
  for(const b of host.querySelectorAll('button'))b.disabled=false;
  get('[data-sync-export]').onclick=()=>{
   const blob=new Blob([store.exportFile()],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
   link.href=url;link.download='nutrition-fitness-private-plan-backup.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const busy=async(button,action)=>{button.disabled=true;try{await action();render();}catch(error){report(error.message);}finally{button.disabled=false;}};
  get('[data-sync-retry]').onclick=e=>busy(e.currentTarget,()=>store.flush());
  get('[data-sync-reload]').onclick=e=>{
   if(store.pending&&!confirm('Replace the unsynced changes on this browser with the saved account copy? Download your backup first to keep those changes.'))return;
   busy(e.currentTarget,()=>store.reloadAccount());
  };
  const guest=store.guestFile();
  if(guest){get('[data-sync-guest]').hidden=false;get('[data-sync-guest]').onclick=e=>{
   if(!confirm('Replace this account’s current meal plan with the guest plan from this browser? Download your account backup first. The guest copy will be kept.'))return;
   busy(e.currentTarget,async()=>{store.importFile(guest);await store.flush();});
  };}
 }catch(error){report(error.message||'Your saved plan could not be confirmed.');}
}
