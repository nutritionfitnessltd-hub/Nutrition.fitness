import { createHash, randomUUID } from 'node:crypto';
import { HttpError, email } from './platform.mjs';
import { itemTable, saveRecord } from './studio-store.mjs';
import { esc, url, heading, form, hidden, input, button } from './studio-ui.mjs';
import { brandKit } from './studio-brand.mjs';

const settingsId='studio:notifications';
export const notificationPrefix='studio:notification:';
const sender='notifications@nutrition.fitness';
const defaults={enabled:false,reviewer:'kasia@nutrition.fitness'};
const adminOnly=actor=>{if(actor.role!=='admin')throw new HttpError(403,'Administrator access is required.');};
export const notificationSettings=data=>({...defaults,...data.byId.get(settingsId)?.fields});
export function exchangeConfigured(env){return ['EXCHANGE_TENANT_ID','EXCHANGE_CLIENT_ID','EXCHANGE_CLIENT_SECRET'].every(k=>Boolean(env[k]?.trim()));}
const recordUrl=id=>itemTable+'?id=eq.'+encodeURIComponent(id)+'&select=id,payload,revision,updated_at';
const recordFrom=row=>row?{...row.payload,revision:row.revision}:null;
async function findRecord(api,id){return recordFrom((await api(recordUrl(id),{service:true}))[0]);}
function notificationLink(env,section,values){
  let base;try{base=new URL(env.NUFI_NOTIFICATION_BASE_URL||'https://nutrition-fitness-website-2.vercel.app');}catch{throw new HttpError(503,'Check the workspace address in the email connection.');}
  if(base.protocol!=='https:'||base.username||base.password)throw new HttpError(503,'The notification workspace address must use HTTPS.');
  return base.origin+url(section,values).replaceAll('&amp;','&');
}
export function notificationHtml({title,message,link}){
  return '<!doctype html><html lang="en-GB"><body style="margin:0;background:#ffffff;color:#092A3E;font-family:Arial,sans-serif"><table role="presentation" style="max-width:600px;width:100%;margin:auto;padding:32px"><tr><td><p style="font-size:24px;font-weight:bold">nutrition.fitness</p><h1 style="font-size:24px">'+esc(title)+'</h1><p>'+esc(message)+'</p><p style="margin:28px 0"><a href="'+esc(link)+'" style="background:#06475E;color:#ffffff;text-decoration:none;padding:14px 20px;border-radius:6px;display:inline-block">Open in Content workspace</a></p><p style="font-size:13px;color:#536572">Sign in to view this work. Real food. Real progress. A fitter, happier you.</p></td></tr></table></body></html>';
}
// A failed token request cannot send mail. A timed-out send can, so its result is unknown.
export async function sendExchange(env,notification,fetcher=fetch){
  if(!exchangeConfigured(env))return {state:'failed',detail:'Microsoft 365 is not connected.'};
  if(!/^[a-zA-Z0-9.-]+$/.test(env.EXCHANGE_TENANT_ID))return {state:'failed',detail:'Check the Microsoft tenant ID.'};
  let token;
  try{
    const response=await fetcher('https://login.microsoftonline.com/'+encodeURIComponent(env.EXCHANGE_TENANT_ID)+'/oauth2/v2.0/token',{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.EXCHANGE_CLIENT_ID,client_secret:env.EXCHANGE_CLIENT_SECRET,grant_type:'client_credentials',scope:'https://graph.microsoft.com/.default'}).toString(),signal:AbortSignal.timeout(15000)
    });
    if(!response.ok){
      // Only expose Microsoft's numeric diagnostic code, never its free-form response.
      const failure=await response.json().catch(()=>null);
      const code=Array.isArray(failure?.error_codes)?failure.error_codes.find(value=>Number.isSafeInteger(value)&&value>0&&value<100000000):null;
      return {state:'failed',detail:'Microsoft sign-in failed'+(code?' (AADSTS'+code+')':'')+'. Check the app credentials and authorisation.'};
    }
    token=(await response.json()).access_token;
    if(!token)return {state:'failed',detail:'Microsoft did not provide an access token.'};
  }catch{return {state:'failed',detail:'Could not connect to Microsoft. No email was sent.'};}
  try{
    const response=await fetcher('https://graph.microsoft.com/v1.0/users/'+encodeURIComponent(sender)+'/sendMail',{
      method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({message:{subject:notification.title,body:{contentType:'HTML',content:notificationHtml(notification)},toRecipients:[{emailAddress:{address:email(notification.recipient)}}],internetMessageHeaders:[{name:'x-nufi-notification-id',value:notification.id}]},saveToSentItems:true}),signal:AbortSignal.timeout(15000)
    });
    if(response.status===202)return {state:'accepted',detail:'Accepted by Microsoft 365.'};
    if(response.status>=500)return {state:'unknown',detail:'Microsoft returned an uncertain result. Check the sender’s Sent Items before sending again.'};
    return {state:'failed',detail:response.status===403?'Microsoft has not authorised this app to send from '+sender+'.':'Microsoft did not accept this email (HTTP '+response.status+').'};
  }catch{return {state:'unknown',detail:'The send request timed out. Check the sender’s Sent Items; it may have been sent.'};}
}
export async function deliverNotification({api,actor,env,event,fetcher=fetch,retry=false}){
  const id=notificationPrefix+createHash('sha256').update(event.key).digest('hex');
  let record=await findRecord(api,id);
  if(!record){
    const fields={...event,recipient:email(event.recipient),state:'queued',createdAt:new Date().toISOString()};
    try{const saved=await saveRecord(api,actor,{id,kind:'notification',title:event.title,status:'Draft',fields},0);record=recordFrom(saved);}
    catch(error){if(error.status!==409)throw error;record=await findRecord(api,id);}
  }
  if(!record)throw new HttpError(503,'The notification could not be recorded.');
  if(record.fields.state!=='queued'&&!(retry&&record.fields.state==='failed'))return record.fields.state;
  // Claim before sending. Concurrent requests and repeated POSTs cannot send the same event twice.
  const sending={...record,fields:{...record.fields,state:'sending',attemptedAt:new Date().toISOString()}};delete sending.revision;
  let claimed;
  try{claimed=await saveRecord(api,actor,sending,record.revision);}catch(error){if(error.status===409)return 'sending';throw error;}
  const result=await sendExchange(env,{...sending.fields,id},fetcher);
  await saveRecord(api,actor,{...sending,fields:{...sending.fields,...result}},claimed.revision);
  return result.state;
}
export function workflowNotifications(params,f,data,env){
  const settings=notificationSettings(data);if(!settings.enabled)return [];
  const events=[],person=id=>data.people.find(p=>p.id===id);
  const add=(recipient,key,title,message,section,values)=>{if(recipient)events.push({recipient,key,title,message,link:notificationLink(env,section,values)});};
  const project=data.projects.find(p=>p.id===params.get('project'));
  if(f.action==='project-create')add(person(f.creator)?.email,'assigned:'+f.id+':0','New work: '+f.name,'You have been assigned '+f.name+'.','project',{project:f.id});
  if(f.action==='project-save'&&project){
    if(f.creator&&f.creator!==project.creator_id)add(person(f.creator)?.email,'assigned:'+project.id+':'+project.revision,'New work: '+f.name,'You have been assigned '+f.name+'.','project',{project:project.id});
    if(f.status==='Ready for review'&&project.status!==f.status)add(settings.reviewer,'project-review:'+project.id+':'+project.revision,'Ready for review: '+project.name,'Please review the finished work.','project',{project:project.id});
  }
  if(f.action==='task-save'&&project){
    const task=project.entries.find(e=>e.id===f.entry);
    if(task&&task.status!==f.status){
      if(f.status==='Ready for review')add(settings.reviewer,'task-review:'+project.id+':'+project.revision,'Ready for review: '+f.title,'Please review this task.','project',{project:project.id,week:f.week});
      if(['Changes requested','Done'].includes(f.status))add(person(project.creator_id)?.email,'task-result:'+project.id+':'+project.revision,f.status+': '+f.title,'The review of your task has been updated.','project',{project:project.id,week:f.week});
    }
  }
  const record=data.byId.get(params.get('id'));
  const status=f.action==='content-review'?f.status:f.action==='content-save'?({review:'In review',approve:'Approved'}[f.intent]):null;
  if(record&&status&&(status!==record.status||f.action==='content-save')){
    const key='content-review:'+record.id+':'+record.revision;
    if(status==='In review')add(settings.reviewer,key,'Please review: '+(f.title||record.title),'This content is ready for your review.','item',{id:record.id,tab:'preview'});
    if(['Changes requested','Approved'].includes(status)){
      const people=new Set(data.projects.filter(p=>p.studio?.allowedIds?.includes(record.id)||p.entries.some(e=>e.record===record.id||e.scopeIds?.includes(record.id))).map(p=>person(p.creator_id)?.email).filter(Boolean));
      for(const recipient of people)add(recipient,key+':'+recipient,status+': '+record.title,'The review of your content has been updated.','item',{id:record.id,tab:'preview'});
    }
  }
  return events;
}
export async function notifyWorkflow(events,context){
  let failed=false;
  for(const event of events){try{const state=await deliverNotification({...context,event});if(state!=='accepted')failed=true;}catch{failed=true;}}
  return failed;
}
export async function connectionsPage(data,env,api,params){
  adminOnly(data.actor);
  const settings=notificationSettings(data),r=data.byId.get(settingsId),configured=exchangeConfigured(env);
  const rows=await api(itemTable+'?id=like.studio:notification:*&select=id,payload,revision,updated_at&order=updated_at.desc&limit=12',{service:true});
  const statuses={queued:'Waiting',sending:'Sending / check Sent Items',accepted:'Accepted by Microsoft',failed:'Not sent',unknown:'Check Sent Items'};
  return heading('Connections','Manage the services used by your workspace.')+
    (params.get('saved')?'<p role="status">Notification settings saved.</p>':'')+
    (params.get('mail')?'<p role="status">'+esc(statuses[params.get('mail')]||'Check the recent email activity below.')+'</p>':'')+
    '<section class="panel"><h2>Email notifications</h2><p><strong>Microsoft 365 · '+(configured?'Ready to test':'Not connected')+'</strong></p><p>From '+sender+'</p>'+(!configured?'<p>Authorise your Microsoft 365 sender to turn on notifications.</p>':'')+
    form('notifications-save',hidden('revision',r?.revision||0)+'<label class="check"><input type="checkbox" name="enabled" value="yes"'+(settings.enabled?' checked':'')+(!configured?' disabled':'')+'> Send workflow notifications</label>'+input('reviewer','Send review requests to',settings.reviewer,'email','required maxlength="254"')+'<p class="meta">Email the assigned person when work is assigned, the approver when work is ready, and the creator when a review is finished. Saving a draft does not send an email.</p>',{section:'connections'},'Save settings')+
    (configured?'<details><summary>Send a test email</summary>'+form('notifications-test',hidden('requestId',randomUUID())+input('recipient','Send to','james@nutrition.fitness','email','required'),{section:'connections'},'Send test email')+'</details>':'')+
    '<details><summary>Microsoft 365 setup</summary><p>Use a Microsoft Entra app authorised to send from '+sender+'. Scope its Exchange permission to this mailbox.</p><p>Add the tenant ID, app ID and client secret in this project’s Vercel environment settings as <code>EXCHANGE_TENANT_ID</code>, <code>EXCHANGE_CLIENT_ID</code> and <code>EXCHANGE_CLIENT_SECRET</code>. Keep the secret in Vercel, then redeploy and send a test.</p><p>'+button('Open Vercel settings','https://vercel.com/nufi2/nutrition-fitness-website-2/settings/environment-variables')+'</p></details>'+
    (rows.length?'<details><summary>Recent email activity</summary><ul class="studio-list">'+rows.map(row=>{const f=row.payload.fields;return '<li><div><strong>'+esc(row.payload.title)+'</strong><small>'+esc(f.recipient)+' · '+esc(statuses[f.state]||f.state)+' · '+esc(row.updated_at?.slice(0,16).replace('T',' '))+'</small><p>'+esc(f.detail||'')+'</p>'+(f.state==='failed'?form('notifications-retry',hidden('notification',row.id),{section:'connections'},'Retry email'):'')+'</div></li>';}).join('')+'</ul><p class="meta">Accepted means Microsoft has queued the email. Delivery can take a moment. Uncertain sends are not retried automatically.</p></details>':'')+'</section>'+
    '<section class="panel"><h2>Other connections</h2><p>OpenAI drafting · '+(env.OPENAI_API_KEY?'Connected':'Not connected')+'</p><p>Canva · '+button('Open brand kit',brandKit)+'</p><p>App publishing · Import format awaiting confirmation</p></section>';
}
export async function changeNotifications(f,data,api,env,fetcher){
  adminOnly(data.actor);
  if(f.action==='notifications-save'){
    if(f.enabled==='yes'&&!exchangeConfigured(env))throw new HttpError(400,'Connect Microsoft 365 before turning on notifications.');
    await saveRecord(api,data.actor,{id:settingsId,kind:'settings',title:'Email notifications',status:'Draft',fields:{enabled:f.enabled==='yes',reviewer:email(f.reviewer)}},Number(f.revision));
    return {saved:'1'};
  }
  if(f.action==='notifications-test'){
    if(!/^[a-f0-9-]{36}$/i.test(f.requestId||''))throw new HttpError(400,'Reopen the test email form.');
    const event={key:'test:'+f.requestId,recipient:email(f.recipient),title:'Your Content workspace email is connected',message:'This is a test notification from nutrition.fitness.',link:notificationLink(env,'connections',{})};
    return {mail:await deliverNotification({api,actor:data.actor,env,event,fetcher})};
  }
  if(f.action==='notifications-retry'){
    if(!/^studio:notification:[a-f0-9]{64}$/.test(f.notification||''))throw new HttpError(400,'Choose a notification from recent activity.');
    const record=await findRecord(api,f.notification);
    if(!record||record.fields.state!=='failed')throw new HttpError(409,'Only emails confirmed as not sent can be retried.');
    return {mail:await deliverNotification({api,actor:data.actor,env,event:record.fields,fetcher,retry:true})};
  }
  throw new HttpError(400,'Choose a notification action.');
}
