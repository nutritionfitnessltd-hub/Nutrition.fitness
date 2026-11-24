// Immediate delivery-date feedback; the server validates and recalculates on save.
const date=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')&&Number.isFinite(Date.parse(s));
const iso=d=>d.toISOString().slice(0,10);
const next=s=>iso(new Date(Date.parse(s)+86400000));
const work=s=>{while([0,6].includes(new Date(s).getUTCDay()))s=next(s);return s;};
function updateSchedule(fieldset){
 const form=fieldset.closest('form'),start=fieldset.querySelector('[name=start]'),duration=fieldset.querySelector('[name=duration]'),due=form?.querySelector('[name=due]'),picker=fieldset.querySelector('[data-dependency-picker]');
 if(!due||!start||!duration)return;
 const n=Number(duration.value);if(!Number.isInteger(n)||n<1||n>365)return;
 if(!start.value)start.value=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 if(!date(start.value))return;
 const entries=JSON.parse(fieldset.dataset.scheduleEntries||'[]'),byId=new Map(entries.map(e=>[e.id,e])),task=fieldset.dataset.scheduleTask||'__new__';
 byId.set(task,{id:task,start:start.value,duration:n,dependsOn:[...picker.selectedOptions].map(o=>o.value)});
 const active=new Set();function finish(id){if(active.has(id))return '';const e=byId.get(id);if(!e)return '';active.add(id);let s=date(e.start)?work(e.start):'';
  for(const dep of e.dependsOn||[]){const d=byId.get(dep);const end=d?.status==='Done'&&date(d.completedAt?.slice(0,10))?d.completedAt.slice(0,10):finish(dep);if(!end){active.delete(id);return '';}const after=work(next(end));if(!s||after>s)s=after;}
  active.delete(id);if(!s||!Number.isInteger(e.duration)||e.duration<1)return '';for(let i=1;i<e.duration;i++)s=work(next(s));return s;
 }
 const end=finish(task);if(end){due.value=end;due.dispatchEvent(new Event('change',{bubbles:true}));}
}
document.addEventListener('input',e=>{if(e.target.matches('.task-scheduling [name=start],.task-scheduling [name=duration]'))updateSchedule(e.target.closest('fieldset'));});
document.addEventListener('change',e=>{if(e.target.matches('[data-dependency-picker]'))updateSchedule(e.target.closest('fieldset'));});
