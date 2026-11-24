import { randomUUID } from 'node:crypto';
import { brandPage } from './studio-brand.mjs';
import { canAccess } from './library-permissions.mjs';
import { HttpError } from './platform.mjs';
import { cleanText } from './studio-model.mjs';
import { saveRecord } from './studio-store.mjs';
import {originalCollections} from './studio-import.mjs';
import {contentPhoto} from './studio-visuals.mjs';
import {kinds} from './studio-model.mjs';
import { esc, url, heading, button, form, hidden, input, textarea, select, list, badge, pages } from './studio-ui.mjs';

const card=(title,note,section,values={})=>'<a class="studio-card" href="'+url(section,values)+'"><h2>'+esc(title)+'</h2><p>'+esc(note)+'</p></a>';
export function assetsPage(data){
  return heading('Assets','Create content and find the materials your team uses.')+'<div class="studio-cards">'+
    (canAccess(data.actor,'studio')?card('Content Studio','Create, edit and review content.','create'):'')+
    (canAccess(data.actor,'library')?card('Content Library','Browse and reuse your content.','library')+card('Products','Supplements, physical products, ads and creative assets.','products')+card('Brand & Media','Brand guidance, images and supporting files.','brand-media'):'')+
    '</div>'+(canAccess(data.actor,'originals')?'<section class="panel"><h2>Originals</h2><p>Your source collections and reference materials.</p>'+button('Browse originals',url('archive'))+'</section>':'');
}
export function brandMediaPage(data){
  if(data.actor.role==='admin'||canAccess(data.actor,'shared_library'))return brandPage(data);
  return heading('Brand & Media','Your official brand assets.')+'<p>Ask your administrator to enable Shared content & brand assets to view the logo, fonts, colours and brand guide.</p>';
}
export function workspaceArchive(params,data){
  const tab=params.get('tab')||(canAccess(data.actor,'originals')?'originals':'content');
  const tabs=[...(canAccess(data.actor,'originals')?[['originals','Original collections']]:[]),...(canAccess(data.actor,'library')?[['content','Archived content']]:[]),...(canAccess(data.actor,'work')?[['projects','Completed projects']]:[]),...(data.actor.role==='admin'?[['releases','Software releases']]:[])];
  const selected=tabs.some(([id])=>id===tab)?tab:tabs[0]?.[0];
  let body='';
  if(selected==='originals')body=originalCollections(data,{embedded:true});
  if(selected==='content'){
    const archived=data.items.filter(r=>r.status==='Archived'&&r.kind!=='settings'),kind=params.get('kind')||'',q=(params.get('q')||'').trim().toLowerCase();
    const counts=new Map();for(const r of archived)counts.set(r.kind,(counts.get(r.kind)||0)+1);
    body='<form class="studio-filters" action="/content-library/">'+hidden('work','1')+hidden('studio','workspace-archive')+hidden('tab','content')+input('q','Search archived content',params.get('q')||'','search')+select('kind','Content type',{'':'All types',...Object.fromEntries([...counts].map(([key,n])=>[key,(kinds[key]||key)+' ('+n+')']))},kind)+'<button>Search</button></form>';
    if(!kind&&!q)body+='<div class="studio-type-grid">'+[...counts].sort(([a],[b])=>a.localeCompare(b)).map(([key,n])=>'<a class="studio-card studio-type-card has-photo" href="'+url('workspace-archive',{tab:'content',kind:key})+'">'+contentPhoto(key,'studio-type-photo')+'<h2>'+esc(kinds[key]||key)+'</h2><p>'+n+' archived</p></a>').join('')+'</div>'+(!archived.length?'<p>No content has been archived.</p>':'');
    else body+=archiveCards(params,archived.filter(r=>(!kind||r.kind===kind)&&r.title.toLowerCase().includes(q)),r=>({title:r.title,note:kinds[r.kind]||r.kind,status:r.status,href:url('item',{id:r.id}),kind:r.kind}));
  }
  if(selected==='projects')body=archiveCards(params,data.projects.filter(p=>p.status==='Complete'),p=>({title:p.name,note:'Completed project',status:p.status,href:url('project',{project:p.id}),kind:'campaign'}),'No completed projects yet.');
  if(selected==='releases')body=archiveCards(params,releaseRecords(data).filter(r=>r.fields.archived),r=>({title:r.title,note:'Software release',status:r.fields.stage,href:url('software-releases',{id:r.id}),kind:'asset'}),'No archived software releases.');
  return heading('Archive','Original source collections, archived content and completed work.')+'<nav class="tabs" aria-label="Archive type">'+tabs.map(([id,label])=>'<a href="'+url('workspace-archive',{tab:id})+'"'+(selected===id?' aria-current="page"':'')+'>'+label+'</a>').join('')+'</nav>'+body;
}
function archiveCards(params,rows,describe,empty='No archived content matches this search.'){
 if(!rows.length)return '<p class="studio-empty">'+esc(empty)+'</p>';
 return pages(params,[...rows].sort((a,b)=>(a.title||a.name).localeCompare(b.title||b.name)),batch=>'<div class="studio-content-grid">'+batch.map(record=>{const r=describe(record);return '<a class="studio-card" href="'+r.href+'"><small>'+esc(r.note)+'</small><h2>'+esc(r.title)+'</h2>'+badge(r.status)+'</a>';}).join('')+'</div>',24);
}
const releaseRecords=data=>data.items.filter(r=>r.id.startsWith('studio:software-release:')&&r.kind==='settings');
export {softwareReleases,saveSoftwareRelease} from './software-releases.mjs';
