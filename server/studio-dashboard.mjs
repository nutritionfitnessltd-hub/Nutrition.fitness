import { teamWorkDashboard } from './studio-team-work.mjs';
import { canReviewContent, canAccess } from './library-permissions.mjs';
import { contentPhoto } from './studio-visuals.mjs';
import { esc, url, heading, button, list, badge } from './studio-ui.mjs';

const complete=status=>['Done','Complete','Archived'].includes(status);
const row=r=>'<div><a '+(r.review?'data-review-preview target="_blank" rel="noopener" ':'')+'href="'+r.href+'">'+esc(r.title)+'</a><small>'+esc(r.context||'')+'</small></div>'+badge(r.status);

export function dashboardWork(data){
  const ownProjects=data.projects.filter(p=>p.creator_id===data.actor.id&&!complete(p.status));
  const assigned=data.tasks.filter(t=>t.staff_id===data.actor.id&&!complete(t.status)).map(t=>({title:t.title,status:t.status,context:t.record_title,href:'/content-library/?work=1&assignments=1&staff='+encodeURIComponent(data.actor.id)}));
  const projectTasks=ownProjects.flatMap(p=>(p.entries||[]).filter(e=>!complete(e.status)).map(e=>({title:e.title,status:e.status,context:p.name+(e.week?' · Week '+e.week:' · Preparation'),href:url('project',{project:p.id,week:e.week||0})})));
  const reviews=data.items.filter(r=>r.status==='In review'&&(canReviewContent(data,r)||data.assigned.has(r.id))).map(r=>({title:r.title,status:r.status,context:'Content',review:true,recordId:r.id,href:url('review-preview',{id:r.id})}));
  if(data.actor.role==='admin'){
    for(const p of data.projects.filter(p=>!complete(p.status)))for(const e of (p.entries||[]).filter(e=>e.status==='Ready for review'&&!reviews.some(r=>r.recordId===e.record)))reviews.push({title:e.title,status:e.status,context:p.name,review:Boolean(data.byId.get(e.record)),recordId:e.record,href:data.byId.has(e.record)?url('review-preview',{id:e.record}):url('project',{project:p.id,week:e.week||0})});
    for(const t of data.tasks.filter(t=>t.status==='Ready for review'))reviews.push({title:t.title,status:t.status,context:t.record_title,href:'/content-library/?work=1&assignments=1&status=Ready+for+review'});
  }
  return {mine:[...assigned,...projectTasks],reviews,ownProjects};
}

function teamDashboard(data){
  const {mine,reviews}=dashboardWork(data),allowed=key=>canAccess(data.actor,key);
  const sections=[['library','Content library','Read your working content.','library'],['originals','Originals','Browse reference material.','archive'],['studio','Studio','Create drafts for your assigned projects.','create'],['work','Work','Your projects, tasks and calendar.','projects']].filter(([key])=>allowed(key));
  return '<section class="dashboard-welcome"><div class="welcome-copy"><span class="studio-eyebrow">Made for real life. Created by your team.</span><h1>Dashboard</h1><p class="welcome-lead">Good ideas start here.</p><p>Welcome back, '+esc(data.actor.name)+'.</p><p>Your work, your team and what comes next. Turn your originals into something people will enjoy, use and come back to.</p><div class="studio-actions">'+(allowed('studio')?button('Create content',url('create'),true):'')+(allowed('library')?button('Explore your library',url('library')):allowed('work')?button('Open your work',url('projects')):'')+'</div></div><div class="welcome-pictures"><div>'+contentPhoto('recipe','welcome-photo',true)+'<span>Food to enjoy</span></div><div>'+contentPhoto('programme','welcome-photo',true)+'<span>Movement for real life</span></div></div></section>'+
    '<div class="studio-cards team-dashboard-areas">'+sections.map(([key,title,note,section])=>'<a class="studio-card team-area-'+key+'" href="'+url(section)+'"><h2>'+title+'</h2><p>'+note+'</p></a>').join('')+'</div>'+
    (!sections.length?'<section class="panel"><p>Your account is ready. Ask your administrator to enable the areas you need.</p></section>':'')+
    (allowed('work')?'<section class="panel"><h2>My work</h2>'+list(mine.slice(0,10),row,'No open tasks assigned to you.')+'</section>':'')+
    (allowed('work')&&allowed('library')?'<section class="panel"><h2>Awaiting review</h2>'+list(reviews.slice(0,5),row,'No submitted work awaiting review.')+'</section>':'')+teamWorkDashboard(data);
}
export function workspaceDashboard(data){
  if(data.actor.role!=='admin')return teamDashboard(data);
  const {mine,reviews,ownProjects}=dashboardWork(data),admin=data.actor.role==='admin';
  return '<section class="dashboard-welcome"><div class="welcome-copy"><span class="studio-eyebrow">Made for real life. Created by your team.</span><h1>Dashboard</h1><p class="welcome-lead">Good ideas start here.</p><p>Your work, your team and what comes next. Turn your originals into something people will enjoy, use and come back to.</p><div class="studio-actions">'+button('Create content',url('create'),true)+button('Explore your library',url('library'))+'</div></div><div class="welcome-pictures"><a href="'+url('library',{kind:'recipe'})+'">'+contentPhoto('recipe','welcome-photo',true)+'<span>Food to enjoy ↗</span></a><a href="'+url('library',{kind:'programme'})+'">'+contentPhoto('programme','welcome-photo',true)+'<span>Movement for real life ↗</span></a></div></section>'+
    '<nav data-worker-updates="overview" class="dashboard-overview" aria-label="Work overview"><a href="#my-work"><strong>'+mine.length+'</strong><span>My open tasks</span></a><a href="#my-review"><strong>'+reviews.length+'</strong><span>'+(admin?'For my review':'Awaiting review')+'</span></a>'+'<a href="'+url('team-work')+'"><span>Team work & history</span></a>'+'</nav>'+
    '<div class="dashboard-work"><section class="panel" id="my-work"><div class="dashboard-section-heading"><h2>My work</h2>'+button('All work',url('projects'))+'</div>'+
    list(mine.slice(0,5),row,'No open tasks assigned to you.')+
    (mine.length>5?'<p class="meta">Showing 5 of '+mine.length+' open tasks.</p>':'')+
    (ownProjects.length?'<details><summary>My projects ('+ownProjects.length+')</summary>'+list(ownProjects,p=>'<div><a href="'+url('project',{project:p.id})+'">'+esc(p.name)+'</a></div>'+badge(p.status))+'</details>':'')+
    '<a class="dashboard-secondary" href="/content-library/?work=1&amp;assignments=1&amp;staff='+encodeURIComponent(data.actor.id)+'">My assignments →</a></section>'+
    '<section data-worker-updates="reviews" class="panel" id="my-review"><div class="dashboard-section-heading"><h2>'+(admin?'For my review':'Awaiting review')+'</h2>'+button('Open reviews',url('review'))+'</div>'+list(reviews.slice(0,5),row,admin?'Nothing needs your review right now.':'No submitted work awaiting review.')+(reviews.length>5?'<p class="meta">Showing 5 of '+reviews.length+' items.</p>':'')+'</section></div>'+
    teamWorkDashboard(data)+
    '<nav class="dashboard-shortcuts" aria-label="Workspace shortcuts">'+button('Content library',url('library'))+button('Browse originals',url('archive'))+button('Work calendar',url('calendar'))+'</nav>';
}
