import { icons } from './library-icons.mjs';

export const contentSections=[
  ['recipe','Recipes'],['mealplan','Meal plans'],['programme','Programmes'],['course','Courses'],['challenge','Challenges'],['article','Articles'],['ebook','Books & guides'],['communication','Messages'],['campaign','Marketing'],['asset','Images & files'],['exercise','Exercises']
];
export const referenceSections=['Recipes','Programs','Courses','Challenges','Articles','E-Books','Business','Socials','Needs sorting','Source collections','All content'];
const href=(section,values={})=>'/content-library/?'+new URLSearchParams({work:'1',studio:section,...values}).toString().replaceAll('&','&amp;');
const row=(name,section,values={})=>'<a href="'+href(section,values)+'">'+name+'</a>';
export function studioNavigation(section,actor){
  const active=['create','new','import','builder','worker-requests'].includes(section)?'create':['archive'].includes(section)?'archive':['projects','project','work','review','calendar','journey','release','export'].includes(section)?'work':['settings','team','standards','nda'].includes(section)?'settings':'library';
  const menu=[['library','Content library','Layers'],['archive','Originals','FolderOpen'],['create','Studio','FileText'],['work','Work','Briefcase'],...(actor.role==='admin'?[['settings','Settings','Settings']]:[])];
  const subs={library:'',archive:'',create:'',work:row('Projects','projects')+row('Needs checking','review')+row('Calendar','calendar'),settings:row('Team & permissions','team')+row('Confidentiality agreements','nda')+row('Brand & connections','standards')};
  return {label:menu.find(x=>x[0]===active)?.[1]||'Content library',html:menu.map(([id,title,icon])=>'<div class="studio-nav-section"><a href="'+href(id==='work'?'projects':id)+'"'+(id===active?' aria-current="page"':'')+'>'+(icons[icon]||icons.FileText)+'<span>'+title+'</span></a>'+(id===active&&subs[id]?'<div class="studio-subnav">'+subs[id]+'</div>':'')+'</div>').join('')};
}
