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
const stages=['Planned','Development','Testing','Awaiting Approval','Deploying','Released'];
const platforms=['Website','Backend','Android','iOS'];
const choices=values=>Object.fromEntries(values.map(v=>[v,v]));
const releaseRecords=data=>data.items.filter(r=>r.id.startsWith('studio:software-release:')&&r.kind==='settings');
export function softwareReleases(params,data){
  const id=params.get('id'),record=id?releaseRecords(data).find(r=>r.id===id):null;
  if(id&&!record)throw new HttpError(404,'This software release is unavailable.');
  if(record||params.get('new')==='1'){
    const f=record?.fields||{};
    return heading(record?'Edit release':'New software release','Plan and record the release. Deployment remains a separate action.',button('Back to releases',url('software-releases')))+
      form('software-release-save',hidden('id',record?.id||'studio:software-release:'+randomUUID())+hidden('revision',record?.revision||0)+
        input('title','Release name',record?.title||'','text','required maxlength="160"')+
        '<div class="studio-columns">'+input('version','Version',f.version||'','text','required maxlength="80"')+select('platform','Platform',choices(platforms),f.platform||'Website')+'</div>'+
        '<div class="studio-columns">'+select('stage','Status',choices(stages),f.stage||'Planned')+input('target','Target date',f.target||'','date')+'</div>'+
        select('project','Project',{'':'No linked project',...Object.fromEntries(data.projects.map(p=>[p.id,p.name]))},f.project||'')+
        input('owner','Owner',f.owner||'','text','maxlength="160"')+textarea('notes','Features, fixes and release notes',f.notes||'',5)+
        textarea('testing','Testing and acceptance',f.testing||'')+textarea('deployment','Deployment links and rollback notes',f.deployment||'')+
        '<label class="check"><input type="checkbox" name="archived" value="yes"'+(f.archived?' checked':'')+'> Store in Archive</label>',{section:'software-releases'},'Save release');
  }
  const status=stages.includes(params.get('stage'))?params.get('stage'):'';
  const records=releaseRecords(data).filter(r=>!r.fields.archived&&(!status||r.fields.stage===status)).sort((a,b)=>(a.fields.target||'9999').localeCompare(b.fields.target||'9999'));
  return heading('Software Releases','Versions, target dates and release progress.',button('New release',url('software-releases',{new:'1'}),true))+
    '<form class="studio-filters" action="/content-library/">'+hidden('work','1')+hidden('studio','software-releases')+select('stage','Status',{'':'All releases',...choices(stages)},status)+'<button>Filter</button></form>'+
    list(records,r=>'<div><a href="'+url('software-releases',{id:r.id})+'">'+esc(r.title)+'</a><small>'+esc([r.fields.platform,r.fields.version,r.fields.target,r.fields.owner].filter(Boolean).join(' · '))+'</small></div>'+badge(r.fields.stage),'No software releases here yet. Add a release when you are ready to plan it.');
}
export async function saveSoftwareRelease(f,data,api){
  if(data.actor.role!=='admin')throw new HttpError(403,'Administrator access is required.');
  if(!/^studio:software-release:[0-9a-f-]{36}$/i.test(f.id||''))throw new HttpError(400,'Reopen the release and try again.');
  const old=data.byId.get(f.id),revision=Number(f.revision);
  if(!Number.isInteger(revision)||revision<0||(old?.revision||0)!==revision)throw new HttpError(409,'Reopen the latest release before saving.');
  if(!stages.includes(f.stage)||!platforms.includes(f.platform))throw new HttpError(400,'Choose a valid platform and status.');
  if(f.project&&!data.projects.some(p=>p.id===f.project))throw new HttpError(400,'Choose an available project.');
  if(f.target&&(!/^\d{4}-\d{2}-\d{2}$/.test(f.target)||!Number.isFinite(Date.parse(f.target))||new Date(f.target).toISOString().slice(0,10)!==f.target))throw new HttpError(400,'Choose a valid target date.');
  const title=cleanText(f.title||'',160),version=cleanText(f.version||'',80);
  if(!title||!version)throw new HttpError(400,'Add a release name and version.');
  await saveRecord(api,data.actor,{id:f.id,kind:'settings',title,status:'Draft',fields:{version,platform:f.platform,stage:f.stage,target:f.target||'',project:f.project||'',owner:cleanText(f.owner||'',160),notes:cleanText(f.notes||'',8000),testing:cleanText(f.testing||'',8000),deployment:cleanText(f.deployment||'',8000),archived:f.archived==='yes'}},revision);
}
