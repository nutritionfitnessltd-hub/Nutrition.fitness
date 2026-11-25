import {human} from './team-message-store.mjs';
import {HttpError} from './platform.mjs';
import {esc,form,hidden} from './studio-ui.mjs';
const table='/rest/v1/nufi_team_working_hours',service={service:true};
export const dayNames=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
export function validateHours(fields){
 const zone=String(fields.timeZone||'');if(zone.length>100)throw new HttpError(400,'Choose your time zone.');
 try{new Intl.DateTimeFormat('en',{timeZone:zone}).format();}catch{throw new HttpError(400,'Choose a valid time zone.');}
 const days=dayNames.map((_,i)=>{if(fields['day'+i]!=='1')return null;const start=String(fields['start'+i]||''),end=String(fields['end'+i]||'');if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(end)||start===end)throw new HttpError(400,'Enter different start and finish times for each working day.');return {start,end};});
 return {time_zone:zone,days};
}
export async function ownHours(api,actor){human(actor);const [row]=await api(table+'?actor_id=eq.'+actor.id+'&select=actor_id,time_zone,days,revision',service);return row||null;}
export async function saveHours(api,actor,fields){
 human(actor);const value=validateHours(fields),revision=Number(fields.hoursRevision);if(!Number.isSafeInteger(revision)||revision<0)throw new HttpError(400,'Reload your working hours.');
 const rows=await api(table+(revision?'?actor_id=eq.'+actor.id+'&revision=eq.'+revision:'?on_conflict=actor_id'),{...service,method:revision?'PATCH':'POST',headers:{Prefer:revision?'return=representation':'resolution=ignore-duplicates,return=representation'},payload:{...value,revision:revision+1,...(revision?{}:{actor_id:actor.id})}});
 if(!rows.length)throw new HttpError(409,'Your working hours changed. Reload before saving.');
}
export async function sharedHours(api,people){try{const rows=await api(table+'?select=actor_id,time_zone,days',service);return rows.filter(r=>people.some(p=>p.id===r.actor_id)).map(r=>({id:r.actor_id,timeZone:r.time_zone,days:r.days}));}catch{return null;}}
export function hoursEditor(row,copy=false){
 if(copy)return '<section class="panel"><h2>Working hours</h2><p>Open your own My account to set working hours.</p></section>';
 const zones=[...new Set(['UTC','Europe/London',...(Intl.supportedValuesOf?.('timeZone')||[]),...(row?[row.time_zone]:[])])].sort();
 return '<section class="panel"><h2>Working hours</h2><p>Enter your usual hours in your own time zone. Team members see them converted to their local time, including daylight-saving changes.</p>'+form('account-hours',hidden('hoursRevision',row?.revision||0)+'<label>Your time zone<select name="timeZone" '+(!row?'data-zone-auto':'')+'>'+zones.map(z=>'<option value="'+esc(z)+'"'+(z===(row?.time_zone||'Europe/London')?' selected':'')+'>'+esc(z.replaceAll('_',' '))+'</option>').join('')+'</select></label><div class="working-hours-grid">'+dayNames.map((name,i)=>{const d=row?.days?.[i];return '<div><label><input type="checkbox" name="day'+i+'" value="1"'+(d?' checked':'')+'> '+name+'</label><label>From<input type="time" name="start'+i+'" value="'+esc(d?.start||'09:00')+'" aria-label="'+name+' start"></label><label>To<input type="time" name="end'+i+'" value="'+esc(d?.end||'17:00')+'" aria-label="'+name+' finish"></label></div>';}).join('')+'</div><p class="meta">Tick your working days. A finish before the start means the shift ends the next day. Untick every day to clear your hours. Hours are a guide, separate from online status.</p>',{section:'account'},'Save working hours')+'</section>';
}
