import {HttpError} from './platform.mjs';
import {esc,input,hidden} from './studio-ui.mjs';
const iso=d=>d.toISOString().slice(0,10);
export const todayLondon=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function validDate(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&iso(new Date(s))===s;}
const next=s=>iso(new Date(Date.parse(s)+86400000));
const working=s=>![0,6].includes(new Date(s).getUTCDay());
export function workStart(s){while(!working(s))s=next(s);return s;}
export function workFinish(s,n){s=workStart(s);for(let i=1;i<n;i++)s=workStart(next(s));return s;}
export function workDaysBetween(a,b){let n=0;for(let s=next(a);s<=b;s=next(s))if(working(s))n++;return n;}
export function validateDependencies(entries){
 const byId=new Map(entries.map(e=>[e.id,e])),visiting=new Set(),visited=new Set();
 function visit(e){if(visiting.has(e.id))throw new HttpError(400,'Dependencies cannot form a circle.');if(visited.has(e.id))return;visiting.add(e.id);for(const id of e.dependsOn||[]){if(id===e.id||!byId.has(id))throw new HttpError(400,'Choose an existing task in this project as the dependency.');visit(byId.get(id));}visiting.delete(e.id);visited.add(e.id);}
 entries.forEach(visit);
}
export function scheduleFields(f,e,entries){
 if(f.schedulePresent!=='1')return;
 const deps=f.dependencySelection==='1'?Object.keys(f).filter(k=>k.startsWith('dependency.')).map(k=>k.slice(11)):String(f.dependencies||'').split(',').filter(Boolean);
 if(f.plannerVersion==='2'){
  const parse=(value,label)=>{if(value===''||value===undefined)return null;const n=Number(value);if(!Number.isFinite(n)||n<=0||n>5000||!/^\d+(?:\.\d{1,2})?$/.test(String(value)))throw new HttpError(400,'Enter '+label+' between 0.01 and 5,000 hours.');return n;};
  const estimatedHours=parse(f.estimatedHours,'estimated hours');
  const remainingHours=parse(f.remainingHours,'remaining hours');
  Object.assign(e,{estimatedHours,remainingHours,start:'',duration:estimatedHours===null?(e.duration??null):null,dependsOn:[...new Set(deps)]});
 }else{
  const start=f.start||'',duration=f.duration===''?null:Number(f.duration);
  if(start&&!validDate(start))throw new HttpError(400,'Choose a valid start date.');
  if(duration!==null&&(!Number.isInteger(duration)||duration<1||duration>365))throw new HttpError(400,'Duration must be 1–365 working days.');
  Object.assign(e,{start,duration,dependsOn:[...new Set(deps)]});
 }
 validateDependencies(entries);
}
// Legacy day-based calculation retained for saved-plan compatibility. Live pages use portfolioSchedule.
export function projectSchedule(p,today=todayLondon(),forecast=true){
 const byId=new Map(p.entries.map(e=>[e.id,e])),memo=new Map(),active=new Set();
 function calc(e){if(memo.has(e.id))return memo.get(e.id);if(active.has(e.id))return {error:'Circular dependency',blocked:true};active.add(e.id);
  const deps=(e.dependsOn||[]).map(id=>byId.get(id)),blocked=deps.some(d=>!d||d.status!=='Done');
  let start=validDate(e.start)?workStart(e.start):'',unknown=false,error='';
  for(const d of deps){if(!d){unknown=true;error='Dependency unavailable';continue;}const r=calc(d);if(r.error){unknown=true;error=r.error;}const end=d.status==='Done'?(validDate(d.completedAt?.slice(0,10))?d.completedAt.slice(0,10):r.finish):r.finish;if(!end){unknown=true;continue;}const earliest=workStart(next(end));if(!start||earliest>start)start=earliest;}
  // Forecast unfinished work from today; do not rewrite its committed due date.
  if(forecast&&start&&e.status!=='Done'&&start<today)start=workStart(today);
  const duration=Number.isInteger(e.duration)&&e.duration>0?e.duration:null,finish=start&&duration&&!unknown?workFinish(start,duration):'';
  const overdue=e.status!=='Done'&&validDate(e.due)&&e.due<today,late=overdue?workDaysBetween(e.due,today):0,atRisk=e.status!=='Done'&&finish&&validDate(e.due)&&finish>e.due;
  const row={entry:e,start,finish,duration,blocked,overdue,late,atRisk,error,unscheduled:!finish};memo.set(e.id,row);active.delete(e.id);return row;
 }return p.entries.map(calc);
}
export function reorderAndSchedule(entries,entryId,position){
 validateDependencies(entries);
 let ordered=[...entries];
 if(position!==undefined&&position!==''){
  const n=Number(position);if(!Number.isInteger(n)||n<1||n>entries.length)throw new HttpError(400,'Choose a task position between 1 and '+entries.length+'.');
  const i=ordered.findIndex(e=>e.id===entryId);if(i<0)throw new HttpError(404,'Task not found.');const [e]=ordered.splice(i,1);ordered.splice(n-1,0,e);
 }
 const byId=new Map(ordered.map(e=>[e.id,e])),seen=new Set(),result=[];
 function visit(e){if(seen.has(e.id))return;for(const id of e.dependsOn||[])visit(byId.get(id));seen.add(e.id);result.push(e);}
 ordered.forEach(visit);
 return result;
}
export function weeklyHours(fields={}){
 const hours=Number(fields.agreedHours);
 if(!Number.isFinite(hours)||hours<=0||!['week','month'].includes(fields.hoursPeriod))return null;
 const weekly=fields.hoursPeriod==='month'?hours*12/52:hours;
 return weekly<=168?weekly:null;
}
const taskKey=(p,e)=>p.id+':'+e.id;
export function portfolioSchedule(projects,profiles={},today=todayLondon()){
 const result=new Map(),pending=[],bookings=new Map();
 for(const p of projects){
  if(['Complete','Archived'].includes(p.status))continue;
  for(const [order,e] of (p.entries||[]).entries())pending.push({p,e,order,key:taskKey(p,e)});
 }
 const daily=id=>{const n=weeklyHours(profiles[id]);return n===null?null:n/5;};
 const set=(t,details)=>{const e=t.e;const overdue=e.status!=='Done'&&validDate(e.due)&&e.due<today;
  result.set(t.key,{entry:e,start:'',finish:'',blocked:(e.dependsOn||[]).some(id=>t.p.entries.find(x=>x.id===id)?.status!=='Done'),overdue,late:overdue?workDaysBetween(e.due,today):0,...details,atRisk:Boolean(details.finish&&validDate(e.due)&&details.finish>e.due&&e.status!=='Done'),unscheduled:!details.finish});};
 const rank=t=>t.e.status==='In progress'||t.e.status==='Changes requested'?0:1;
 pending.sort((a,b)=>rank(a)-rank(b)||(a.e.due||'9999').localeCompare(b.e.due||'9999')||String(a.p.id).localeCompare(String(b.p.id))||a.order-b.order);
 while(pending.length){
  let progressed=false;
  for(let i=0;i<pending.length;){
   const t=pending[i],{p,e}=t,deps=(e.dependsOn||[]).map(id=>({id,entry:p.entries.find(x=>x.id===id),row:result.get(p.id+':'+id)}));
   if(e.status==='Done'){const end=validDate(e.completedAt?.slice(0,10))?e.completedAt.slice(0,10):today;set(t,{start:end,finish:end,hours:0});}
   else if(deps.some(d=>!d.entry)){set(t,{error:'Choose an available prerequisite.'});}
   else if(deps.some(d=>!d.row)){i++;continue;}
   else if(deps.some(d=>!d.row.finish)){set(t,{error:'Waiting for prerequisite planning or review.'});}
   else if(e.status==='Ready for review'){set(t,{error:'Awaiting review; finish date will update after approval.'});}
   else{
    const person=e.assignee||p.creator_id,capacity=daily(person);
    const hours=Number.isFinite(e.remainingHours)&&e.remainingHours>0?e.remainingHours:Number.isFinite(e.estimatedHours)&&e.estimatedHours>0?e.estimatedHours:capacity&&e.duration?e.duration*capacity:null;
    if(e.milestone||e.kind==='Milestone'){
     const finish=deps.length?deps.map(d=>d.row.finish).sort().at(-1):workStart(today);set(t,{start:finish,finish,hours:0});
    }else if(profiles[person]?.engagementType==='owner_director'){const ready=deps.map(d=>workStart(next(d.row.finish))).sort().at(-1)||today;const usable=validDate(e.due)&&e.due>=today&&e.due>=ready;set(t,{manual:true,finish:usable?e.due:'',error:usable?'':validDate(e.due)?'Update the owner / director deadline to plan dependent tasks.':'Deadline managed by the owner / director.'});}
    else if(capacity===null){set(t,{missingCapacity:true,error:'Set weekly hours in the assigned person’s profile.'});}
    else if(!hours){set(t,{error:'Add estimated hours to plan this task.'});}
    else{
     let start=workStart(validDate(e.start)&&e.start>today?e.start:today);
     for(const d of deps){const after=workStart(next(d.row.finish));if(after>start)start=after;}
     const load=bookings.get(person)||new Map();bookings.set(person,load);
     let left=hours,first='',finish='',days=0;const reserved=[];
     for(let day=start;left>0.000001&&days<1096;day=workStart(next(day)),days++){
      const available=Math.max(0,capacity-(load.get(day)||0));if(!available)continue;
      const amount=Math.min(left,available);reserved.push([day,amount]);left-=amount;if(!first)first=day;finish=day;
     }
     if(left>0.000001)set(t,{error:'This task exceeds the planning window. Split it into smaller tasks.'});
     else{for(const [day,n] of reserved)load.set(day,(load.get(day)||0)+n);set(t,{start:first,finish,hours,duration:workDaysBetween(first,finish)+1,capacity,person});}
    }
   }
   pending.splice(i,1);progressed=true;
  }
  if(!progressed){for(const t of pending)set(t,{error:'Dependencies form a circle. Update the prerequisites.'});break;}
 }
 return result;
}
export function plannedRows(p,data={}){
 if(data.planner?.unavailable)return p.entries.map(entry=>({entry,error:'Planning is temporarily unavailable. Your tasks and deadlines are saved.'}));
 const plan=data.planner?.rows||portfolioSchedule(data.projects?.length?data.projects:[p],Object.fromEntries([...(data.byId||new Map())].filter(([id])=>id.startsWith('studio:team-profile:')).map(([id,r])=>[id.slice('studio:team-profile:'.length),r.fields||{}])));
 return p.entries.map(e=>plan.get(taskKey(p,e))||{entry:e,error:p.status==='Complete'?'Project complete':'Planning details unavailable'});
}
export function schedulingInputs(p,e={},data={}){
 const person=e.id?(e.assignee||p.creator_id):(data.actor?.role==='staff'?data.actor.id:p.creator_id),f=data.byId?.get('studio:team-profile:'+person)?.fields||{},hours=weeklyHours(f);
 const directors=[...new Set([...(data.planner?.directorIds||[]),...[...(data.byId||new Map())].filter(([id,r])=>id.startsWith('studio:team-profile:')&&r.fields?.engagementType==='owner_director').map(([id])=>id.slice('studio:team-profile:'.length))])];
 const manual=directors.includes(person);
 const estimate=e.estimatedHours??(e.duration&&hours?Math.round(e.duration*hours/5*100)/100:'');
 return '<fieldset class="task-scheduling simple-task-planning" data-director-ids="'+esc(JSON.stringify(directors))+'" data-project-owner="'+esc(p.creator_id)+'" data-task-person="'+esc(person)+'"><legend>Plan the work</legend>'+hidden('schedulePresent','1')+hidden('plannerVersion','2')+hidden('dependencySelection','1')+
  '<p data-owner-task'+(manual?'':' hidden')+'>Owner / Director: manage this task by its deadline. Hours are not required.</p><div data-task-effort-fields'+(manual?' hidden':'')+'>'+
  ((e.milestone||e.kind==='Milestone')?'<p class="meta">A milestone marks a result; its date follows its prerequisites.</p>':input('estimatedHours','Estimated hours',estimate,'number','min="0.01" max="5000" step="0.01" placeholder="How many hours of work?"')+
  (['In progress','Changes requested'].includes(e.status)?input('remainingHours','Hours left',e.remainingHours??estimate,'number','min="0.01" max="5000" step="0.01"'):hidden('remainingHours',e.remainingHours??'')))+'</div>'+
  '<details class="schedule-dependencies"><summary>Must finish first (<span data-dependency-count>'+(e.dependsOn||[]).length+'</span>)</summary><div class="task-prerequisites">'+
  (p.entries.filter(t=>t.id!==e.id).map(t=>'<label><input type="checkbox" name="dependency.'+esc(t.id)+'" value="1" data-task-prerequisite'+((e.dependsOn||[]).includes(t.id)?' checked':'')+'><span>'+esc(t.title)+'</span></label>').join('')||'<p class="meta">No other tasks yet.</p>')+'</div></details><p class="meta">Expected dates update when you save. Deadlines stay fixed.</p></fieldset>';
}
export function taskScheduleSummary(p,e,data={}){
 const r=plannedRows(p,data).find(r=>r.entry.id===e.id);
 return '<div class="task-schedule-summary">'+(r.hours?'<span>'+esc(r.hours)+' hours'+(e.remainingHours?' left':' estimated')+'</span>':'')+(r.finish?'<span>'+(r.manual?'Deadline ':'Expected ')+esc(r.finish)+'</span>':'')+(r.overdue?'<strong class="schedule-late">Deadline missed</strong>':r.atRisk?'<strong class="schedule-late">At risk of missing deadline</strong>':'')+(r.blocked?'<strong class="schedule-blocked">Waiting for prerequisites</strong>':'')+(r.error?'<span class="planner-question">'+esc(r.error)+'</span>':'')+(r.missingCapacity&&data.actor?.role==='admin'?'<a href="/content-library/?work=1&amp;studio=team&amp;person='+encodeURIComponent(e.assignee||p.creator_id)+'">Set working hours</a>':'')+'</div>';
}
export function taskForecastLabel(p,e,data={}){
 const r=plannedRows(p,data).find(r=>r.entry.id===e.id);
 return r.finish?(r.manual?'Deadline ':'Expected ')+r.finish+(r.overdue?' · Deadline missed':r.atRisk?' · At risk':'')+(r.blocked?' · Waiting for prerequisites':''):r.error||'Add planning details';
}
export function ganttPanel(p,data={}){
 const rows=plannedRows(p,data),today=todayLondon(),dates=rows.flatMap(r=>[r.start,r.finish,validDate(r.entry.due)?r.entry.due:'']).filter(Boolean);
 if(!rows.length)return '';
 dates.push(today);const from=dates.reduce((a,b)=>a<b?a:b),last=dates.reduce((a,b)=>a>b?a:b),all=[];for(let s=from;s<=last&&all.length<366;s=next(s))all.push(s);
 return '<details class="panel project-gantt"><summary>View timeline</summary><p>Expected dates share each person’s weekly hours across Monday–Friday and all active projects. In-progress work comes first, then earlier deadlines. Prerequisites finish before the next working day starts. Bank holidays are not excluded. Deadlines stay fixed.</p><div class="gantt-scroll"><div style="min-width:'+Math.max(900,all.length*30)+'px"><div class="gantt-dates">'+all.map(d=>'<span class="'+(!working(d)?'weekend':'')+'">'+esc(d.slice(5))+'</span>').join('')+'</div>'+rows.map(r=>{const a=all.indexOf(r.start),b=all.indexOf(r.finish);return '<div class="gantt-label">'+esc(r.entry.title)+'</div><div class="gantt-track" style="--columns:'+all.length+'">'+all.map(d=>'<span class="gantt-day '+(!working(d)?'weekend ':'')+(d===today?'today':'')+'"></span>').join('')+(a>=0&&b>=0?'<span class="gantt-bar '+(r.atRisk||r.overdue?'late':r.entry.status==='Done'?'done':'')+'" style="left:'+a/all.length*100+'%;width:'+(b-a+1)/all.length*100+'%" title="'+esc(r.start+' to '+r.finish)+'"></span>':'')+'</div>';}).join('')+'</div></div>'+(last>all.at(-1)?'<p>Timeline shows the first 366 days. Full dates appear below.</p>':'')+'<div class="gantt-scroll"><table><thead><tr><th>Task</th><th>Expected start</th><th>Expected finish</th><th>Deadline</th><th>Planning note</th></tr></thead><tbody>'+rows.map(r=>'<tr>'+[r.entry.title,r.start||'—',r.finish||'—',r.entry.due||'None',r.error||(r.atRisk?'At risk':r.blocked?'Waiting for prerequisites':'')].map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div></details>';
}
