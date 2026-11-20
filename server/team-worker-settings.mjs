import {esc,form,hidden,textarea,input,select} from './studio-ui.mjs';
import {workers} from './studio-workers.mjs';
import {HttpError} from './platform.mjs';
const weekdays={0:'Sunday',1:'Monday',2:'Tuesday',3:'Wednesday',4:'Thursday',5:'Friday',6:'Saturday'};
export function workerSettingsPanel(key,settings,error,fallbackPrompt){
 if(!settings?.employee)return '<section class="team-profile-section"><h2>AI prompt &amp; schedule</h2><p role="alert">'+esc(error||'James HQ settings are unavailable. Reopen this profile to retry.')+'</p>'+(fallbackPrompt?'<h3>Saved AI instructions · read only</h3><p class="prose">'+esc(fallbackPrompt)+'</p>':'')+'</section>';
 const destination={section:'team',tab:'workers',worker:key},identity=hidden('worker',key);
 const editor=r=>{const cadences={daily:'Daily',weekly:'Weekly',hourly:'Hourly','hours:2':'Every 2 hours','hours:4':'Every 4 hours','hours:6':'Every 6 hours','hours:12':'Every 12 hours'};if(r.cadence&&!cadences[r.cadence])cadences[r.cadence]='Current schedule · '+r.cadence;
 return form('team-worker-routine-save',identity+(r.id?hidden('routineId',r.id)+hidden('version',r.version):'')+textarea('title','Task brief',r.title||'',3)+select('cadence','Repeat',cadences,r.cadence||'daily')+input('time','Time · Europe/London',r.time||'09:00','time','required')+select('weekday','Weekday · for weekly schedules',weekdays,r.weekday??1)+select('priority','Priority',{Normal:'Normal',High:'High'},r.priority||'Normal'),destination,r.id?'Save schedule':'Add schedule');};
 const routines=(settings.routines||[]).map(r=>'<section class="panel"><p><strong>'+ (r.enabled?'Active':'Paused')+'</strong> · Next run: '+esc(r.nextRunAt?new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/London'}).format(new Date(r.nextRunAt)):'Not scheduled')+' · London time</p>'+editor(r)+form('team-worker-routine-toggle',identity+hidden('routineId',r.id)+hidden('version',r.version)+hidden('enabled',r.enabled?'no':'yes'),destination,r.enabled?'Pause schedule':'Resume schedule')+'</section>').join('');
 return '<section class="team-profile-section"><h2>AI prompt</h2><p class="meta">These instructions are saved to this worker in James HQ.</p>'+form('team-worker-prompt-save',identity+hidden('version',settings.organisationVersion)+textarea('instructions','AI instructions',settings.employee.instructions||'',7).replace('<textarea ', '<textarea maxlength="4000" '),destination,'Save AI prompt')+'</section><section class="team-profile-section"><h2>Schedule</h2><p class="meta">All times use Europe/London. Saving a new schedule enables its recurring task in James HQ.</p>'+(routines||'<p>No schedules set for this worker.</p>')+'<details><summary>Add a schedule</summary>'+editor({})+'</details></section>';
}
export function workerSettingsCommand(f){
 if(!Object.hasOwn(workers,f.worker))throw new HttpError(400,'Choose a worker.');
 const base={worker:f.worker},version=Number(f.version);
 if(f.action==='team-worker-prompt-save'){
  if(!Number.isSafeInteger(version)||version<1||typeof f.instructions!=='string'||f.instructions.length>4000)throw new HttpError(400,'Use AI instructions up to 4,000 characters and reopen the profile before saving.');
  return {...base,action:'worker-prompt-save',version,instructions:f.instructions};
 }
 if(!['team-worker-routine-save','team-worker-routine-toggle'].includes(f.action))throw new HttpError(400,'Choose a worker setting.');
 if(f.routineId&&(typeof f.routineId!=='string'||f.routineId.length>200||!Number.isSafeInteger(version)||version<0))throw new HttpError(400,'Reopen this schedule before saving.');
 if(f.action==='team-worker-routine-toggle'){
  if(!f.routineId||!['yes','no'].includes(f.enabled))throw new HttpError(400,'Choose a schedule and state.');return {...base,action:'worker-routine-toggle',routineId:f.routineId,version,enabled:f.enabled==='yes'};
 }
 if(typeof f.title!=='string'||!f.title.trim()||f.title.length>3000||typeof f.cadence!=='string'||f.cadence.length>250||!/^([01]\d|2[0-3]):[0-5]\d$/.test(f.time||'')||!Number.isInteger(Number(f.weekday))||Number(f.weekday)<0||Number(f.weekday)>6||!['Normal','High'].includes(f.priority))throw new HttpError(400,'Complete the task brief, repeat schedule, London time and priority.');
 return {...base,action:'worker-routine-save',...(f.routineId?{routineId:f.routineId,version}:{}),title:f.title.trim(),cadence:f.cadence,time:f.time,weekday:Number(f.weekday),priority:f.priority};
}
