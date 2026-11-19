import { workerContent } from './studio-worker-content.mjs';
import { canAccess } from './library-permissions.mjs';
import { workers } from './studio-workers.mjs';
import { contentPhoto, workerPortrait } from './studio-visuals.mjs';
import { esc, url, heading, button, list, badge } from './studio-ui.mjs';

const complete=status=>['Done','Complete','Archived'].includes(status);
const requestsFor=data=>[...data.byId.values()].filter(r=>r.kind==='worker-request').sort((a,b)=>(b.fields?.createdAt||'').localeCompare(a.fields?.createdAt||''));
const row=r=>'<div><a '+(r.review?'data-review-preview target="_blank" rel="noopener" ':'')+'href="'+r.href+'">'+esc(r.title)+'</a><small>'+esc(r.context||'')+'</small></div>'+badge(r.status);

export function dashboardWork(data){
  const ownProjects=data.projects.filter(p=>p.creator_id===data.actor.id&&!complete(p.status));
  const assigned=data.tasks.filter(t=>t.staff_id===data.actor.id&&!complete(t.status)).map(t=>({title:t.title,status:t.status,context:t.record_title,href:'/content-library/?work=1&assignments=1&staff='+encodeURIComponent(data.actor.id)}));
  const projectTasks=ownProjects.flatMap(p=>(p.entries||[]).filter(e=>!complete(e.status)).map(e=>({title:e.title,status:e.status,context:p.name+(e.week?' · Week '+e.week:' · Preparation'),href:url('project',{project:p.id,week:e.week||0})})));
  const reviews=data.items.filter(r=>r.status==='In review'&&(data.actor.role==='admin'||data.assigned.has(r.id))).map(r=>({title:r.title,status:r.status,context:'Content',review:true,recordId:r.id,href:url('review-preview',{id:r.id})}));
  if(data.actor.role==='admin'){
    for(const p of data.projects.filter(p=>!complete(p.status)))for(const e of (p.entries||[]).filter(e=>e.status==='Ready for review'&&!reviews.some(r=>r.recordId===e.record)))reviews.push({title:e.title,status:e.status,context:p.name,review:Boolean(data.byId.get(e.record)),recordId:e.record,href:data.byId.has(e.record)?url('review-preview',{id:e.record}):url('project',{project:p.id,week:e.week||0})});
    for(const t of data.tasks.filter(t=>t.status==='Ready for review'))reviews.push({title:t.title,status:t.status,context:t.record_title,href:'/content-library/?work=1&assignments=1&status=Ready+for+review'});
  }
  return {mine:[...assigned,...projectTasks],reviews,ownProjects};
}

