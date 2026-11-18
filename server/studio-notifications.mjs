import { createHash, randomUUID } from 'node:crypto';
import { HttpError, email } from './platform.mjs';
import { itemTable, saveRecord } from './studio-store.mjs';
import { esc, url, heading, form, hidden, input, button } from './studio-ui.mjs';
import { openWelcomeMessage, welcomeRecipient } from './studio-mail-private.mjs';
import { brandKit } from './studio-brand.mjs';

const settingsId='studio:notifications';
export const notificationPrefix='studio:notification:';
const sender='notifications@nutrition.fitness';
const adminOnly=actor=>{if(actor.role!=='admin')throw new HttpError(403,'Administrator access is required.');};
const reviewerList=values=>[...new Set(values.map(value=>email(value)))];
export function notificationSettings(data){
  const fields=data.byId.get(settingsId)?.fields||{};
  return {enabled:fields.enabled===true,reviewers:reviewerList(Array.isArray(fields.reviewers)?fields.reviewers:[fields.reviewer||'kasia@nutrition.fitness'])};
}
function reviewerSelector(data,settings){
  const selected=new Set(settings.reviewers),people=new Map();
  for(const person of data.people||[]){
    try{const address=email(person.email);if(!people.has(address))people.set(address,person.name||address);}catch{}
  }
  for(const address of selected)if(!people.has(address))people.set(address,address);
  return hidden('reviewersVersion','1')+'<fieldset class="notification-reviewers"><legend>Send review requests to</legend><p class="meta" id="reviewer-help">Select everyone who should receive a review request.</p><div class="notification-reviewer-options">'+
    [...people].map(([address,name],i)=>'<label class="check"><input type="checkbox" name="reviewer_'+i+'" value="'+esc(address)+'"'+(selected.has(address)?' checked':'')+' aria-describedby="reviewer-help"><span>'+esc(name)+(name!==address?'<small>'+esc(address)+'</small>':'')+'</span></label>').join('')+
    '</div><details><summary>Add other email addresses</summary>'+input('additionalReviewers','Email addresses','','text','maxlength="6600" placeholder="name@example.com, another@example.com"')+'<p class="meta">Separate addresses with commas. They will appear in the list after saving.</p></details></fieldset>';
}
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
  return '<!doctype html><html lang="en-GB"><body style="margin:0;background:#ffffff;color:#092A3E;font-family:Arial,sans-serif"><table role="presentation" style="max-width:600px;width:100%;margin:auto;padding:32px"><tr><td><p style="font-size:24px;font-weight:bold">nutrition.fitness</p><h1 style="font-size:24px">'+esc(title)+'</h1><p style="white-space:pre-line">'+esc(message)+'</p><p style="margin:28px 0"><a href="'+esc(link)+'" style="background:#06475E;color:#ffffff;text-decoration:none;padding:14px 20px;border-radius:6px;display:inline-block">Open in Content workspace</a></p><p style="font-size:13px;color:#536572">Sign in to view this work. Real food. Real progress. A fitter, happier you.</p></td></tr></table></body></html>';
}
// A failed token request cannot send mail. A timed-out send can, so its result is unknown.
export async function sendExchange(env,notification,fetcher=fetch){
  if(!exchangeConfigured(env))return {state:'failed',detail:'Microsoft 365 is not connected.'};
  if(!/^[a-zA-Z0-9.-]+$/.test(env.EXCHANGE_TENANT_ID))return {state:'failed',detail:'Check the Microsoft tenant ID.'};
  let message=notification;
  if(notification.type==='welcome'){
    try{message={...notification,message:openWelcomeMessage(env,notification)};}
    catch{return {state:'cancelled',detail:'This welcome message is unavailable. Prepare a new welcome email.'};}
  }
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
      body:JSON.stringify({message:{subject:notification.title,body:{contentType:'HTML',content:notificationHtml(message)},toRecipients:[{emailAddress:{address:email(notification.recipient)}}],internetMessageHeaders:[{name:'x-nufi-notification-id',value:notification.id}]},saveToSentItems:true}),signal:AbortSignal.timeout(15000)
    });
    if(response.status===202)return {state:'accepted',detail:'Accepted by Microsoft 365.'};
    if(response.status>=500)return {state:'unknown',detail:'Microsoft returned an uncertain result. Check the sender’s Sent Items before sending again.'};
    const failure=await response.json().catch(()=>null);
    const safeCode=['ErrorAccessDenied','Authorization_RequestDenied','ErrorSendAsDenied','InvalidAuthenticationToken','MailboxNotEnabledForRESTAPI'].includes(failure?.error?.code)?' ('+failure.error.code+')':'';
    return {state:'failed',detail:response.status===403?'Microsoft sign-in succeeded, but sending from '+sender+' is not authorised'+safeCode+'. An Exchange administrator must complete the mailbox-scoped Application Mail.Send permission.':'Microsoft did not accept this email (HTTP '+response.status+')'+safeCode+'.'};
  }catch{return {state:'unknown',detail:'The send request timed out. Check the sender’s Sent Items; it may have been sent.'};}
}
export async function deliverNotification({api,actor,env,event,fetcher=fetch,retry=false,returnResult=false}){
  const answer=fields=>returnResult?{state:fields.state,detail:fields.detail||'The send result is not yet confirmed. Check recent email activity before sending again.'}:fields.state;
  const id=notificationPrefix+createHash('sha256').update(event.key).digest('hex');
  let record=await findRecord(api,id);
  if(!record){
    const fields={...event,recipient:email(event.recipient),state:'queued',createdAt:new Date().toISOString()};
    try{const saved=await saveRecord(api,actor,{id,kind:'notification',title:event.title,status:'Draft',fields},0);record=recordFrom(saved);}
    catch(error){if(error.status!==409)throw error;record=await findRecord(api,id);}
  }
  if(!record)throw new HttpError(503,'The notification could not be recorded.');
  if(record.fields.state!=='queued'&&!(retry&&record.fields.state==='failed'))return answer(record.fields);
  // Claim before sending. Concurrent requests and repeated POSTs cannot send the same event twice.
  const sending={...record,title:event.type==='welcome'&&record.fields.state==='failed'?event.title:record.title,fields:{...record.fields,...(retry&&record.fields.state==='failed'&&event.type==='welcome'?event:{}),state:'sending',attemptedAt:new Date().toISOString()}};delete sending.revision;
  let claimed;
  try{claimed=await saveRecord(api,actor,sending,record.revision);}catch(error){if(error.status===409)return answer({state:'sending'});throw error;}
  let result;
  if(sending.fields.type==='welcome'){
    try{await welcomeRecipient(api,env,sending.fields);}
    catch(error){if(error.status!==409)throw error;result={state:'cancelled',detail:error.message};}
  }
  result ||= await sendExchange(env,{...sending.fields,id},fetcher);
  const fields={...sending.fields,...result};
  if(fields.type==='welcome'&&result.state!=='failed')delete fields.encryptedMessage;
  await saveRecord(api,actor,{...sending,fields},claimed.revision);
  return answer(fields);
}
export function workflowNotifications(params,f,data,env){
  const settings=notificationSettings(data);if(!settings.enabled)return [];
  const events=[],person=id=>data.people.find(p=>p.id===id);
  const add=(recipient,key,title,message,section,values)=>{if(recipient)events.push({recipient,key,title,message,link:notificationLink(env,section,values)});};
  const review=(key,...details)=>{for(const recipient of settings.reviewers)add(recipient,key+':'+recipient,...details);};
  const project=data.projects.find(p=>p.id===params.get('project'));
  if(f.action==='project-create')add(person(f.creator)?.email,'assigned:'+f.id+':0','New work: '+f.name,'You have been assigned '+f.name+'.','project',{project:f.id});
  if(f.action==='project-save'&&project){
    if(f.creator&&f.creator!==project.creator_id)add(person(f.creator)?.email,'assigned:'+project.id+':'+project.revision,'New work: '+f.name,'You have been assigned '+f.name+'.','project',{project:project.id});
    if(f.status==='Ready for review'&&project.status!==f.status)review('project-review:'+project.id+':'+project.revision,'Ready for review: '+project.name,'Please review the finished work.','project',{project:project.id});
  }
  if(f.action==='task-save'&&project){
    const task=project.entries.find(e=>e.id===f.entry);
    if(task&&task.status!==f.status){
      if(f.status==='Ready for review')review('task-review:'+project.id+':'+project.revision,'Ready for review: '+f.title,'Please review this task.','project',{project:project.id,week:f.week});
      if(['Changes requested','Done'].includes(f.status))add(person(project.creator_id)?.email,'task-result:'+project.id+':'+project.revision,f.status+': '+f.title,'The review of your task has been updated.','project',{project:project.id,week:f.week});
    }
  }
  const record=data.byId.get(params.get('id'));
  const status=f.action==='content-review'?f.status:f.action==='content-save'?({review:'In review',approve:'Approved'}[f.intent]):null;
  if(record&&status&&(status!==record.status||f.action==='content-save')){
    const key='content-review:'+record.id+':'+record.revision;
    if(status==='In review')review(key,'Please review: '+(f.title||record.title),'This content is ready for your review.','item',{id:record.id,tab:'preview'});
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
  const statuses={queued:'Waiting',sending:'Sending / check Sent Items',accepted:'Accepted by Microsoft',failed:'Not sent',unknown:'Check Sent Items',cancelled:'Prepare fresh welcome details'};
  return heading('Connections','Manage the services used by your workspace.')+
    (params.get('saved')?'<p role="status">Notification settings saved.</p>':'')+
    (params.get('mail')?'<p role="status">'+esc(statuses[params.get('mail')]||'Check the recent email activity below.')+'</p>':'')+
    '<section class="panel"><h2>Email notifications</h2><p><strong>Microsoft 365 · '+(configured?'Ready to test':'Not connected')+'</strong></p><p>From '+sender+'</p>'+(!configured?'<p>Authorise your Microsoft 365 sender to turn on notifications.</p>':'')+
    form('notifications-save',hidden('revision',r?.revision||0)+'<label class="check"><input type="checkbox" name="enabled" value="yes"'+(settings.enabled?' checked':'')+(!configured?' disabled':'')+'> Send workflow notifications</label>'+reviewerSelector(data,settings)+'<p class="meta">Email the assigned person when work is assigned, the selected reviewers when work is ready, and the creator when a review is finished. Saving a draft does not send an email.</p>',{section:'connections'},'Save settings')+
    (configured?'<details><summary>Send a test email</summary>'+form('notifications-test',hidden('requestId',randomUUID())+input('recipient','Send to','james@nutrition.fitness','email','required'),{section:'connections'},'Send test email')+'</details>':'')+
    '<details><summary>Microsoft 365 setup</summary><p>Use a Microsoft Entra app authorised to send from '+sender+'. Scope its Exchange permission to this mailbox.</p><p>Add the tenant ID, app ID and client secret in this project’s Vercel environment settings as <code>EXCHANGE_TENANT_ID</code>, <code>EXCHANGE_CLIENT_ID</code> and <code>EXCHANGE_CLIENT_SECRET</code>. Keep the secret in Vercel, then redeploy and send a test.</p><p>'+button('Open Vercel settings','https://vercel.com/nufi2/nutrition-fitness-website-2/settings/environment-variables')+'</p></details>'+
    (rows.length?'<details><summary>Recent email activity</summary><ul class="studio-list">'+rows.map(row=>{const f=row.payload.fields;return '<li><div><strong>'+esc(row.payload.title)+'</strong><small>'+esc(f.recipient)+' · '+esc(statuses[f.state]||f.state)+' · '+esc(row.updated_at?.slice(0,16).replace('T',' '))+'</small><p>'+esc(f.detail||'')+'</p>'+(f.state==='failed'?form('notifications-retry',hidden('notification',row.id),{section:'connections'},'Retry email'):'')+'</div></li>';}).join('')+'</ul><p class="meta">Accepted means Microsoft has queued the email. Delivery can take a moment. Uncertain sends are not retried automatically.</p></details>':'')+'</section>'+
    '<section class="panel"><h2>Other connections</h2><p>OpenAI drafting · '+(env.OPENAI_API_KEY?'Connected':'Not connected')+'</p><p>Canva · '+button('Open brand kit',brandKit)+'</p><p>App publishing · Import format awaiting confirmation</p></section>';
}
export async function changeNotifications(f,data,api,env,fetcher){
  adminOnly(data.actor);
  if(f.action==='notifications-save'){
    if(f.enabled==='yes'&&!exchangeConfigured(env))throw new HttpError(400,'Connect Microsoft 365 before turning on notifications.');
    const values=f.reviewersVersion==='1'?[...Object.entries(f).filter(([key])=>/^reviewer_\d+$/.test(key)).map(([,value])=>value),...String(f.additionalReviewers||'').split(/[,;\n]/).map(value=>value.trim()).filter(Boolean)]:[f.reviewer];
    const reviewers=reviewerList(values);
    if(reviewers.length>25)throw new HttpError(400,'Choose up to 25 review recipients.');
    if(f.enabled==='yes'&&!reviewers.length)throw new HttpError(400,'Select at least one person to receive review requests.');
    await saveRecord(api,data.actor,{id:settingsId,kind:'settings',title:'Email notifications',status:'Draft',fields:{enabled:f.enabled==='yes',reviewers}},Number(f.revision));
    return {saved:'1'};
  }
  if(f.action==='notifications-test'){
    if(!/^[a-f0-9-]{36}$/i.test(f.requestId||''))throw new HttpError(400,'Reopen the test email form.');
    const event={key:'test:'+f.requestId,recipient:email(f.recipient),title:'Content Manager email test',message:'This is a test notification from nutrition.fitness.',link:notificationLink(env,'connections',{})};
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
