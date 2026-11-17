import { icons } from './library-icons.mjs';
export const path = '/content-library/';
export const esc = value => String(value ?? '').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[c]);
export const link = values => path + '?' + esc(new URLSearchParams(Object.entries(values).filter(([,v])=>v!==undefined && v!=='')).toString());
export const human = value => String(value || '').replace(/_/g,' ').replace(/^./,c=>c.toUpperCase());
const shelves = {Recipes:'Utensils',Courses:'BookOpen',Training:'Dumbbell',Programs:'Dumbbell',Challenges:'CheckCheck',Articles:'FileText','E-Books':'Book',Business:'Briefcase',Socials:'MessageCircle','Needs sorting':'FolderOpen','Source collections':'LayoutGrid','All content':'Layers'};
const tabs = {books:'Recipe books & meal plans',recipes:'Individual recipes',supporting:'Supporting files'};
export const displayName = name => name === 'Unsorted' ? 'Needs sorting' : name;
export function activeShelf(params,index) {
  const item = params.get('item');
  const current = item && index?.records.find(r=>r.id===item);
  if (current) return item.startsWith('training:')?'Training':displayName(current.group);
  if (params.has('group')) return displayName(params.get('group')) || 'All content';
  return Object.hasOwn(shelves,params.get('shelf'))?params.get('shelf'):params.has('q')?'All content':'Recipes';
}
function brand(meta) {
  return meta?.brand?'<img class="brand-logo" src="'+link({preview:meta.brand})+'" alt="nutrition.fitness. Real food. Real progress. A fitter, happier you.">':'<b>nutrition</b>.fitness';
}
export function frame({body,section='Recipes',meta,guest=false,work=false,crumb=''}) {
  const menu=Object.entries(shelves).map(([name,icon])=>'<a href="'+link({shelf:name})+'"'+(name===section?' aria-current="page"':'')+'>'+icons[icon]+'<span>'+esc(name)+'</span></a>').join('');
  const brandMark='<a class="brand" href="'+path+'">'+brand(meta)+'</a>';
  return '<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>'+esc(section)+' | Nutrition.fitness</title><link rel="stylesheet" href="/library-reader.css"></head><body>'+
    '<div class="shell"><aside class="side">'+brandMark+'<strong class="kicker">Content manager</strong><div class="side-scroll"><p class="eyebrow">Your library</p><nav aria-label="Your library">'+menu+'</nav></div><a class="work-link" href="'+link({work:'1'})+'"'+(work?' aria-current="page"':'')+'>'+icons.ClipboardList+' Work assignments</a></aside>'+
    '<div class="workspace"><header class="top"><details class="mobile-menu"><summary aria-label="Open library navigation">'+icons.PanelLeft+'</summary><nav>'+menu+'<a href="'+link({work:'1'})+'">Work assignments</a></nav></details><span class="desktop-icon">'+icons.PanelLeft+'</span><a href="'+path+'">Content library</a><span>›</span><strong>'+esc(section)+'</strong>'+(crumb?'<span class="trail">› &nbsp; '+esc(crumb)+'</span>':'')+(guest?'<form class="signout" method="post" action="'+path+'"><button name="action" value="logout">Sign out</button></form>':'')+'</header><main>'+body+'</main></div></div></body></html>';
}
function thumb(meta,record) {
  return meta?.training?.[record.id] || meta?.assets?.[record.id]?.preview || '';
}
function cardHtml(card) {
  const dest=link(card.to);
  const preview=card.preview?'<img alt="" loading="lazy" src="'+link({preview:card.preview})+'"><small>'+esc(card.previewLabel || 'Source preview')+'</small>':'<div class="title-cover"><span>nutrition.fitness</span><b>'+esc(card.title)+'</b></div>';
  return '<li><a class="card" href="'+dest+'"><div class="cover-panel'+(card.wide?' wide':'')+'">'+preview+'</div><div class="card-body"><small>'+esc(card.kind)+'</small><h2>'+esc(card.title)+'</h2><footer><span>'+esc(card.summary)+'</span><span aria-hidden="true">↗</span></footer></div></a></li>';
}
const recordCard=(r,meta)=>({title:r.title,kind:r.kind,summary:human(r.status),preview:thumb(meta,r),wide:r.kind==='programme',previewLabel:r.kind==='programme'?'Programme preview':undefined,to:{item:r.id},records:[r]});
function groupedCards(rows, groups, meta, shelf, mode) {
  return [...groups].map(([title,records])=>{
    const representative=records.find(r=>thumb(meta,r)&&/guide|book|cover/i.test(r.kind))||records.find(r=>thumb(meta,r));
    return {title,kind:({Courses:'Course',Programs:'Program',Challenges:'Challenge'})[shelf]||'Collection',summary:records.length+' '+(records.length===1?'file':'files'),preview:meta.collections?.[title]||representative&&thumb(meta,representative),to:{shelf,tab:mode,folder:title},records};
  }).sort((a,b)=>a.title.localeCompare(b.title,'en'));
}
function recipeScope(r,m) {
  if (/recipe book|meal plan/i.test(r.kind)&&!m?.folder&&!/folder/i.test(r.kind)) return 'books';
  return m?.recipe || r.fields.recipeText || r.kind==='Individual recipe' ? 'recipes':'supporting';
}
export function shelfView(index,params,meta={}) {
  const shelf=activeShelf(params,index), mode=Object.hasOwn(tabs,params.get('tab'))?params.get('tab'):'books';
  const folder=params.get('folder')||'', source=params.get('source')||'', progress=params.get('progress')||'';
  const q=(params.get('q')||'').trim().slice(0,160);
  const all=shelf==='All content',sources=shelf==='Source collections',training=shelf==='Training';
  const rows=index.records.filter(r=>all || (sources?r.id.startsWith('catalogue:'):training?r.kind==='programme':displayName(r.group)===shelf));
  const groups=new Map(), loose=[];
  const courseNames=new Map();
  if(shelf==='Courses'){
    for(const [name,c] of Object.entries(meta.courses||{})){
      for(const id of [...c.members,'course:'+name]){
        if(!courseNames.has(id))courseNames.set(id,[]);
        courseNames.get(id).push(name);
      }
    }
  }
  for (const r of rows) {
    const m=meta.assets?.[r.id];
    const names=courseNames.get(r.id)||(sources?(m?.sources||[r.fields.collection].filter(Boolean)):all||training?[]:[m?.shelf].filter(Boolean));
    if (!names.length) loose.push(r);
    for(const name of names){if(!groups.has(name))groups.set(name,[]);groups.get(name).push(r);}
  }
  const matchesMode=r=>shelf!=='Recipes'||(params.has('group')&&q&&!params.has('tab'))||recipeScope(r,meta.assets?.[r.id])===mode;
  let cards=folder?(groups.get(folder)||[]).map(r=>recordCard(r,meta)):[
    ...groupedCards(rows,groups,meta,shelf,mode).filter(c=>c.records.some(matchesMode)),
    ...loose.filter(matchesMode).sort((a,b)=>all||training?0:a.title.localeCompare(b.title,'en')).map(r=>recordCard(r,meta))];
  const sourceShelf=sources?'collections':shelf==='Needs sorting'?'Unsorted':shelf;
  const original=meta.originalShelves;
  const order=original?.order?.[sourceShelf]?.[shelf==='Recipes'?mode:'books'];
  if(order && !(params.has('group')&&q&&!params.has('tab'))){
    const byId=new Map(index.records.map(r=>[r.id,r]));
    const members=name=>(original.groups[sourceShelf]?.[name]||[]).map(id=>byId.get(id)).filter(Boolean);
    if(folder)cards=members(folder).map(r=>recordCard(r,meta));
    else cards=order.flatMap(c=>{
      if(c.id)return byId.has(c.id)?[recordCard(byId.get(c.id),meta)]:[];
      const records=members(c.folder);
      return records.length?groupedCards(rows,new Map([[c.folder,records]]),meta,shelf,mode):[];
    });
  }
  const choices=[...new Set(rows.flatMap(r=>meta.assets?.[r.id]?.sources||[r.fields.collection]).filter(Boolean))].sort();
  if(shelf==='Courses'&&!folder){
    for(const card of cards){
      const course=meta.courses?.[card.title];
      if(!course)continue;
      card.to={item:'course:'+card.title};
      const lessons=course.sections.reduce((total,s)=>total+s.entries.filter(e=>e.id).length,0);
      card.summary=lessons?lessons+' lesson files':'Lesson order needs checking';
      card.preview=meta.collections?.[card.title]||card.preview;
    }
  }
  const statuses=[...new Set(rows.map(r=>r.status).filter(Boolean))].sort();
  cards=cards.filter(c=>c.records.some(r=>(!progress||r.status===progress)&&(!source||(meta.assets?.[r.id]?.sources||[r.fields.collection]).includes(source)))&&(!q||[c.title,...c.records.map(r=>r.title+' '+r.kind+' '+(r.fields.collection||''))].join(' ').toLowerCase().includes(q.toLowerCase())));
  const count=Math.max(1,Math.ceil(cards.length/24)), page=Math.min(count,Math.max(1,parseInt(params.get('page'))||1));
  const opt=(values,current,first,translate=false)=>'<option value="">'+first+'</option>'+values.map(v=>'<option value="'+esc(v)+'"'+(current===v?' selected':'')+'>'+esc(translate?human(v):v)+'</option>').join('');
  const state={shelf,tab:shelf==='Recipes'?mode:'',folder,source,progress,q};
  const hidden=(k,v)=>v?'<input type="hidden" name="'+k+'" value="'+esc(v)+'">':'';
  return (folder?'<a class="back" href="'+link({shelf,tab:mode})+'">← '+esc(shelf)+'</a>':'')+'<h1>'+esc(folder||shelf)+'</h1>'+
    (shelf==='Recipes'&&!folder?'<nav class="tabs" aria-label="Recipe library">'+Object.entries(tabs).map(([k,v])=>'<a href="'+link({shelf,tab:k})+'"'+(k===mode?' aria-current="page"':'')+'>'+esc(v)+'</a>').join('')+'</nav>':'')+
    '<form class="filters" action="'+path+'">'+hidden('shelf',shelf)+hidden('tab',state.tab)+hidden('folder',folder)+'<input type="search" name="q" aria-label="Search your library" placeholder="Search your library…" value="'+esc(q)+'"><select aria-label="Source collection" name="source">'+opt(choices,source,'All source collections')+'</select><select aria-label="Progress" name="progress">'+opt(statuses,progress,'All progress',true)+'</select><button>Search</button></form>'+
    '<ul class="items grid '+(shelf==='Recipes'?'recipes':'')+'">'+cards.slice((page-1)*24,page*24).map(cardHtml).join('')+'</ul>'+(!cards.length?'<p>0 results. Try another search or filter.</p>':'')+'<nav class="pages" aria-label="Results pages">'+(page>1?'<a href="'+link({...state,page:page-1})+'">← Previous</a>':'')+'<span class="meta">'+cards.length+' results · Page '+page+' of '+count+'</span>'+(page<count?'<a href="'+link({...state,page:page+1})+'">Next →</a>':'')+'</nav>';
}
