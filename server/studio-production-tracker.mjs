import {productionItemProgress,productionItemProgressHtml,latestProductionProgress} from './production-item-progress.mjs';
import {backgroundJobPanel} from './background-jobs.mjs';
import {checkedVideo} from './production-video.mjs';
import {randomUUID} from 'node:crypto';
import {productionWorkState,workStates} from './production-work-state.mjs';
import {canAccess,canReadContent,canReviewContent} from './library-permissions.mjs';
import {productionFileUrl} from './production-file-links.mjs';
import {courseProgressLink} from './studio-courses.mjs';
import {contentWorker} from './studio-worker-content.mjs';
import {esc,form,hidden,select,textarea,url} from './studio-ui.mjs';

export const isProductionTracker=p=>['courses','other'].includes(p?.studio?.productionTracking?.scope);
const originalId=r=>r.sourceId||r.fields?.production?.sourceId||r.source?.id||r.id;
const excludedKinds=new Set(['settings','worker-request','account-preview','notification']);
const courseRecord=(r,sources)=>['course','lesson'].includes(r.kind)||r.group==='Courses'||sources.get(originalId(r))?.group==='Courses';
export function projectTrackingSummaries(data){
 const summaries=new Map();
 if(data.actor.role==='admin'||!canAccess(data.actor,'work')||!canAccess(data.actor,'library'))return summaries;
 const sources=new Map((data.index?.records||[]).map(r=>[r.id,r]));
 for(const p of data.projects.filter(p=>isProductionTracker(p)&&!p.assignmentOnly&&p.creator_id===data.actor.id)){
  const config=p.studio.productionTracking;
  summaries.set(p.id,data.items.filter(r=>!excludedKinds.has(r.kind)&&r.status!=='Archived'&&contentWorker(r,data.byId)===config.worker&&(config.scope==='courses')===courseRecord(r,sources)).map(r=>({
   id:r.id,kind:r.kind,title:r.title,status:r.status,sourceId:originalId(r),workerId:config.worker,revision:r.revision,updatedAt:r.updatedAt,
   fields:{collection:r.fields?.collection,production:{checkedAt:r.fields?.production?.checkedAt,files:(r.fields?.production?.files||[]).map(f=>({name:f.name,url:f.url,bytes:f.bytes,sha256:f.sha256}))},
    ...(r.fields?.courseProductionIndex?{courseProductionIndex:true,runner:r.fields.runner?Object.fromEntries(['status','currentSourceId','stage','updatedAt','completedSourceIds','projectId'].map(key=>[key,r.fields.runner[key]])):null}:{})}
  })));
 }
 return summaries;
}
export const trackingStages=['To do','Imogen working','Awaiting review','Changes requested','Approved','Saved to SharePoint'];
function checkedExport(r){return (r?.fields?.production?.files||[]).some(f=>f.bytes>0&&/^[a-f0-9]{64}$/.test(f.sha256||''));}
function approvedSharePoint(r){
 return r.status==='Approved'&&(r.fields?.production?.files||[]).some(f=>{
  try{const u=new URL(f.url);return u.protocol==='https:'&&u.hostname==='nutritionfitness.sharepoint.com'&&/\/Content Library\//.test(decodeURIComponent(u.pathname))&&!/\/For review\//i.test(decodeURIComponent(u.pathname))&&f.bytes>0&&/^[a-f0-9]{64}$/.test(f.sha256||'');}catch{return false;}
 });
}
function actualStage(r,config){
 if(!r)return 'To do';
 if(r.status==='Approved')return approvedSharePoint(r)?'Saved to SharePoint':'Approved';
 if(r.status==='Changes requested')return 'Changes requested';
 if(r.status==='In review')return 'Awaiting review';
 if(config.pilotIds?.includes(r.id))return 'Imogen working';
 if(checkedExport(r))return 'Awaiting review';
 return 'Imogen working';
}
export function productionRunnerCheckpoint(p,data){
 if(p.studio?.productionTracking?.scope!=='courses')return null;
 const candidates=[...data.items,...(data.trackingByProject?.get(p.id)||[])];
 const index=candidates.find(r=>r.fields?.courseProductionIndex&&r.fields.runner?.projectId===p.id);
 if(!index)return null;
 return {record:index,...index.fields.runner};
}
const productionSourceKey=id=>String(id||'').replace(/^catalogue:/,'');
function currentProductionSource(checkpoint){
 const time=Date.parse(checkpoint?.updatedAt||'');
 return checkpoint?.status==='working'&&!checkpoint.completedSourceIds?.some(id=>productionSourceKey(id)===productionSourceKey(checkpoint.currentSourceId))&&Number.isFinite(time)&&Date.now()-time>=0&&Date.now()-time<15*60*1000?checkpoint.currentSourceId:null;
}
export function productionRowLinks(row,data,{pilot=false,working=false}={}){
 const r=row.record;if(!r)return '';
 const files=(r.fields?.production?.files||[]).filter(f=>f.bytes>0&&/^[a-f0-9]{64}$/.test(f.sha256||'')&&productionFileUrl(f.url));
 // Supporting exports stay on the asset page instead of duplicating row actions.
 const video=checkedVideo(r),canApprove=!pilot&&!working&&row.status==='Awaiting review'&&r.status!=='Approved'&&canReviewContent(data,r);
 const links=video&&canReadContent(data,r)?['<a class="btn" data-production-video data-video-title="'+esc(r.title)+'" data-video-src="'+url('video-source',{id:r.id,sha:video.sha256,revision:r.revision})+'" href="'+esc(productionFileUrl(video.url))+'" target="_blank" rel="noopener noreferrer" title="'+esc((pilot||working?'Previous export; replacement in progress. ':'')+(video.name||'Checked video export'))+'">Open video</a>']:[];
 if(canApprove&&files.length){
  const approval=form('review-decision',hidden('revision',r.revision)+hidden('decision','approve')+hidden('reviewId',randomUUID())+(video?hidden('videoSha256',video.sha256)+(r.source?.needsChecking?'<label class="video-source-check"><input type="checkbox" name="sourceChecked" value="yes" data-video-source-check required> I have checked this video against the original source.</label>':''):''),{section:'review-preview',id:r.id,...(video?{fragment:'1'}:{})},'Approve',video?'data-video-approval':'');
  if(video&&links.length)links.push('<div data-video-approval-source hidden>'+approval+'</div>');else if(!video)links.unshift(approval);
 }
 if(canReadContent(data,r))links.push('<a class="btn" href="'+url('item',{id:r.id})+'">Open asset</a>');
 return links.length?'<div class="studio-actions tracker-file-actions">'+links.join('')+'</div>':'';
}
export function productionTracking(p,data,meta={}){
 if(!isProductionTracker(p)||!canAccess(data.actor,'library'))return null;
 const config=p.studio.productionTracking,sources=new Map((data.index?.records||[]).map(r=>[r.id,r]));
 const summaries=data.trackingByProject?.get(p.id)||[],summaryIds=new Set(summaries.map(r=>r.id));
 const assigned=[...data.items,...summaries].filter(r=>!excludedKinds.has(r.kind)&&r.status!=='Archived'&&(canReadContent(data,r)||summaryIds.has(r.id))&&contentWorker(r,data.byId)===config.worker);
 const copies=new Map();
 for(const r of assigned){const key=originalId(r),old=copies.get(key);if(!old||(r.updatedAt||'')>(old.updatedAt||''))copies.set(key,r);}
 const manual=p.studio.trackingUpdates||{};
 const checkpoint=productionRunnerCheckpoint(p,data),current=currentProductionSource(checkpoint);
 const row=(key,title,group,record,extra={})=>{
  const update=manual[key],derived=actualStage(record,config);
  const checkedAt=checkedExport(record)?record.fields?.production?.checkedAt:null,completedTime=Date.parse(checkedAt||''),updateTime=Date.parse(update?.at||'');
  const supersededUpdate=Boolean(update)&&Number.isFinite(completedTime)&&Number.isFinite(updateTime)&&completedTime>updateTime;
  const effectiveUpdate=supersededUpdate?null:update;
  // Tracking can describe work, but cannot grant approval or assert file delivery.
  const working=Boolean(current)&&productionSourceKey(extra.sourceId)===productionSourceKey(current)&&(!Number.isFinite(completedTime)||Date.parse(checkpoint.updatedAt)>completedTime);
  const status=['Approved','Saved to SharePoint','Changes requested'].includes(derived)?derived:working?'Imogen working':
   effectiveUpdate&&['To do','Imogen working','Awaiting review','Changes requested'].includes(effectiveUpdate.status)?effectiveUpdate.status:derived;
  const result={key,title,group,record,status,note:update?.note||'',working,completedAt:checkedAt,supersededUpdate,...extra};return {...result,update:update||{},work:productionWorkState(result,checkpoint,effectiveUpdate||{})};
 };
 const rows=[],groups=[];
 if(config.scope==='courses'){
  const courses=Object.entries(meta.courses||{}).sort(([a],[b])=>a===config.course?-1:b===config.course?1:a.localeCompare(b));
  const occurrences=new Map();
  for(const [,course] of courses)for(const section of course.sections||[])for(const lesson of section.entries||[])occurrences.set(lesson.id,(occurrences.get(lesson.id)||0)+1);
  const matched=new Set();
  for(const [name,course] of courses){
   let count=0;
   for(const section of course.sections||[])for(const lesson of section.entries||[]){
    count++;
    const draft=occurrences.get(lesson.id)===1?copies.get(lesson.id):null,source=sources.get(lesson.id);
    if(data.actor.role!=='admin'&&!canAccess(data.actor,'originals')&&!draft&&!data.assigned.has(lesson.id))continue;
    if(source&&contentWorker(source,data.byId)&&contentWorker(source,data.byId)!==config.worker)continue;
    const key='lesson:'+name+':'+(lesson.key||lesson.position||lesson.id);
    rows.push(row(key,lesson.title||source?.title||'Lesson',name,draft,{module:section.title||'',position:lesson.position||count,sourceId:lesson.id}));
    if(draft)matched.add(draft.id);
   }
   const list=rows.filter(r=>r.group===name);
   if(list.length||data.actor.role==='admin'||canAccess(data.actor,'originals'))groups.push({name,confirmed:course.order==='confirmed',rows:list});
  }
  const unmatched=[...copies.values()].filter(r=>r.kind==='lesson'&&!matched.has(r.id));
  if(unmatched.length){const list=unmatched.map(r=>row('item:'+originalId(r),r.title,'Course to confirm',r,{sourceId:originalId(r)}));rows.push(...list);groups.push({name:'Course to confirm',confirmed:false,rows:list});}
 }else{
  // An assignment must exist on the item or its parent. A broad job description
  // never assigns the whole archive, and course assets cannot enter this tracker.
  const candidates=new Map(copies);
  if(data.actor.role==='admin'||canAccess(data.actor,'originals'))for(const r of sources.values()){
   if(!candidates.has(r.id)&&contentWorker(r,data.byId)===config.worker)candidates.set(r.id,r);
  }
  for(const [id,r] of candidates){
   if(courseRecord(r,sources)||excludedKinds.has(r.kind))continue;
   const saved=data.byId.get(r.id),group=r.fields?.collection||sources.get(id)?.fields?.collection||r.group||'Other content';
   rows.push(row('item:'+id,r.title,group,r.revision>0?(saved||r):null,{sourceId:id}));
  }
  rows.sort((a,b)=>a.group.localeCompare(b.group)||a.title.localeCompare(b.title));
  for(const name of new Set(rows.map(r=>r.group)))groups.push({name,confirmed:true,rows:rows.filter(r=>r.group===name)});
 }
 const counts=Object.fromEntries(trackingStages.map(s=>[s,rows.filter(r=>r.status===s).length]));
 return {rows,groups,counts,scope:config.scope,approved:counts.Approved+counts['Saved to SharePoint']};
}


function workUpdate(r,checkpoint){
 const u=r.update||{},time=Date.parse(r.work.at||u.at||'');
 const when=Number.isFinite(time)?new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/London'}).format(new Date(time))+' London time':'No update time recorded';
 return '<details class="tracker-work-update"><summary>Updates</summary><div><p class="tracker-update-time">'+esc(when)+'</p><p>'+esc(r.work.source)+'</p>'+(r.working?'<p><b>Current step:</b> '+esc(checkpoint.stage||'Production running')+'</p>':'')+(r.note?'<p><b>'+(r.supersededUpdate?'Earlier update (before checked export)':'Latest update')+':</b> '+esc(r.note)+'</p>':'<p>No written update yet.</p>')+(!r.supersededUpdate&&u.nextStep?'<p><b>Next step:</b> '+esc(u.nextStep)+'</p>':'')+(!r.supersededUpdate&&u.blocker?'<p class="work-blocker"><b>Blocker:</b> '+esc(u.blocker)+'</p>':'')+'</div></details>';

}
export function productionTrackerPanel(p,data,meta={}){
 const model=productionTracking(p,data,meta);if(!model)return '';
 const checkpoint=productionRunnerCheckpoint(p,data);
 const checkpointTime=Date.parse(checkpoint?.updatedAt||'');
 const savedTime=Number.isFinite(checkpointTime)?new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/London'}).format(new Date(checkpointTime))+' London time':'Time unavailable';
 const courseProgress=name=>{const r=data.items.find(x=>x.kind==='course'&&x.status!=='Archived'&&x.fields.production?.collection===name&&canReadContent(data,x));return r?courseProgressLink(r,{...data,trackingMeta:meta}):'';};
 const canUpdate=canAccess(data.actor,'edit')&&(data.actor.role==='admin'||p.creator_id===data.actor.id);
 const state={section:'project',project:p.id};
 const status=s=>'<span class="studio-status tracker-status" data-stage="'+esc(s)+'">'+esc(s==='Imogen working'?'In production':s)+'</span>';
 const renderRow=r=>{
 const progress=productionItemProgress(p,data,r.sourceId);
 const working=r.working,pilot=p.studio.productionTracking.pilotIds?.includes(r.record?.id);
 return '<li class="tracker-row" data-tracker-completed="'+((progress?.label||r.work.label)==='Completed'?'true':'false')+'"><div><strong>'+(r.position?'<span class="tracker-position">'+esc(r.position)+'.</span> ':'')+esc(r.title)+'</strong>'+(r.module?'<small>'+esc(r.module)+'</small>':'')+productionItemProgressHtml(progress)+productionRowLinks(r,data,{pilot,working})+workUpdate(r,checkpoint)+'</div><div class="tracker-row-state"><span class="work-state" data-work-state="'+esc(progress?.label||r.work.label)+'">'+esc(progress?.label||r.work.label)+'</span>'+status(working&&!['Approved','Saved to SharePoint'].includes(r.status)?'Imogen working':r.status)+
  (canUpdate?'<details class="tracker-update"><summary>Update</summary>'+form('tracking-update',hidden('projectRevision',p.revision)+hidden('trackingKey',r.key)+select('status','Review / production stage',Object.fromEntries(trackingStages.slice(0,4).map(s=>[s,s])),trackingStages.slice(0,4).includes(r.status)?r.status:'Awaiting review')+select('workState','Work state',{'':'Not reported',...Object.fromEntries(workStates.map(s=>[s,s]))},r.update.workState||'')+textarea('note','Latest update — what has been done?',r.note,2)+textarea('nextStep','Next step',r.update.nextStep||'',2)+textarea('blocker','Blocker / reason stopped',r.update.blocker||'',2),state,'Save')+'</details>':'')+'</div></li>';
 };
 const summaries=[['To do',model.counts['To do']],['With Imogen',model.counts['Imogen working']+model.counts['Changes requested']],['Awaiting review',model.counts['Awaiting review']],['Approved',model.approved],['In SharePoint',model.counts['Saved to SharePoint']]];
 return backgroundJobPanel(p,data)+'<section class="production-tracker" data-tracker-project="'+esc(p.id)+'" data-tracker-actor="'+esc(data.actor.id)+'" data-worker-updates="project-progress" aria-label="'+(model.scope==='courses'?'Course tracking':'Imogen’s other content tracking')+'"><p class="tracker-intro">'+(model.scope==='courses'?'Imogen brands the lessons. Kasia reviews and approves.':'Only non-course content assigned to Imogen appears here. Kasia reviews and approves.')+'</p>'+
 latestProductionProgress(p,data,model.rows)+(checkpoint&&!model.rows.some(r=>productionItemProgress(p,data,r.sourceId))?'<section class="panel production-checkpoint"><h2>Latest production update</h2><p>'+esc(checkpoint.currentSourceId||'Courses')+' · '+esc(checkpoint.stage||checkpoint.status)+'</p><p class="meta">Last saved progress: '+esc(savedTime)+'. Updates after each production step.</p>'+(canReadContent(data,checkpoint.record)?'<a href="'+url('item',{id:checkpoint.record.id})+'">Open production log</a>':'')+'</section>':'')+'<div class="tracker-counts">'+summaries.map(([label,n])=>'<div><strong>'+n+'</strong><span>'+esc(label)+'</span></div>').join('')+'</div>'+
  '<div class="tracker-filters"><label><input type="checkbox" data-hide-completed> Hide completed</label><span data-tracker-visible role="status" aria-live="polite"></span></div>'+
  (model.groups.length?model.groups.map(g=>'<details class="tracker-group" data-tracker-group'+(g.name===p.studio.productionTracking.course||model.scope==='other'?' open':'')+'><summary class="project-section-heading"><h2>'+esc(g.name)+'</h2><span>'+(g.rows.length?g.rows.filter(r=>['Approved','Saved to SharePoint'].includes(r.status)).length+' / '+g.rows.length+' approved':'Lesson list needed')+'</span></summary>'+courseProgress(g.name)+(!g.confirmed?'<p class="project-muted">'+(g.rows.length?'Lesson order still needs checking.':'The lesson list still needs checking before work can be tracked.')+'</p>':'')+'<ul>'+g.rows.map(renderRow).join('')+'</ul><p class="project-muted" data-tracker-group-empty hidden>All items in this group are completed.</p></details>').join(''):'<p class="studio-empty">'+(model.scope==='other'?'No other content is assigned to Imogen yet. Assign an item to Imogen in the content library to include it here.':'No course lessons are available to track yet.')+'</p>')+'<p class="project-count-note">Approval and SharePoint completion follow the saved content records. Changes here only update this tracker.</p><link rel="stylesheet" href="/production-tracker-filter.css"><script type="module" src="/production-tracker-filter.js"></script></section>';
}
