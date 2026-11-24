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
 if(f.schedulePresent!=='1')return; // Preserve schedules submitted through older task forms.
 const start=f.start||'',duration=f.duration===''?null:Number(f.duration),deps=String(f.dependencies||'').split(',').map(x=>x.trim()).filter(Boolean);
 if(start&&!validDate(start))throw new HttpError(400,'Choose a valid start date.');
 if(duration!==null&&(!Number.isInteger(duration)||duration<1||duration>365))throw new HttpError(400,'Duration must be 1–365 working days.');
 Object.assign(e,{start,duration,dependsOn:[...new Set(deps)]});validateDependencies(entries);
}
export function projectSchedule(p,today=todayLondon()){
 const byId=new Map(p.entries.map(e=>[e.id,e])),memo=new Map(),active=new Set();
 function calc(e){if(memo.has(e.id))return memo.get(e.id);if(active.has(e.id))return {error:'Circular dependency',blocked:true};active.add(e.id);
  const deps=(e.dependsOn||[]).map(id=>byId.get(id)),blocked=deps.some(d=>!d||d.status!=='Done');
  let start=validDate(e.start)?workStart(e.start):'',unknown=false,error='';
  for(const d of deps){if(!d){unknown=true;error='Dependency unavailable';continue;}const r=calc(d);if(r.error){unknown=true;error=r.error;}const end=d.status==='Done'?(validDate(d.completedAt?.slice(0,10))?d.completedAt.slice(0,10):r.finish):r.finish;if(!end){unknown=true;continue;}const earliest=workStart(next(end));if(start&&earliest>start)start=earliest;}
  // Forecast unfinished work from today; do not rewrite its committed due date.
  if(start&&e.status!=='Done'&&start<today)start=workStart(today);
  const duration=Number.isInteger(e.duration)&&e.duration>0?e.duration:null,finish=start&&duration&&!unknown?workFinish(start,duration):'';
  const overdue=e.status!=='Done'&&validDate(e.due)&&e.due<today,late=overdue?workDaysBetween(e.due,today):0,atRisk=e.status!=='Done'&&finish&&validDate(e.due)&&finish>e.due;
  const row={entry:e,start,finish,duration,blocked,overdue,late,atRisk,error,unscheduled:!finish};memo.set(e.id,row);active.delete(e.id);return row;
 }return p.entries.map(calc);
}
export function schedulingInputs(p,e={}){return '<fieldset class="task-scheduling"><legend>Schedule · Monday–Friday</legend>'+hidden('schedulePresent','1')+input('start','Earliest start',e.start||'','date')+input('duration','Days to complete (working days)',e.duration??'','number','min="1" max="365" step="1"')+'<label>Depends on (finish before this starts)<select name="dependencyPicker" multiple size="4" data-dependency-picker>'+p.entries.filter(t=>t.id!==e.id).map(t=>'<option value="'+esc(t.id)+'"'+((e.dependsOn||[]).includes(t.id)?' selected':'')+'>'+esc(t.title)+'</option>').join('')+'</select></label><input type="hidden" name="dependencies" data-dependency-value value="'+esc((e.dependsOn||[]).join(','))+'"><small>Select multiple tasks with Ctrl / Command. Saturdays and Sundays do not count; bank holidays are not excluded.</small></fieldset>';}
export function taskScheduleSummary(p,e){const r=projectSchedule(p).find(r=>r.entry.id===e.id);return '<div class="task-schedule-summary">'+(r.duration?'<span>'+r.duration+' working day'+(r.duration===1?'':'s')+'</span>':'<span>Duration not set</span>')+(r.finish?'<span>Forecast finish '+esc(r.finish)+'</span>':'<span>Schedule not set</span>')+(r.overdue?'<strong class="schedule-late">Overdue'+(r.late?' · '+r.late+' working day'+(r.late===1?'':'s')+' late':'')+'</strong>':'')+(r.blocked?'<strong class="schedule-blocked">Blocked by dependency</strong>':'')+(r.atRisk?'<strong class="schedule-late">Forecast after due date</strong>':'')+(r.error?'<strong>'+esc(r.error)+'</strong>':'')+'</div>';}
export function ganttPanel(p){
 const rows=projectSchedule(p),dates=rows.flatMap(r=>[r.start,r.finish,validDate(r.entry.due)?r.entry.due:'']).filter(Boolean),today=todayLondon();
 if(!rows.length)return '';
 dates.push(today);const from=dates.reduce((a,b)=>a<b?a:b),last=dates.reduce((a,b)=>a>b?a:b),all=[];for(let s=from;s<=last&&all.length<366;s=next(s))all.push(s);
 const clipped=last>all.at(-1),width=Math.max(900,all.length*30),positions=new Map(all.map((d,i)=>[d,i]));
 return '<section class="panel project-gantt"><h2>Project timeline · Gantt chart</h2><p>Monday–Friday working days. Shaded columns are weekends. Due dates stay fixed; forecasts reflect unfinished dependencies. Duration is the full task estimate, not time remaining.</p><details><summary>Timeline and dependency table</summary><div class="gantt-scroll"><div style="min-width:'+width+'px"><div class="gantt-dates">'+all.map(d=>'<span style="background:'+(working(d)?'#fff':'#edf0f2')+'" title="'+d+'">'+esc(d.slice(5))+'</span>').join('')+'</div>'+rows.map(r=>{const a=positions.get(r.start),b=r.finish?(positions.get(r.finish)??all.length-1):undefined;return '<div class="gantt-label">'+esc(r.entry.title)+(r.entry.status==='Done'?' · Done':r.overdue?' · Overdue':r.blocked?' · Blocked':'')+'</div><div class="gantt-track" style="--columns:'+all.length+'">'+all.map(d=>'<span class="gantt-day '+(!working(d)?'weekend ':'')+(d===today?'today':'')+'"></span>').join('')+(a!==undefined&&b!==undefined?'<span class="gantt-bar '+(r.overdue||r.atRisk?'late':r.entry.status==='Done'?'done':'')+'" style="left:'+a/all.length*100+'%;width:'+Math.max(1,b-a+1)/all.length*100+'%" title="'+esc(r.start+' to '+r.finish)+'">'+r.duration+'d</span>':'')+'</div>';}).join('')+'</div></div>'+(clipped?'<p>Chart limited to the first 366 calendar days; the full dates are in the table.</p>':'')+'<div class="gantt-scroll"><table><thead><tr><th>Task</th><th>Depends on</th><th>Days</th><th>Forecast start</th><th>Forecast finish</th><th>Due</th><th>Flags</th></tr></thead><tbody>'+rows.map(r=>'<tr>'+[r.entry.title,(r.entry.dependsOn||[]).map(id=>p.entries.find(e=>e.id===id)?.title||'Unavailable task').join(', ')||'None',r.duration??'Not set',r.start||'Not set',r.finish||'Not set',r.entry.due||'Not set',[r.overdue?'Overdue':'',r.blocked?'Blocked':'',r.atRisk?'At risk':'',r.error].filter(Boolean).join(' · ')||'—'].map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div></details></section>';
}
