import {HttpError} from './platform.mjs';
import {saveRecord} from './studio-store.mjs';
import {isNewsletterContent} from './studio-newsletter-type.mjs';
import {londonPublicationTime} from './studio-review-publication.mjs';
import {readNewsletterConnection,openGhlToken,syncNewsletter} from './newsletter-sync.mjs';
import {ghlClient,ghlLocation} from './ghl-newsletter-client.mjs';
import {newsletterDraftButton} from './newsletter-draft-links.mjs';
import {esc,form,hidden} from './studio-ui.mjs';

export function newsletterPublicationChoices(r,data,params,retained={}){
 if(data.actor.role!=='admin'||!isNewsletterContent(r)||r.status!=='Approved'||r.approval?.revision!==r.revision)return '';
 const opened=params.get('reviewed')==='approve'||['review-publish','review-schedule'].includes(retained.action);
 return '<dialog data-publication-dialog'+(opened?' data-open-on-load':'')+' aria-labelledby="publication-title"><h2 id="publication-title">Newsletter approved</h2><p>When should this version be saved in GHL?</p><p class="meta">This creates or updates a GHL draft. It does not send the newsletter to subscribers.</p><div class="studio-actions">'+
 form('review-publish',hidden('revision',r.revision),{section:'review-preview',id:r.id},'Save to GHL now')+'<button type="button" data-show-publication-schedule>Schedule for later</button>'+form('review-keep-draft',hidden('revision',r.revision),{section:'review-preview',id:r.id},'Keep here for now').replace('class="primary"','class="secondary"')+'</div>'+
 '<section data-publication-schedule'+(retained.action==='review-schedule'?'':' hidden')+'><h3>Schedule the GHL draft</h3>'+form('review-schedule',hidden('revision',r.revision)+'<label>Save to GHL on<input type="datetime-local" name="scheduledAt" value="'+esc(retained.scheduledAt||r.ghlDraftPlan?.localDateTime||'')+'" required></label><p class="meta">Europe/London time. The draft will be saved within five minutes of this time. Sending is arranged separately in GHL.</p>',{section:'review-preview',id:r.id},'Confirm schedule')+'</section>'+(retained.message?'<p role="alert">'+esc(retained.message)+'</p>':'')+'</dialog>';
}

export function newsletterHandoffStatus(r,data){
 if(!isNewsletterContent(r))return '';
 const plan=r.ghlDraftPlan,valid=r.status==='Approved'&&r.approval?.revision===r.revision&&plan?.revision===r.revision;
 const state=data.ghlDraftStates?.get(r.id),saved=valid&&state?.status==='synced'&&state.sourceRevision===r.revision;
 const text=saved?'This approved version is saved in GHL as a draft.':valid&&state?.status==='held'?'GHL updates are paused to protect changes made in GHL. Check Connections.':valid&&plan.state==='scheduled'?'GHL draft scheduled for '+plan.localDateTime.replace('T',' at ')+' (London time).':valid&&plan.state==='queued'?'GHL draft requested. The connection retries if needed.':'';
 return (text?'<p class="meta">'+esc(text)+'</p>':'')+newsletterDraftButton(data,r);
}

export async function publishNewsletterDraft(f,r,data,api,env={},fetcher=fetch){
 if(data.actor.role!=='admin')throw new HttpError(403,'Only the administrator can save or schedule GHL drafts.');
 if(Number(f.revision)!==r.revision)throw new HttpError(409,'Content changed. Reopen the latest preview.');
 if(!isNewsletterContent(r)||r.status!=='Approved'||r.approval?.revision!==r.revision)throw new HttpError(400,'Approve this saved newsletter before sending it to GHL.');
 if(!['review-publish','review-schedule','review-keep-draft'].includes(f.action))throw new HttpError(400,'Choose when to save the GHL draft.');
 if(f.action==='review-keep-draft'&&!r.ghlDraftPlan)return {section:'review-preview',id:r.id,reviewed:'ghl-kept',record:r};
 let client,scheduledAt;
 if(f.action!=='review-keep-draft'){
  scheduledAt=f.action==='review-schedule'?londonPublicationTime(f.scheduledAt):new Date().toISOString();
  if(f.action==='review-schedule'&&Date.parse(scheduledAt)<=Date.now())throw new HttpError(400,'Choose a future date and time for the GHL draft.');
  const connection=await readNewsletterConnection(api);
  if(!connection.enabled||connection.locationId!==ghlLocation)throw new HttpError(503,'The GHL connection is paused or unavailable. Reconnect it in Settings → Connections. Your approval is saved.');
  client=ghlClient(openGhlToken(connection.sealedToken,env),fetcher);
 }
 const next=structuredClone(r);delete next.revision;delete next.updatedAt;
 next.approval={...next.approval,revision:r.revision+1};
 if(f.action==='review-keep-draft')delete next.ghlDraftPlan;
 else next.ghlDraftPlan={state:f.action==='review-schedule'?'scheduled':'queued',scheduledAt,localDateTime:f.scheduledAt||'',timeZone:'Europe/London',revision:r.revision+1,by:data.actor.id,requestedAt:new Date().toISOString()};
 const saved=await saveRecord(api,data.actor,next,r.revision),record={...next,revision:saved.revision};
 if(f.action!=='review-publish')return {section:'review-preview',id:r.id,reviewed:f.action==='review-schedule'?'ghl-scheduled':'ghl-kept',record};
 // Persist the explicit request first. The existing cron can retry a lost response.
 let result;try{result=await syncNewsletter({record,revision:record.revision,api,client});}catch{result={status:'attention'};}
 if(result.id){data.ghlDrafts??=new Map();data.ghlDrafts.set(r.id,result.id);}
 data.ghlDraftStates??=new Map();data.ghlDraftStates.set(r.id,{status:['synced','unchanged'].includes(result.status)?'synced':result.status,sourceRevision:record.revision});
 return {section:'review-preview',id:r.id,reviewed:['synced','unchanged'].includes(result.status)?'ghl-saved':'ghl-attention',record};
}
