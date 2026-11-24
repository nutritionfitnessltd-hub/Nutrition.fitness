import {checkedVideo} from './production-video.mjs';
import {articleMediaIssues} from './worker-drafts.mjs';
import {newsletterDraftButton} from './newsletter-draft-links.mjs';
import {staffTaskPanel,createReviewTask} from './review-staff-task.mjs';
import {courseApprovalRecord} from './studio-courses.mjs';
import {releasePath} from './studio-publishing.mjs';
import {publicationChoices,publishFromReview} from './studio-review-publication.mjs';
import {randomUUID} from 'node:crypto';
import {HttpError} from './platform.mjs';
import {readable,saveRecord} from './studio-store.mjs';
import {issues,cleanText} from './studio-model.mjs';
import {contentWorker,workerNames} from './studio-worker-content.mjs';
import {itemPage} from './studio-pages.mjs';
import {isNewsletterContent} from './studio-newsletters.mjs';
import {newsletterPublicationChoices,publishNewsletterDraft,newsletterHandoffStatus} from './studio-review-newsletter.mjs';
import {isProductAsset,productAssetPage} from './studio-products.mjs';
const reviewBody=(params,data)=>isProductAsset(data.byId.get(params.get('id')))?'<div class="product-space document-reader">'+productAssetPage(new URLSearchParams({id:params.get('id'),tab:'review'}),data)+'</div>':'<article class="approval-paper document-reader">'+itemPage(new URLSearchParams({...Object.fromEntries(params),document:'1'}),data)+'</article>';
import {readerDocument} from './article-reader.mjs';
import {articleImage} from './studio-articles.mjs';
import {canEditContent,canReviewContent} from './library-permissions.mjs';
import {esc,url,hidden,form,button} from './studio-ui.mjs';

function newsletterApprovalHistory(r,data){
 if(!isNewsletterContent(r))return '';
 const feedback=r.reviewFeedback||[],approval=r.approval;
 const entries=feedback.length?feedback:approval?[{decision:'approve',author:data.people?.find(p=>p.id===approval.by)?.name||approval.by,at:approval.at,reviewedRevision:approval.revision}]:[];
 return '<details class="panel newsletter-approval-history"><summary>Approval history'+(entries.length?' ('+entries.length+')':'')+'</summary>'+(entries.length?entries.map(f=>'<article><h3>'+esc(f.decision==='approve'?'Approved for GHL':f.decision==='submit'?'Submitted for review':'Changes requested')+'</h3><p>'+esc(f.author)+' · '+esc(f.at)+' · Version '+esc(f.reviewedRevision)+'</p>'+(f.changes?'<p class="prose">'+esc(f.changes)+'</p>':'')+(f.guidance?'<p><strong>Remember for future work:</strong> '+esc(f.guidance)+'</p>':'')+'</article>').join(''):'<p>No approval has been recorded for this newsletter.</p>')+'</details>';
}

