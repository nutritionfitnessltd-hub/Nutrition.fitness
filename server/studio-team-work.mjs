import { canAccess, canReviewContent, canReadContent } from './library-permissions.mjs';
import { contentWorker, workerNames } from './studio-worker-content.mjs';
import { esc, url, heading, button, badge, hidden, select, pages } from './studio-ui.mjs';

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
  const projects=data.projects.filter(p=>admin||canAccess(data.actor,'work')&&p.creator_id===data.actor.id);
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
    const review=r.kind==='article'||canReviewContent(data,r)&&r.status==='In review';
    recordRows.set(r.id,{id:'content:'+r.id,recordId:r.id,title:r.title,...owner,project:project?.id||'',projectName:project?.name||'',
      state:stateFor(r.status),status:r.status,updated:date(r.updatedAt||r.workerSource?.receivedAt),due:task?.due_date||'',
      note:r.reviewFeedback?.at(-1)?.changes||'Saved content',review,href:url(review?'review-preview':'item',{id:r.id}),action:review?'Review':'Open'});
  }
  for(const t of tasks){
    const r=recordRows.get(t.record_id);if(r){linked.add(r.recordId);const status=['In review','Changes requested'].includes(r.status)?r.status:t.status;rows.push({...r,id:'task:'+t.id,title:t.title||r.title,state:stateFor(status),status,updated:[date(t.updated_at),r.updated].sort().at(-1),note:t.instructions||r.note});continue;}
    rows.push({id:'task:'+t.id,title:t.title,...person(t.staff_id),project:'',projectName:t.record_title||'',state:stateFor(t.status),status:t.status,updated:date(t.updated_at||t.created_at),due:t.due_date||'',note:t.instructions||'',href:'/content-library/?work=1&amp;assignments=1&amp;staff='+encodeURIComponent(t.staff_id),action:'Open'});
  }
  for(const p of projects)for(const [i,e] of (p.entries||[]).entries()){
    if(e.status==='Archived')continue;
    const r=recordRows.get(e.record);if(r&&linked.has(r.recordId))continue;if(r)linked.add(r.recordId);
    rows.push({...r,id:'project:'+p.id+':'+(e.id||i),title:e.title||r?.title,...(r?.type==='ai'?{owner:r.owner,ownerName:r.ownerName,type:r.type}:person(p.creator_id)),project:p.id,projectName:p.name,
      state:stateFor(r&&['In review','Changes requested'].includes(r.status)?r.status:e.status),status:r&&['In review','Changes requested'].includes(r.status)?r.status:e.status,updated:[date(e.updatedAt||p.updated_at),r?.updated||''].sort().at(-1),due:e.due||'',note:e.notes||r?.note||'',
      href:r?.href||url('project',{project:p.id,week:e.week||0}),action:r?.action||'Open'});
  }
  rows.push(...[...recordRows.values()].filter(r=>!linked.has(r.recordId)));
  if(admin){
    for(const r of data.byId.values())if(r.kind==='worker-request'&&r.status!=='Archived')for(const [i,o] of (r.fields?.outputs||[]).entries()){
      if(!o.title?.trim()||!workerNames[o.worker])continue;
      rows.push({id:'request:'+r.id+':'+i,title:o.title,...worker(o.worker),project:'',projectName:r.title,state:'requested',status:'Saved plan',updated:date(r.updatedAt||r.fields.createdAt),note:'Not started · '+(o.brief||''),href:url('worker-requests',{id:r.id}),action:'Open plan'});
    }
    for(const [id,idea] of Object.entries(data.hqIdeas||{}))if(idea?.title?.trim()&&!['rejected','superseded'].includes(idea.state))rows.push({id:'idea:'+id,title:idea.title,...worker(id),project:'',projectName:'Daily ideas',state:stateFor(idea.state),status:({pending:'Awaiting your approval',scoped:'Scope ready',scoping:'Preparing scope',active:'Plan in progress',done:'Completed'})[idea.state]||'Requested',updated:date(idea.updatedAt||idea.createdAt),note:'Idea & plan update',href:url('worker-chat',{worker:id}),action:'Open idea'});
  }
  for(const f of data.reviewHistory||[])rows.push({id:'review:'+f.id,title:f.title,...person(f.authorId||data.actor.id),ownerName:f.author||person(f.authorId||data.actor.id).ownerName,project:'',projectName:'Review history',state:'completed',status:f.decision==='approve'?'Approved':'Changes requested',updated:date(f.at),note:'Reviewed version '+f.reviewedRevision,href:url('review-history',{id:f.recordId,review:f.id}),action:'Read review'});
  return rows.sort((a,b)=>b.updated.localeCompare(a.updated)||a.title.localeCompare(b.title));
}
function workList(rows){
  if(!rows.length)return '<p class="studio-empty">No work matches this view.</p>';
  return '<ul class="team-work-list">'+rows.map(r=>'<li class="team-work-row" data-work-id="'+esc(r.id)+'"><div class="team-work-owner"><span class="team-work-avatar" aria-hidden="true">'+esc((r.ownerName||'?').slice(0,1))+'</span><div><strong>'+esc(r.ownerName)+'</strong><small>'+esc(r.type==='ai'?'AI worker':'Team member')+'</small></div></div><div class="team-work-detail"><a '+(r.review?'data-review-preview target="_blank" rel="noopener" ':'')+'href="'+r.href+'">'+esc(r.title)+'</a><small>'+esc(r.projectName)+'</small>'+(r.note?'<p>'+esc(r.note.length>180?r.note.slice(0,177)+'…':r.note)+'</p>':'')+'</div><div class="team-work-status">'+badge(r.status)+(r.due?'<small>Due '+esc(stamp(date(r.due)))+'</small>':'')+(r.updated?'<small>Updated '+esc(stamp(r.updated))+'</small>':'')+'</div><a class="btn" '+(r.review?'data-review-preview target="_blank" rel="noopener" ':'')+'href="'+r.href+'">'+esc(r.action)+'</a></li>').join('')+'</ul>';
}
export function teamWorkDashboard(data){
  const rows=teamWorkRows(data),recent=Date.now()-7*86400000;
  const active=rows.filter(r=>r.state!=='completed').sort((a,b)=>(a.state==='attention'?-1:0)-(b.state==='attention'?-1:0)).slice(0,8);
  const completed=rows.filter(r=>r.state==='completed'&&Date.parse(r.updated)>=recent).slice(0,3),shown=[...active,...completed];
  if(!shown.length)return '<div data-worker-updates="cards" hidden></div>';
  return '<section data-worker-updates="cards" class="dashboard-team" aria-labelledby="team-work-title"><div class="dashboard-section-heading"><div><h2 id="team-work-title">Team work</h2><p>'+(data.actor.role==='admin'?'People and AI workers · active work and completions from the last 7 days.':'Your assignments and relevant reviews.')+'</p></div>'+button('View all team work',url('team-work'))+'</div><nav class="tabs" aria-label="Team work status">'+Object.entries(workStates).map(([key,label])=>button(label+' ('+rows.filter(r=>r.state===key).length+')',url('team-work',{state:key}))).join('')+'</nav>'+(active.length?workList(active):'')+(completed.length?'<h3>Recently completed</h3>'+workList(completed):'')+(rows.length>shown.length?'<p class="meta">Showing '+shown.length+' recent items. Open all team work for the full history.</p>':'')+'</section>';
}
export function teamWorkPage(params,data){
  const all=teamWorkRows(data),state=Object.hasOwn(workStates,params.get('state'))?params.get('state'):'',type=params.get('type')||'',owner=params.get('owner')||'',project=params.get('project')||'';
  const filtered=all.filter(r=>(!state||r.state===state)&&(!type||r.type===type)&&(!owner||r.owner===owner)&&(!project||r.project===project));
  const owners=Object.fromEntries(all.map(r=>[r.owner,r.ownerName])),projects=Object.fromEntries(all.filter(r=>r.project).map(r=>[r.project,r.projectName]));
  return heading('Team work',data.actor.role==='admin'?'Requested, active and completed work across your team.':'Your assigned work and submissions within your review responsibilities.')+
    '<form class="studio-filters" action="/content-library/">'+hidden('work','1')+hidden('studio','team-work')+select('state','Status',{'':'All statuses',...workStates},state)+select('type','Team',{'':'All team',people:'People',ai:'AI workers'},type)+select('owner','Person or worker',{'':'Everyone',...owners},owner)+select('project','Project',{'':'All projects',...projects},project)+'<button>Apply filters</button>'+button('Clear',url('team-work'))+'</form><section data-worker-updates="work-list">'+pages(params,filtered,workList)+'</section><script type="module" src="/studio-review.js"></script>';
}
