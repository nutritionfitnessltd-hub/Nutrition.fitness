import { randomUUID } from 'node:crypto';
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
  article:['Articles','Helpful advice and educational content.','FileText'],
  ebook:['E-books','Longer guides and downloadable books.','Book'],
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

export function home(data){
  const mine=data.actor.role==='admin'?data.items:data.items.filter(r=>data.assigned.has(r.id));
  const pending=mine.filter(r=>r.status==='In review');
  const tasks=data.projects.flatMap(p=>p.entries.filter(e=>!['Done'].includes(e.status)).map(e=>({...e,project:p})));
  return heading(data.actor.role==='admin'?'What would you like to create?':'Your content workspace','Develop an idea, continue a project or review the next piece of work.')+
    '<div class="studio-cards">'+card('Create something','Start with an idea, a template or the archive.',url('create'))+
    card('Continue a project',data.projects.filter(p=>p.status!=='Complete').length+' active projects',url('projects'))+
    card('Review work',pending.length+' items awaiting review',url('review'))+
    card('Find content','Explore your programmes, recipes, exercises and messages.',url('library'))+'</div>'+
    '<div class="studio-columns"><section class="panel"><h2>Next work to do</h2>'+list(tasks.slice(0,8),t=>'<div><a href="'+url('project',{project:t.project.id,week:t.week})+'">'+esc(t.title)+'</a><small>'+esc(t.project.name)+' · '+(t.week?'Week '+t.week:'Preparation')+'</small></div>'+badge(t.status),'Create a project to turn an idea into clear production tasks.')+'</section>'+
    '<section class="panel"><h2>Your training programmes</h2>'+list(data.items.filter(r=>r.kind==='programme'&&r.status!=='Archived'),contentRow)+'</section></div>';
}
export function library(params,data,meta={}){
  const exercise=params.get('studio')==='exercises',kind=params.get('kind')||'',q=(params.get('q')||'').toLowerCase(),state=params.get('state')||'';
  if(!exercise&&!kind&&!q&&!state&&params.get('view')!=='all'){
    const counts=new Map();
    for(const r of data.items)if(r.status!=='Archived')counts.set(r.kind,(counts.get(r.kind)||0)+1);
    return heading('Content library','Choose a content type to browse, create or continue your work.',button('Create content',url('new'),true))+
      '<form class="studio-filters" action="/content-library/">'+hidden('work','1')+hidden('studio','library')+hidden('view','all')+input('q','Search all content','','search')+'<button>Search</button>'+button('Browse all content',url('library',{view:'all'}))+'</form>'+
      '<nav class="studio-cards studio-type-grid" aria-label="Content types">'+Object.entries(collections).map(([id,[title,description,icon]])=>{
        const count=counts.get(id)||0;
        return '<a class="studio-card studio-type-card" href="'+url('library',{kind:id})+'"><div class="studio-type-icon" aria-hidden="true">'+icons[icon]+'</div><h2>'+title+'</h2><p>'+description+'</p><div class="studio-type-count">'+count.toLocaleString('en-GB')+' '+(count===1?'item':'items')+'</div><span aria-hidden="true">→</span></a>';
      }).join('')+'</nav>';
  }
  let rows=data.items.filter(r=>!['settings','programme-family'].includes(r.kind)&&(exercise?['exercise','activity'].includes(r.kind)&&(!kind||r.kind===kind):!kind||r.kind===kind)&&(!state?r.status!=='Archived':r.status===state));
  if(kind==='programme'){
    const families=['stronger','build','fitter','run','swim','ride','back-to-it','nufi365'];
    const rank=r=>{const id=(r.parent||r.id).replace(/^training:/,'');const n=families.indexOf(id);return n<0?99:n;};
    rows.sort((a,b)=>rank(a)-rank(b)||['start','progress','develop','own-it'].indexOf(a.fields.level)-['start','progress','develop','own-it'].indexOf(b.fields.level));
  }
  const words=value=>Array.isArray(value)?value.join(' '):String(value||'');
  rows=rows.filter(r=>(r.title+' '+words(r.fields.aliases)+' '+words(r.fields.equipment)+' '+words(r.fields.muscles)).toLowerCase().includes(q));
  const filter='<form class="studio-filters" action="/content-library/">'+hidden('work','1')+hidden('studio',exercise?'exercises':'library')+hidden('view','all')+input('q','Search',params.get('q')||'','search')+select('kind','Content type',{'':'All types',...Object.fromEntries(Object.entries(kinds).filter(([k])=>!exercise||['exercise','activity'].includes(k)))},kind)+select('state','Progress',{'':'Active content',Draft:'Draft','In review':'In review','Changes requested':'Changes requested',Approved:'Approved',Archived:'Archived'},state)+'<button>Search</button></form>';
  return (!exercise?'<a class="back" href="'+url('library')+'">← Content types</a>':'')+heading(exercise?'Exercises & drills':collections[kind]?.[0]||'All content',exercise?'Find instructions, coaching cues and demonstrations.':collections[kind]?.[1]||'Your working Nutrition.fitness content.',button(kind?'Create '+(kinds[kind]||'content').toLowerCase():'Create content',url('new',{kind:kind||(exercise?'exercise':'article')}),true))+filter+
    (!rows.length?'<p class="studio-empty">'+(q||state?'No content matches these filters.':'Nothing here yet. Create the first item or import a starting point from the archive.')+'</p>':'')+
    pages(params,rows,rs=>'<div class="studio-content-grid">'+rs.map(r=>{
      const preview=meta.training?.[r.id]||meta.assets?.[r.id]?.preview||meta.training?.[r.parent];
      return '<a class="studio-content-card" href="'+url('item',{id:r.id})+'">'+(preview?'<img src="'+url('media',{preview})+'" alt="" loading="lazy">':'')+'<div><small>'+esc(kinds[r.kind]||r.kind)+'</small><h2>'+esc(r.title)+'</h2>'+(r.kind==='programme'?'<p>'+esc(r.fields.weeks)+' weeks · '+(r.id==='training:nufi365'?'Year-round programme':'Standalone programme')+'</p>':'')+badge(r.status)+'</div></a>';
    }).join('')+'</div>');
}
export function createPage(params,data,values={}){
  if(data.actor.role!=='admin')return heading('Create content','Choose a content type and attach it to one of your assigned projects.')+
    '<div class="studio-cards">'+[['recipe','Recipe'],['exercise','Exercise'],['communication','Coaching message'],['asset','Creative asset'],['article','Article'],['session','Workout']].map(([kind,name])=>card(name,'Create a draft for review.',url('new',{kind}))).join('')+'</div>';
  const choice=params.get('template'),t=templates[choice];
  if(!t)return heading('Create something','Choose a starting point. You can change the plan before creating the project.')+
    '<div class="studio-cards">'+Object.entries(templates).map(([id,t])=>card(t.name,t.description,url('create',{template:id}))).join('')+
    card('Start from the archive','Use a source book, course or programme.',url('archive'))+'</div>';
  return heading(t.name,'Describe the outcome. We’ll propose the work needed to get there.')+
    form('plan-preview',hidden('template',choice)+hidden('id',values.id||randomUUID())+hidden('rootId',values.rootId||'')+
      input('name','Project name',values.name||'','text','required maxlength="160"')+
      textarea('brief','What do you have in mind?',values.brief||'',4)+input('audience','Who is this for?',values.audience||'')+
      input('outcome','What should they achieve?',values.outcome||'')+
      '<div class="studio-columns">'+(choice==='programme'?select('weeks','Programme length',{4:'4 weeks',6:'6 weeks',8:'8 weeks',12:'12 weeks'},values.weeks||12):input('weeks','Number of weeks',values.weeks||6,'number','min="1" max="52" required'))+
      select('creator','Creator',personOptions(data),values.creator||data.people[0]?.id)+'</div>'+
      input('launch','Target launch date (optional)',values.launch||'','date')+
      (data.aiReady?'<label class="check"><input type="checkbox" name="assist" value="yes" checked> Use AI to tailor the production plan to this brief</label>':'<p class="meta">AI drafting will be available when the account connection is complete.</p>'),
      {section:'create',template:choice},'Preview project plan');
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
  return heading(p.name,p.studio.audience||p.brief,button('Preview journey',url('journey',{project:p.id}))+button('Release preparation',url('release',{project:p.id})))+
    '<p class="studio-project-meta">'+esc(p.status)+' · '+esc(data.people.find(s=>s.id===p.creator_id)?.name||'Assigned creator')+(p.studio.launchDate?' · Launch '+esc(p.studio.launchDate):'')+'</p>'+
    (root?'<p>Programme content · '+itemLink(root)+'</p>':'')+nav+'<div class="studio-columns project-columns"><section><h2>'+(week?'Week '+week:'Preparation')+'</h2>'+(rows||'<p>No tasks in this week yet.</p>')+'</section>'+
    '<aside class="panel"><h2>Add work</h2>'+form('task-add',base+input('title','What needs doing?','','text','required maxlength="160"')+
    select('kind','Content type',{'Content to create':'Content to create','PT WhatsApp message':'PT WhatsApp message','GHL workflow':'GHL workflow','Creative asset':'Creative asset','Marketing content':'Marketing content'})+textarea('notes','What does a finished result need?'),state,'Add task')+
    '<details><summary>Attach existing content</summary><form action="/content-library/">'+hidden('work','1')+hidden('studio','project')+hidden('project',p.id)+hidden('week',week)+input('find','Find content',params.get('find')||'')+'<button>Find</button></form>'+
    (params.has('find')?form('task-attach',base+select('record','Library item',Object.fromEntries(candidates.map(r=>[r.id,r.title]))),state,'Attach to this week'):'')+'</details>'+
    '<details><summary>Project settings</summary>'+form('project-save',base+(admin?input('name','Name',p.name)+select('creator','Creator',personOptions(data),p.creator_id):'')+
      textarea('brief','Project brief',p.brief)+input('launch','Target launch',p.studio.launchDate||'','date')+
      select('status','Status',Object.fromEntries((admin?['Planning','In progress','Ready for review','Complete']:['Planning','In progress','Ready for review']).map(x=>[x,x])),p.status),state)+'</details></aside></div>';
}
function readable(value,data){
  if(Array.isArray(value))return '<ol>'+value.map(v=>'<li>'+readable(v,data)+'</li>').join('')+'</ol>';
  if(value&&typeof value==='object')return '<dl>'+Object.entries(value).map(([k,v])=>'<dt>'+esc(k.replace(/([A-Z])/g,' $1'))+'</dt><dd>'+readable(v,data)+'</dd>').join('')+'</dl>';
  const ref=data.byId.get(value)||data.byId.get('training:'+value);
  return ref?itemLink(ref):esc(value);
}
export function itemPage(params,data){
  const r=data.byId.get(params.get('id'));if(!r)return heading('Content unavailable');
  if(r.kind==='programme-family'){
    const programmes=data.items.filter(x=>x.parent===r.id&&x.kind==='programme'&&x.status!=='Archived');
    return heading(r.title,'Choose a standalone level programme. You do not need to complete all four in sequence.')+
      '<div class="studio-cards">'+programmes.map(p=>card(p.title,p.fields.weeks+' weeks · '+(p.fields.audience||''),url('item',{id:p.id}))).join('')+'</div>'+
      '<section class="panel"><h2>Shared content & assets</h2>'+list(data.items.filter(x=>x.parent===r.id&&x.kind!=='programme'&&x.status!=='Archived'),contentRow)+'</section>';
  }
  const admin=data.actor.role==='admin',canEdit=admin||data.assigned.has(r.id),state={section:'item',id:r.id};
  const children=data.items.filter(x=>(x.parent===r.id||(r.fields.sharedContentIds||[]).includes(x.id))&&x.status!=='Archived'),refs=references(r,data.byId).map(id=>data.byId.get(id));
  const parents=data.items.filter(x=>x.id!==r.id&&(x.id===r.parent||references(x,data.byId).includes(r.id)));
  const checks=issues(r,data.items),preview=params.get('tab')==='preview',schedule=r.kind==='structure'&&params.get('tab')!=='edit'&&!preview;
  let out=heading(r.title,(kinds[r.kind]||r.kind)+(r.kind==='programme'?' · '+r.fields.weeks+' weeks':''),button(preview||schedule?'Edit content':'Member preview',url('item',{id:r.id,tab:preview||schedule?'edit':'preview'}))+(admin?button('Create a project',url('project-from',{id:r.id})):''))+
    '<p>'+badge(r.status)+' <span class="meta">Version '+(r.revision||1)+(r.updatedAt?' · Saved '+esc(new Date(r.updatedAt).toLocaleDateString('en-GB')):'')+'</span></p>';
  if(children.length){
    const grouped=new Map();for(const child of children){if(!grouped.has(child.kind))grouped.set(child.kind,[]);grouped.get(child.kind).push(child);}
    const section=params.get('contentKind')||children[0].kind;
    out+='<section class="panel"><h2>Included content</h2><nav class="tabs" aria-label="Included content types">'+[...grouped].map(([kind,items])=>'<a href="'+url('item',{id:r.id,tab:params.get('tab')||'',contentKind:kind})+'"'+(section===kind?' aria-current="page"':'')+'>'+esc(collections[kind]?.[0]||kinds[kind]||kind)+' ('+items.length+')</a>').join('')+'</nav>'+list(grouped.get(section)||[],contentRow)+'</section>';
  }
  if(schedule){
    const weeks=r.fields.weeks||[],week=weeks.find(w=>String(w.number)===params.get('week'))||weeks[0];
    const frequencies=data.items.filter(x=>x.kind==='structure'&&x.parent===r.parent);
    out+='<nav class="tabs" aria-label="Training days">'+frequencies.map(x=>'<a href="'+url('item',{id:x.id,week:week?.number||1})+'"'+(x.id===r.id?' aria-current="page"':'')+'>'+esc(x.fields.frequency)+' days</a>').join('')+'</nav>'+
      '<nav class="tabs" aria-label="Training weeks">'+weeks.map(w=>'<a href="'+url('item',{id:r.id,week:w.number})+'"'+(w===week?' aria-current="page"':'')+'>Week '+esc(w.number)+'</a>').join('')+'</nav>';
    if(week){
      const sessions=(week.sessionIds||[]).map(id=>data.byId.get(id)||data.byId.get('training:'+id));
      const row=(title,key)=>'<tr><th scope="row">'+title+'</th>'+sessions.map(s=>'<td>'+(s?readable(s.fields[key],data):'Session unavailable')+'</td>').join('')+'</tr>';
      out+='<h2>Week '+week.number+' · '+esc(week.title||'')+'</h2><p>'+esc(week.message||'')+'</p><p>'+esc(week.progression||'')+'</p>'+
      '<div class="week-scroll"><table><thead><tr><th>Workout</th>'+sessions.map((s,i)=>'<th>Day '+(i+1)+(s?'<br>'+itemLink(s):'')+'</th>').join('')+'</tr></thead><tbody>'+
      row('Warm-up','warmup')+row('Main work','blocks')+row('Cool-down','cooldown')+'</tbody></table></div>';
    }
    return out;
  }
  if(preview)return out+'<article class="studio-preview"><h2>'+esc(r.title)+'</h2>'+readable(r.fields,data)+'</article>';
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
