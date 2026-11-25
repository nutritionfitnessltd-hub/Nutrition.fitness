import {upcomingHours} from './working-hours.mjs';
const viewerZone=Intl.DateTimeFormat().resolvedOptions().timeZone||'Europe/London';
for(const select of document.querySelectorAll('[data-zone-auto]')){if(![...select.options].some(o=>o.value===viewerZone)){const o=new Option(viewerZone,viewerZone);select.add(o);}select.value=viewerZone;}
let schedules,selected;const dialog=document.querySelector('[data-hours-dialog]'),content=dialog?.querySelector('[data-hours-content]');
function render(){
 if(!dialog?.open||!selected)return;content.replaceChildren();const p=document.createElement('p');p.textContent='Shown in your time: '+viewerZone.replaceAll('_',' ');content.append(p);
 if(schedules===undefined){p.textContent='Loading working hours…';return;}if(schedules===null){p.textContent='Working hours are unavailable. Please try again.';return;}
 const schedule=schedules.find(s=>s.id===selected);if(!schedule||!schedule.days.some(Boolean)){p.textContent='Working hours have not been set.';return;}
 const source=document.createElement('p');source.className='meta';source.textContent='Their time zone: '+schedule.timeZone.replaceAll('_',' ');content.append(source);
 const {rows,skipped}=upcomingHours(schedule,viewerZone),list=document.createElement('ul');for(const row of rows){const li=document.createElement('li');li.textContent=row.label;list.append(li);}content.append(list);
 if(skipped){const warning=document.createElement('p');warning.textContent='A scheduled time falls within a daylight-saving clock change. Check that shift with your teammate.';content.append(warning);}
}
addEventListener('team-working-hours',event=>{schedules=event.detail;render();});
for(const button of document.querySelectorAll('[data-person-hours]'))button.addEventListener('click',async()=>{selected=button.dataset.personHours;dialog.querySelector('h2').textContent=button.dataset.personName+' · Working hours';dialog.showModal();render();if(schedules===undefined)try{const r=await fetch('/content-library/?work=1&studio=messages&poll=1',{headers:{Accept:'application/json'}});if(!r.ok)throw Error();schedules=(await r.json()).workingHours??null;render();}catch{schedules=null;render();}});
for(const button of dialog?.querySelectorAll('[data-hours-close]')||[])button.addEventListener('click',()=>dialog.close());
dialog?.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dialog.close();}});
