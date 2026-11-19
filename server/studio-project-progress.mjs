import {canAccess,canReadContent} from './library-permissions.mjs';
import {contentWorker,workerNames} from './studio-worker-content.mjs';
import {esc,url} from './studio-ui.mjs';

const sourceId=r=>r.sourceId||r.fields?.production?.sourceId||r.source?.id||r.id;
const day=value=>{const d=new Date(value);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(d):'';};
const dateLabel=value=>new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',day:'numeric',month:'short'}).format(new Date(value));
const target=n=>Number.isSafeInteger(n)&&n>0?n:3;
const tracked=p=>p?.studio?.productionTracking;
function recordsFor(p,data){
 const config=tracked(p);if(!config||!canAccess(data.actor,'library'))return [];
 return data.items.filter(r=>!['settings','worker-request','account-preview'].includes(r.kind)&&r.status!=='Archived'&&canReadContent(data,r)&&
  contentWorker(r,data.byId)===config.worker&&
  (config.scope==='library'||config.itemIds?.includes(r.id)||r.fields?.projectId===p.id));
}

// The first persisted version is stable when a draft is edited or approved later.
// Query only records that this viewer is allowed to read; never load draft bodies.
export async function loadProjectProductionDates(api,p,data){
 if(!tracked(p))return;
 const records=recordsFor(p,data),dates=new Map();
 try{
  for(let i=0;i<records.length;i+=100){
   const ids=records.slice(i,i+100).map(r=>JSON.stringify(r.id)).join(',');
   const rows=await api('/rest/v1/nufi_studio_versions?select=item_id,created_at&revision=eq.1&item_id=in.'+encodeURIComponent('('+ids+')')+'&limit=100',{service:true});
   for(const row of rows)dates.set(row.item_id,row.created_at);
  }
  data.productionFirstSaved=dates;
 }catch{data.productionFirstSaved=null;}
}

export function projectProduction(p,data,meta={},now=new Date()){
 const config=tracked(p);if(!config||!canAccess(data.actor,'library'))return null;
 const all=recordsFor(p,data),unique=new Map();
 for(const r of all){
  const key=sourceId(r),old=unique.get(key);
  // Copies of one original count once; display the most recently saved copy.
  if(!old||(r.updatedAt||'')>(old.updatedAt||''))unique.set(key,r);
 }
 const items=[...unique.values()].sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||'')||a.title.localeCompare(b.title));
 const firstSaved=new Map();
 for(const r of all){const value=data.productionFirstSaved?.get(r.id);if(value&&day(value)){
  const key=sourceId(r),old=firstSaved.get(key);if(!old||new Date(value)<new Date(old))firstSaved.set(key,value);
 }}
 const today=day(now),knownDates=data.productionFirstSaved instanceof Map&&items.every(r=>firstSaved.has(sourceId(r)));
 const newToday=items.filter(r=>day(firstSaved.get(sourceId(r)))===today);
 const lessons=items.filter(r=>r.kind==='lesson'),other=items.filter(r=>!['course','lesson'].includes(r.kind));
 const manifest=meta.courses?.[config.course],lessonIds=new Set((manifest?.sections||[]).flatMap(s=>s.entries||[]).map(e=>e.id));
 const courseItems=lessons.filter(r=>lessonIds.has(sourceId(r)));
 return {config,items,lessons,other,knownDates,today,date:dateLabel(now),partial:data.actor.role!=='admin',
  lessonsToday:knownDates?newToday.filter(r=>r.kind==='lesson').length:null,
  otherToday:knownDates?newToday.filter(r=>!['course','lesson'].includes(r.kind)).length:null,
  lessonTarget:target(config.lessonsPerDay),otherTarget:target(config.otherPerDay),
  drafts:items.filter(r=>r.status==='Draft').length,review:items.filter(r=>r.status==='In review').length,
  changes:items.filter(r=>r.status==='Changes requested').length,approved:items.filter(r=>r.status==='Approved').length,
  course:{total:manifest?.order==='confirmed'&&lessonIds.size?lessonIds.size:null,saved:courseItems.length,approved:courseItems.filter(r=>r.status==='Approved').length},
  pilots:items.filter(r=>config.pilotIds?.includes(r.id))};
}

