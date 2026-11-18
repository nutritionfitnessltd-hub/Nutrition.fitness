import { randomUUID } from 'node:crypto';
import { recipeImage, recipePreview } from './studio-recipes.mjs';
import { bookAssetUrl, bookPage } from './studio-books.mjs';
import { kinds, templates, blankFields, references, descendants, issues } from './studio-model.mjs';
import { projectFor } from './studio-store.mjs';
import { icons } from './library-icons.mjs';
import { esc, url, heading, button, hidden, input, textarea, select, form, list, pages, badge } from './studio-ui.mjs';

const card=(title,text,href)=>'<a class="studio-card" href="'+href+'"><h2>'+esc(title)+'</h2><p>'+esc(text)+'</p><span aria-hidden="true">↗</span></a>';
const itemLink=r=>'<a href="'+url('item',{id:r.id})+'">'+esc(r.title)+'</a>';
const personOptions=d=>Object.fromEntries(d.people.map(p=>[p.id,p.name]));
const projectChoices=d=>({'':'Library only',...Object.fromEntries(d.projects.filter(p=>p.status!=='Complete').map(p=>[p.id,p.name]))});
const contentRow=r=>'<div>'+itemLink(r)+'<small>'+esc(kinds[r.kind]||r.kind)+'</small></div>'+badge(r.status);
const collections={
  programme:['Training programmes','Standalone level programmes, each with a clear duration.','Dumbbell'],
  recipe:['Recipes','Ingredients, methods and nutrition information.','Utensils'],
  mealplan:['Meal plans','Weekly menus and recipe collections.','Utensils'],
  exercise:['Exercises','Reusable instructions and demonstrations.','Dumbbell'],
  activity:['Activities & drills','Running, swimming, cycling and fitness practice.','Dumbbell'],
  session:['Workouts','Warm-up, main work and cool-down.','ClipboardList'],
  challenge:['Challenges','Guided journeys with a clear finish line.','CheckCheck'],
  course:['Courses','Structured learning and practical activities.','BookOpen'],
  lesson:['Lessons','Individual lessons to use in your courses.','BookOpen'],
  article:['Knowledge Centre','Helpful advice and educational content.','FileText'],
  ebook:['Books','Recipe books, workout books and other guides.','Book'],
  leadmagnet:['Lead magnets','Free guides, checklists and resources that introduce Nutrition.fitness.','FileText'],
  communication:['Coaching messages','WhatsApp messages, emails and member encouragement.','MessageCircle'],
  campaign:['Marketing content','Campaigns, launch copy and promotional content.','Briefcase'],
  workflow:['GHL workflows','Triggers, timing, messages and follow-up steps.','Layers'],
  asset:['Creative assets','Images, video briefs and supporting materials.','FolderOpen'],
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
const createLink=(kind,admin=true)=>admin&&templates[kind]?url('create',{template:kind}):url('new',{kind});
function workSummary(data){
  const pending=data.items.filter(r=>r.status==='In review'&&(data.actor.role==='admin'||data.assigned.has(r.id))).length;
  const projects=data.projects.filter(p=>p.status!=='Complete');
  return '<div class="studio-workbar">'+button('Work in progress ('+projects.length+')',url('projects',{view:'all'}))+button('Review work ('+pending+')',url('review'))+'</div>'+
    (projects.length?'<details class="panel"><summary>Continue your work</summary>'+list(projects.slice(0,6),p=>'<div><a href="'+url('project',{project:p.id})+'">'+esc(p.name)+'</a><small>'+esc(data.people.find(x=>x.id===p.creator_id)?.name||'Assigned creator')+'</small></div>'+badge(p.status))+'</details>':'');
}
export function home(data,meta={}){
  return library(new URLSearchParams({studio:'library'}),data,meta);
}
export function library(params,data,meta={}){
  const bucket=params.get('bucket')==='published'?'published':'drafts';
  const published=r=>r.publication?.status==='published';
  data={...data,items:data.items.filter(r=>bucket==='published'?published(r):!published(r))};
  const lifecycle='<nav class="tabs" aria-label="Content status">'+[['published','Published'],['drafts','Drafts']].map(([id,title])=>'<a href="'+url('library',{bucket:id,kind:params.get('kind')||''})+'"'+(id===bucket?' aria-current="page"':'')+'>'+title+'</a>').join('')+'</nav>';
  const exercise=params.get('studio')==='exercises',kind=params.get('kind')||shelves[params.get('category')]?.create||'',q=(params.get('q')||'').toLowerCase(),state=params.get('state')||'';
  if(!exercise&&!kind&&!q&&!state&&params.get('view')!=='all'){
    const counts=new Map();
    for(const r of data.items)if(r.status!=='Archived')counts.set(r.kind,(counts.get(r.kind)||0)+1);
    return heading('Content Library','Choose a content type to browse, create or continue your work.',button('Create',url('create'),true))+workSummary(data)+lifecycle+
      '<form class="studio-filters" action="/content-library/">'+hidden('work','1')+hidden('studio','library')+hidden('view','all')+hidden('bucket',bucket)+input('q','Search all content','','search')+'<button>Search</button>'+button('Browse all content',url('library',{view:'all',bucket}))+'</form>'+
      '<nav class="studio-cards studio-type-grid" aria-label="Content types">'+Object.entries(collections).map(([id,[title,description,icon]])=>{
        const count=counts.get(id)||0;
        return '<a class="studio-card studio-type-card" href="'+url('library',{kind:id,bucket})+'"><div class="studio-type-icon" aria-hidden="true">'+icons[icon]+'</div><h2>'+title+'</h2><p>'+description+'</p><div class="studio-type-count">'+count.toLocaleString('en-GB')+' '+(count===1?'item':'items')+'</div><span aria-hidden="true">→</span></a>';
      }).join('')+'</nav>';
  }
  let rows=data.items.filter(r=>!['settings','programme-family'].includes(r.kind)&&(exercise?['exercise','activity'].includes(r.kind)&&(!kind||r.kind===kind):!kind||r.kind===kind)&&(!state?r.status!=='Archived':r.status===state));
  if(kind==='programme'){
    if(!q&&!state&&bucket!=='published')rows=data.items.filter(r=>r.status!=='Archived'&&(r.kind==='programme-family'||r.kind==='programme'&&data.byId.get(r.parent)?.kind!=='programme-family'));
    const families=['stronger','build','fitter','run','swim','ride','back-to-it','nufi365'];
    const rank=r=>{const id=(r.parent||r.id).replace(/^training:/,'');const n=families.indexOf(id);return n<0?99:n;};
    rows.sort((a,b)=>rank(a)-rank(b)||['start','progress','develop','own-it'].indexOf(a.fields.level)-['start','progress','develop','own-it'].indexOf(b.fields.level));
  }
  const words=value=>Array.isArray(value)?value.join(' '):String(value||'');
  if(kind==='ebook'&&params.get('bookType'))rows=rows.filter(r=>(r.fields.bookType||'Guide')===params.get('bookType'));
  rows=rows.filter(r=>(r.title+' '+words(r.fields.aliases)+' '+words(r.fields.equipment)+' '+words(r.fields.muscles)).toLowerCase().includes(q));
  const filter='<form class="studio-filters" action="/content-library/">'+hidden('work','1')+hidden('studio',exercise?'exercises':'library')+hidden('view','all')+hidden('bucket',bucket)+input('q','Search',params.get('q')||'','search')+select('kind','Content type',{'':'All types',...Object.fromEntries(Object.entries(kinds).filter(([k])=>!exercise||['exercise','activity'].includes(k)))},kind)+select('state','Progress',{'':'Active content',Draft:'Draft','In review':'In review','Changes requested':'Changes requested',Approved:'Approved',Archived:'Archived'},state)+'<button>Search</button></form>';
  return (!exercise?'<a class="back" href="'+url('library',{bucket})+'">← Content types</a>':'')+heading(exercise?'Exercises & drills':kind==='ebook'&&params.get('bookType')?params.get('bookType')+'s':collections[kind]?.[0]||'All content',exercise?'Find instructions, coaching cues and demonstrations.':collections[kind]?.[1]||'Your working Nutrition.fitness content.',button(kind?'Create '+(kinds[kind]||'content').toLowerCase():'Create content',url('new',{kind:kind||(exercise?'exercise':'article')}),true))+lifecycle+filter+
    (!rows.length?'<p class="studio-empty">'+(q||state?'No content matches these filters.':(bucket==='published'?'No content has been published here yet. Approved drafts stay under Drafts until they are released.':'Nothing here yet. Create the first item or import a starting point from the Reference Library.'))+'</p>':'')+
    pages(params,rows,rs=>'<div class="studio-content-grid">'+rs.map(r=>{
      const preview=meta.training?.[r.id]||meta.assets?.[r.id]?.preview||meta.training?.[r.parent];
      const photo=r.kind==='ebook'&&r.bookAssets?.front?bookAssetUrl(r.id,'front').replaceAll('&amp;','&'):recipeImage(r);
      return '<a class="studio-content-card" href="'+url('item',{id:r.id})+'">'+(photo?'<img src="'+esc(photo)+'" alt="" loading="lazy">':preview?'<img src="'+url('media',{preview})+'" alt="" loading="lazy">':'')+'<div><small>'+esc(r.kind==='programme-family'?'Training programmes':kinds[r.kind]||r.kind)+'</small><h2>'+esc(r.title)+'</h2>'+(r.kind==='programme'?'<p>'+esc(r.fields.weeks)+' weeks · '+(r.id==='training:nufi365'?'Year-round programme':'Standalone programme')+'</p>':r.kind==='programme-family'?'<p>Start · Progress · Develop · Own It</p>':'')+badge(r.status)+'</div></a>';
    }).join('')+'</div>');
}
export function createPage(params,data,values={}){
  const choice=params.get('template'),t=data.actor.role==='admin'?templates[choice]:null;
  if(!t)return heading('What would you like to create?','Choose a type. Start fresh or use something from the Reference Library.')+
    '<div class="studio-cards studio-simple-grid">'+Object.values(shelves).map(c=>card(c.title,c.description,createLink(c.create,data.actor.role==='admin'))).join('')+'</div>'+
    '<div class="panel studio-start-options">'+button('Use something from the Reference Library',url('archive'))+'<details><summary>More options</summary><div class="studio-actions">'+[['challenge','Challenge'],['mealplan','Meal plan'],['article','Article'],['ebook','Book'],['leadmagnet','Lead magnet'],['workflow','GHL workflow'],['asset','Creative asset']].map(([k,t])=>button(t,createLink(k,data.actor.role==='admin'))).join('')+'</div></details></div>';
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
  if(!kind&&params.get('view')!=='all')return heading(data.actor.role==='admin'?'Projects':'My projects','Choose the type of content you want to work on.',data.actor.role==='admin'?button('Create a project',url('create'),true):'')+
    button('Browse all projects',url('projects',{view:'all'}))+'<nav class="studio-cards studio-type-grid" aria-label="Project content types">'+Object.entries(categories).filter(([id])=>id!=='other'||data.projects.some(p=>projectKind(p)==='other')).map(([id,[title,description,icon]])=>{
      const count=data.projects.filter(p=>projectKind(p)===id).length;
      return '<a class="studio-card studio-type-card" href="'+url('projects',{kind:id})+'"><div class="studio-type-icon" aria-hidden="true">'+icons[icon]+'</div><h2>'+title+'</h2><p>'+description+'</p><div class="studio-type-count">'+count+' '+(count===1?'project':'projects')+'</div><span aria-hidden="true">→</span></a>';
    }).join('')+'</nav>';
  const selected=data.projects.filter(p=>!kind||projectKind(p)===kind);
  return '<a class="back" href="'+url('projects')+'">← Project types</a>'+heading((categories[kind]?.[0]||'All')+' projects','Bring the content, people and customer journey together.',data.actor.role==='admin'?button('Create a project',url('create'),true):'')+
    pages(params,selected,rows=>list(rows,p=>'<div><a href="'+url('project',{project:p.id})+'">'+esc(p.name)+'</a><small>'+esc(data.people.find(s=>s.id===p.creator_id)?.name||'Assigned creator')+' · '+p.weeks+' weeks'+(p.studio.launchDate?' · Launch '+esc(p.studio.launchDate):'')+'</small></div>'+badge(p.status),'No projects of this type yet.'));
}
export function projectPage(params,data){
  const p=projectFor(data,params.get('project')),week=Math.max(0,Math.min(p.weeks,Number(params.get('week'))||0)),admin=data.actor.role==='admin';
  const state={section:'project',project:p.id,week},base=hidden('projectRevision',p.revision);
  const root=data.byId.get(p.studio.rootId);
  const nav='<nav class="tabs" aria-label="Project weeks">'+Array.from({length:p.weeks+1},(_,w)=>'<a href="'+url('project',{project:p.id,week:w})+'"'+(week===w?' aria-current="page"':'')+'>'+(w?'Week '+w:'Preparation')+'</a>').join('')+'</nav>';
  const tasks=p.entries.filter(e=>e.week===week);
  const taskRows=new Map();
  for(const e of tasks){
    const type=data.byId.get(e.record)?.kind||Object.keys(kinds).find(k=>kinds[k]===e.kind)||({'PT WhatsApp message':'communication','Content to create':'article'})[e.kind]||'article';
    if(!taskRows.has(type))taskRows.set(type,[]);taskRows.get(type).push(e);
  }
  const rows=[...taskRows].map(([type,entries])=>'<section class="studio-task-group"><h3>'+esc(collections[type]?.[0]||'Content')+'</h3>'+entries.map(e=>{
    const r=data.byId.get(e.record);
    return '<section class="studio-task"><div class="studio-heading"><div><small>'+esc(e.kind)+'</small><h3>'+esc(e.title)+'</h3></div>'+badge(e.status)+'</div><p class="prose">'+esc(e.notes||'')+'</p>'+
      (r?button('Open content',url('item',{id:r.id})):button('Create this content',url('new',{project:p.id,entry:e.id,kind:e.kind==='PT WhatsApp message'?'communication':e.kind==='Creative asset'?'asset':e.kind==='GHL workflow'?'workflow':'article',title:e.title})))+
      '<details><summary>Update task</summary>'+form('task-save',base+hidden('entry',e.id)+
      input('title','Task',e.title,'text','required maxlength="160"')+textarea('notes','Brief and feedback',e.notes||'')+
      select('status','Progress',Object.fromEntries((admin?['To do','In progress','Ready for review','Changes requested','Done']:['To do','In progress','Ready for review','Changes requested']).map(x=>[x,x])),e.status)+
      input('week','Week (0 is preparation)',e.week,'number','min="0" max="'+p.weeks+'"')+input('due','Due date',e.due||'','date'),state)+'</details></section>';
  }).join('')+'</section>').join('');
  const candidates=data.items.filter(r=>(r.title+' '+r.kind).toLowerCase().includes((params.get('find')||'').toLowerCase())).slice(0,35);
  return heading(p.name,p.studio.audience||p.brief,button('Preview journey',url('journey',{project:p.id}))+button('Prepare for app',url('release',{project:p.id})))+
    '<p class="studio-project-meta">'+esc(p.status)+' · '+esc(data.people.find(s=>s.id===p.creator_id)?.name||'Assigned creator')+(p.studio.launchDate?' · Launch '+esc(p.studio.launchDate):'')+'</p>'+
    (root?'<p>Programme content · '+itemLink(root)+'</p>':'')+nav+'<div class="studio-columns project-columns"><section><h2>'+(week?'Week '+week:'Preparation')+'</h2>'+(rows||'<p>No tasks in this week yet.</p>')+'</section>'+
    '<aside class="panel"><details><summary>Add work</summary>'+form('task-add',base+input('title','What needs doing?','','text','required maxlength="160"')+
    select('kind','Content type',{'Content to create':'Content to create','PT WhatsApp message':'PT WhatsApp message','GHL workflow':'GHL workflow','Creative asset':'Creative asset','Marketing content':'Marketing content'})+textarea('notes','What does a finished result need?'),state,'Add task')+'</details>'+
    '<details><summary>Attach existing content</summary><form action="/content-library/">'+hidden('work','1')+hidden('studio','project')+hidden('project',p.id)+hidden('week',week)+input('find','Find content',params.get('find')||'')+'<button>Find</button></form>'+
    (params.has('find')?form('task-attach',base+select('record','Library item',Object.fromEntries(candidates.map(r=>[r.id,r.title]))),state,'Attach to this week'):'')+'</details>'+
    '<details><summary>Creator & details</summary>'+form('project-save',base+(admin?input('name','Name',p.name)+select('creator','Creator',personOptions(data),p.creator_id):'')+
      textarea('brief','Project brief',p.brief)+input('launch','Target launch',p.studio.launchDate||'','date')+
      select('status','Status',Object.fromEntries((admin?['Planning','In progress','Ready for review','Complete']:['Planning','In progress','Ready for review']).map(x=>[x,x])),p.status),state)+'</details></aside></div>';
}
function readable(value,data){
  if(Array.isArray(value))return '<ol>'+value.map(v=>'<li>'+readable(v,data)+'</li>').join('')+'</ol>';
  if(value&&typeof value==='object')return '<dl>'+Object.entries(value).map(([k,v])=>'<dt>'+esc(k.replace(/([A-Z])/g,' $1'))+'</dt><dd>'+readable(v,data)+'</dd>').join('')+'</dl>';
  const ref=data.byId.get(value)||data.byId.get('training:'+value);
  return ref?itemLink(ref):esc(value);
}
function weeklyPlan(params,data,schedules,owner){
  const chosen=schedules.find(x=>x.id===params.get('schedule'))||schedules[0];
  if(!chosen)return '<p class="studio-empty">No weekly plan has been added yet.</p>';
  const weeks=Array.isArray(chosen.fields.weeks)?chosen.fields.weeks:[],week=weeks.find(w=>String(w.number)===params.get('week'))||weeks[0];
  const href=(schedule,w)=>url('item',{id:owner?.id||schedule.id,...(owner?{tab:'plan',schedule:schedule.id}:{}),week:w});
  let out='<nav class="tabs" aria-label="Training days">'+schedules.map(x=>'<a href="'+href(x,week?.number||1)+'"'+(x.id===chosen.id?' aria-current="page"':'')+'>'+esc(x.fields.frequency)+' days'+(schedules.filter(y=>y.fields.frequency===x.fields.frequency).length>1?' · '+esc(x.title):'')+'</a>').join('')+'</nav>'+
    '<nav class="tabs studio-week-tabs" aria-label="Training weeks">'+weeks.map(w=>'<a href="'+href(chosen,w.number)+'"'+(w===week?' aria-current="page"':'')+'>Week '+esc(w.number)+'</a>').join('')+'</nav>';
  if(week){
    const sessions=(week.sessionIds||[]).map(id=>data.byId.get(id)||data.byId.get('training:'+id));
    const row=(title,key)=>'<tr><th scope="row">'+title+'</th>'+sessions.map(s=>'<td>'+(s?readable(s.fields[key],data):'Session unavailable')+'</td>').join('')+'</tr>';
    out+='<h2>Week '+esc(week.number)+' · '+esc(week.title||'')+'</h2><p class="prose">'+esc(week.message||'')+'</p><p class="prose">'+esc(week.progression||'')+'</p>'+
      '<div class="week-scroll" tabindex="0" role="region" aria-label="Weekly workouts; scroll sideways to see every day"><table><thead><tr><th>Workout</th>'+sessions.map((s,i)=>'<th>Day '+(i+1)+(s?'<br>'+itemLink(s):'')+'</th>').join('')+'</tr></thead><tbody>'+row('Warm-up','warmup')+row('Main work','blocks')+row('Cool-down','cooldown')+'</tbody></table></div>';
  }
  return out+'<details class="panel"><summary>Spacing, recovery & busy weeks</summary>'+readable({spacing:chosen.fields.spacing||'',rest:chosen.fields.restRules||'',busyWeek:chosen.fields.busyWeek||{}},data)+button('Edit this schedule',url('item',{id:chosen.id,tab:'edit'}))+'</details>';
}
function programmePage(params,data,r){
  const admin=data.actor.role==='admin',canEdit=admin||data.assigned.has(r.id);
  const projects=data.projects.filter(p=>p.studio?.rootId===r.id),project=projects.find(p=>p.status!=='Complete')||projects[0];
  const ids=descendants([r.id,...projects.flatMap(p=>p.entries.map(e=>e.record).filter(Boolean))],data.items),related=data.items.filter(x=>x.id!==r.id&&ids.has(x.id)&&x.status!=='Archived');
  const schedules=related.filter(x=>x.kind==='structure').sort((a,b)=>a.fields.frequency-b.fields.frequency);
  const tab=['plan','messages','assets'].includes(params.get('tab'))?params.get('tab'):'overview';
  const creator=data.people.find(p=>p.id===project?.creator_id);
  let out='<a class="back" href="'+(data.byId.get(r.parent)?.kind==='programme-family'?url('item',{id:r.parent}):url('library',{category:'programmes'}))+'">← '+esc(data.byId.get(r.parent)?.kind==='programme-family'?data.byId.get(r.parent).title:'Programmes')+'</a>'+
    heading(r.title,r.fields.weeks+' weeks',button('Member preview',url('item',{id:r.id,tab:'preview'})))+
    '<div class="studio-programme-bar">'+badge(r.status)+'<span>Creator: '+esc(creator?.name||'Not assigned')+'</span>'+
    (project?button('Work & feedback',url('project',{project:project.id})):admin?button('Assign work',url('project-from',{id:r.id})): '')+
    (canEdit?button('Edit & review',url('item',{id:r.id,tab:'edit'})):'')+'</div>'+
    '<nav class="tabs studio-programme-tabs" aria-label="Programme content">'+[['overview','Overview'],['plan','Weekly plan'],['messages','Messages'],['assets','Assets']].map(([key,title])=>'<a href="'+url('item',{id:r.id,tab:key})+'"'+(tab===key?' aria-current="page"':'')+'>'+title+'</a>').join('')+'</nav>';
  if(tab==='plan')return out+(schedules.length?weeklyPlan(params,data,schedules,r):'<section class="panel"><h2>Weekly plan</h2><p>This programme’s planning material is below. Open a section to continue building its weeks.</p>'+list(related.filter(x=>['stage','session'].includes(x.kind)),contentRow,'No workouts have been added yet.')+'</section>');
  if(tab==='messages'||tab==='assets'){
    const types=tab==='messages'?['communication','workflow']:['asset','campaign'];
    const rows=related.filter(x=>types.includes(x.kind)),kind=tab==='messages'?'communication':'asset';
    return out+'<section class="panel">'+heading(tab==='messages'?'Messages':'Assets',tab==='messages'?'Coaching messages and follow-up plans for this programme.':'Images, marketing and supporting files for this programme.',canEdit&&project?button('Add '+(tab==='messages'?'message':'asset'),url('new',{kind,project:project.id})):admin&&!project?button('Assign work to add content',url('project-from',{id:r.id})): '')+
      pages(params,rows,items=>list(items,contentRow,'Nothing here yet.'))+
      (tab==='assets'&&canEdit&&r.sourceId?button('Open original source assets','/content-library/?work=1&assets='+encodeURIComponent(r.sourceId)):'')+'</section>';
  }
  const fields=[['The aim',r.fields.purpose||r.fields.description],['Who it’s for',r.fields.audience||r.fields.suitableFor],['What you’ll achieve',r.fields.outcome||r.fields.memberPromise],['Before starting',r.fields.entryCriteria],['Equipment',r.fields.equipment],['Completing the programme',r.fields.exitCriteria]];
  out+='<section class="panel studio-programme-overview">'+fields.filter(([,v])=>v&&(!Array.isArray(v)||v.length)).map(([label,value])=>'<section><h2>'+esc(label)+'</h2><div class="prose">'+readable(value,data)+'</div></section>').join('')+'</section>';
  out+=button('Open weekly plan',url('item',{id:r.id,tab:'plan'}),true);
  const supporting=related.filter(x=>['learning','lesson','article','rule','review'].includes(x.kind));
  if(supporting.length)out+='<details class="panel"><summary>Coaching guidance & check-ins ('+supporting.length+')</summary>'+list(supporting,contentRow)+'</details>';
  return out;
}
export function itemPage(params,data){
  const r=data.byId.get(params.get('id'));if(!r)return heading('Content unavailable');
  if(r.kind==='ebook'&&r.bookAssets&&params.get('tab')!=='edit')return bookPage(r,data);
  if(r.kind==='programme'&&!['edit','preview'].includes(params.get('tab')))return programmePage(params,data,r);
  if(r.kind==='programme-family'){
    const programmes=data.items.filter(x=>x.parent===r.id&&x.kind==='programme'&&x.status!=='Archived');
    return '<a class="back" href="'+url('library',{category:'programmes'})+'">← Programmes</a>'+heading(r.title,'Choose the level you want to work on.')+
      '<div class="studio-cards">'+programmes.map(p=>card(p.title,p.fields.weeks+' weeks · '+(p.fields.audience||''),url('item',{id:p.id}))).join('')+'</div>'+
      '<details class="panel"><summary>Shared content & assets</summary>'+list(data.items.filter(x=>x.parent===r.id&&x.kind!=='programme'&&x.status!=='Archived'),contentRow)+'</details>';
  }
  const admin=data.actor.role==='admin',canEdit=admin||data.assigned.has(r.id),state={section:'item',id:r.id,tab:'edit'};
  const children=data.items.filter(x=>(x.parent===r.id||(r.fields.sharedContentIds||[]).includes(x.id))&&x.status!=='Archived'),refs=references(r,data.byId).map(id=>data.byId.get(id));
  const parents=data.items.filter(x=>x.id!==r.id&&(x.id===r.parent||references(x,data.byId).includes(r.id)));
  const checks=issues(r,data.items),preview=params.get('tab')==='preview'||(r.kind==='recipe'&&r.publication?.status==='published'&&!params.has('tab')),schedule=r.kind==='structure'&&params.get('tab')!=='edit'&&!preview;
  let out=(r.kind==='programme'?'<a class="back" href="'+url('item',{id:r.id})+'">← Programme overview</a>':'')+heading(r.title,(kinds[r.kind]||r.kind)+(r.kind==='programme'?' · '+r.fields.weeks+' weeks':''),button(preview||schedule?'Edit content':'Member preview',url('item',{id:r.id,tab:preview||schedule?'edit':'preview'}))+(admin&&r.kind!=='programme'?button('Assign work',url('project-from',{id:r.id})):''))+
    '<p>'+badge(r.status)+' <span class="meta">Version '+(r.revision||1)+(r.updatedAt?' · Saved '+esc(new Date(r.updatedAt).toLocaleDateString('en-GB')):'')+'</span></p>';
  if(children.length&&r.kind!=='programme'){
    const grouped=new Map();for(const child of children){if(!grouped.has(child.kind))grouped.set(child.kind,[]);grouped.get(child.kind).push(child);}
    const section=params.get('contentKind')||children[0].kind;
    out+='<section class="panel"><h2>Included content</h2><nav class="tabs" aria-label="Included content types">'+[...grouped].map(([kind,items])=>'<a href="'+url('item',{id:r.id,tab:params.get('tab')||'',contentKind:kind})+'"'+(section===kind?' aria-current="page"':'')+'>'+esc(collections[kind]?.[0]||kinds[kind]||kind)+' ('+items.length+')</a>').join('')+'</nav>'+list(grouped.get(section)||[],contentRow)+'</section>';
  }
  if(schedule){
    const frequencies=data.items.filter(x=>x.kind==='structure'&&x.parent===r.parent&&x.status!=='Archived');
    const selected=new URLSearchParams(params);selected.set('schedule',r.id);
    return out+weeklyPlan(selected,data,frequencies);
  }
  if(preview)return out+(r.kind==='recipe'?recipePreview(r):'<article class="studio-preview"><h2>'+esc(r.title)+'</h2>'+readable(r.fields,data)+'</article>');
  if(canEdit){
    out+='<div class="studio-columns editor-columns"><section>'+form('content-save',hidden('revision',r.revision)+input('title','Title',r.title,'text','required maxlength="200"')+
      '<textarea hidden id="studio-fields" name="fields">'+esc(JSON.stringify({...blankFields(r.kind),...r.fields}))+'</textarea><div id="studio-editor"></div><noscript><p>Enable JavaScript to edit structured content.</p></noscript>'+
      (r.source?.needsChecking?'<label class="check"><input type="checkbox" name="sourceChecked" value="yes"> I compared the extracted content with the original source</label>':''),
      state,'Save draft','id="studio-editor-form"')+'</section><aside class="panel"><h2>Review</h2>'+
      (checks.length?'<ul>'+checks.map(c=>'<li>'+esc(c)+'</li>').join('')+'</ul>':'<p>The required fields are complete.</p>')+
      form('content-review',hidden('revision',r.revision)+select('status','Next status',Object.fromEntries((admin?['In review','Changes requested','Approved','Archived']:['In review']).map(s=>[s,s])))+
        textarea('feedback','Review note'),state,admin?'Save review':'Submit for review')+
      '<details><summary>Draft with AI</summary>'+(data.aiReady?form('ai-draft',hidden('revision',r.revision)+textarea('prompt','What would you like to create or improve?'),state,'Generate a draft for review'):'<p>The OpenAI account connection is being completed.</p>')+'</details>'+
      '<details><summary>Feedback</summary>'+list(r.comments||[],c=>'<div><p>'+esc(c.body)+'</p><small>'+esc(c.author)+' · '+esc(c.at.slice(0,10))+'</small></div>','No feedback yet.')+
      form('content-comment',hidden('revision',r.revision)+textarea('comment','Add feedback'),state,'Add feedback')+'</details>'+
      button('Version history',url('history',{id:r.id}))+
      (r.sourceId?'<p>'+button('Original assets','/content-library/?work=1&assets='+encodeURIComponent(r.sourceId))+'</p>':'')+'</aside></div>';
  }else out+='<article class="studio-preview">'+readable(r.fields,data)+'</article>';
  if(refs.length)out+='<details class="panel"><summary>Linked content ('+refs.length+')</summary>'+list(refs,contentRow)+'</details>';
  if(parents.length)out+='<details class="panel"><summary>Used in ('+parents.length+')</summary>'+list(parents,contentRow)+'</details>';
  if(r.source)out+='<details class="panel"><summary>Source and extraction</summary><p>'+esc(r.source.name||r.sourceId||'Imported content')+'</p><pre class="source-text">'+esc(r.source.text||'')+'</pre></details>';
  out+='<textarea hidden id="studio-reference-data">'+esc(JSON.stringify(data.items.filter(x=>['exercise','activity','session','recipe','stage','lesson','rule','asset'].includes(x.kind)).map(x=>({id:x.id,title:x.title,kind:x.kind}))))+'</textarea>';
  return out;
}
export function newItem(params,data){
  const kind=Object.hasOwn(kinds,params.get('kind'))?params.get('kind'):'article';
  return heading('Create '+kinds[kind].toLowerCase(),'Start with a clear title, then develop and review the content.')+
    form('content-create',hidden('id','studio:'+randomUUID())+hidden('entry',params.get('entry')||'')+input('title','Title',params.get('title')||'','text','required maxlength="200"')+
      select('kind','Content type',kinds,kind)+select('project','Project',data.actor.role==='admin'?projectChoices(data):Object.fromEntries(data.projects.map(p=>[p.id,p.name])),params.get('project')||''),
      {section:'new'},'Create draft');
}
export function reviewPage(params,data){
  const rows=data.items.filter(r=>['In review','Changes requested'].includes(r.status)&&(data.actor.role==='admin'||data.assigned.has(r.id)));
  return heading('Review work','Open an item to check its content, leave feedback or approve the current version.')+
    pages(params,rows,rs=>list(rs,contentRow,'There is no content waiting for review.'));
}
export function calendar(data){
  const events=data.projects.flatMap(p=>[
    ...(p.studio.launchDate?[{date:p.studio.launchDate,title:p.name+' · Launch',id:p.id}]:[]),
    ...p.entries.filter(e=>e.due).map(e=>({date:e.due,title:e.title,id:p.id,week:e.week}))
  ]).sort((a,b)=>a.date.localeCompare(b.date));
  return heading('Content calendar','Launches and task deadlines across your projects.')+list(events,e=>'<time>'+esc(e.date)+'</time><a href="'+url('project',{project:e.id,week:e.week||0})+'">'+esc(e.title)+'</a>','Set a launch date or task deadline in a project to populate the calendar.');
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
  return heading('Release preparation',p.name,button('Back to project',url('project',{project:p.id})))+
    '<div class="panel"><p>'+records.length+' linked content items · '+records.filter(r=>r.status==='Approved').length+' approved · '+pending.length+' unfinished tasks</p>'+
    '<p>The export contains versioned content and its relationships. The app’s import format still needs to be connected.</p>'+
    button('Download review package',url('export',{project:p.id,mode:'review'}))+' '+(data.actor.role==='admin'?button('Download approved release',url('export',{project:p.id,mode:'approved'}),true):'')+'</div>'+
    '<h2>Content checks</h2>'+list(records,r=>'<div>'+itemLink(r)+'<small>'+esc(issues(r,data.items).join(' ')||'Required fields complete')+'</small></div>'+badge(r.status));
}
