import {createHash} from 'node:crypto';
import {HttpError} from './platform.mjs';
import {saveRecord} from './studio-store.mjs';
import {references,issues} from './studio-model.mjs';
import {canReadContent,canEditContent,canReviewContent,canAccess} from './library-permissions.mjs';
import {coursePlan,coursePack,courseApprovalRecord} from './studio-courses.mjs';
import {hasReadyVideo,offeringKinds} from './review-policy.mjs';
import {isProductionTracker,productionTracking,productionRowLinks} from './studio-production-tracker.mjs';
import {esc,url,heading,button,form,hidden,select,badge} from './studio-ui.mjs';
const active=r=>r&&r.status!=='Archived'&&!['settings','worker-request','notification','supplier'].includes(r.kind)&&!r.fields?.previewOnly&&!r.fields?.courseProductionIndex;
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,canonical(value[k])])):value;
const hash=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const forwardReferences=(r,data)=>{const fields={...(r.fields||{})};for(const key of ['courseId','programmeId','bookId','challengeId','themeId','collectionId','launchPackId','productIds'])delete fields[key];if(fields.production){fields.production={...fields.production};delete fields.production.courseId;}return references({...r,fields},data.byId);};
const content=r=>({id:r.id,kind:r.kind,title:r.title,parent:r.parent||'',collectionId:r.collectionId||'',themeId:r.themeId||'',sourceId:r.sourceId||r.source?.id||'',fields:r.fields||{},workerImage:r.workerImage||null,articleImage:r.articleImage||null});
const documents=data=>data.offeringReviews||data.items.filter(r=>r.kind==='settings'&&r.fields?.websiteOfferingReview===true);
export const offeringDocumentId=key=>'studio:website-offering:'+hash(key);
const saved=(data,key)=>documents(data).find(r=>r.id===offeringDocumentId(key));
function offeringRoot(data,key){
 if(key?.startsWith('project:')){const p=data.projects.find(p=>p.id===key.slice(8));if(!p||isProductionTracker(p)||!canAccess(data.actor,'work')||data.actor.role!=='admin'&&p.creator_id!==data.actor.id&&!p.entries?.some(e=>e.assignee===data.actor.id))throw new HttpError(404,'This offering is unavailable.');return {key,title:p.name,project:p,editable:data.actor.role==='admin'||canAccess(data.actor,'edit')&&p.creator_id===data.actor.id};}
 const r=data.byId.get(key);if(!active(r)||r.sourceOnly||!offeringKinds.has(r.kind)||!canReadContent(data,r))throw new HttpError(404,'Choose an available offering.');return {key,title:r.title,record:r,editable:canEditContent(data,r.id)};
}
export function offeringChoices(data){
 return [...data.items.filter(r=>active(r)&&!r.sourceOnly&&offeringKinds.has(r.kind)&&canReadContent(data,r)).map(r=>({key:r.id,title:r.title,label:r.kind+' · '+r.title})),...data.projects.filter(p=>!isProductionTracker(p)&&p.status!=='Archived'&&(data.actor.role==='admin'||p.creator_id===data.actor.id||p.entries?.some(e=>e.assignee===data.actor.id))).map(p=>({key:'project:'+p.id,title:p.name,label:'Launch · '+p.name}))];
}
export function offeringManifest(data,key,extraIds=saved(data,key)?.fields.extraIds||[]){
 const root=offeringRoot(data,key),ids=new Set(root.record?[root.record.id]:[root.project.studio?.rootId,...(root.project.studio?.allowedIds||[]),...(root.project.entries||[]).flatMap(e=>[e.record,...(e.scopeIds||[])])].filter(Boolean));
 for(const id of extraIds){const r=data.byId.get(id);if(!active(r)||r.sourceOnly||!offeringKinds.has(r.kind)||!canReadContent(data,r))throw new HttpError(400,'Choose readable content for this offering.');ids.add(id);}
 let changed=true;while(changed){changed=false;for(const id of [...ids]){const r=data.byId.get(id);if(!active(r))continue;for(const ref of forwardReferences(r,data)){if(active(data.byId.get(ref))&&!ids.has(ref)){ids.add(ref);changed=true;}}}
 for(const r of data.items){if(!active(r)||ids.has(r.id))continue;const links=[r.parent,r.collectionId,r.themeId,r.fields?.courseId,r.fields?.programmeId,r.fields?.bookId,r.fields?.challengeId,r.fields?.launchPackId,r.fields?.production?.courseId,...(r.fields?.productIds||[])];if(links.some(id=>id&&ids.has(id))||(data.collectionLinks||[]).some(l=>l.contentId===r.id&&ids.has(l.collectionId))){ids.add(r.id);changed=true;}}}
 const records=[...ids].map(id=>data.byId.get(id)).filter(active).sort((a,b)=>a.id.localeCompare(b.id));
 if(records.some(r=>!canReadContent(data,r)))throw new HttpError(403,'Some linked content is outside your access. Ask the offering owner to prepare its website review.');
 const videos=records.filter(hasReadyVideo),unapprovedVideos=videos.filter(r=>r.status!=='Approved'),checks=[];
 for(const r of records){if(r.sourceOnly||r.status==='Approved'||hasReadyVideo(r))continue;const candidate=structuredClone(r.kind==='course'?courseApprovalRecord(r,data):r);if(candidate.source?.needsChecking)candidate.source.needsChecking=false;for(const issue of issues(candidate,data.items))checks.push({id:r.id,title:r.title,issue});}
 if(root.record?.kind==='course'){const plan=coursePlan(root.record,data),pack=coursePack(root.record,data);if(!plan.complete)checks.push({id:root.record.id,title:root.title,issue:'Confirm the full lesson list and order.'});if(pack.ready<pack.checks.length)checks.push({id:root.record.id,title:root.title,issue:'Finish the linked launch content before website sign-off.'});}
 const fingerprint=hash({key,title:root.title,extraIds:[...extraIds].sort(),records:records.map(content)});
 return {...root,records,videos,unapprovedVideos,checks,extraIds:[...extraIds],fingerprint};
}
export function approvedOffering(data,key){const doc=saved(data,key);if(doc?.fields.state!=='approved')return null;try{const manifest=offeringManifest(data,key);return doc.fields.fingerprint===manifest.fingerprint&&!manifest.unapprovedVideos.length&&!manifest.checks.length?{document:doc,manifest}:null;}catch{return null;}}
export function offeringForRecord(data,record){
 if(offeringKinds.has(record.kind)&&!record.sourceOnly)return record.id;
 const queue=[record],seen=new Set();while(queue.length){const r=queue.shift();if(!r||seen.has(r.id))continue;seen.add(r.id);for(const id of [r.parent,r.collectionId,r.fields?.courseId,r.fields?.programmeId,r.fields?.bookId,r.fields?.challengeId,r.fields?.launchPackId,r.fields?.production?.courseId,...(r.fields?.productIds||[])]){const p=data.byId.get(id);if(p&&offeringKinds.has(p.kind)&&canReadContent(data,p))return p.id;if(p)queue.push(p);}}
 return '';
}
export function offeringPanel(record,data){const key=offeringForRecord(data,record);return key?'<section class="panel offering-review-note"><p>Working drafts are checked together when the whole offering is ready for the website.</p>'+button('Website offering review',url('offering-review',{offering:key}))+'</section>':'';}
export function videoReviewRecords(data){
 const blocked=new Set(),tracked=new Map();for(const p of data.projects.filter(isProductionTracker)){const model=productionTracking(p,data,data.trackingMeta||{});for(const row of model?.rows||[]){if(row.record){tracked.set(String(row.sourceId||row.record.sourceId||'').replace(/^catalogue:/,''),row.record.id);if(row.working||p.studio.productionTracking.pilotIds?.includes(row.record.id))blocked.add(row.record.id);}}}
 const latest=new Map();for(const r of data.items.filter(hasReadyVideo)){const source=String(r.sourceId||r.fields?.production?.sourceId||r.workerSource?.sourceId||'').replace(/^catalogue:/,'');if(source&&tracked.has(source)&&tracked.get(source)!==r.id)continue;const key=source||r.id,old=latest.get(key);if(!old||(r.updatedAt||'')>(old.updatedAt||''))latest.set(key,r);}
 return [...latest.values()].filter(r=>['Draft','In review'].includes(r.status)&&!blocked.has(r.id)&&canReadContent(data,r)&&canReviewContent(data,r));
}
export function reviewQueue(data){
 const videos=videoReviewRecords(data).map(r=>({type:'video',title:r.title,status:'Video ready',context:'Finished video',record:r,recordId:r.id,href:url('item',{id:r.id})}));
 if(data.actor.role!=='admin')return videos;
 const offerings=[];for(const doc of documents(data)){if(!['requested','approved'].includes(doc.fields.state))continue;try{const m=offeringManifest(data,doc.fields.offeringKey);if(doc.fields.state==='approved'&&doc.fields.fingerprint===m.fingerprint&&!m.unapprovedVideos.length&&!m.checks.length)continue;offerings.push({type:'offering',title:m.title,status:doc.fields.state==='approved'?'Changed since sign-off':'Ready for website review',context:'Whole offering · '+m.records.length+' linked items',href:url('offering-review',{offering:m.key})});}catch{}}
 return [...videos,...offerings];
}
export function reviewRowsHtml(rows,data){return rows.length?'<ul class="studio-list offering-review-list">'+rows.map(row=>'<li><div><strong>'+esc(row.title)+'</strong><small>'+esc(row.context)+'</small></div><div class="studio-actions">'+badge(row.status)+(row.type==='video'?productionRowLinks({record:row.record,status:'Awaiting review'},data).replace('>Open video</a>','>Open video &amp; approve</a>'):button('Review whole offering',row.href))+'</div></li>').join('')+'</ul>':'<p class="studio-empty">No finished videos or website offerings are waiting for approval.</p>';}
export function offeringReviewPage(params,data){
 const key=params.get('offering');if(!key)return heading('Website offering review','One final sign-off covers the complete offering, including its linked content and assets.')+form('offering-open',select('offering','Offering',{'':'Choose an offering',...Object.fromEntries(offeringChoices(data).map(r=>[r.key,r.label]))},''),{section:'offering-review'},'Open offering');
 const m=offeringManifest(data,key),doc=saved(data,key),valid=approvedOffering(data,key),selected=new Set(m.extraIds);
 const extras=m.project?'<details><summary>Content included in this launch</summary><p>Select the products or other content that make up this offering. Their linked assets are included automatically.</p>'+offeringChoices(data).filter(r=>!r.key.startsWith('project:')).map(r=>'<label class="check"><input type="checkbox" name="include:'+esc(r.key)+'" value="yes"'+(selected.has(r.key)?' checked':'')+'> '+esc(r.title)+'</label>').join('')+'</details>':'';
 const submit=m.editable&&!valid&&(data.actor.role!=='admin'||m.project)?form('offering-request',hidden('offering',key)+hidden('revision',doc?.revision||0)+extras,{section:'offering-review',offering:key},m.project&&data.actor.role==='admin'?'Save offering contents':doc?.fields.state==='requested'?'Update website review request':'Ready for website review'):'';
 const approvals=data.actor.role==='admin'&&m.records.length&&!valid?form('offering-approve',hidden('offering',key)+hidden('revision',doc?.revision||0)+hidden('fingerprint',m.fingerprint)+'<label class="check"><input type="checkbox" name="confirmed" value="yes" required> I have checked the whole offering, including its linked content and assets, and approve this version for the website.</label>',{section:'offering-review',offering:key},'Approve whole offering for website'):'';
 return button('← Reviews',url('review'))+heading(m.title,'Final website sign-off · '+m.records.length+' linked content items and assets')+(valid?'<p class="studio-status">Approved for website · this saved offering</p>'+button('Download approved offering',url('offering-review',{offering:key,download:'1'})):'<p>Keep developing the drafts without individual sign-offs. Submit the whole offering here when it is ready for the website.</p>')+
 (m.unapprovedVideos.length?'<section class="panel"><h2>Videos still need approval</h2>'+reviewRowsHtml(m.unapprovedVideos.map(r=>({type:'video',title:r.title,context:'Video check',status:'Needs video approval',record:r})),data)+'</section>':'')+
 (m.checks.length?'<details open><summary>Content to finish ('+m.checks.length+')</summary><ul>'+m.checks.map(c=>'<li><strong>'+esc(c.title)+'</strong> · '+esc(c.issue)+'</li>').join('')+'</ul></details>':'')+'<details open><summary>Included content ('+m.records.length+')</summary><ul class="production-file-list">'+m.records.map(r=>'<li><a href="'+url('item',{id:r.id})+'">'+esc(r.title)+'</a><small>'+esc(r.kind)+(hasReadyVideo(r)?' · video '+(r.status==='Approved'?'approved':'awaiting approval'):' · included in offering sign-off')+'</small></li>').join('')+'</ul></details>'+submit+(m.unapprovedVideos.length||m.checks.length?'<p>Finish the checks above before the final website sign-off.</p>':approvals);
}
export async function offeringReviewAction(f,data,api){
 if(f.action==='offering-open'){offeringRoot(data,f.offering);return f.offering;}
 const old=saved(data,f.offering),root=offeringRoot(data,f.offering);if(Number(f.revision)!==(old?.revision||0))throw new HttpError(409,'This offering review changed. Open the latest version.');
 if(f.action==='offering-request'){
  if(!root.editable||!canAccess(data.actor,'edit'))throw new HttpError(403,'Only the offering owner can submit it for website review.');
  const extras=root.project?Object.entries(f).filter(([key,value])=>key.startsWith('include:')&&value==='yes').map(([key])=>key.slice(8)):old?.fields.extraIds||[];
  const m=offeringManifest(data,f.offering,extras);if(!m.records.length)throw new HttpError(400,'Include the offering’s content before requesting website review.');
  await saveRecord(api,data.actor,{id:offeringDocumentId(m.key),kind:'settings',title:'Website offering review · '+m.title,status:'Draft',fields:{websiteOfferingReview:true,offeringKey:m.key,extraIds:extras,state:'requested',fingerprint:m.fingerprint,requestedBy:data.actor.id,requestedAt:new Date().toISOString()}},old?.revision||0);return m.key;
 }
 if(f.action!=='offering-approve')throw new HttpError(400,'Choose a website review action.');
 if(data.actor.role!=='admin')throw new HttpError(403,'Only the administrator can approve a website offering.');
 const m=offeringManifest(data,f.offering);if(!m.records.length||m.fingerprint!==f.fingerprint)throw new HttpError(409,'The offering changed. Check its latest content before approving.');
 if(f.confirmed!=='yes')throw new HttpError(400,'Confirm you checked the whole offering.');if(m.checks.length)throw new HttpError(400,'Finish the offering content checks before website sign-off.');if(m.unapprovedVideos.length)throw new HttpError(400,'Approve the finished videos before website sign-off.');
 await saveRecord(api,data.actor,{id:offeringDocumentId(m.key),kind:'settings',title:'Website offering review · '+m.title,status:'Approved',fields:{...(old?.fields||{}),websiteOfferingReview:true,offeringKey:m.key,extraIds:m.extraIds,state:'approved',fingerprint:m.fingerprint,approvedBy:data.actor.id,approvedAt:new Date().toISOString(),members:m.records.map(r=>({id:r.id,revision:r.revision||0,contentHash:hash(content(r))}))}},old?.revision||0);return m.key;
}

export async function websiteApprovedRecord(r,data,api){
 if(data.actor.role!=='admin')throw new HttpError(403,'Only the administrator can prepare website content.');
 const approval=documents(data).map(doc=>approvedOffering(data,doc.fields.offeringKey)).find(a=>a?.manifest.records.some(item=>item.id===r.id));
 if(!approval)throw new HttpError(400,'Approve the whole offering for the website before publishing this content.');
 if(r.status==='Approved'&&r.approval?.revision===r.revision)return r;
 const next=structuredClone(r);delete next.revision;delete next.updatedAt;next.status='Approved';if(next.source?.needsChecking)next.source.needsChecking=false;
 next.approval={by:approval.document.fields.approvedBy,at:approval.document.fields.approvedAt,revision:r.revision+1,offeringKey:approval.manifest.key,offeringFingerprint:approval.manifest.fingerprint};
 const row=await saveRecord(api,data.actor,next,r.revision);const record={...next,revision:row.revision};data.byId.set(r.id,record);return record;
}
