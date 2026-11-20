import {launchPackChildren} from './launch-packs.mjs';
import {createHash} from 'node:crypto';
import {HttpError} from './platform.mjs';
import {canReadContent,reviewsKind} from './library-permissions.mjs';
import {workerImagePath} from './worker-images.mjs';
import {esc,url,hidden,textarea,button,badge} from './studio-ui.mjs';

export const coursePackFields={
 introduction:'Course introduction',outcome:'Learning outcomes',audience:'Who it is for',
 marketingCopy:'Marketing & landing page copy',introductionScript:'Introduction video script',
 heroImageUrl:'Hero image link',heroImageAlt:'Hero image description',heroImageCredit:'Hero image source / rights',
 welcomeEmail:'Welcome email',socialCopy:'Social launch copy'
};
export const courseProductionBrief='Before starting each course, check the complete source index, scripts, lesson order and supporting files; flag missing material. Prepare the complete course structure for James to approve separately from finished content. Produce the course introduction, learning outcomes, audience, marketing and landing page copy, introduction video script, a real branded hero image with description and source/rights, welcome email and social launch copy. Keep ONE parent launch pack linked to the existing course. Save the overview, marketing and landing page copy, intro script, welcome email, social copy and each generated image as separate reviewable child drafts, not separate top-level jobs. Every child must carry fields.launchPackId (the exact parent Studio ID) and fields.launchPackPart from the launchPack contract. The parent is their index. Generate new images using our Brand kit, approved course colours, DM Sans/Kalam and current logo/tagline; do not select stock or library photos. Upload real generated files with alt text and AI provenance. Save all as Draft. Continue three course lessons every day plus other assigned library content; do not stop because three drafts are awaiting review. Never approve or publish your own work. Preserve the evidenced teaching content and flag unsupported claims, prices or promises. Label narration timing estimates separately from measured video duration.';
const text=v=>typeof v==='string'?v.trim():'';
const imageUrl=v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}};