const bar=(value,max,label,css='')=>'<progress class="'+css+'" value="'+Math.min(value,max)+'" max="'+max+'" aria-label="'+esc(label)+'">'+value+' / '+max+'</progress>';
const metric=(label,value,note,progress='')=>'<div class="project-metric"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong>'+progress+'<small>'+esc(note)+'</small></div>';
export function projectProductionPanel(p,data,meta={},now=new Date()){
 const m=projectProduction(p,data,meta,now);if(!m)return '';
 const name=workerNames[m.config.worker]||'Worker',state={project:p.id};
 const daily=(value,max,label)=>metric(label,value===null?'—':value+' / '+max,'New drafts · '+m.date,value===null?'':bar(value,max,label));
 const current=m.course,total=current.total,known=total!==null;
 const lastReport=m.config.report,reportDate=lastReport?.at&&day(lastReport.at)?dateLabel(lastReport.at):'';
 const recent=m.items.slice(0,5).map(r=>'<li><a href="'+url('item',{id:r.id})+'">'+esc(r.title)+'</a><span>'+esc(m.config.pilotIds?.includes(r.id)?'Pilot · '+r.status:r.status)+'</span></li>').join('');
 return '<section class="project-production" data-worker-updates="project-progress" aria-label="Production progress">'+
  '<div class="project-section-heading"><div class="project-worker">'+(m.config.worker==='imogen'?'<img src="/assets/studio-team/imogen-aligned.png" alt="" width="42" height="42">':'')+'<div><h2>'+esc(name)+'’s progress</h2><small>'+esc(m.partial?'Only content you can access':'Across the content library')+' · Updates every 30 seconds</small></div></div><a class="btn" href="'+url('project',state)+'">Refresh</a></div>'+
  '<div class="project-metrics">'+daily(m.lessonsToday,m.lessonTarget,'Lessons today')+daily(m.otherToday,m.otherTarget,'Other content today')+
   metric('Drafts to check',m.drafts+m.review+m.changes,m.drafts+' draft · '+m.review+' in review · '+m.changes+' need changes')+
   metric('Approved',m.approved,'Checked content',bar(m.approved,Math.max(m.items.length,1),'Approved saved items','approved'))+'</div>'+
  '<div class="project-progress-grid"><section class="project-progress-card"><div class="project-section-heading"><h3>'+esc(m.config.course||'Current course')+'</h3><span>'+ (known?Math.round(current.approved/total*100)+'% approved':'Total unconfirmed')+'</span></div>'+
   (known?'<p><strong>'+current.saved+' / '+total+'</strong> lesson drafts saved</p>'+bar(current.saved,total,'Course lesson drafts saved')+'<p class="project-muted">'+current.approved+' approved · '+(total-current.saved)+' without a saved draft</p>':'<p>Confirm the lesson inventory to show course progress.</p>')+
   (m.pilots.length?'<p class="project-muted">'+m.pilots.length+' saved pilot'+(m.pilots.length===1?' still needs':'s still need')+' production checks.</p>':'')+'</section>'+
  '<section class="project-progress-card"><div class="project-section-heading"><h3>Rest of the library</h3><strong>'+m.other.length+' saved</strong></div><div class="project-category-counts">'+[['Recipes & meal plans',['recipe','mealplan']],['Programmes & challenges',['programme','challenge']],['Articles & books',['article','ebook','leadmagnet']],['Business, socials & resources',null]].map(([label,kinds])=>{
    const count=m.other.filter(r=>kinds?kinds.includes(r.kind):!['recipe','mealplan','programme','challenge','article','ebook','leadmagnet'].includes(r.kind)).length;
    return '<div><span>'+esc(label)+'</span><b>'+count+'</b></div>';
   }).join('')+'</div><small>Total inventory not confirmed yet.</small></section></div>'+
  (lastReport&&reportDate?'<div class="project-report"><strong>Latest worker report · '+reportDate+'</strong><span>'+esc(lastReport.text)+'</span></div>':'')+
  '<div class="project-section-heading project-recent-heading"><h3>Saved work</h3><a href="'+url('library',{worker:m.config.worker,view:'all'})+'">View all</a></div>'+
  (recent?'<ul class="project-recent">'+recent+'</ul>':'<p class="project-muted">No saved content yet.</p>')+
  '<p class="project-count-note">New drafts count once per source, on their first saved day (London time). Edits do not increase the daily total. Drafts can keep accumulating while review is pending.'+(!m.knownDates?' Daily totals are unavailable until saved dates can be verified.':'')+'</p></section>';
}

export function projectProductionSummary(p,data){
 const m=projectProduction(p,data);if(!m)return '';
 return '<span class="project-list-progress">'+m.items.length+' saved · '+m.approved+' approved'+bar(m.approved,Math.max(m.items.length,1),'Approved saved items')+'</span>';
}
