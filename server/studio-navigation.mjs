import { canAccess } from './library-permissions.mjs';
import { icons } from './library-icons.mjs';

export const contentSections=[
  ['theme','Themes'],['recipe','Recipes'],['programme','Programmes'],['course','Courses'],['challenge','Challenges'],['article','Articles'],['ebook','Books & guides'],['newsletter','Newsletters'],['exercise','Exercises']
];
export const referenceSections=['Recipes','Programs','Courses','Challenges','Articles','E-Books','Business','Socials','Needs sorting','Source collections','All content'];
const href=(section,values={})=>'/content-library/?'+new URLSearchParams({work:'1',studio:section,...values}).toString().replaceAll('&','&amp;');
const row=(name,section,values={})=>'<a href="'+href(section,values)+'">'+name+'</a>';
export function studioNavigation(section,actor){
  const active=['home','worker-chat','team-work','review','review-history'].includes(section)?'home':['task','projects','project','project-create','work','calendar','journey','release','export'].includes(section)?'projects':['suppliers','supplier','products','product','product-creatives','product-asset','product-file'].includes(section)?'products':section==='shiny-things'?'shiny-things':['software-releases'].includes(section)?'software-releases':['settings','team','connections','nda'].includes(section)?'team':['workspace-archive','archive'].includes(section)?'workspace-archive':'assets';
  const assets=canAccess(actor,'library')||canAccess(actor,'studio')||canAccess(actor,'originals');
  const menu=[['home','Home','LayoutGrid'],...(canAccess(actor,'work')?[['projects','Projects','Briefcase']]:[]),...(canAccess(actor,'library')?[['shiny-things','Shiny Things','MessageCircle']]:[]),...(canAccess(actor,'library')?[['products','Products','Package']]:[]),...(assets?[['assets','Assets','Layers']]:[]),...(actor.role==='admin'?[['software-releases','Software Releases','CheckCheck'],['team','Team','Settings']]:[]),...(canAccess(actor,'library')||canAccess(actor,'work')||canAccess(actor,'originals')?[['workspace-archive','Archive','FolderOpen']]:[])];
  const subs=(canAccess(actor,'studio')?row('Content Studio','create'):'')+(canAccess(actor,'library')?row('Content Library','library'):'')+(canAccess(actor,'library')?row('Brand & Media','brand-media'):'');
  return {label:section==='account'?'My account':menu.find(x=>x[0]===active)?.[1]||'Assets',html:menu.map(([id,title,icon])=>'<div class="studio-nav-section"><a href="'+href(id)+'"'+(id===active&&section!=='account'?' aria-current="page"':'')+'>'+(icons[icon]||icons.FileText)+'<span>'+title+'</span></a>'+(id==='home'?'<div class="studio-subnav">'+row('Team work','team-work')+'</div>':'')+(id==='products'&&active==='products'?'<div class="studio-subnav">'+row('All products','products')+row('Suppliers','suppliers')+row('Ads & creatives','product-creatives')+'</div>':'')+(id==='assets'&&subs?'<div class="studio-subnav">'+subs+'</div>':'')+'</div>').join('')};
}
