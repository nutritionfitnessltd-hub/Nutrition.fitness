import {hasReadyVideo} from './review-policy.mjs';
import {launchPackParent,launchPackChildren} from './launch-packs.mjs';
import {releasePath,publicationDestination} from './studio-publishing.mjs';
import {newsletterDraftButton} from './newsletter-draft-links.mjs';
import {isNewsletterContent} from './studio-newsletters.mjs';
import {participates,ownsTask} from './studio-project-tasks.mjs';
import {assignmentProjectId} from './team-assignments.mjs';
import { canAccess, canReviewContent, canReadContent } from './library-permissions.mjs';
import { contentWorker, workerNames } from './studio-worker-content.mjs';
import { esc, url, heading, button, badge, hidden, select, pages, form } from './studio-ui.mjs';

export const workStates={requested:'Requested',progress:'In progress',attention:'Needs attention',completed:'Completed'};
const stateFor=status=>['Done','Complete','Approved','Published','done'].includes(status)?'completed':
  ['In review','Ready for review','Changes requested','pending','scoped'].includes(status)?'attention':
  ['To do','Requested','prepared'].includes(status)?'requested':'progress';
const date=value=>Number.isFinite(Date.parse(value))?new Date(value).toISOString():'';
const stamp=value=>value?new Date(value).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'Europe/London'}):'';