function workerCards(data){
  const requests=requestsFor(data);
  return '<section data-worker-updates="cards" class="dashboard-team" aria-labelledby="workers-title"><div class="dashboard-section-heading"><div><h2 id="workers-title">AI workers</h2><p>Your team’s saved content and planned work.</p></div>'+button('All worker plans',url('worker-requests'))+'</div>'+
    '<p class="dashboard-connection">Message your workers in James HQ and review their work here. Alex, Andy and Martina bring daily ideas; you approve before they scope or start a plan.</p><div class="dashboard-workers">'+Object.entries(workers).map(([id,w])=>{
      const content=workerContent(data,id).filter(r=>id!=='nina'||r.status!=='Approved'),drafts=content.filter(r=>['Draft','Changes requested'].includes(r.status)).length,reviews=content.filter(r=>r.status==='In review').length;
      const plans=requests.flatMap(request=>(request.fields.outputs||[]).filter(o=>o.worker===id).map(output=>({request,output})));
      return '<article class="dashboard-worker worker-'+id+'"><header>'+workerPortrait(w)+'<div><h3>'+w.name+'</h3><p>'+esc(w.role)+'</p></div></header><p class="worker-state">'+(id==='ellis'?'Daily backlog review at 9 am London':content.length?content.length+' content items · '+drafts+' drafts · '+reviews+' awaiting approval':plans.length?plans.length+' planned · not started':id==='nina'?'No unfinished content':'No work planned')+'</p>'+
        (['alex','andy','martina'].includes(id)?'<section class="worker-idea-summary"><strong>Daily ideas · 9 am London</strong>'+(data.hqIdeas?.[id]?'<p><a href="'+url('worker-chat',{worker:id})+'">'+esc(data.hqIdeas[id].title)+'</a></p><p>'+esc(({pending:'Awaiting your approval',scoping:'Preparing scope',scoped:'Scope ready to review',active:'Plan in progress',done:'Plan completed',rejected:'New idea due tomorrow',superseded:'Newer proposal available'})[data.hqIdeas[id].state]||'Open for review')+'</p>':'<p>Your first proposal will appear after HQ processes the queued work.</p>')+'</section>':'')+
        (content.length?'<ul class="worker-content-list">'+content.slice(0,5).map(r=>'<li><a '+(r.kind==='article'||r.status==='In review'?'data-review-preview target="_blank" rel="noopener" ':'')+'href="'+(r.kind==='article'||r.status==='In review'?url('review-preview',{id:r.id}):url('item',{id:r.id,tab:'edit'}))+'">'+esc(r.title)+'</a>'+badge(r.publication?.status==='published'?'Published':r.status)+'</li>').join('')+'</ul>':'')+
        button('Open '+w.name+'’s work',id==='ellis'?url('software-releases'):url('library',{worker:id,view:'all'}))+
        button('Message '+w.name+(['alex','andy','martina'].includes(id)?' & review ideas':''),url('worker-chat',{worker:id}))+
        (w.setupNote?'<p class="worker-empty">'+esc(w.setupNote)+'</p>':'')+
        (plans.length?'<ul class="worker-plan-list">'+plans.slice(0,3).map(({request,output})=>'<li><a href="'+url('worker-requests',{id:request.id})+'">'+esc(output.title)+'</a><small>From '+esc(request.title)+'</small><details><summary>What '+w.name+' will do</summary><p>'+esc(output.brief)+'</p></details></li>').join('')+'</ul>':'<p class="worker-empty">'+esc(w.reason.split(' HQ directory')[0])+'</p>')+
        (plans.length>3?button('View all '+w.name+'’s plans',url('worker-requests',{worker:id})):'')+
        '<a class="worker-new" href="'+(id==='ellis'?url('software-releases'):id==='morgan'?url('shiny-things'):url('builder',{build:w.defaultBuild}))+'">Plan work for '+w.name+' →</a></article>';
    }).join('')+'</div></section>';
}