export function reviewPreview(params,data,retained={}){
 const r=readable(data,params.get('id')),worker=contentWorker(r,data.byId),name=workerNames[worker]||'the assigned person';
 const preview=new URLSearchParams({id:r.id,tab:'preview'}),admin=data.actor.role==='admin',reviewer=canReviewContent(data,r),newsletter=isNewsletterContent(r);
 const feedback=r.reviewFeedback||[],latest=feedback.at(-1),pending=latest?.decision==='changes'&&latest.delivery==='pending';
 const missing=r.status==='Approved'?[]:issues(r.kind==='course'?courseApprovalRecord(r,data):r,data.items);
 const readiness=missing.length?'Before approval: '+missing.join(' ').replace('Add brief.','Add a short brief. Choose Edit to add it.'):'';
 return '<section data-review-content><header class="review-popup-header"><div><p class="kicker">Review saved version '+esc(r.revision)+'</p><h2 id="review-popup-title">'+esc(r.title)+'</h2><p>'+esc(workerNames[worker]||'No worker assigned')+' · '+esc(r.status)+'</p></div><button type="button" data-review-close aria-label="Close preview">×</button></header>'+
 '<div class="review-popup-body">'+reviewBody(preview,data)+(newsletter?newsletterApprovalHistory(r,data):'')+
 (!newsletter&&feedback.length?'<details class="panel"><summary>Review feedback ('+feedback.length+')</summary>'+feedback.map(f=>'<article><h3>'+esc(f.decision==='approve'?'Approved':f.decision==='submit'?'Submitted for review':'Changes requested')+'</h3><p class="prose">'+esc(f.changes||'')+'</p>'+(f.guidance?'<p><strong>Remember for future work:</strong> '+esc(f.guidance)+'</p>':'')+'<small>'+esc(f.author)+' · '+esc(f.at)+'</small></article>').join('')+'</details>':'')+'</div>'+
 (reviewer?'<footer class="review-popup-footer"><p role="status" tabindex="-1" data-review-status>'+(retained.message?esc(retained.message):params.get('reviewed')==='submit'?'Submitted for review.':pending?'Feedback saved for '+esc(name)+'’s next worker check.':params.get('reviewed')==='approve'?'Approved.':params.get('reviewed')==='changes'?'Change request saved for '+esc(name)+'.':esc(readiness))+'</p><div class="studio-actions">'+
 (r.status!=='Approved'?form('review-decision',hidden('revision',r.revision)+hidden('decision','approve')+hidden('reviewId',randomUUID()),{section:'review-preview',id:r.id},newsletter?'Approve for GHL':'Approve','data-review-form'):'<span class="studio-status">'+(newsletter?'Approved for GHL':'Approved')+'</span>')+
 (canEditContent(data,r.id)?reviewEditLink(r):'')+'<button type="button" data-request-changes>Request changes</button>'+
 (admin&&r.status==='Approved'?'<button type="button" data-create-staff-task>Create staff task</button>':'')+(admin&&r.status==='Approved'?'<button type="button" data-open-publication>'+(newsletter?'GHL draft options':'Publishing options')+'</button>':'')+(newsletter?newsletterDraftButton(data,r):'')+'</div>'+staffTaskPanel(r,data,retained)+(newsletter?'<p class="meta">Approval is for the GHL handoff. It does not send this email.</p>':'')+(newsletter?newsletterHandoffStatus(r,data,false)+newsletterPublicationChoices(r,data,params,retained):publicationChoices(r,data,params,retained))+
 '<section data-review-feedback'+(retained.decision==='changes'?'':' hidden')+'><h3>Request changes from '+esc(name)+'</h3>'+form('review-decision',hidden('revision',r.revision)+hidden('decision','changes')+hidden('reviewId',retained.reviewId||randomUUID())+
 '<label>What needs changing?<textarea name="feedback" rows="4" maxlength="4000" required>'+esc(retained.feedback||'')+'</textarea></label><label>Remember for future work (optional)<textarea name="guidance" rows="3" maxlength="2000" placeholder="For example: use shorter introductions and explain technical terms.">'+esc(retained.guidance||'')+'</textarea></label><p class="meta">Your feedback is saved against this version for '+esc(name)+'’s next worker check. Future guidance stays available for later drafts.</p>',{section:'review-preview',id:r.id},'Send change request','data-review-form')+'</section></footer>':'')+'</section>';
}

