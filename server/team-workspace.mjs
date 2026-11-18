import { randomUUID } from 'node:crypto';
import { canAccess } from './library-permissions.mjs';
import { HttpError } from './platform.mjs';
import { cleanText } from './studio-model.mjs';
import { saveRecord } from './studio-store.mjs';
import { esc, url, heading, button, form, hidden, input, textarea, select, list, badge } from './studio-ui.mjs';

const card=(title,note,section,values={})=>'<a class="studio-card" href="'+url(section,values)+'"><h2>'+esc(title)+'</h2><p>'+esc(note)+'</p></a>';
export function assetsPage(data){
  return heading('Assets','Create content and find the materials your team uses.')+'<div class="studio-cards">'+
    (canAccess(data.actor,'studio')?card('Content Studio','Create, edit and review content.','create'):'')+
    (canAccess(data.actor,'library')?card('Content Library','Browse and reuse your content.','library')+card('Brand & Media','Brand guidance, images and supporting files.','brand-media'):'')+
    '</div>'+(canAccess(data.actor,'originals')?'<section class="panel"><h2>Originals</h2><p>Your source collections and reference materials.</p>'+button('Browse originals',url('archive'))+'</section>':'');
}
export function brandMediaPage(data){
  return heading('Brand & Media','Shared materials for consistent team work.')+'<div class="studio-cards">'+
    (data.actor.role==='admin'?card('Brand guide','Logos, fonts, colours and writing guidance.','standards'):'')+
    card('Images & files','Browse creative assets and supporting media.','library',{kind:'asset'})+
    (canAccess(data.actor,'originals')?card('Original files','Find source files in the reference collections.','archive',{shelf:'All content'}):'')+'</div>';
}
export function workspaceArchive(params,data){
  const tab=['projects','releases'].includes(params.get('tab'))?params.get('tab'):'content';
  const tabs=[...(canAccess(data.actor,'library')?[['content','Content']]:[]),...(canAccess(data.actor,'work')?[['projects','Projects']]:[]),...(data.actor.role==='admin'?[['releases','Software releases']]:[])];
  const selected=tabs.some(([id])=>id===tab)?tab:tabs[0]?.[0];
  let body='';
  if(selected==='content')body=list(data.items.filter(r=>r.status==='Archived'&&r.kind!=='settings'),r=>'<a href="'+url('item',{id:r.id})+'">'+esc(r.title)+'</a>'+badge(r.status),'No content has been archived.');
  if(selected==='projects')body=list(data.projects.filter(p=>p.status==='Complete'),p=>'<a href="'+url('project',{project:p.id})+'">'+esc(p.name)+'</a>'+badge(p.status),'No completed projects yet.');
  if(selected==='releases')body=list(releaseRecords(data).filter(r=>r.fields.archived),r=>'<a href="'+url('software-releases',{id:r.id})+'">'+esc(r.title)+'</a>'+badge(r.fields.stage),'No archived software releases.');
  return heading('Archive','Completed projects and materials put away from active work.')+'<nav class="tabs" aria-label="Archive type">'+tabs.map(([id,label])=>'<a href="'+url('workspace-archive',{tab:id})+'"'+(selected===id?' aria-current="page"':'')+'>'+label+'</a>').join('')+'</nav>'+body;
}
const releaseRecords=data=>data.items.filter(r=>r.id.startsWith('studio:software-release:')&&r.kind==='settings');
export {softwareReleases,saveSoftwareRelease} from './software-releases.mjs';
