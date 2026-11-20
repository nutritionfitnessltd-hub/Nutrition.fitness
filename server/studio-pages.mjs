import {newsletterDraftButton} from './newsletter-draft-links.mjs';
import {coursePreview,courseEditorRecord} from './studio-courses.mjs';
import {ownsTask,deleteTaskControl,deletedTasksPanel} from './studio-project-tasks.mjs';
import {projectCreatePage} from './studio-project-create.mjs';
import {isNewsletter,isNewsletterContent} from './studio-newsletters.mjs';
import { imageCaption } from './knowledge-article.mjs';
import {projectProductionSummary} from './studio-project-progress.mjs';
import { workerNames, workerContent } from './studio-worker-content.mjs';
import { canReadContent, canReviewContent, canAccess, canEditContent } from './library-permissions.mjs';
import { canEditDays, workoutDaysEditor } from './studio-workout-days.mjs';
import { workoutDays, workoutSession } from './studio-workouts.mjs';
import { contentPhoto } from './studio-visuals.mjs';
import { workspaceDashboard } from './studio-dashboard.mjs';
import { workerStart } from './studio-workers.mjs';
import { contentSections } from './studio-navigation.mjs';
import { editorForm, referenceData, contentPreview, videoTools } from './studio-editor.mjs';
import { fieldLabel } from '../public/studio-fields.mjs';
import { randomUUID } from 'node:crypto';
import { recipeImage, recipePreview } from './studio-recipes.mjs';
import { mealPlanForm, mealPlanPage } from './studio-mealplan-ui.mjs';
import { bookAssetUrl, bookPage } from './studio-books.mjs';
import { articleImage, articlePage } from './studio-articles.mjs';
import { kinds, templates, blankFields, references, descendants, issues } from './studio-model.mjs';
import { projectFor } from './studio-store.mjs';
import { icons } from './library-icons.mjs';
import { esc, url, heading, button, hidden, input, textarea, select, form, list, pages, badge } from './studio-ui.mjs';

const card=(title,text,href)=>'<a class="studio-card" href="'+href+'"><h2>'+esc(title)+'</h2><p>'+esc(text)+'</p><span aria-hidden="true">↗</span></a>';
const itemLink=r=>'<a '+(r.kind==='article'?'data-review-preview target="_blank" rel="noopener" ':'')+'href="'+url(r.kind==='article'?'review-preview':'item',{id:r.id})+'">'+esc(r.title)+'</a>';
const personOptions=d=>Object.fromEntries(d.people.map(p=>[p.id,p.name]));
const projectChoices=d=>({'':'Library only',...Object.fromEntries(d.projects.filter(p=>p.status!=='Complete').map(p=>[p.id,p.name]))});
const contentRow=r=>'<div>'+itemLink(r)+'<small>'+esc(kinds[r.kind]||r.kind)+'</small></div>'+badge(r.publication?.status==='published'?'Published':r.status);
const collections={
  programme:['Programmes','Training plans, organised by level.','Dumbbell'],
  recipe:['Recipes','Ingredients, methods and nutrition information.','Utensils'],
  mealplan:['Meal plans','Weekly menus and recipe collections.','Utensils'],
  exercise:['Exercises','Reusable instructions and demonstrations.','Dumbbell'],
  activity:['Activities & drills','Running, swimming, cycling and fitness practice.','Dumbbell'],
  session:['Workouts','Warm-up, main work and cool-down.','ClipboardList'],
  challenge:['Challenges','Guided journeys with a clear finish line.','CheckCheck'],
  course:['Courses','Structured learning and practical activities.','BookOpen'],
  lesson:['Lessons','Individual lessons to use in your courses.','BookOpen'],
  article:['Articles','Helpful advice and educational content.','FileText'],
  ebook:['Books & guides','Recipe books, workout books and other guides.','Book'],
  leadmagnet:['Lead magnets','Free guides, checklists and resources that introduce Nutrition.fitness.','FileText'],
  newsletter:['Newsletters','Email newsletters, designs and plain-text drafts.','Mail'],
  communication:['Messages','WhatsApp messages, emails and member encouragement.','MessageCircle'],
  campaign:['Marketing','Campaigns, launch copy and promotional content.','Briefcase'],
  workflow:['GHL workflows','Triggers, timing, messages and follow-up steps.','Layers'],
  asset:['Images & files','Images, video briefs and supporting materials.','FolderOpen'],
  learning:['Learning content','Guides and useful supporting explanations.','BookOpen'],
  stage:['Training stages','Start, Develop, Progress and Own It.','Layers'],
  structure:['Weekly schedules','Training days and week-by-week plans.','LayoutGrid'],
  rule:['Progression rules','When and how the training moves forward.','ClipboardList'],
  review:['Check-ins','Questions, reflections and progress reviews.','CheckCheck']
};

