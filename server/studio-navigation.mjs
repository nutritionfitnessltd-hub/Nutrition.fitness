import { icons } from './library-icons.mjs';

export const contentSections=[
  ['recipe','Recipes'],['mealplan','Meal plans'],['programme','Training programmes'],['exercise','Exercises'],['session','Workouts'],['course','Courses'],['challenge','Challenges'],['article','Knowledge Centre'],['ebook','Books'],['leadmagnet','Lead magnets'],['communication','Messages'],['workflow','Workflows'],['campaign','Marketing'],['asset','Assets']
];
export const referenceSections=['Recipes','Programs','Courses','Challenges','Articles','E-Books','Business','Socials','Needs sorting','Source collections','All content'];
const href=(section,values={})=>'/content-library/?'+new URLSearchParams({work:'1',studio:section,...values}).toString().replaceAll('&','&amp;');
const row=(name,section,values={})=>'<a href="'+href(section,values)+'">'+name+'</a>';
export function studioNavigation(section,actor){
  const active=['create','new','import'].includes(section)?'create':['archive'].includes(section)?'archive':['projects','project','work','review','calendar','journey','release','export'].includes(section)?'work':['settings','team','standards'].includes(section)?'settings':'library';
  const menu=[['library','Content Library','Layers'],['archive','Reference Library','FolderOpen'],['create','Studio','FileText'],['work','Work','Briefcase'],...(actor.role==='admin'?[['settings','Settings','Settings']]:[])];
  const content=['published','drafts'].map(bucket=>'<details><summary>'+ (bucket==='published'?'Published':'Drafts')+'</summary>'+contentSections.map(([kind,label])=>kind==='ebook'?'<details><summary>Books</summary>'+row('All books','library',{kind,bucket})+[['Recipe book','Recipe books'],['Workout book','Workout books'],['Guide','Guides']].map(([bookType,title])=>row(title,'library',{kind,bucket,bookType})).join('')+'</details>':row(label,'library',{kind,bucket})).join('')+'</details>').join('');
  const subs={library:content,archive:referenceSections.map(name=>row(name,'archive',{shelf:name})).join(''),create:row('Create something','create')+row('Start from Reference Library','archive')+row('Import a file','import'),work:'<a href="/content-library/?work=1">My work</a>'+row('Projects','projects')+row('Awaiting review','review')+row('Calendar','calendar'),settings:row('Team & permissions','team')+row('Brand & writing guidance','standards')+row('Connections','standards')};
  return {label:menu.find(x=>x[0]===active)?.[1]||'Content Library',html:menu.map(([id,title,icon])=>'<div class="studio-nav-section"><a href="'+(id==='work'?'/content-library/?work=1':href(id))+'"'+(id===active?' aria-current="page"':'')+'>'+(icons[icon]||icons.FileText)+'<span>'+title+'</span></a>'+(id===active?'<div class="studio-subnav">'+subs[id]+'</div>':'')+'</div>').join('')};
}
