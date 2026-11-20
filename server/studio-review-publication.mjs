import {HttpError} from './platform.mjs';
import {saveRecord,allRows} from './studio-store.mjs';
import {issues} from './studio-model.mjs';
import {esc,form,hidden} from './studio-ui.mjs';
export function publicationChoices(r,data,params,retained={}){
 if(data.actor.role!=='admin'||r.kind!=='article'||r.status!=='Approved')return '';
 const opened=params.get('reviewed')==='approve'||['review-publish','review-schedule'].includes(retained.action);
 return '<dialog data-publication-dialog'+(opened?' data-open-on-load':'')+' aria-labelledby="publication-title"><h2 id="publication-title">Article approved</h2><p>What would you like to do next?</p><div class="studio-actions">'+
 form('review-publish',hidden('revision',r.revision),{section:'review-preview',id:r.id},'Publish now')+
 '<button type="button" data-show-publication-schedule>Schedule</button>'+form('review-keep-draft',hidden('revision',r.revision),{section:'review-preview',id:r.id},'Keep as approved draft').replace('class="primary"','class="secondary"')+'</div>'+
 '<section data-publication-schedule'+(retained.action==='review-schedule'?'':' hidden')+'><h3>Schedule publication</h3>'+form('review-schedule',hidden('revision',r.revision)+'<label>Publication date and time<input type="datetime-local" name="scheduledAt" value="'+esc(retained.scheduledAt||r.publicationPlan?.localDateTime||'')+'" required></label><p class="meta">Europe/London time. Publication runs within five minutes of the selected time.</p>',{section:'review-preview',id:r.id},'Confirm schedule')+'</section>'+
 (retained.message?'<p role="alert">'+esc(retained.message)+'</p>':'')+'</dialog>';
}
export function londonPublicationTime(value){
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value||''))throw new HttpError(400,'Choose a publication date and time.');
 const base=Date.parse(value+'Z');
 const format=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const matches=[base,base-3600000].filter(t=>Number.isFinite(t)&&format.format(new Date(t)).replace(' ','T')===value);
 if(matches.length!==1)throw new HttpError(400,'Choose a valid, unambiguous Europe/London time.');
 return new Date(matches[0]).toISOString();
}
function approved(r,expected){
 if(Number(expected)!==r.revision)throw new HttpError(409,'Content changed. Reopen the latest preview.');
 if(r.kind!=='article'||r.status!=='Approved'||r.approval?.revision!==r.revision)throw new HttpError(400,'Approve this saved article before publishing or scheduling.');
 const missing=issues(r,[r]);if(missing.length)throw new HttpError(400,missing.join(' '));
}
export async function releaseApprovedArticle(r,api,by){
 approved(r,r.revision);
 // Preserve the release procedure's version checks and test snapshot prerequisite.
 for(const target of ['test','live'])await api('/rest/v1/rpc/nufi_studio_release',{service:true,method:'POST',payload:{item:r.id,expected:r.revision,target,approved_by:by}});
}
export async function publishFromReview(f,r,data,api){
 if(data.actor.role!=='admin')throw new HttpError(403,'Only the administrator can publish or schedule.');
 approved(r,f.revision);
 if(f.action==='review-keep-draft'){
  if(!r.publicationPlan)return {section:'review-preview',id:r.id,reviewed:'kept',record:r};
  const next=structuredClone(r);delete next.revision;delete next.updatedAt;delete next.publicationPlan;next.approval.revision=r.revision+1;
  const saved=await saveRecord(api,data.actor,next,r.revision);return {section:'review-preview',id:r.id,reviewed:'kept',record:{...next,revision:saved.revision}};
 }
 if(!data.livePublishingReady)throw new HttpError(503,'Live publishing is not connected yet. Your article is saved as an approved draft.');
 if(f.action==='review-publish'){
  await releaseApprovedArticle(r,api,data.actor.id);
  return {section:'review-preview',id:r.id,reviewed:'published',record:r};
 }
 const at=londonPublicationTime(f.scheduledAt);
 if(Date.parse(at)<=Date.now())throw new HttpError(400,'Choose a future publication date and time.');
 const next=structuredClone(r);delete next.revision;delete next.updatedAt;
 next.publicationPlan={date:f.scheduledAt.slice(0,10),localDateTime:f.scheduledAt,scheduledAt:at,timeZone:'Europe/London',state:'scheduled',by:data.actor.id,at:new Date().toISOString()};
 next.approval={...next.approval,revision:r.revision+1};
 const saved=await saveRecord(api,data.actor,next,r.revision);
 return {section:'review-preview',id:r.id,reviewed:'scheduled',record:{...next,revision:saved.revision}};
}
export async function runScheduledPublications({api,env,now=Date.now()}){
 if(env.NUFI_STUDIO_LIVE_READY!=='true')return {status:'paused',published:0};
 const rows=await allRows(api,'/rest/v1/nufi_studio_items?select=id,payload,revision&payload->publicationPlan->>state=eq.scheduled&order=id');
 const due=rows.filter(r=>Date.parse(r.payload.publicationPlan?.scheduledAt)<=now&&r.payload.status==='Approved'&&r.payload.approval?.revision===r.revision);
 let published=0,attempted=0;const failed=[];
 for(const row of due){
  const existing=await api('/rest/v1/nufi_studio_releases?select=source_revision&environment=eq.live&item_id=eq.'+encodeURIComponent(row.id),{service:true});
  if(existing[0]?.source_revision===row.revision)continue;
  if(attempted++>=20)break;
  try{await releaseApprovedArticle({...row.payload,id:row.id,revision:row.revision},api,row.payload.publicationPlan.by);published++;}catch{failed.push(row.id);}
 }
 return {status:failed.length?'attention':'checked',published,failed};
}
