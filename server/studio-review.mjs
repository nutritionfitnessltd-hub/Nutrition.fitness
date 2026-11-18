import {randomUUID} from 'node:crypto';
import {HttpError} from './platform.mjs';
import {editable,saveRecord} from './studio-store.mjs';
import {issues,cleanText} from './studio-model.mjs';
import {contentWorker,workerNames} from './studio-worker-content.mjs';
import {itemPage} from './studio-pages.mjs';
import {esc,url,hidden,form,button} from './studio-ui.mjs';

export function reviewPreview(params,data,retained={}){
 const r=editable(data,params.get('id')),worker=contentWorker(r,data.byId),name=workerNames[worker]||'the assigned worker';
 const preview=new URLSearchParams({id:r.id,tab:'preview'}),admin=data.actor.role==='admin';
 const feedback=r.reviewFeedback||[],latest=feedback.at(-1),pending=latest?.decision==='changes'&&latest.delivery!=='sent';
 return '<section data-review-content><header class="review-popup-header"><div><p class="kicker">Review saved version '+esc(r.revision)+'</p><h2 id="review-popup-title">'+esc(r.title)+'</h2><p>'+esc(workerNames[worker]||'No worker assigned')+' · '+esc(r.status)+'</p></div><button type="button" data-review-close aria-label="Close preview">×</button></header>'+
 '<div class="review-popup-body">'+itemPage(preview,data)+
 (feedback.length?'<details class="panel"><summary>Review feedback ('+feedback.length+')</summary>'+feedback.map(f=>'<article><h3>'+esc(f.decision==='approve'?'Approved':'Changes requested')+'</h3><p class="prose">'+esc(f.changes||'')+'</p>'+(f.guidance?'<p><strong>Remember for future work:</strong> '+esc(f.guidance)+'</p>':'')+'<small>'+esc(f.author)+' · '+esc(f.at)+'</small></article>').join('')+'</details>':'')+'</div>'+
 (admin?'<footer class="review-popup-footer"><p role="status" tabindex="-1" data-review-status>'+(retained.message?esc(retained.message):pending?'Feedback saved for '+esc(name)+'’s next worker check.':params.get('reviewed')==='approve'?'Approved. Nothing has been published.':params.get('reviewed')==='changes'?'Feedback saved and sent to '+esc(name)+'.':'Approval checks this saved version; publishing is separate.')+'</p><div class="studio-actions">'+
 (r.status!=='Approved'?form('review-decision',hidden('revision',r.revision)+hidden('decision','approve')+hidden('reviewId',randomUUID()),{section:'review-preview',id:r.id},'Approve','data-review-form'):'<span class="studio-status">Approved</span>')+
 '<button type="button" data-request-changes>Request changes</button>'+button('Edit content',url('item',{id:r.id,tab:'edit'}))+'</div>'+
 '<section data-review-feedback'+(retained.decision==='changes'?'':' hidden')+'><h3>Request changes from '+esc(name)+'</h3>'+form('review-decision',hidden('revision',r.revision)+hidden('decision','changes')+hidden('reviewId',retained.reviewId||randomUUID())+
 '<label>What needs changing?<textarea name="feedback" rows="4" maxlength="4000" required>'+esc(retained.feedback||'')+'</textarea></label><label>Remember for future work (optional)<textarea name="guidance" rows="3" maxlength="2000" placeholder="For example: use shorter introductions and explain technical terms.">'+esc(retained.guidance||'')+'</textarea></label><p class="meta">Your feedback is saved against this version for '+esc(name)+'’s next worker check. Future guidance stays available for later drafts.</p>',{section:'review-preview',id:r.id},'Send change request','data-review-form')+'</section></footer>':'')+'</section>';
}

