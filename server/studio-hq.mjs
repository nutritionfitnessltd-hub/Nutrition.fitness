import {documentText} from './document-reader.mjs';
import {workerIdeasPanel} from './studio-ideas.mjs';
import {randomUUID} from 'node:crypto';
import {HttpError} from './platform.mjs';
import {saveRecord} from './studio-store.mjs';
import {workerNames,contentWorker} from './studio-worker-content.mjs';
import {esc,url,heading,button,form,hidden,textarea,list} from './studio-ui.mjs';
import {workers} from './studio-workers.mjs';
import {workerPortrait} from './studio-visuals.mjs';
export async function hqRequest(env,input,fetcher=fetch){
 if(!env.NUFI_HQ_SITE_TOKEN)throw new HttpError(503,'James HQ messaging is not connected yet. Your message has not been sent.');
 const endpoint='https://james-control-centre.james615845.chatgpt.site/api/nutrition-studio';
 const res=await fetcher(endpoint,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json','OAI-Sites-Authorization':'Bearer '+env.NUFI_HQ_SITE_TOKEN},body:JSON.stringify(input),signal:AbortSignal.timeout(20000)});
 const data=await res.json().catch(()=>null);if(!res.ok||data?.error)throw new HttpError(res.status===409?409:503,data?.error||'HQ did not confirm this request. Keep your message and try again.');return data;
}
export async function workerChatPage(params,data,env,fetcher=fetch,retained={}){
 if(data.actor.role!=='admin')throw new HttpError(403,'Only the administrator can message HQ workers.');
 const key=params.get('worker');if(!Object.hasOwn(workers,key))throw new HttpError(400,'Choose a worker.');
 const w=workers[key];let error;
 const [chat,ideas]=await Promise.all([hqRequest(env,{action:'chat',worker:key},fetcher).catch(e=>{error=e.message;return null;}),workerIdeasPanel(key,env,fetcher)]);
 const state=chat?.task?.status,label={queued:'Message queued in James HQ',working:w.name+' is working on a reply',ready:'Reply received',needs_input:'Waiting for your reply',done:'Conversation ready'}[state]||'Start a conversation';
 return heading(['alex','andy','martina'].includes(key)?w.name+': ideas & conversation':'Message '+w.name,'This conversation is saved with the real employee in James HQ.',button('Dashboard',url()))+
 ideas+'<section class="panel worker-chat-profile">'+workerPortrait(w)+'<div><h2>'+esc(w.name)+'</h2><p>'+esc(w.role)+'</p><p>AI worker · James HQ</p></div></section>'+
 (error?'<p role="alert">'+esc(error)+'</p>':'')+'<section data-worker-updates="conversation" class="worker-conversation" aria-label="Conversation"><h2>Conversation</h2><p role="status">'+esc(label)+'</p>'+
 list(chat?.messages||[],m=>'<div class="worker-message document-reader '+(m.role==='user'?'from-you':'from-worker')+'"><h3>'+esc(m.role==='user'?'You':m.author||w.name)+'</h3>'+documentText(m.body,{headingLevel:4})+'<small>'+esc(m.createdAt||'')+'</small></div>','No messages yet.')+'</section>'+
 form('hq-message',hidden('worker',key)+hidden('clientMessageId',retained.clientMessageId||randomUUID())+textarea('message','Your message',retained.message||'',5)+'<p class="meta">HQ replies when its worker checks the queue. Sending a message does not approve spending, publishing or a monthly plan.</p>',{section:'worker-chat',worker:key},'Send to '+w.name,state==='working'?'data-worker-busy="true"':'');
}
export function seasonalPlanPanel(r,data){
 const plan=r.fields?.seasonalPlan;if(contentWorker(r,data.byId)!=='martina'||!plan)return '';
 return '<section class="document-reader document-sheet seasonal-plan"><h2>Monthly theme</h2><h3>'+esc(plan.theme||r.title)+'</h3><p>'+esc(plan.month||'Month not set')+'</p>'+list(plan.assignments||[],a=>'<div><strong>'+esc(a.title)+'</strong><small>'+esc(workerNames[a.worker]||'Choose a worker')+'</small><p class="prose">'+esc(a.brief)+'</p></div>','No assignments prepared yet.')+
 (plan.dispatch?'<p role="status">Approved and sent to James HQ · '+esc(plan.dispatch.approvedAt)+'</p>':data.actor.role==='admin'?form('hq-approve-plan',hidden('revision',r.revision)+'<label class="check"><input type="checkbox" name="confirmed" value="yes" required> I approve this saved plan and want its assignments sent to the workers.</label>',{section:'item',id:r.id},'Approve plan & assign work'):'<p>Awaiting James’s approval before work is assigned.</p>')+'</section>';
}
export async function changeHq(params,f,data,api,env,fetcher=fetch){
 if(data.actor.role!=='admin')throw new HttpError(403,'Only the administrator can send HQ messages or approve assignments.');
 if(f.action==='hq-message'){
  if(!Object.hasOwn(workers,f.worker)||typeof f.message!=='string'||!f.message.trim()||f.message.length>8000||!/^[\w-]{1,80}$/.test(f.clientMessageId||''))throw new HttpError(400,'Write a message of up to 8000 characters.');
  await hqRequest(env,{action:'message',worker:f.worker,message:f.message,clientMessageId:f.clientMessageId},fetcher);return {section:'worker-chat',worker:f.worker};
 }
 if(f.action==='hq-idea'){if(!['alex','andy','martina'].includes(f.worker)||!['approve-idea','reject-idea','start-scope','approve-step'].includes(f.decision))throw new HttpError(400,'Choose an available idea action.');await hqRequest(env,{action:f.decision,worker:f.worker,ideaId:f.ideaId,expectedVersion:Number(f.expectedVersion),feedback:f.feedback||''},fetcher);return {section:'worker-chat',worker:f.worker};}
 const r=data.byId.get(params.get('id'));if(!r||r.revision!==Number(f.revision))throw new HttpError(409,'The plan changed. Reopen the saved version before approving.');
 if(contentWorker(r,data.byId)!=='martina'||!r.fields?.seasonalPlan||f.confirmed!=='yes')throw new HttpError(400,'Confirm approval of Martina’s saved monthly plan.');
 if(r.fields.seasonalPlan.dispatch)return {section:'item',id:r.id};
 const result=await hqRequest(env,{action:'assign-plan',planId:r.id,revision:r.revision,confirmed:true,plan:r.fields.seasonalPlan},fetcher);
 const next=structuredClone(r);delete next.revision;delete next.updatedAt;delete next.approval;next.status='Draft';next.fields.seasonalPlan.dispatch={taskIds:result.taskIds,approvedAt:result.approvedAt,approvedBy:data.actor.id};
 await saveRecord(api,data.actor,next,r.revision);return {section:'item',id:r.id};
}