export function teamWorkRows(data){
  const admin=data.actor.role==='admin',rows=[],linked=new Set();
  const person=id=>({owner:'person:'+id,ownerName:data.people.find(p=>p.id===id)?.name||(id===data.actor.id?data.actor.name||(admin?'Administrator':'You'):'Assigned team member'),type:'people'});
  const worker=id=>({owner:'worker:'+id,ownerName:workerNames[id],type:'ai'});
  const projects=data.projects.filter(p=>admin||canAccess(data.actor,'work')&&participates(p,data.actor.id));
  const projectOf=id=>projects.find(p=>p.studio?.allowedIds?.includes(id)||p.entries?.some(e=>e.record===id));
  const tasks=(data.tasks||[]).filter(t=>admin||canAccess(data.actor,'work')&&t.staff_id===data.actor.id);
  const recordRows=new Map();
  for(const r of data.items){
    if(['Archived'].includes(r.status)||['settings','worker-request','account-preview'].includes(r.kind)||!canReadContent(data,r)||!canAccess(data.actor,'library'))continue;
    if(!admin&&!data.assigned.has(r.id)&&!canReviewContent(data,r))continue;
    const w=contentWorker(r,data.byId),task=tasks.find(t=>t.record_id===r.id),project=projectOf(r.id);
    // Imported reference content is not active work until attributed, assigned or submitted.
    if(!w&&!task&&!project&&!['In review','Changes requested'].includes(r.status))continue;
    const owner=task?person(task.staff_id):w?worker(w):project?person(project.creator_id):{owner:'unassigned',ownerName:admin?'Unassigned':'Team submission',type:'people'};
    const destination=data.publicationDestination||publicationDestination({});
    const published=(data.releases||[]).some(release=>release.item_id===r.id&&release.environment===destination.environment&&release.source_revision===r.revision);
    const review=!published&&(hasReadyVideo(r)||isNewsletterContent(r));
    recordRows.set(r.id,{id:'content:'+r.id,recordId:r.id,title:r.title,...owner,project:project?.id||'',projectName:project?.name||'',
      published,state:published?'completed':!hasReadyVideo(r)&&!isNewsletterContent(r)&&r.status==='In review'?'progress':stateFor(r.status),status:published?'Published':!hasReadyVideo(r)&&!isNewsletterContent(r)&&r.status==='In review'?'Draft':r.status,updated:date(r.updatedAt||r.workerSource?.receivedAt),due:task?.due_date||'',
      ghlAction:newsletterDraftButton(data,r),note:r.reviewFeedback?.at(-1)?.changes||'Saved content',review,href:published?destination.origin+releasePath(r.id):url(review?'review-preview':'item',{id:r.id}),action:published?'View published article':review?'Review':'Open'});
  }
  for(const t of tasks){
    const r=recordRows.get(t.record_id);if(r){linked.add(r.recordId);const status=r.published?'Published':['In review','Changes requested'].includes(r.status)?r.status:t.status;rows.push({...r,id:'task:'+t.id,title:t.title||r.title,state:stateFor(status),status,updated:[date(t.updated_at),r.updated].sort().at(-1),note:t.instructions||r.note,messageHref:url('task',{task:t.id})});continue;}
    rows.push({id:'task:'+t.id,title:t.title,...person(t.staff_id),project:assignmentProjectId(t),projectName:t.record_title||'',state:stateFor(t.status),status:t.status,updated:date(t.updated_at||t.created_at),due:t.due_date||'',note:t.instructions||'',href:url('task',{task:t.id}),action:'Open'});
  }
  for(const p of projects)for(const [i,e] of (p.entries||[]).entries()){
    if(e.status==='Archived'||!admin&&!ownsTask(p,e,data.actor.id))continue;
    const r=recordRows.get(e.record);if(r&&linked.has(r.recordId))continue;if(r)linked.add(r.recordId);
    rows.push({...r,id:'project:'+p.id+':'+(e.id||i),title:e.title||r?.title,...(r?.type==='ai'?{owner:r.owner,ownerName:r.ownerName,type:r.type}:person(e.assignee||p.creator_id)),project:p.id,projectName:p.name,
      state:stateFor(r?.published?'Published':r&&['In review','Changes requested'].includes(r.status)?r.status:e.status),status:r?.published?'Published':r&&['In review','Changes requested'].includes(r.status)?r.status:e.status,updated:[date(e.updatedAt||p.updated_at),r?.updated||''].sort().at(-1),due:e.due||'',note:e.notes||r?.note||'',
      messageHref:url('task',{project:p.id,entry:e.id}),href:r?.href||url('task',{project:p.id,entry:e.id}),action:r?.action||'Open'});
  }
  rows.push(...[...recordRows.values()].filter(r=>!linked.has(r.recordId)));
  if(admin){
    const production=data.hqProduction;
    if(production?.jobId||data.hqProductionUnavailable){
      const status=production?.status,ready=production?.progress?.readyItems||[],blockers=production?.progress?.blockers||[];
      rows.push({id:'production:'+(production?.jobId||'imogen'),title:'Course and content production',...worker('imogen'),project:'',projectName:'Existing production job',
        state:status==='working'?'progress':status==='needs_input'?'attention':status==='done'?'completed':'requested',
        status:({working:'Production claim active',queued:'Queued for production',needs_input:'Production needs input',ready:'Production check ended',done:'Job closed'})[status]||'Production status unavailable',
        updated:date(production?.updatedAt),note:ready.length?ready.map(item=>item.title).join(' · '):blockers.length?blockers[0].detail:production?.result||'Open Imogen’s production panel for the latest verified state.',
        href:url('team',{tab:'workers',worker:'imogen'}),action:'Open production'});
    }
    for(const r of data.byId.values())if(r.kind==='worker-request'&&r.status!=='Archived')for(const [i,o] of (r.fields?.outputs||[]).entries()){
      if(!o.title?.trim()||!workerNames[o.worker])continue;
      rows.push({id:'request:'+r.id+':'+i,title:o.title,...worker(o.worker),project:'',projectName:r.title,state:'requested',status:'Saved plan',updated:date(r.updatedAt||r.fields.createdAt),note:'Not started · '+(o.brief||''),href:url('worker-requests',{id:r.id}),action:'Open plan'});
    }
    for(const [id,idea] of Object.entries(data.hqIdeas||{}))if(idea?.title?.trim()&&!['rejected','superseded'].includes(idea.state))rows.push({id:'idea:'+id,title:idea.title,...worker(id),project:'',projectName:'Daily ideas',state:stateFor(idea.state),status:({pending:'Awaiting your approval',scoped:'Scope ready',scoping:'Preparing scope',active:'Plan in progress',done:'Completed'})[idea.state]||'Requested',updated:date(idea.updatedAt||idea.createdAt),note:'Idea & plan update',suggestion:idea.state==='pending'&&Number.isSafeInteger(idea.version)?{worker:id,id:idea.id,version:idea.version}:null,href:url('worker-chat',{worker:id}),action:'Open idea'});
  }
  // The native production checkpoint can be newer than the separate HQ job.
  const checkpoint=data.items.filter(r=>r.fields?.courseProductionIndex&&r.fields.runner&&(admin||recordRows.has(r.id)))
    .sort((a,b)=>date(b.fields.runner.updatedAt).localeCompare(date(a.fields.runner.updatedAt)))[0];
  if(checkpoint){
    const run=checkpoint.fields.runner,updated=date(run.updatedAt);
    const existing=rows.find(r=>r.owner==='worker:imogen'&&r.id.startsWith('production:'));
    if(updated&&(!existing||updated>=existing.updated)){
      if(existing)rows.splice(rows.indexOf(existing),1);
      const source=String(run.currentSourceId||'').replace(/^catalogue:/,'');
      const original=data.index?.records?.find(r=>r.id==='catalogue:'+source);
      const current=source&&data.items.find(r=>String(r.sourceId||r.fields?.production?.sourceId||'').replace(/^catalogue:/,'')===source&&!r.fields?.courseProductionIndex);
      const fresh=Date.now()-Date.parse(updated)>=0&&Date.now()-Date.parse(updated)<15*60*1000;
      const running=run.status==='working'&&fresh;
      rows.push({id:'production:native:'+checkpoint.id,recordId:checkpoint.id,title:'Course and content production',...worker('imogen'),
        project:run.projectId||'',projectName:'Ongoing course production',state:run.status==='done'?'completed':run.status==='needs_input'?'attention':'progress',
        status:running?'In progress':run.status==='done'?'Production completed':run.status==='needs_input'?'Needs attention':'Last saved progress',updated,
        note:(original?.title||current?.title||source?'Latest lesson: '+(original?.title||current?.title||source)+'. ':'')+
          (/brand/.test(run.stage||'')?'Branding and preparing the next lesson.':/narrat|title/.test(run.stage||'')?'Updating lesson narration.':'Continuing the existing production work.'),
        href:run.projectId&&data.projects.some(p=>p.id===run.projectId)?url('project',{project:run.projectId}):url('item',{id:checkpoint.id}),action:'Open course work'});
    }
  }
  for(const f of data.reviewHistory||[])rows.push({id:'review:'+f.id,title:f.title,...person(f.authorId||data.actor.id),ownerName:f.author||person(f.authorId||data.actor.id).ownerName,project:'',projectName:'Review history',state:'completed',status:f.decision==='approve'?'Approved':'Changes requested',updated:date(f.at),note:'Reviewed version '+f.reviewedRevision,href:url('review-history',{id:f.recordId,review:f.id}),action:'Read review'});
  return rows.filter(row=>{const id=row.recordId||tasks.find(t=>'task:'+t.id===row.id)?.record_id;return !launchPackParent(data.byId.get(id),data);}).map(row=>{
    const parent=data.byId.get(row.recordId);if(parent?.fields?.coursePack!==true)return row;
    const children=launchPackChildren(parent,data).sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||'')),latest=children[0];
    if(!latest)return row;
    const attention=children.some(c=>['In review','Changes requested'].includes(c.status)),drafts=children.some(c=>c.status==='Draft');
    return {...row,updated:[row.updated,date(latest.updatedAt)].sort().at(-1),...(attention?{state:'attention',status:'Supporting drafts need review'}:drafts?{state:'progress',status:'Supporting drafts in progress'}:{}),note:'Latest supporting update: '+latest.title+' · '+latest.status+' · revision '+latest.revision,related:{href:url('item',{id:latest.id}),label:'Open latest supporting draft'}};
  }).sort((a,b)=>b.updated.localeCompare(a.updated)||a.title.localeCompare(b.title));
}
function workList(rows,{summary=false,returnTo='team-work'}={}){
  if(!rows.length)return '<p class="studio-empty">No work matches this view.</p>';
  return '<ul class="team-work-list">'+rows.map(r=>'<li class="team-work-row" data-work-id="'+esc(r.id)+'" data-work-type="'+esc(r.type)+'" data-work-owner="'+esc(r.owner)+'" data-work-state="'+esc(r.state)+'"><div class="team-work-owner"><span class="team-work-avatar" aria-hidden="true">'+esc((r.ownerName||'?').slice(0,1))+'</span><div><strong>'+esc(r.ownerName)+'</strong><small>'+esc(r.type==='ai'?'AI worker':'Team member')+'</small></div></div><div class="team-work-detail"><a '+(r.review?'data-review-preview target="_blank" rel="noopener" ':'')+'href="'+r.href+'">'+esc(r.title)+'</a><small>'+esc(r.projectName)+'</small>'+(r.note?'<p>'+esc(r.note.length>180?r.note.slice(0,177)+'…':r.note)+'</p>':'')+(r.related?'<p><a href="'+r.related.href+'">'+esc(r.related.label)+'</a></p>':'')+(r.messageHref&&r.messageHref!==r.href?'<p>'+button('Messages',r.messageHref)+'</p>':'')+(r.ghlAction?'<div class="studio-actions">'+r.ghlAction+'</div>':'')+'</div><div class="team-work-status">'+badge(r.status)+(r.due&&r.state!=='completed'&&r.due<new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())?'<span class="studio-status task-overdue">Overdue</span>':'')+(r.due?'<small>Due '+esc(stamp(date(r.due)))+'</small>':'')+(r.updated?'<small>Updated '+esc(stamp(r.updated))+'</small>':'')+'</div><div class="team-work-actions"><a class="btn" '+(r.review?'data-review-preview target="_blank" rel="noopener" ':'')+'href="'+r.href+'">'+esc(r.action)+'</a>'+(summary?button('Work & history',url('team-work',{owner:r.owner,view:'history'})):'')+(r.suggestion?form('hq-idea',hidden('worker',r.suggestion.worker)+hidden('decision','reject-idea')+hidden('ideaId',r.suggestion.id)+hidden('expectedVersion',r.suggestion.version)+hidden('returnTo',returnTo),{section:'worker-chat',worker:r.suggestion.worker},'Dismiss','data-work-dismiss') :'')+'</div></li>').join('')+'</ul>';
}
export function teamWorkCards(data,rows=teamWorkRows(data)){
  const groups=new Map();
  for(const row of rows){if(!groups.has(row.owner))groups.set(row.owner,[]);groups.get(row.owner).push(row);}
  return [...groups.values()].map(own=>{
    const sorted=[...own].sort((a,b)=>b.updated.localeCompare(a.updated)||a.title.localeCompare(b.title));
    const active=sorted.filter(r=>r.state!=='completed'),recent=sorted.filter(r=>r.state==='completed'&&Date.parse(r.updated)>=Date.now()-7*86400000);
    const focus=active.find(r=>r.id.startsWith('production:'))||active[0]||recent[0]||sorted[0];
    return {...focus,activeCount:active.length,attentionCount:active.filter(r=>r.state==='attention').length,completedCount:recent.length,rows:sorted};
  }).sort((a,b)=>a.ownerName.localeCompare(b.ownerName));
}