const withoutVersion=r=>{const next=structuredClone(r);delete next.revision;delete next.updatedAt;return next;};
export function reviewWindowDocument(params,data,retained={}){
 const r=readable(data,params.get('id')),preview=reviewPreview(params,data,retained);
 const footer=preview.includes('<footer class="review-popup-footer">')?preview.slice(preview.indexOf('<footer class="review-popup-footer">'),preview.lastIndexOf('</footer>')+9):canEditContent(data,r.id)?'<footer class="review-popup-footer">'+reviewEditLink(r)+'</footer>':'';
 const notice=!retained.message?({assigned:'Staff task created. No email has been sent.',schedule:'Schedule saved to the content calendar.',scheduled:'Publication scheduled.',published:'Published on '+(data.publicationDestination?.label||'nutrition.fitness')+'.',approve:isNewsletterContent(r)?'Approved for GHL. No email has been sent.':data.actor.role==='admin'?'':'Approved. Nothing has been published.',changes:'Change request saved.','ghl-saved':'Saved in GHL as a draft. No email has been sent.','ghl-scheduled':'GHL draft scheduled. This does not schedule an email to subscribers.','ghl-kept':'Kept here as an approved draft. No GHL transfer is scheduled.','ghl-attention':'The GHL draft could not be confirmed yet. Check Connections for its status; the saved request can retry.'})[params.get('reviewed')]||'':'';
 const publishedLink=params.get('reviewed')==='published'&&data.publicationDestination?.origin?button('View published article',data.publicationDestination.origin+releasePath(r.id)).replace('<a ','<a target="_blank" rel="noopener" '):'';
 const draftDetails=data.actor.role==='admin'&&r.kind==='article'?'<details class="review-draft-details"><summary>Draft details</summary><p>Saved submission and production notes. These are not part of the reader-facing article.</p><pre>'+esc(r.fields?.body||'')+'</pre></details>':'';
 const controls='<div class="review-window-controls">'+(notice?'<p role="status">'+esc(notice)+'</p>':'')+footer.replace('<div class="studio-actions">','<div class="studio-actions">'+publishedLink)+draftDetails+'</div>'+reviewEditorDialog(r,data);
 const page=r.kind==='article'?readerDocument(r,articleImage(r)):'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(r.title)+'</title>'+'<link rel="stylesheet" href="/library-reader.css">'+'<link rel="stylesheet" href="/studio.css"></head><body'+(isNewsletterContent(r)?' class="newsletter-review-window"':' class="content-review-window"')+'>'+reviewBody(new URLSearchParams({id:r.id,tab:'preview'}),data)+newsletterApprovalHistory(r,data)+'</body></html>';
 return page.replace('</head>','<link rel="stylesheet" href="/product-workspace.css"><link rel="stylesheet" href="/review-window.css"><link rel="stylesheet" href="/document-reader.css"><script type="module" src="/studio-review.js"></script></head>').replace('<body class="kc-page">','<body class="kc-page article-review-window document-reader">').replace(/(<body[^>]*>)/,'$1'+controls);
}
async function sendFeedback(r,entry,data,api,env,fetcher){
 if(entry.delivery==='sent'||!entry.workerId||data.actor.role!=='admin')return r;
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
 const r=data.byId.get(params.get('id'));
 if(!canReviewContent(data,r))throw new HttpError(403,'Only the administrator or a designated reviewer can review this submitted content.');
 const admin=data.actor.role==='admin';
 if(!admin&&(f.action!=='review-decision'||!['approve','changes'].includes(f.decision)))throw new HttpError(403,'Reviewers can approve submitted work or request changes.');
 if(f.action==='review-assign')return createReviewTask(f,r,data,api);
 if(['review-publish','review-keep-draft'].includes(f.action)||f.action==='review-schedule'&&(f.scheduledAt||isNewsletterContent(r)))return isNewsletterContent(r)?publishNewsletterDraft(f,r,data,api,env,fetcher):publishFromReview(f,r,data,api);
 let next=r;
 if(f.action==='review-schedule'){
  if(Number(f.revision)!==r.revision)throw new HttpError(409,'This item changed. Reopen the latest preview before scheduling.');
  const date=String(f.scheduledDate||''),today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date<today)throw new HttpError(400,'Choose today or a future publication date.');
  next=withoutVersion(r);next.publicationPlan={date,timeZone:'Europe/London',state:'planned',by:data.actor.id,at:new Date().toISOString()};
  if(next.approval?.revision===r.revision)next.approval.revision=r.revision+1;
  const saved=await saveRecord(api,data.actor,next,r.revision);return {section:'review-preview',id:r.id,reviewed:'schedule',record:{...next,revision:saved.revision}};
 }
 if(!/^[a-f0-9-]{36}$/i.test(f.reviewId||''))throw new HttpError(400,'Reopen the preview before reviewing.');
 const previous=r.reviewFeedback?.find(e=>e.id===f.reviewId);
 if(f.action==='review-retry'){
  if(!previous||previous.decision!=='changes')throw new HttpError(400,'Choose a saved change request.');
 }else if(!previous){
  if(!Number.isSafeInteger(Number(f.revision))||Number(f.revision)!==r.revision)throw new HttpError(409,'This item changed. Reopen the latest preview before reviewing it. Your feedback has been kept below.');
  if(!['approve','changes','submit'].includes(f.decision))throw new HttpError(400,'Choose Approve, Submit for review or Request changes.');
  const changes=cleanText(f.feedback||'',4000),guidance=cleanText(f.guidance||'',2000),workerId=contentWorker(r,data.byId);
  if(f.decision==='changes'&&!changes.trim())throw new HttpError(400,'Describe what needs changing.');
  if(f.decision==='approve'&&f.videoSha256&&!checkedVideo(r,f.videoSha256))throw new HttpError(409,'This video export changed. Reopen and watch the current version before approving.');
  const sourceChecked=f.decision==='approve'&&f.videoSha256&&f.sourceChecked==='yes'&&r.source?.needsChecking;
  const checked=sourceChecked?{...r,source:{...r.source,needsChecking:false}}:r;
  const reviewed=f.decision==='approve'&&r.kind==='course'?courseApprovalRecord(checked,data):checked;
  if(f.decision==='submit'&&articleMediaIssues(reviewed).length)throw new HttpError(400,articleMediaIssues(reviewed).join(' '));
  if(f.decision==='approve'){const missing=issues(reviewed,data.items);if(missing.length)throw new HttpError(400,missing.join(' '));}
  next=withoutVersion(reviewed);next.status=f.decision==='approve'?'Approved':f.decision==='submit'?'In review':'Changes requested';delete next.approval;delete next.ghlDraftPlan;
  const at=new Date().toISOString(),entry={id:f.reviewId,decision:f.decision,reviewedRevision:r.revision,workerId,changes,guidance,author:data.actor.name||'James',authorId:data.actor.id,reviewedTitle:r.title,at,delivery:f.decision==='changes'&&workerId?'pending':'not-required'};
  if(f.decision==='approve'&&f.videoSha256)entry.videoReview={sha256:f.videoSha256,filename:checkedVideo(r,f.videoSha256).name||'Video export',...(sourceChecked?{sourceChecked:true}:{})};
  next.reviewFeedback=[...(r.reviewFeedback||[]),entry];
  next.comments=[...(r.comments||[]),{id:entry.id,body:f.decision==='approve'?'Approved saved version '+r.revision+'.':f.decision==='submit'?'Submitted saved version '+r.revision+' for review.':changes+(guidance?'\n\nRemember for future work: '+guidance:''),author:entry.author,at}];
  if(f.decision==='approve'){next.approval={by:data.actor.id,at,revision:r.revision+1};if(next.publicationPlan?.state==='scheduled')delete next.publicationPlan;}
  const saved=await persistDecision(api,data.actor,next,r.revision);next={...next,revision:saved.revision};
 }
 const entry=next.reviewFeedback.find(e=>e.id===f.reviewId);
 if(entry.decision==='changes')next=await sendFeedback(next,entry,data,api,env,fetcher);
 data.reviewedNow=r.id;
 return {section:'review-preview',id:r.id,reviewed:entry.decision,record:next};
}

// Only reviewDecision calls this after checking category, submission state and revision.
// The payload is built from the saved record; posted fields cannot edit its content.
async function persistDecision(api,actor,record,expected){
 const rows=await api('/rest/v1/rpc/nufi_studio_save',{service:true,method:'POST',payload:{item:record.id,expected,document:record,editor_name:actor.role+':'+actor.id}});
 if(!rows.length)throw new HttpError(409,'This item changed. Reopen it before reviewing.');
 return rows[0];
}

function reviewEditorDialog(r,data){
 if(!canEditContent(data,r.id)||isProductAsset(r))return '';
 return '<dialog class="review-edit-dialog" data-review-edit-dialog aria-labelledby="review-edit-title"><header><div><p class="kicker">Edit saved content</p><h2 id="review-edit-title">'+esc(r.title)+'</h2></div><button type="button" data-review-edit-close aria-label="Close editor">Close</button></header><iframe title="Edit content form" data-review-edit-frame></iframe></dialog>';
}

function reviewEditLink(r){
 return isProductAsset(r)?button('Edit',url('item',{id:r.id,tab:'edit'})):button('Edit',url('item',{id:r.id,tab:'edit',reviewEditor:'1'})).replace('<a ','<a data-review-edit ');
}