const withoutVersion=r=>{const next=structuredClone(r);delete next.revision;delete next.updatedAt;return next;};
async function sendFeedback(r,entry,data,api,env,fetcher){
 if(entry.delivery==='sent'||!entry.workerId)return r;
 let result;
 try{
  if(!env.NUFI_HQ_SITE_TOKEN)throw new Error('not connected');
  const message=['Changes requested: '+r.title,'Content ID: '+r.id,'Reviewed version: '+entry.reviewedRevision,'Review: https://team.nutrition.fitness/content-library/?work=1&studio=item&id='+encodeURIComponent(r.id),'Requested changes: '+entry.changes,entry.guidance?'Remember for future work: '+entry.guidance:'','Read the latest saved draft and feedback before revising. Preserve unrelated content and return the revision as a draft for James to review. Do not approve or publish.'].filter(Boolean).join('\n\n');
  const response=await fetcher('https://james-control-centre.james615845.chatgpt.site/api/nutrition-studio',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json','OAI-Sites-Authorization':'Bearer '+env.NUFI_HQ_SITE_TOKEN},body:JSON.stringify({action:'message',worker:entry.workerId,message,clientMessageId:entry.id}),signal:AbortSignal.timeout(20000)});
  result=await response.json().catch(()=>null);if(!response.ok||!result?.ok)throw new Error('not confirmed');
 }catch{return r;}
 // A lost acknowledgement remains retryable using the same HQ idempotency key.
 const next=withoutVersion(r);next.reviewFeedback=next.reviewFeedback.map(e=>e.id===entry.id?{...e,delivery:'sent',sentAt:new Date().toISOString()}:e);
 try{const saved=await saveRecord(api,data.actor,next,r.revision);return {...next,revision:saved.revision};}catch{return r;}
}

export async function reviewDecision(params,f,data,api,env={},fetcher=fetch){
 if(data.actor.role!=='admin')throw new HttpError(403,'Only the administrator can approve content or request changes.');
 const r=editable(data,params.get('id'));let next=r;
 if(!/^[a-f0-9-]{36}$/i.test(f.reviewId||''))throw new HttpError(400,'Reopen the preview before reviewing.');
 const previous=r.reviewFeedback?.find(e=>e.id===f.reviewId);
 if(f.action==='review-retry'){
  if(!previous||previous.decision!=='changes')throw new HttpError(400,'Choose a saved change request.');
 }else if(!previous){
  if(!Number.isSafeInteger(Number(f.revision))||Number(f.revision)!==r.revision)throw new HttpError(409,'This item changed. Reopen the latest preview before reviewing it. Your feedback has been kept below.');
  if(!['approve','changes'].includes(f.decision))throw new HttpError(400,'Choose Approve or Request changes.');
  const changes=cleanText(f.feedback||'',4000),guidance=cleanText(f.guidance||'',2000),workerId=contentWorker(r,data.byId);
  if(f.decision==='changes'&&!changes.trim())throw new HttpError(400,'Describe what needs changing.');
  if(f.decision==='changes'&&!workerId)throw new HttpError(400,'Assign a worker to this item before requesting changes.');
  if(f.decision==='approve'){const missing=issues(r,data.items);if(missing.length)throw new HttpError(400,missing.join(' '));}
  next=withoutVersion(r);next.status=f.decision==='approve'?'Approved':'Changes requested';delete next.approval;
  const at=new Date().toISOString(),entry={id:f.reviewId,decision:f.decision,reviewedRevision:r.revision,workerId,changes,guidance,author:data.actor.name||'James',at,delivery:f.decision==='changes'?'pending':'not-required'};
  next.reviewFeedback=[...(r.reviewFeedback||[]),entry];
  next.comments=[...(r.comments||[]),{id:entry.id,body:f.decision==='approve'?'Approved saved version '+r.revision+'.':changes+(guidance?'\n\nRemember for future work: '+guidance:''),author:entry.author,at}];
  if(f.decision==='approve')next.approval={by:data.actor.id,at,revision:r.revision+1};
  const saved=await saveRecord(api,data.actor,next,r.revision);next={...next,revision:saved.revision};
 }
 const entry=next.reviewFeedback.find(e=>e.id===f.reviewId);
 if(entry.decision==='changes')next=await sendFeedback(next,entry,data,api,env,fetcher);
 return {section:'review-preview',id:r.id,reviewed:entry.decision,record:next};
}
