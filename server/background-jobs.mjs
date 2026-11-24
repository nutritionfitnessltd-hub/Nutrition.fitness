import {randomUUID} from 'node:crypto';
import {HttpError} from './platform.mjs';
import {saveRecord} from './studio-store.mjs';
import {esc,form,hidden} from './studio-ui.mjs';

export const backgroundControlId=id=>'worker:content-manager:background-control-'+id;
const taskLink=value=>{
 try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='chatgpt.com'&&/^\/c\/[a-f0-9-]{36}$/.test(u.pathname)&&!u.username&&!u.password?u.origin+u.pathname:'';}catch{return '';}
};
export function backgroundJobState(control,now=Date.now()){
 const f=control?.fields?.backgroundJob;
 if(!f||f.runtime!=='chatgpt-cloud')return {label:'Cloud job not connected',active:false,pending:false};
 const pending=Boolean(f.requestId&&f.requestId!==f.acknowledgedRequestId);
 const age=now-Date.parse(f.heartbeatAt||'');
 const fresh=Number.isFinite(age)&&age>=0&&age<10*60*1000;
 const active=!pending&&f.state==='working'&&fresh;
 const label=pending?'Restart requested':active?'Working in ChatGPT cloud':({blocked:'Blocked — needs attention',completed:'Completed',waiting:'Waiting for next cloud run',paused:'Paused',preflight:'Cloud setup in progress'})[f.state]||(f.state==='working'?'No recent heartbeat — activity unconfirmed':'Cloud job not connected');
 return {label,active,pending,fresh};
}
export function backgroundJobPanel(project,data,now=Date.now()){
 if(!project?.studio?.productionTracking)return '';
 const control=data.backgroundControls?.get(project.id),f=control?.fields?.backgroundJob||{},status=backgroundJobState(control,now),href=taskLink(f.taskUrl);
 const enabled=data.actor.role==='admin'&&f.wakeEnabled===true&&Boolean(href)&&!status.pending;
 const time=Date.parse(f.heartbeatAt||f.reportedAt||'');
 const stamp=Number.isFinite(time)?new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',dateStyle:'medium',timeStyle:'short'}).format(time)+' London time':'No cloud heartbeat received';
 return '<section class="production-checkpoint background-job" data-worker-updates="background-job"><h2>Background job</h2><p role="status"><strong>'+esc(status.label)+'</strong></p>'+(f.stage?'<p>'+esc(f.stage)+'</p>':'')+'<p class="meta">'+esc(stamp)+'</p>'+(status.pending?'<p>The request is saved. It has not been acknowledged by the cloud worker yet.</p>':'')+(f.state==='blocked'&&f.blocker?'<p>'+esc(f.blocker)+'</p>':'')+'<div class="studio-actions">'+(href?'<a class="btn" href="'+esc(href)+'" target="_blank" rel="noopener noreferrer">Open ChatGPT job</a>':'')+(data.actor.role==='admin'?(enabled?form('background-restart',hidden('controlRevision',control?.revision||0),{section:'project',project:project.id},'Restart cloud job'):'<button type="button" disabled>'+(status.pending?'Restart requested':'Restart cloud job')+'</button>'):'')+'</div>'+(!f.wakeEnabled?'<p class="meta">Restart becomes available after the cloud schedule is connected. A saved request alone does not start work.</p>':'<p class="meta">Restart resumes from the last saved checkpoint when the cloud worker next wakes. Existing approved files are preserved.</p>')+'</section>';
}
export async function requestBackgroundRestart(params,fields,data,api,now=new Date()){
 if(data.actor.role!=='admin')throw new HttpError(403,'Only the administrator can restart background production.');
 const project=data.projects.find(p=>p.id===params.get('project'));
 if(!project?.studio?.productionTracking)throw new HttpError(404,'This production project is unavailable.');
 const id=backgroundControlId(project.id),rows=await api('/rest/v1/nufi_studio_items?id=eq.'+encodeURIComponent(id)+'&select=id,payload,revision&limit=1',{service:true});
 const row=rows?.[0],control=row?.payload,f=control?.fields?.backgroundJob;
 if(!control?.fields?.backgroundJobControl||f?.projectId!==project.id||f.runtime!=='chatgpt-cloud'||!f.wakeEnabled||!taskLink(f.taskUrl))throw new HttpError(409,'Connect the ChatGPT cloud schedule before restarting this job.');
 if(Number(fields.controlRevision)!==row.revision)throw new HttpError(409,'The cloud job changed. Reload before requesting a restart.');
 if(f.requestId&&f.requestId!==f.acknowledgedRequestId)return;
 await saveRecord(api,data.actor,{...control,fields:{...control.fields,backgroundJob:{...f,requestId:randomUUID(),requestedAt:now.toISOString(),requestedBy:data.actor.id}}},row.revision);
}
