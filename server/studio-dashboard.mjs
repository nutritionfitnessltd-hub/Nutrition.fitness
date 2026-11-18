import { canAccess } from './library-permissions.mjs';
import { workers } from './studio-workers.mjs';
import { contentPhoto, workerPortrait } from './studio-visuals.mjs';
import { esc, url, heading, button, list, badge } from './studio-ui.mjs';

const complete=status=>['Done','Complete','Archived'].includes(status);
const requestsFor=data=>[...data.byId.values()].filter(r=>r.kind==='worker-request').sort((a,b)=>(b.fields?.createdAt||'').localeCompare(a.fields?.createdAt||''));
const row=r=>'<div><a href="'+r.href+'">'+esc(r.title)+'</a><small>'+esc(r.context||'')+'</small></div>'+badge(r.status);

export function dashboardWork(data){
  const ownProjects=data.projects.filter(p=>p.creator_id===data.actor.id&&!complete(p.status));
  const assigned=data.tasks.filter(t=>t.staff_id===data.actor.id&&!complete(t.status)).map(t=>({title:t.title,status:t.status,context:t.record_title,href:'/content-library/?work=1&assignments=1&staff='+encodeURIComponent(data.actor.id)}));
  const projectTasks=ownProjects.flatMap(p=>(p.entries||[]).filter(e=>!complete(e.status)).map(e=>({title:e.title,status:e.status,context:p.name+(e.week?' · Week '+e.week:' · Preparation'),href:url('project',{project:p.id,week:e.week||0})})));
  const reviews=data.items.filter(r=>r.status==='In review'&&(data.actor.role==='admin'||data.assigned.has(r.id))).map(r=>({title:r.title,status:r.status,context:'Content',href:url('item',{id:r.id})}));
  if(data.actor.role==='admin'){
    for(const p of data.projects.filter(p=>!complete(p.status)))for(const e of (p.entries||[]).filter(e=>e.status==='Ready for review'&&!reviews.some(r=>r.href===url('item',{id:e.record}))))reviews.push({title:e.title,status:e.status,context:p.name,href:url('project',{project:p.id,week:e.week||0})});
    for(const t of data.tasks.filter(t=>t.status==='Ready for review'))reviews.push({title:t.title,status:t.status,context:t.record_title,href:'/content-library/?work=1&assignments=1&status=Ready+for+review'});
  }
  return {mine:[...assigned,...projectTasks],reviews,ownProjects};
}

function workerCards(data){
  const requests=requestsFor(data);
  return '<section class="dashboard-team" aria-labelledby="workers-title"><div class="dashboard-section-heading"><div><h2 id="workers-title">AI workers</h2><p>The work you have planned with your team.</p></div>'+button('All worker plans',url('worker-requests'))+'</div>'+
    '<p class="dashboard-connection">Plans are saved here. Automatic worker start and progress updates are not connected yet.</p><div class="dashboard-workers">'+Object.entries(workers).map(([id,w])=>{
      const plans=requests.flatMap(request=>(request.fields.outputs||[]).filter(o=>o.worker===id).map(output=>({request,output})));
      return '<article class="dashboard-worker worker-'+id+'"><header>'+workerPortrait(w)+'<div><h3>'+w.name+'</h3><p>'+esc(w.role)+'</p></div></header><p class="worker-state">'+(plans.length?plans.length+' planned · not started':'No work planned')+'</p>'+
        (w.setupNote?'<p class="worker-empty">'+esc(w.setupNote)+'</p>':'')+
        (plans.length?'<ul class="worker-plan-list">'+plans.slice(0,3).map(({request,output})=>'<li><a href="'+url('worker-requests',{id:request.id})+'">'+esc(output.title)+'</a><small>From '+esc(request.title)+'</small><details><summary>What '+w.name+' will do</summary><p>'+esc(output.brief)+'</p></details></li>').join('')+'</ul>':'<p class="worker-empty">'+esc(w.reason.split(' HQ directory')[0])+'</p>')+
        (plans.length>3?button('View all '+w.name+'’s plans',url('worker-requests',{worker:id})):'')+
        '<a class="worker-new" href="'+url('builder',{build:w.defaultBuild})+'">Plan work for '+w.name+' →</a></article>';
    }).join('')+'</div></section>';
}