function dashboardFilters(rows){
 return '<form class="team-work-filters" data-team-work-filters>'+select('type','Show',{'':'AI & people',ai:'AI workers only',people:'People only'},'')+select('state','Status',{'':'All statuses',...workStates},'')+select('owner','Person or worker',{'':'Everyone',...Object.fromEntries(rows.map(r=>[r.owner,r.ownerName]))},'')+'<button type="reset">Clear filters</button></form>';
}

export function teamWorkDashboard(data){
  const rows=teamWorkRows(data),cards=teamWorkCards(data,rows).filter(c=>c.activeCount||c.completedCount);
  if(!cards.length)return '<div data-worker-updates="cards" hidden></div>';
  return '<section data-worker-updates="cards" class="dashboard-team" data-work-filter-scope="'+esc(data.actor.id)+'" aria-labelledby="team-work-title"><div class="dashboard-section-heading"><div><h2 id="team-work-title">Team work</h2><p>Current work and latest progress, one row per person or worker.</p></div>'+button('View all team work',url('team-work'))+'</div><nav class="tabs" aria-label="Team work status">'+Object.entries(workStates).map(([key,label])=>button(label+' ('+rows.filter(r=>r.state===key).length+')',url('team-work',{state:key}))).join('')+'</nav>'+dashboardFilters(cards)+workList(cards,{summary:true,returnTo:'home'})+'<p class="studio-empty" data-work-filter-empty hidden>No work matches these filters.</p></section>';
}
function groupedTeamWork(rows){
  if(!rows.length)return workList(rows);
  return [['ai','AI workers'],['people','People']].map(([type,label])=>{
    const team=rows.filter(r=>r.type===type);if(!team.length)return '';
    const owners=[...new Set(team.map(r=>r.owner))].sort((a,b)=>team.find(r=>r.owner===a).ownerName.localeCompare(team.find(r=>r.owner===b).ownerName));
    return '<section class="team-work-group"><h2>'+label+'</h2>'+owners.map(owner=>{
      const own=team.filter(r=>r.owner===owner),active=own.filter(r=>r.state!=='completed'),completed=own.filter(r=>r.state==='completed');
      return '<section class="team-work-person"><h3>'+esc(own[0].ownerName)+'</h3>'+(active.length?'<h4>Active work</h4>'+workList(active):'<p class="meta">No active work in this view.</p>')+(completed.length?'<h4>Completed</h4>'+workList(completed):'<p class="meta">No completed work in this view.</p>')+'</section>';
    }).join('')+'</section>';
  }).join('');
}
export function teamWorkPage(params,data){
  const all=teamWorkRows(data),state=Object.hasOwn(workStates,params.get('state'))?params.get('state'):'',type=params.get('type')||'',owner=params.get('owner')||'',project=params.get('project')||'';
  const filtered=all.filter(r=>(!state||r.state===state)&&(!type||r.type===type)&&(!owner||r.owner===owner)&&(!project||r.project===project));
  const owners=Object.fromEntries(all.map(r=>[r.owner,r.ownerName])),projects=Object.fromEntries(all.filter(r=>r.project).map(r=>[r.project,r.projectName]));
  return heading('Team work',data.actor.role==='admin'?'Requested, active and completed work across your team.':'Your assigned work and submissions within your review responsibilities.')+
    '<form class="studio-filters" action="/content-library/">'+hidden('work','1')+hidden('studio','team-work')+hidden('view',params.get('view')==='history'?'history':'')+select('state','Status',{'':'All statuses',...workStates},state)+select('type','Team',{'':'All team',people:'People',ai:'AI workers'},type)+select('owner','Person or worker',{'':'Everyone',...owners},owner)+select('project','Project',{'':'All projects',...projects},project)+'<button>Apply filters</button>'+button('Clear',url('team-work'))+'</form><section data-worker-updates="work-list">'+(params.get('view')==='history'?pages(params,filtered,groupedTeamWork):workList(teamWorkCards(data,filtered),{summary:true}))+'</section><script type="module" src="/studio-review.js"></script>';
}