export function coursePlan(r,data){
 const name=r.fields.production?.collection,source=name?data.trackingMeta?.courses?.[name]:null;
 const savedLesson=id=>data.byId.get(id)||data.byId.get('training:'+id);
 const sections=source?(source.sections||[]).map(s=>({title:s.title||'Lessons',lessons:(s.entries||[]).map(e=>({id:e.id,title:e.title||'Lesson'}))})):
  name?[]:[{title:'Lessons',lessons:(r.fields.lessonIds||[]).map(id=>({id:savedLesson(id)?.id||id,title:savedLesson(id)?.title||'Lesson unavailable'}))}];
 const lessons=sections.flatMap(s=>s.lessons),ids=lessons.map(l=>l.id);
 const complete=lessons.length>0&&new Set(ids).size===ids.length&&ids.every(id=>typeof id==='string'&&id)&&
  (source?source.order==='confirmed':ids.every(id=>data.byId.has(id)));
 const fingerprint=createHash('sha256').update(JSON.stringify({name:name||r.title,sections})).digest('hex');
 const review=r.courseStructureReview,approved=complete&&review?.decision==='approve'&&review.fingerprint===fingerprint;
 return {sections,lessons,fingerprint,complete,approved,review,source:Boolean(source)};
}
export function coursePack(r,data){
 // Workers can deliver the pack through the existing Content Manager connector.
 // Only readable, explicitly linked packs appear; a similarly named item is not a match.
 const linked=data.items.filter(x=>x.id!==r.id&&x.status!=='Archived'&&x.fields?.coursePack===true&&x.fields.courseId===r.id&&canReadContent(data,x))
  .sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''))[0];
 const fields={...r.fields,...(linked?.fields||{})};
 const children=linked?launchPackChildren(linked,data):[];
 const mappings={landingPage:'marketingCopy',introScript:'introductionScript',welcomeEmail:'welcomeEmail',socialCopy:'socialCopy'};
 for(const child of children){const part=child.fields.launchPackPart,key=mappings[part];if(part==='overview')for(const field of ['introduction','outcome','audience'])if(text(child.fields[field]))fields[field]=child.fields[field];if(key)fields[key]=child.fields[key]||child.fields.script||child.fields.body||fields[key];}
 // An owner's saved course edits take precedence over subsequent worker drafts.
 for(const key of Object.keys(coursePackFields))if(text(r.fields[key]))fields[key]=r.fields[key];
 const imageRecord=r.workerImage?r:children.find(x=>x.fields.launchPackPart==='hero'&&x.workerImage)||linked||r;
 const uploaded=imageRecord.workerImage?.bucket==='worker-content'&&workerImagePath(imageRecord.workerImage.path);
 const hero=imageUrl(r.fields.heroImageUrl)||(uploaded?url('article-image',{id:imageRecord.id}).replaceAll('&amp;','&'):imageUrl(fields.heroImageUrl));
 if(uploaded){fields.heroImageAlt=r.fields.heroImageAlt||imageRecord.fields?.imageAlt||fields.imageAlt||fields.heroImageAlt;fields.heroImageCredit=r.fields.heroImageCredit||imageRecord.fields?.imageCredit||fields.imageCredit||fields.heroImageCredit;}
 const checks=[
  ['overview','Overview, outcomes & audience',['introduction','outcome','audience'].every(k=>text(fields[k]))],
  ['marketingCopy','Marketing & landing page copy',Boolean(text(fields.marketingCopy))],
  ['introductionScript','Introduction video script',Boolean(text(fields.introductionScript))],
  ['heroImageUrl','Hero image',Boolean(hero&&text(fields.heroImageAlt)&&text(fields.heroImageCredit))],
  ['welcomeEmail','Welcome email',Boolean(text(fields.welcomeEmail))],
  ['socialCopy','Social launch copy',Boolean(text(fields.socialCopy))]
 ];
 return {fields,linked,hero,checks,ready:checks.filter(([, ,ready])=>ready).length};
}
export function courseEditorRecord(r,data){
 const {fields}=coursePack(r,data);
 return {...r,fields:{...r.fields,...Object.fromEntries(Object.keys(coursePackFields).map(key=>[key,fields[key]||'']))}};
}
export function courseProgressLink(r,data){
 const pack=coursePack(r,data),plan=coursePlan(r,data);
 return '<p class="course-progress-link">'+button('Open course & structure',url('item',{id:r.id}))+' <span>'+ (plan.approved?'Structure approved':'Structure awaiting approval')+' · '+pack.ready+'/'+pack.checks.length+' supporting drafts ready</span></p>';
}
export function coursePreview(r,data,readable){
 const plan=coursePlan(r,data),pack=coursePack(r,data),f=pack.fields;
 let position=0;
 const draftFor=id=>data.items.find(x=>x.kind==='lesson'&&x.status!=='Archived'&&(x.id===id||x.parent===r.id&&String(x.sourceId||'').replace(/^catalogue:/,'')===String(id).replace(/^catalogue:/,'')));
 const state=plan.approved?'Structure approved':plan.review?.decision==='changes'?'Structure changes requested':'Structure awaiting approval';
 const hero=pack.hero;
 const overview=['introduction','outcome','audience'].filter(k=>text(f[k])).map(k=>'<section><h3>'+esc(coursePackFields[k])+'</h3><div class="prose">'+readable(f[k],data)+'</div></section>').join('');
 let out='<section class="panel course-overview"><h2>Course overview</h2>'+(hero?'<figure><img class="course-hero" src="'+esc(hero)+'" alt="'+esc(f.heroImageAlt||'')+'"><figcaption>'+esc(f.heroImageCredit||'Image source / rights still needed')+'</figcaption></figure>':'')+
  (overview||'<p class="studio-empty">Imogen still needs to add the course introduction, outcomes and audience. The full lesson structure is below.</p>')+'</section>';
 out+='<section class="panel course-structure"><div class="project-section-heading"><h2>Course structure</h2>'+badge(state)+'</div><p class="meta">'+plan.sections.filter(s=>s.lessons.length).length+' modules · '+plan.lessons.length+' lessons'+(plan.source?' · Order checked against the original course':'')+'</p>'+
  '<p>Approve the module and lesson order here. Lessons and supporting content stay as drafts for separate checking.</p>';
 if(plan.review)out+='<p class="meta">'+esc(plan.review.by)+' · '+esc(plan.review.at?.slice(0,10)||'')+(plan.review.fingerprint!==plan.fingerprint?' · The structure has changed since that review.':'')+'</p>'+(plan.review.note?'<p>'+esc(plan.review.note)+'</p>':'');
 out+='<p>'+button('Review this structure','#course-structure-review')+'</p>';
 out+=plan.sections.filter(s=>s.lessons.length).map((s,i)=>'<details class="course-module"'+(i===0?' open':'')+'><summary>'+esc(s.title)+' <span>'+s.lessons.length+' lessons</span></summary><ol start="'+(position+1)+'">'+s.lessons.map(l=>{position++;const draft=draftFor(l.id);return '<li><span>'+(draft?'<a href="'+url('item',{id:draft.id})+'">'+esc(l.title)+'</a>':esc(l.title))+'</span><small>'+(draft?esc(draft.status):'Not yet created')+'</small></li>';}).join('')+'</ol></details>').join('');
 if(!plan.complete)out+='<p class="studio-empty">The complete lesson list and order still need checking before structure approval.</p>';
 out+='<div id="course-structure-review">';
 if(reviewsKind(data.actor,'course')&&canReadContent(data,r)&&r.status!=='Archived')out+='<form method="post" action="'+url('item',{id:r.id})+'" class="studio-form course-review-form">'+hidden('action','course-structure-review')+hidden('revision',r.revision)+hidden('fingerprint',plan.fingerprint)+textarea('note','Structure review note (optional)', '',2)+'<div class="studio-actions">'+
  (plan.complete&&!plan.approved?'<button class="primary" name="decision" value="approve">Approve course structure</button>':'')+'<button name="decision" value="changes">Request structure changes</button></div></form>';
 out+='</div></section><section class="panel course-pack"><div class="project-section-heading"><h2>Course launch content</h2><span>'+pack.ready+' / '+pack.checks.length+' drafts ready</span></div><p class="meta">Imogen prepares these alongside the lessons. Drafts ready means content is saved, not approved.</p>'+
  '<ul class="course-pack-checks">'+pack.checks.map(([key,label,ready])=>'<li><span>'+esc(label)+'</span><span>'+ (ready?'Draft ready':'Still needed')+'</span></li>').join('')+'</ul>'+
  (pack.linked?'<p>'+button('Open supporting draft',url('item',{id:pack.linked.id}))+'</p>':'');
 if(text(f.introductionScript))out+='<section class="studio-video-tools" aria-label="Introduction script"><button type="button" data-copy-script>Copy introduction script</button><textarea hidden data-script-text>'+esc(f.introductionScript)+'</textarea><span>Estimated narration: '+Math.ceil(text(f.introductionScript).split(/\s+/).length/140*60)+' seconds at 140 words/minute</span><span role="status" data-copy-status></span></section>';
 out+=['marketingCopy','welcomeEmail','socialCopy'].filter(k=>text(f[k])).map(k=>'<details><summary>'+esc(coursePackFields[k])+'</summary><div class="prose">'+readable(f[k],data)+'</div></details>').join('')+'</section>';
 return out;
}
export async function reviewCourseStructure(params,f,data,api){
 const r=data.byId.get(params.get('id'));
 if(!r||r.kind!=='course'||!canReadContent(data,r)||!reviewsKind(data.actor,'course'))throw new HttpError(403,'Course reviewer access is required.');
 if(r.status==='Archived')throw new HttpError(409,'Restore this course before reviewing its structure.');
 const plan=coursePlan(r,data);
 if(Number(f.revision)!==r.revision||f.fingerprint!==plan.fingerprint)throw new HttpError(409,'The course changed. Reopen it and check the latest structure before reviewing.');
 if(!['approve','changes'].includes(f.decision))throw new HttpError(400,'Choose a structure review decision.');
 if(f.decision==='approve'&&!plan.complete)throw new HttpError(400,'Confirm the complete lesson list and order before approval.');
 const note=typeof f.note==='string'?f.note.trim():'';
 if(note.length>4000||f.decision==='changes'&&!note)throw new HttpError(400,'Describe the structure changes needed (up to 4,000 characters).');
 const review={decision:f.decision,fingerprint:plan.fingerprint,by:data.actor.name||'Administrator',actorId:data.actor.id,at:new Date().toISOString(),note};
 const document={...r,courseStructureReview:review,courseStructureHistory:[...(r.courseStructureHistory||[]),review]};
 const rows=await api('/rest/v1/rpc/nufi_studio_save',{service:true,method:'POST',payload:{item:r.id,expected:r.revision,document,editor_name:data.actor.role+':'+data.actor.id}});
 if(!rows.length)throw new HttpError(409,'The course changed. Reopen it before saving your review.');
 return {section:'item',id:r.id};
}