const shelves={
  programmes:{title:'Programmes',description:'Training plans and challenges.',icon:'Dumbbell',types:['programme','programme-family','challenge','stage','structure','session','rule','review'],create:'programme'},
  recipes:{title:'Recipes',description:'Recipes, meal plans and recipe books.',icon:'Utensils',types:['recipe','mealplan'],create:'recipe'},
  exercises:{title:'Exercises',description:'Exercises, demonstrations and sport drills.',icon:'Dumbbell',types:['exercise','activity'],create:'exercise'},
  courses:{title:'Courses & guides',description:'Courses, lessons, articles and e-books.',icon:'BookOpen',types:['course','lesson','article','ebook','learning'],create:'course'},
  messages:{title:'Messages',description:'Coaching, email, WhatsApp and GHL workflows.',icon:'MessageCircle',types:['communication','workflow'],create:'communication'},
  marketing:{title:'Marketing & assets',description:'Campaigns, images, videos and supporting files.',icon:'Briefcase',types:['campaign','asset'],create:'campaign'}
};
const createLink=kind=>kind==='product'?url('product',{id:'new'}):kind==='newsletter'?url('builder',{build:'newsletter'}):url('new',{kind});
function workSummary(data){
  const pending=data.items.filter(r=>r.status==='In review'&&(data.actor.role==='admin'||data.assigned.has(r.id))).length;
  const projects=data.projects.filter(p=>p.status!=='Complete');
  return '<div class="studio-workbar">'+button('Work in progress ('+projects.length+')',url('projects',{view:'all'}))+button('Review work ('+pending+')',url('review'))+'</div>'+
    (projects.length?'<details class="panel"><summary>Continue your work</summary>'+list(projects.slice(0,6),p=>'<div><a href="'+url('project',{project:p.id})+'">'+esc(p.name)+'</a><small>'+esc(data.people.find(x=>x.id===p.creator_id)?.name||'Assigned creator')+'</small></div>'+badge(p.status))+'</details>':'');
}
export function home(data,meta={}){
  return workspaceDashboard(data);
}
function typeCards(sections,counts,bucket){
  return '<nav class="studio-cards studio-type-grid" aria-label="Content types">'+sections.map(([id,title])=>{
    const count=counts.get(id)||0,icon=collections[id]?.[2]||'FileText';
    return '<a class="studio-card studio-type-card has-photo" href="'+url('library',{kind:id,bucket})+'">'+contentPhoto(id,'studio-type-photo')+'<div class="studio-type-icon" aria-hidden="true">'+icons[icon]+'</div><h2>'+esc(title)+'</h2><div class="studio-type-count">'+count.toLocaleString('en-GB')+' '+(count===1?'item':'items')+'</div><span aria-hidden="true">→</span></a>';
  }).join('')+'</nav>';
}
export function library(params,data,meta={}){
  const worker=Object.hasOwn(workerNames,params.get('worker'))?params.get('worker'):'';
  if(worker)data={...data,items:workerContent(data,worker)};
  const bucket=['published','drafts','checked'].includes(params.get('bucket'))?params.get('bucket'):'all';
  const published=r=>r.publication?.status==='published';
  data={...data,items:data.items.filter(r=>bucket==='published'?published(r):bucket==='checked'?r.status==='Approved'&&!published(r):bucket==='drafts'?!published(r)&&r.status!=='Approved':true)};
  const lifecycle='<nav class="tabs" aria-label="Content status">'+[['all','All content'],['drafts','Drafts'],['checked','Checked'],['published','Published']].map(([id,title])=>'<a href="'+url('library',{bucket:id,kind:params.get('kind')||'',worker})+'"'+(id===bucket?' aria-current="page"':'')+'>'+title+'</a>').join('')+'</nav>';
  const exercise=params.get('studio')==='exercises',kind=params.get('kind')||shelves[params.get('category')]?.create||'',q=(params.get('q')||'').toLowerCase(),state=params.get('state')||'';
  if(!worker&&!exercise&&!kind&&!q&&!state&&params.get('view')!=='all'){
    const counts=new Map();
    for(const r of data.items)if(r.status!=='Archived'){const type=isNewsletterContent(r)?'newsletter':r.kind;counts.set(type,(counts.get(type)||0)+1);}
    return heading('Content library','Your working content.',(canAccess(data.actor,'studio')?button('Create content',url('create'),true):'')+(canAccess(data.actor,'originals')?button('Browse original collections',url('workspace-archive',{tab:'originals'})):''))+lifecycle+
      '<form class="studio-filters" action="/content-library/">'+hidden('work','1')+hidden('studio','library')+hidden('view','all')+hidden('bucket',bucket)+hidden('worker',worker)+input('q','Search all content','','search')+'<button>Search</button>'+button('Browse all content',url('library',{view:'all',bucket}))+'</form>'+
      typeCards(contentSections,counts,bucket)+
      '<details class="panel"><summary>More content types</summary>'+typeCards(Object.entries(collections).filter(([id])=>!contentSections.some(([key])=>key===id)).map(([id,[title]])=>[id,title]),counts,bucket)+'</details>';

  }
  const matchesKind=r=>!kind||(kind==='newsletter'?isNewsletterContent(r):r.kind===kind&&(kind!=='communication'||!isNewsletterContent(r)));
  let rows=data.items.filter(r=>!['settings','programme-family'].includes(r.kind)&&(exercise?['exercise','activity'].includes(r.kind)&&(!kind||r.kind===kind):matchesKind(r))&&(!state?r.status!=='Archived':r.status===state));
  if(kind==='programme'){
    if(!q&&!state&&['all','drafts'].includes(bucket))rows=data.items.filter(r=>r.status!=='Archived'&&(r.kind==='programme-family'||r.kind==='programme'&&data.byId.get(r.parent)?.kind!=='programme-family'));
    const families=['stronger','build','fitter','run','swim','ride','back-to-it','nufi365'];
    const rank=r=>{const id=(r.parent||r.id).replace(/^training:/,'');const n=families.indexOf(id);return n<0?99:n;};
    rows.sort((a,b)=>rank(a)-rank(b)||['start','progress','develop','own-it'].indexOf(a.fields.level)-['start','progress','develop','own-it'].indexOf(b.fields.level));
  }
  const words=value=>Array.isArray(value)?value.join(' '):String(value||'');
  if(kind==='ebook'&&params.get('bookType'))rows=rows.filter(r=>(r.fields.bookType||'Guide')===params.get('bookType'));
  rows=rows.filter(r=>(r.title+' '+words(r.fields.aliases)+' '+words(r.fields.equipment)+' '+words(r.fields.muscles)).toLowerCase().includes(q));
  const filter='<form class="studio-filters" action="/content-library/">'+hidden('work','1')+hidden('studio',exercise?'exercises':'library')+hidden('view','all')+hidden('bucket',bucket)+hidden('worker',worker)+input('q','Search',params.get('q')||'','search')+
    (kind?hidden('kind',kind):select('kind','Content type',{'':'All types',...kinds,newsletter:'Newsletter'},kind))+
    (kind==='ebook'?select('bookType','Book type',{'':'All books','Recipe book':'Recipe books','Workout book':'Workout books',Guide:'Guides'},params.get('bookType')||''):'')+
    '<details class="filter-details"'+(state?' open':'')+'><summary>More filters</summary>'+select('state','Progress',{'':'Active content',Draft:'Draft','In review':'Needs checking','Changes requested':'Needs changes',Approved:'Checked',Archived:'Archived'},state)+'</details><button>Search</button></form>';

  return (!exercise?'<a class="back" href="'+url('library',{bucket})+'">← Content types</a>':'')+heading(worker?workerNames[worker]+'’s work':exercise?'Exercises & drills':kind==='ebook'&&params.get('bookType')?params.get('bookType')+'s':collections[kind]?.[0]||'All content',worker?'Open content to edit, submit for approval or approve a submitted draft.':exercise?'Find instructions, coaching cues and demonstrations.':collections[kind]?.[1]||'Your working Nutrition.fitness content.',(canAccess(data.actor,'studio')?button(kind?'Create '+(kind==='newsletter'?'newsletter':kinds[kind]||'content').toLowerCase():'Create content',(kind==='newsletter'?createLink(kind):url('new',{kind:kind||(exercise?'exercise':'article')})),true):''))+lifecycle+filter+
    (!rows.length?'<p class="studio-empty">'+(q||state?'No content matches these filters.':(bucket==='published'?'Nothing has been published here yet. Checked content is kept separately.':'Nothing here yet. Create an item or import an original.'))+'</p>':'')+
    '<div data-worker-updates="library">'+pages(params,rows,rs=>'<div class="studio-content-grid">'+rs.map(r=>{
      const preview=meta.training?.[r.id]||meta.assets?.[r.id]?.preview||meta.training?.[r.parent];
      const photo=r.kind==='ebook'&&r.bookAssets?.front?bookAssetUrl(r.id,'front').replaceAll('&amp;','&'):recipeImage(r)||articleImage(r);
      const ghlAction=newsletterDraftButton(data,r);
      return (ghlAction?'<div class="studio-linked-content-card">':'')+'<a class="studio-content-card" '+(r.kind==='article'?'data-review-preview target="_blank" rel="noopener" ':'')+'href="'+url(r.kind==='article'?'review-preview':'item',{id:r.id})+'">'+(photo?'<span class="studio-card-photo"><img src="'+esc(photo)+'" alt="" loading="lazy">'+(r.kind==='article'&&imageCaption(r)?'<span class="studio-photo-caption">'+esc(imageCaption(r))+'</span>':'')+'</span>':preview?'<img src="'+url('media',{preview})+'" alt="" loading="lazy">':'')+'<div><small>'+esc(isNewsletterContent(r)?'Newsletter':r.kind==='programme-family'?'Training programmes':kinds[r.kind]||r.kind)+'</small><h2>'+esc(r.title)+'</h2>'+(r.kind==='programme'?'<p>'+esc(r.fields.weeks)+' weeks · '+(r.id==='training:nufi365'?'Year-round programme':'Standalone programme')+'</p>':r.kind==='programme-family'?'<p>Start · Progress · Develop · Own It</p>':'')+badge(published(r)?'Published':r.status)+'</div></a>'+(ghlAction?'<div class="studio-actions">'+ghlAction+'</div></div>':'');
    }).join('')+'</div>')+'</div>';
}
export function createPage(params,data,values={}){
  if(data.actor.role==='admin'&&(params.get('project')==='1'||params.get('blank')==='1'))return projectCreatePage(params,data,values);
  if(params.get('template')==='mealplan')return mealPlanForm(data,values);
  const choice=params.get('template'),t=data.actor.role==='admin'?templates[choice]:null;
  if(!t)return (data.actor.role==='admin'?'<section class="panel">'+heading('Start a project','Build your own task list from scratch.',button('Blank project',url('project-create'),true))+'</section>'+workerStart():heading('What do you want to build today?','Choose a content type to begin.'))+'<details class="panel studio-manual"><summary>Create it myself</summary>'+
    '<div class="studio-cards studio-type-grid">'+contentSections.map(([kind,title])=>card(title,'',createLink(kind))).join('')+'</div>'+
    '<details class="panel"><summary>More content types</summary><div class="studio-actions">'+Object.entries(kinds).filter(([kind])=>!contentSections.some(([key])=>key===kind)).map(([kind,title])=>button(title,createLink(kind))).join('')+'</div></details>'+
    '<div class="studio-actions">'+(canAccess(data.actor,'originals')?button('Use an original',url('archive'))+button('Import a file',url('import')):'')+'</div></details>'+
    (data.actor.role==='admin'?'<details class="panel"'+(params.get('project')?' open':'')+'><summary>Plan a project with several items</summary><div class="studio-cards">'+Object.entries(templates).map(([kind,t])=>card(t.name,t.description,url('create',{template:kind}))).join('')+'</div></details>':'');
  return heading(t.name,'Tell us the idea and who will work on it. We’ll organise the steps.')+
    form('plan-preview',hidden('template',choice)+hidden('id',values.id||randomUUID())+hidden('rootId',values.rootId||'')+
      input('name','What shall we call it?',values.name||'','text','required maxlength="160"')+
      textarea('brief','What do you have in mind?',values.brief||'',4)+input('audience','Who is this for?',values.audience||'')+
      input('outcome','What should they achieve?',values.outcome||'')+
      '<div class="studio-columns">'+(choice==='programme'?select('weeks','Programme length',{4:'4 weeks',6:'6 weeks',8:'8 weeks',12:'12 weeks'},values.weeks||12):input('weeks','Number of weeks',values.weeks||6,'number','min="1" max="52" required'))+
      select('creator','Creator',personOptions(data),values.creator||data.people[0]?.id)+'</div>'+
      input('launch','Target launch date (optional)',values.launch||'','date')+
      (data.aiReady?'<label class="check"><input type="checkbox" name="assist" value="yes" checked> Use AI to tailor the production plan to this brief</label>':'<p class="meta">AI drafting will be available when the account connection is complete.</p>'),
      {section:'create',template:choice},'Show the plan');
}
export function projectList(params,data){
  const kind=params.get('kind')||'',categories={...collections,other:['Other projects','Projects without a content type.','Briefcase']};
  const projectKind=p=>data.byId.get(p.studio?.rootId)?.kind||templates[p.studio?.type]?.kind||'other';
  const selected=data.projects.filter(p=>!kind||projectKind(p)===kind);
  return heading(kind?(categories[kind]?.[0]||'All')+' projects':'Projects','',data.actor.role==='admin'?button('Create a project',url('project-create'),true):'')+
    pages(params,selected,rows=>list(rows,p=>'<div><a href="'+url('project',{project:p.id})+'">'+esc(p.name)+'</a><small>'+esc(data.people.find(s=>s.id===p.creator_id)?.name||'Assigned creator')+(p.studio.productionTracking||p.studio.type==='blank'?'':' · '+p.weeks+' weeks')+(p.studio.launchDate?' · Launch '+esc(p.studio.launchDate):'')+'</small>'+projectProductionSummary(p,data)+'</div>'+badge(p.status),'No projects of this type yet.'));
}
export function projectPage(params,data){
  const p=projectFor(data,params.get('project')),week=Math.max(0,Math.min(p.weeks,Number(params.get('week'))||0)),admin=data.actor.role==='admin';
  if(p.assignmentOnly)return heading(p.name,'Linked to your assignment',button('My assignments','/content-library/?work=1&assignments=1'))+'<p>'+badge(p.status)+'</p><section class="panel"><h2>Project brief</h2><p class="prose">'+esc(p.brief||'No project brief recorded.')+'</p><h2>Project plan</h2>'+list(p.entries||[],e=>'<div><strong>'+esc(e.title)+'</strong><small>'+esc(e.week?'Week '+e.week:'Preparation')+'</small></div>'+badge(e.status),'No project tasks recorded yet.')+'</section>';

  if(!canAccess(data.actor,'edit'))return heading(p.name,p.brief)+badge(p.status)+'<section class="panel">'+list(p.entries,e=>'<div><small>'+(e.week?'Week '+e.week:'Preparation')+'</small><h3>'+esc(e.title)+'</h3><p>'+esc(e.notes||'')+'</p>'+(e.record&&canAccess(data.actor,'library')?button('Open content',url('item',{id:e.record})):'' )+'</div>'+badge(e.status))+'</section>';
  const state={section:'project',project:p.id,week},base=hidden('projectRevision',p.revision);
  const blank=p.studio.type==='blank',root=data.byId.get(p.studio.rootId);
  const nav=blank?'':'<form class="studio-filters" action="/content-library/">'+hidden('work','1')+hidden('studio','project')+hidden('project',p.id)+select('week','Week',Object.fromEntries(Array.from({length:p.weeks+1},(_,w)=>[w,w?'Week '+w:'Preparation'])),week)+'<button>Open week</button></form>';
  const tasks=p.entries.filter(e=>blank||e.week===week);
  const taskRows=new Map();
  for(const e of tasks){
    const type=e.kind==='Task'?'task':data.byId.get(e.record)?.kind||Object.keys(kinds).find(k=>kinds[k]===e.kind)||({'PT WhatsApp message':'communication','Content to create':'article'})[e.kind]||'article';
    if(!taskRows.has(type))taskRows.set(type,[]);taskRows.get(type).push(e);
  }
  const rows=[...taskRows].map(([type,entries])=>'<section class="studio-task-group"><h3>'+esc(collections[type]?.[0]||(type==='task'?'Tasks':'Content'))+'</h3>'+entries.map(e=>{
    const r=data.byId.get(e.record);
    return '<section class="studio-task"><div class="studio-heading"><div><small>'+esc(e.kind)+'</small><h3>'+esc(e.title)+'</h3></div>'+badge(e.status)+'</div><p>Assigned to: '+esc(data.people.find(person=>person.id===(e.assignee||p.creator_id))?.name||'Team member')+(e.due?' · Due '+esc(e.due):'')+'</p><p class="prose">'+esc(e.notes||'')+'</p>'+
      (r?(canAccess(data.actor,'library')?button('Open content',url('item',{id:r.id})):'' ):canAccess(data.actor,'studio')&&e.kind!=='Task'?button('Create this content',url('new',{project:p.id,entry:e.id,kind:e.kind==='PT WhatsApp message'?'communication':e.kind==='Creative asset'?'asset':e.kind==='GHL workflow'?'workflow':'article',title:e.title})):'' )+
      (admin||ownsTask(p,e,data.actor.id)?'<details><summary>Update task</summary>'+form('task-save',base+hidden('entry',e.id)+
      (admin?select('assignee','Assign to',{'':'Project owner',...personOptions(data)},e.assignee||''):'')+input('title','Task',e.title,'text','required maxlength="160"')+textarea('notes','Brief and feedback',e.notes||'')+
      select('status','Progress',Object.fromEntries((admin?['To do','In progress','Ready for review','Changes requested','Done']:['To do','In progress','Ready for review','Changes requested']).map(x=>[x,x])),e.status)+
      (blank?hidden('week',e.week):input('week','Week (0 is preparation)',e.week,'number','min="0" max="'+p.weeks+'"'))+input('due','Due date',e.due||'','date'),state)+'</details>':'')+deleteTaskControl(p,e,data)+'</section>';
  }).join('')+'</section>').join('');
  const candidates=data.items.filter(r=>(r.title+' '+r.kind).toLowerCase().includes((params.get('find')||'').toLowerCase())).slice(0,35);
  return heading(p.name,p.studio.audience||p.brief,canAccess(data.actor,'library')&&(!blank||p.entries.some(e=>e.record))?button('Preview journey',url('journey',{project:p.id}))+button('Export',url('release',{project:p.id})):'' )+
    '<p class="studio-project-meta">'+esc(p.status)+' · '+esc(data.people.find(s=>s.id===p.creator_id)?.name||'Assigned creator')+(p.studio.launchDate?' · Launch '+esc(p.studio.launchDate):'')+'</p>'+
    (root&&canAccess(data.actor,'library')?'<p>Programme content · '+itemLink(root)+'</p>':'')+nav+'<div class="studio-columns project-columns"><section><h2>'+(blank?'Tasks':week?'Week '+week:'Preparation')+'</h2>'+(rows||(blank?'<p>No tasks yet. Add your first task to get started.</p>':'<p>No tasks in this week yet.</p>'))+'</section>'+
    '<aside class="panel">'+deletedTasksPanel(p,data)+'<details'+(blank?' open':'')+'><summary>Add work</summary>'+form('task-add',base+input('title','What needs doing?','','text','required maxlength="160"')+
    (admin?select('assignee','Assign to',{'':'Project owner',...personOptions(data)}):'')+input('due','Due date (optional)','','date')+select('kind',blank?'Task type':'Content type',{...(blank?{Task:'Task'}:{}),'Content to create':'Content to create','PT WhatsApp message':'PT WhatsApp message','GHL workflow':'GHL workflow','Creative asset':'Creative asset','Marketing content':'Marketing content'})+textarea('notes','What does a finished result need?'),state,'Add task')+'</details>'+
    (canAccess(data.actor,'library')?'<details><summary>Attach existing content</summary><form action="/content-library/">'+hidden('work','1')+hidden('studio','project')+hidden('project',p.id)+hidden('week',week)+input('find','Find content',params.get('find')||'')+'<button>Find</button></form>'+
    (params.has('find')?form('task-attach',base+select('record','Library item',Object.fromEntries(candidates.map(r=>[r.id,r.title]))),state,'Attach to this week'):'')+'</details>':'')+
    '<details><summary>Creator & details</summary>'+form('project-save',base+(admin?input('name','Name',p.name)+select('creator','Creator',personOptions(data),p.creator_id):'')+
      textarea('brief','Project brief',p.brief)+input('launch','Target launch',p.studio.launchDate||'','date')+
      select('status','Status',Object.fromEntries((admin?['Planning','In progress','Ready for review','Complete']:['Planning','In progress','Ready for review']).map(x=>[x,x])),p.status),state)+'</details></aside></div>';
}
function readable(value,data){
  if(Array.isArray(value))return '<ol>'+value.map(v=>'<li>'+readable(v,data)+'</li>').join('')+'</ol>';
  if(value&&typeof value==='object')return '<dl>'+Object.entries(value).map(([k,v])=>'<dt>'+esc(fieldLabel(k))+'</dt><dd>'+readable(v,data)+'</dd>').join('')+'</dl>';
  const ref=data.byId.get(value)||data.byId.get('training:'+value);
  return ref?itemLink(ref):esc(value);
}
function weeklyPlan(params,data,schedules,owner){
  const chosen=schedules.find(x=>x.id===params.get('schedule'))||schedules[0];
  if(!chosen)return '<p class="studio-empty">No weekly plan has been added yet.</p>';
  const weeks=Array.isArray(chosen.fields.weeks)?chosen.fields.weeks:[],week=weeks.find(w=>String(w.number)===params.get('week'))||weeks[0];
  const href=(schedule,w,day)=>url('item',{id:owner?.id||schedule.id,...(owner?{tab:'plan',schedule:schedule.id}:{}),week:w,...(day?{day}:{})});
  let out='<nav class="tabs" aria-label="Training days">'+schedules.map(x=>'<a href="'+href(x,week?.number||1)+'"'+(x.id===chosen.id?' aria-current="page"':'')+'>'+esc(x.fields.frequency)+' days'+(schedules.filter(y=>y.fields.frequency===x.fields.frequency).length>1?' · '+esc(x.title):'')+'</a>').join('')+'</nav>'+
    '<form class="studio-filters" action="/content-library/">'+hidden('work','1')+hidden('studio','item')+hidden('id',owner?.id||chosen.id)+hidden('tab','plan')+hidden('schedule',chosen.id)+select('week','Week',Object.fromEntries(weeks.map(w=>[w.number,'Week '+w.number+(w.title?' · '+w.title:'')])),week?.number||1)+'<button>Open week</button></form>';
  if(week){
    const sessions=(week.sessionIds||[]).map(id=>data.byId.get(id)||data.byId.get('training:'+id));
    out+='<div class="workout-week-intro"><h2>Week '+esc(week.number)+(week.title?' · '+esc(week.title):'')+'</h2>'+(week.message?'<p class="prose">'+esc(week.message)+'</p>':'')+
      (week.progression?'<details><summary>This week’s progression</summary><p class="prose">'+esc(week.progression)+'</p></details>':'')+'</div>'+
      (params.get('notice')==='days-saved'?'<p class="workout-save-notice" role="status">Days saved as a draft.</p>':'')+
      (canEditDays(chosen,data)&&params.get('editDays')==='1'?workoutDaysEditor(params,data,chosen,week):
        '<div class="workout-day-tools"><h3>Training days</h3>'+(canEditDays(chosen,data)?button('Edit days',href(chosen,week.number)+'&amp;editDays=1#days-editor'):'')+'</div>'+workoutDays(params,data,sessions,day=>href(chosen,week.number,day),week.dayLabels));
  }
  return out+'<details class="panel"><summary>Spacing, recovery & busy weeks</summary>'+readable({spacing:chosen.fields.spacing||'',rest:chosen.fields.restRules||'',busyWeek:chosen.fields.busyWeek||{}},data)+button('Edit this schedule',url('item',{id:chosen.id,tab:'edit'}))+'</details>';
}
function programmePage(params,data,r){
  const admin=data.actor.role==='admin',canEdit=canEditContent(data,r.id);
  const projects=data.projects.filter(p=>p.studio?.rootId===r.id),project=projects.find(p=>p.status!=='Complete')||projects[0];
  const ids=descendants([r.id,...projects.flatMap(p=>p.entries.map(e=>e.record).filter(Boolean))],data.items),related=data.items.filter(x=>x.id!==r.id&&ids.has(x.id)&&x.status!=='Archived');
  const schedules=related.filter(x=>x.kind==='structure').sort((a,b)=>a.fields.frequency-b.fields.frequency);
  const tab=['plan','messages','assets'].includes(params.get('tab'))?params.get('tab'):'overview';
  const creator=data.people.find(p=>p.id===project?.creator_id);
  let out='<a class="back" href="'+(data.byId.get(r.parent)?.kind==='programme-family'?url('item',{id:r.parent}):url('library',{category:'programmes'}))+'">← '+esc(data.byId.get(r.parent)?.kind==='programme-family'?data.byId.get(r.parent).title:'Programmes')+'</a>'+
    heading(r.title,r.fields.weeks+' weeks',button('Preview',url('item',{id:r.id,tab:'preview'})))+
    '<div class="studio-programme-bar">'+badge(r.status)+'<span>Creator: '+esc(creator?.name||'Not assigned')+'</span>'+
    (project?button('Work & feedback',url('project',{project:project.id})):admin?button('Assign work',url('project-from',{id:r.id})): '')+
    (canEdit?button('Edit content',url('item',{id:r.id,tab:'edit'})):'')+'</div>'+
    '<nav class="tabs studio-programme-tabs" aria-label="Programme content">'+[['overview','Overview'],['plan','Weekly plan'],['messages','Messages'],['assets','Assets']].map(([key,title])=>'<a href="'+url('item',{id:r.id,tab:key})+'"'+(tab===key?' aria-current="page"':'')+'>'+title+'</a>').join('')+'</nav>';
  if(tab==='plan')return out+(schedules.length?weeklyPlan(params,data,schedules,r):'<section class="panel"><h2>Weekly plan</h2><p>This programme’s planning material is below. Open a section to continue building its weeks.</p>'+list(related.filter(x=>['stage','session'].includes(x.kind)),contentRow,'No workouts have been added yet.')+'</section>');
  if(tab==='messages'||tab==='assets'){
    const types=tab==='messages'?['communication','workflow']:['asset','campaign'];
    const rows=related.filter(x=>types.includes(x.kind)),kind=tab==='messages'?'communication':'asset';
    return out+'<section class="panel">'+heading(tab==='messages'?'Messages':'Assets',tab==='messages'?'Coaching messages and follow-up plans for this programme.':'Images, marketing and supporting files for this programme.',canEdit&&project?button('Add '+(tab==='messages'?'message':'asset'),url('new',{kind,project:project.id})):admin&&!project?button('Assign work to add content',url('project-from',{id:r.id})): '')+
      pages(params,rows,items=>list(items,contentRow,'Nothing here yet.'))+
      (tab==='assets'&&canEdit&&r.sourceId&&canAccess(data.actor,'sources')?button('Open original source assets','/content-library/?work=1&assets='+encodeURIComponent(r.sourceId)):'')+'</section>';
  }
  const fields=[['The aim',r.fields.purpose||r.fields.description],['Who it’s for',r.fields.audience||r.fields.suitableFor],['What you’ll achieve',r.fields.outcome||r.fields.memberPromise],['Before starting',r.fields.entryCriteria],['Equipment',r.fields.equipment],['Completing the programme',r.fields.exitCriteria]];
  out+='<section class="panel studio-programme-overview">'+fields.filter(([,v])=>v&&(!Array.isArray(v)||v.length)).map(([label,value])=>'<section><h2>'+esc(label)+'</h2><div class="prose">'+readable(value,data)+'</div></section>').join('')+'</section>';
  out+=button('Open weekly plan',url('item',{id:r.id,tab:'plan'}),true);
  const supporting=related.filter(x=>['learning','lesson','article','rule','review'].includes(x.kind));
  if(supporting.length)out+='<details class="panel"><summary>Coaching guidance & check-ins ('+supporting.length+')</summary>'+list(supporting,contentRow)+'</details>';
  return out;
}
export function itemPage(params,data){
  const r=data.byId.get(params.get('id'));if(!canReadContent(data,r))return heading('Content unavailable');
  if(r.kind==='article'&&params.get('tab')!=='edit')return articlePage(r,data);
  if(r.kind==='mealplan'&&r.fields.plannerVersion===1&&params.get('tab')!=='edit')return mealPlanPage(params,data,r);
  if(r.kind==='ebook'&&r.bookAssets&&params.get('tab')!=='edit')return bookPage(r,data);
  if(r.kind==='programme'&&!['edit','preview'].includes(params.get('tab')))return programmePage(params,data,r);
  if(r.kind==='programme-family'){
    const programmes=data.items.filter(x=>x.parent===r.id&&x.kind==='programme'&&x.status!=='Archived');
    return '<a class="back" href="'+url('library',{kind:'programme'})+'">← Programmes</a>'+heading(r.title,'Choose a level.')+
      '<div class="studio-cards">'+programmes.map(p=>card(p.title,p.fields.weeks+' weeks · '+(p.fields.audience||''),url('item',{id:p.id}))).join('')+'</div>'+
      '<details class="panel"><summary>Shared content & files</summary>'+list(data.items.filter(x=>x.parent===r.id&&x.kind!=='programme'&&x.status!=='Archived'),contentRow)+'</details>';
  }
  const admin=data.actor.role==='admin',canEdit=canEditContent(data,r.id),state={section:'item',id:r.id,tab:'edit'};
  const children=data.items.filter(x=>(x.parent===r.id||(r.fields.sharedContentIds||[]).includes(x.id))&&x.status!=='Archived'),refs=references(r,data.byId).map(id=>data.byId.get(id)).filter(Boolean);
  const parents=data.items.filter(x=>x.id!==r.id&&(x.id===r.parent||references(x,data.byId).includes(r.id)));
  const checks=issues(r,data.items),preview=params.get('tab')==='preview'||!canEdit||(!params.has('tab')&&(['course','recipe','session'].includes(r.kind)||isNewsletter(r))),schedule=r.kind==='structure'&&params.get('tab')!=='edit'&&!preview;
  let out='<a class="back" href="'+(r.kind==='programme'?url('item',{id:r.id}):url('library',{kind:r.kind}))+'">← '+esc(r.kind==='programme'?'Programme overview':collections[r.kind]?.[0]||'Content library')+'</a>'+
    heading(r.title,isNewsletter(r)?'Newsletter':kinds[r.kind]||r.kind,preview||schedule?(canEdit?button(isNewsletter(r)?'Edit HTML & text':'Edit content',url('item',{id:r.id,tab:'edit'}),true):''):'')+
    '<p>'+badge(isNewsletterContent(r)&&r.status==='Approved'?'Approved for GHL':r.publication?.status==='published'?'Published':r.status)+' <span class="meta">'+(r.updatedAt?'Saved '+esc(new Date(r.updatedAt).toLocaleDateString('en-GB')):'')+'</span></p>';
  if(schedule){
    const frequencies=data.items.filter(x=>x.kind==='structure'&&x.parent===r.parent&&x.status!=='Archived');
    const selected=new URLSearchParams(params);selected.set('schedule',r.id);
    return out+weeklyPlan(selected,data,frequencies);
  }
  if(preview){
    out+=videoTools(r)+(r.kind==='course'?coursePreview(r,data,readable):r.kind==='recipe'?recipePreview(r):r.kind==='session'?workoutSession(r,data,{standalone:true}):contentPreview(r,data,readable));
    const included=r.kind==='course'?(r.fields.lessonIds||[]).map(id=>data.byId.get(id)||data.byId.get('training:'+id)).filter(Boolean):children;
    const unique=[...new Map([...included,...children].map(x=>[x.id,x])).values()];
    if(unique.length&&r.kind!=='course')out+='<section class="panel"><h2>Included content</h2>'+list(unique,contentRow)+'</section>';
    if(r.kind==='course'&&children.some(x=>x.kind!=='lesson'))out+='<details class="panel"><summary>Supporting files</summary>'+list(children.filter(x=>x.kind!=='lesson'),contentRow)+'</details>';
  }else{
    if(checks.length&&r.kind!=='communication')out+='<details class="editor-checks"><summary>'+checks.length+' '+(checks.length===1?'thing':'things')+' to complete before checking</summary><ul>'+checks.map(c=>'<li>'+esc(c)+'</li>').join('')+'</ul></details>';
    out+=videoTools(r)+editorForm(r.kind==='course'&&!data.unsaved?courseEditorRecord(r,data):r,data,{feedback:data.unsavedFeedback||'',unsaved:data.unsaved===true})+referenceData(data);
  }
  if(r.kind==='communication')return out;
  if(canEdit){
    out+='<details class="panel"><summary>History, feedback & other actions</summary><div class="studio-actions">'+button('Version history',url('history',{id:r.id}))+
      (r.sourceId&&canAccess(data.actor,'sources')?button('Original files','/content-library/?work=1&assets='+encodeURIComponent(r.sourceId)):'')+
      (admin?button('Assign work',url('project-from',{id:r.id})):'')+'</div>'+
      '<details><summary>Feedback ('+(r.comments||[]).length+')</summary>'+list(r.comments||[],c=>'<div><p>'+esc(c.body)+'</p><small>'+esc(c.author)+' · '+esc(c.at.slice(0,10))+'</small></div>','No feedback yet.')+
      form('content-comment',hidden('revision',r.revision)+textarea('comment','Add feedback'),state,'Add feedback')+'</details>'+
      (r.kind==='mealplan'&&canAccess(data.actor,'ai')?'<details><summary>Change the plan settings</summary>'+mealPlanForm(data,{},r)+'</details>':data.aiReady?'<details><summary>Draft with AI</summary>'+form('ai-draft',hidden('revision',r.revision)+textarea('prompt','What would you like to improve?'),state,'Generate a draft for checking')+'</details>':'')+
      (admin?'<details><summary>Request changes or archive</summary>'+form('content-review',hidden('revision',r.revision)+select('status','Action',{'Changes requested':'Request changes',Archived:'Archive this item'})+textarea('feedback','Note'),state,'Apply to saved version')+'</details>':'')+'</details>';
  }
  if(refs.length&&!preview)out+='<details class="panel"><summary>Linked content ('+refs.length+')</summary>'+list(refs,contentRow)+'</details>';
  if(parents.length)out+='<details class="panel"><summary>Used in ('+parents.length+')</summary>'+list(parents,contentRow)+'</details>';
  if(r.source)out+='<details class="panel"><summary>Original source</summary><p>'+esc(r.source.name||r.sourceId||'Imported content')+'</p><pre class="source-text">'+esc(r.source.text||'')+'</pre></details>';
  return out;
}
export function newItem(params,data,values={}){
  const kind=Object.hasOwn(kinds,values.kind||params.get('kind'))?(values.kind||params.get('kind')):'article';
  if(kind==='mealplan')return mealPlanForm(data,{...values,project:values.project||params.get('project')||''});
  let fields=blankFields(kind);if(values.fields)try{fields=JSON.parse(values.fields);}catch{}
  const r={id:values.id||'studio:'+randomUUID(),kind,title:values.title??params.get('title')??'',fields};
  return '<a class="back" href="'+url('create')+'">← Create content</a>'+heading('Create '+kinds[kind].toLowerCase())+
    (data.actor.role==='admin'&&!values.fields?'<p class="studio-workbar">'+button('Start from an original with a worker',url('builder',{shelf:kind==='course'||kind==='lesson'?'Courses':kind==='challenge'?'Challenges':''}))+'</p>':'')+
    editorForm(r,data,{create:true,project:values.project||params.get('project')||'',entry:values.entry||params.get('entry')||'',unsaved:data.unsaved===true})+referenceData(data);
}
export function reviewPage(params,data){
  const rows=data.items.filter(r=>['In review','Changes requested'].includes(r.status)&&(canReviewContent(data,r)||data.assigned.has(r.id)));
  return heading('Needs checking','Preview the saved work, approve it or request changes.')+
    pages(params,rows,rs=>list(rs,r=>'<div><a data-review-preview target="_blank" rel="noopener" href="'+url('review-preview',{id:r.id})+'">'+esc(r.title)+'</a><small>'+esc(kinds[r.kind]||r.kind)+'</small></div>'+badge(r.status),'There is no content waiting for review.'))+
    '<script type="module" src="/studio-review.js"></script>';
}
export function calendar(data){
  const events=data.projects.flatMap(p=>[
    ...(p.studio.launchDate?[{date:p.studio.launchDate,title:p.name+' · Launch',id:p.id}]:[]),
    ...p.entries.filter(e=>e.due).map(e=>({date:e.due,title:e.title,id:p.id,week:e.week}))
  ]).concat(data.items.filter(r=>r.publicationPlan?.date&&r.status!=='Archived'&&(data.actor.role==='admin'||data.assigned.has(r.id))).map(r=>({date:r.publicationPlan.date,title:r.title+' · Planned publication',contentId:r.id}))).sort((a,b)=>a.date.localeCompare(b.date));
  return heading('Content calendar','Planned articles, launches and task deadlines.')+list(events,e=>'<time>'+esc(e.date)+'</time><a href="'+(e.contentId?url('review-preview',{id:e.contentId}):url('project',{project:e.id,week:e.week||0}))+'">'+esc(e.title)+'</a>','Set a publication date, launch date or task deadline to populate the calendar.');
}
export function journey(params,data){
  const p=projectFor(data,params.get('project'));
  return heading(p.name+' · Member journey','Read the content in the order it is planned.',button('Back to project',url('project',{project:p.id})))+
    Array.from({length:p.weeks+1},(_,week)=>'<section class="panel"><h2>'+(week?'Week '+week:'Before starting')+'</h2>'+
      p.entries.filter(e=>e.week===week).map(e=>{
        const r=data.byId.get(e.record);
        return '<section class="journey-entry"><h3>'+esc(e.title)+'</h3>'+(r?badge(r.status)+'<div class="prose">'+readable(r.fields,data)+'</div>':'<p>'+esc(e.notes||'Content to create')+'</p>'+badge(e.status))+'</section>';
      }).join('')+'</section>').join('');
}
export function releasePage(params,data){
  const p=projectFor(data,params.get('project'));
  const ids=descendants([p.studio.rootId,...p.entries.map(e=>e.record)].filter(Boolean),data.items);
  const records=data.items.filter(r=>ids.has(r.id));
  const pending=p.entries.filter(e=>e.status!=='Done');
  return heading('Export content',p.name,button('Back to project',url('project',{project:p.id})))+
    '<div class="panel"><p>'+records.length+' linked content items · '+records.filter(r=>r.status==='Approved').length+' checked · '+pending.length+' unfinished tasks</p>'+
    '<p>Download a content package for transfer. Downloading does not publish it to the website or app.</p>'+
    button('Download all drafts',url('export',{project:p.id,mode:'review'}))+' '+(data.actor.role==='admin'?button('Download checked content',url('export',{project:p.id,mode:'approved'}),true):'')+'</div>'+
    '<h2>Content checks</h2>'+list(records,r=>'<div>'+itemLink(r)+'<small>'+esc(issues(r,data.items).join(' ')||'Required fields complete')+'</small></div>'+badge(r.status));
}