function teamDashboard(data){
  const {mine,reviews}=dashboardWork(data),allowed=key=>canAccess(data.actor,key);
  const sections=[['library','Content library','Read your working content.','library'],['originals','Originals','Browse reference material.','archive'],['studio','Studio','Create drafts for your assigned projects.','create'],['work','Work','Your projects, tasks and calendar.','projects']].filter(([key])=>allowed(key));
  return heading('Dashboard','Welcome back, '+data.actor.name+'.')+
    '<div class="studio-cards">'+sections.map(([,title,note,section])=>'<a class="studio-card" href="'+url(section)+'"><h2>'+title+'</h2><p>'+note+'</p></a>').join('')+'</div>'+
    (!sections.length?'<section class="panel"><p>Your account is ready. Ask your administrator to enable the areas you need.</p></section>':'')+
    (allowed('work')?'<section class="panel"><h2>My work</h2>'+list(mine.slice(0,10),row,'No open tasks assigned to you.')+'</section>':'')+
    (allowed('work')&&allowed('library')?'<section class="panel"><h2>Awaiting review</h2>'+list(reviews.slice(0,5),row,'No submitted work awaiting review.')+'</section>':'');
}
export function workspaceDashboard(data){
  if(data.actor.role!=='admin')return teamDashboard(data);
  const {mine,reviews,ownProjects}=dashboardWork(data),admin=data.actor.role==='admin';
  const plans=admin?requestsFor(data).reduce((n,r)=>n+(r.fields.outputs||[]).length,0):0;
  return '<section class="dashboard-welcome"><div class="welcome-copy"><span class="studio-eyebrow">Made for real life. Created by your team.</span><h1>Dashboard</h1><p class="welcome-lead">Good ideas start here.</p><p>Your work, your team and what comes next. Turn your originals into something people will enjoy, use and come back to.</p><div class="studio-actions">'+button('Create content',url('create'),true)+button('Explore your library',url('library'))+'</div></div><div class="welcome-pictures"><a href="'+url('library',{kind:'recipe'})+'">'+contentPhoto('recipe','welcome-photo',true)+'<span>Food to enjoy ↗</span></a><a href="'+url('library',{kind:'programme'})+'">'+contentPhoto('programme','welcome-photo',true)+'<span>Movement for real life ↗</span></a></div></section>'+
    '<nav class="dashboard-overview" aria-label="Work overview"><a href="#my-work"><strong>'+mine.length+'</strong><span>My open tasks</span></a><a href="#my-review"><strong>'+reviews.length+'</strong><span>'+(admin?'For my review':'Awaiting review')+'</span></a>'+(admin?'<a href="#workers-title"><strong>'+plans+'</strong><span>Planned with AI workers</span></a>':'')+'</nav>'+
    '<div class="dashboard-work"><section class="panel" id="my-work"><div class="dashboard-section-heading"><h2>My work</h2>'+button('All work',url('projects'))+'</div>'+
    list(mine.slice(0,5),row,'No open tasks assigned to you.')+
    (mine.length>5?'<p class="meta">Showing 5 of '+mine.length+' open tasks.</p>':'')+
    (ownProjects.length?'<details><summary>My projects ('+ownProjects.length+')</summary>'+list(ownProjects,p=>'<div><a href="'+url('project',{project:p.id})+'">'+esc(p.name)+'</a></div>'+badge(p.status))+'</details>':'')+
    '<a class="dashboard-secondary" href="/content-library/?work=1&amp;assignments=1&amp;staff='+encodeURIComponent(data.actor.id)+'">My assignments →</a></section>'+
    '<section class="panel" id="my-review"><div class="dashboard-section-heading"><h2>'+(admin?'For my review':'Awaiting review')+'</h2>'+button('Open reviews',url('review'))+'</div>'+list(reviews.slice(0,5),row,admin?'Nothing needs your review right now.':'No submitted work awaiting review.')+(reviews.length>5?'<p class="meta">Showing 5 of '+reviews.length+' items.</p>':'')+'</section></div>'+
    (admin?workerCards(data):'')+
    '<nav class="dashboard-shortcuts" aria-label="Workspace shortcuts">'+button('Content library',url('library'))+button('Browse originals',url('archive'))+button('Work calendar',url('calendar'))+'</nav>';
}
