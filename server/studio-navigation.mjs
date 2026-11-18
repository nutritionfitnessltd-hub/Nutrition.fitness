import { canAccess } from './library-permissions.mjs';
import { icons } from './library-icons.mjs';

export const contentSections=[
  ['recipe','Recipes'],['mealplan','Meal plans'],['programme','Programmes'],['course','Courses'],['challenge','Challenges'],['article','Articles'],['ebook','Books & guides'],['communication','Messages'],['campaign','Marketing'],['asset','Images & files'],['exercise','Exercises']
];
export const referenceSections=['Recipes','Programs','Courses','Challenges','Articles','E-Books','Business','Socials','Needs sorting','Source collections','All content'];
const href=(section,values={})=>'/content-library/?'+new URLSearchParams({work:'1',studio:section,...values}).toString().replaceAll('&','&amp;');
const row=(name,section,values={})=>'<a href="'+href(section,values)+'">'+name+'</a>';
export function studioNavigation(section,actor){
  const active=['home','worker-chat'].includes(section)?'home':['projects','project','work','calendar','journey','release','export'].includes(section)?'projects':section==='shiny-things'?'shiny-things':['software-releases'].includes(section)?'software-releases':['settings','team','connections','nda'].includes(section)?'team':section==='workspace-archive'?'workspace-archive':'assets';
  const assets=canAccess(actor,'library')||canAccess(actor,'studio')||canAccess(actor,'originals');
  const menu=[['home','Home','LayoutGrid'],...(canAccess(actor,'work')?[['projects','Projects','Briefcase']]:[]),...(actor.role==='admin'?[['shiny-things','Shiny Things','MessageCircle']]:[]),...(assets?[['assets','Assets','Layers']]:[]),...(actor.role==='admin'?[['software-releases','Software Releases','CheckCheck'],['team','Team','Settings']]:[]),...(canAccess(actor,'library')||canAccess(actor,'work')?[['workspace-archive','Archive','FolderOpen']]:[])];
  const subs=(canAccess(actor,'studio')?row('Content Studio','create'):'')+(canAccess(actor,'library')?row('Content Library','library'):'')+(canAccess(actor,'library')?row('Brand & Media','brand-media'):'');
  return {label:menu.find(x=>x[0]===active)?.[1]||'Assets',html:menu.map(([id,title,icon])=>'<div class="studio-nav-section"><a href="'+href(id)+'"'+(id===active?' aria-current="page"':'')+'>'+(icons[icon]||icons.FileText)+'<span>'+title+'</span></a>'+(id==='assets'&&subs?'<div class="studio-subnav">'+subs+'</div>':'')+'</div>').join('')};
}