function teamDashboard(data){
  const {mine,reviews}=dashboardWork(data),allowed=key=>canAccess(data.actor,key);
  const sections=[['library','Content library','Read your working content.','library'],['originals','Originals','Browse reference material.','archive'],['studio','Studio','Create drafts for your assigned projects.','create'],['work','Work','Your projects, tasks and calendar.','projects']].filter(([key])=>allowed(key));
  return '<section class="dashboard-welcome"><div class="welcome-copy"><span class="studio-eyebrow">Made for real life. Created by your team.</span><h1>Dashboard</h1><p class="welcome-lead">Good ideas start here.</p><p>Welcome back, '+esc(data.actor.name)+'.</p><p>Your work, your team and what comes next. Turn your originals into something people will enjoy, use and come back to.</p><div class="studio-actions">'+(allowed('studio')?button('Create content',url('create'),true):'')+(allowed('library')?button('Explore your library',url('library')):allowed('work')?button('Open your work',url('projects')):'')+'</div></div><div class="welcome-pictures"><div>'+contentPhoto('recipe','welcome-photo',true)+'<span>Food to enjoy</span></div><div>'+contentPhoto('programme','welcome-photo',true)+'<span>Movement for real life</span></div></div></section>'+
    '<div class="studio-cards team-dashboard-areas">'+sections.map(([key,title,note,section])=>'<a class="studio-card team-area-'+key+'" href="'+url(section)+'"><h2>'+title+'</h2><p>'+note+'</p></a>').join('')+'</div>'+
    (!sections.length?'<section class="panel"><p>Your account is ready. Ask your administrator to enable the areas you need.</p></section>':'')+
    (allowed('work')?'<section class="panel"><h2>My work</h2>'+list(mine.slice(0,10),row,'No open tasks assigned to you.')+'</section>':'')+
    (allowed('work')&&allowed('library')?'<section class="panel"><h2>Awaiting review</h2>'+list(reviews.slice(0,5),row,'No submitted work awaiting review.')+'</section>':'');
}
export function workspaceDashboard(data){
  if(data.actor.role!=='admin')return teamDashboard(data);
  const {mine,reviews,ownProjects}=dashboardWork(data),admin=data.actor.role==='admin';
  const plans=admin?requestsFor(data).reduce((n,r)=>n+(r.fields.outputs||[]).length,0):0;
  return '<section class="dashboard-welcome"><div class="welcome-copy"><span class="studio-eyebrow">Made for real life. Created by your team.</span><h1>Dashboard</h1><p class="welcome-lead">Good ideas start here.</p><p>Your work, your team and what comes next. Turn your originals into something people will enjoy, use and come back to.</p><div class="studio-actions">'+button('Create content',url('create'),true)+button('Explore your library',url('library'))+'</div></div><div class="welcome-pictures"><a href="'+url('library',{kind:'recipe'})+'">'+contentPhoto('recipe','welcome-photo',true)+'<span>Food to enjoy ↗</span></a><a href="'+url('library',{kind:'programme'})+'">'+contentPhoto('programme','welcome-photo',true)+'<span>Movement for real life ↗</span></a></div></section>'+
    '<nav data-worker-updates="overview" class="dashboard-overview" aria-label="Work overview"><a href="#my-work"><strong>'+mine.length+'</strong><span>My open tasks</span></a><a href="#my-review"><strong>'+reviews.length+'</strong><span>'+(admin?'For my review':'Awaiting review')+'</span></a>'+(admin?'<a href="#workers-title"><strong>'+plans+'</strong><span>Planned with AI workers</span></a>':'')+'</nav>'+
    '<div class="dashboard-work"><section class="panel" id="my-work"><div class="dashboard-section-heading"><h2>My work</h2>'+button('All work',url('projects'))+'</div>'+
    list(mine.slice(0,5),row,'No open tasks assigned to you.')+
    (mine.length>5?'<p class="meta">Showing 5 of '+mine.length+' open tasks.</p>':'')+
    (ownProjects.length?'<details><summary>My projects ('+ownProjects.length+')</summary>'+list(ownProjects,p=>'<div><a href="'+url('project',{project:p.id})+'">'+esc(p.name)+'</a></div>'+badge(p.status))+'</details>':'')+
    '<a class="dashboard-secondary" href="/content-library/?work=1&amp;assignments=1&amp;staff='+encodeURIComponent(data.actor.id)+'">My assignments →</a></section>'+
    '<section data-worker-updates="reviews" class="panel" id="my-review"><div class="dashboard-section-heading"><h2>'+(admin?'For my review':'Awaiting review')+'</h2>'+button('Open reviews',url('review'))+'</div>'+list(reviews.slice(0,5),row,admin?'Nothing needs your review right now.':'No submitted work awaiting review.')+(reviews.length>5?'<p class="meta">Showing 5 of '+reviews.length+' items.</p>':'')+'</section></div>'+
    (admin?workerCards(data):'')+
    '<nav class="dashboard-shortcuts" aria-label="Workspace shortcuts">'+button('Content library',url('library'))+button('Browse originals',url('archive'))+button('Work calendar',url('calendar'))+'</nav>';
}
