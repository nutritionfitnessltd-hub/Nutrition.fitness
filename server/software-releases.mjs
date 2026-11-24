import {documentSection,documentText,documentEditor} from './document-reader.mjs';
import {randomUUID} from 'node:crypto';
import {HttpError} from './platform.mjs';
import {esc,url,heading,button,form,hidden,input,textarea,select,list,badge} from './studio-ui.mjs';
import {releasePrefix,backlogPrefix,platforms,types,priorities,itemStates,backlogState,releaseRecords,backlogRecords,itemBlockers,releaseBlockers,saveBacklog,saveReleaseDraft,releaseDecision} from './software-release-core.mjs';
export {saveReleaseDraft as saveSoftwareRelease};
const choices=vs=>Object.fromEntries(vs.map(v=>[v,v]));
const nav=()=>'<nav class="tabs">'+button('Bugs & requests',url('software-releases'))+button('Releases',url('software-releases',{tab:'releases'}))+button('Message Ellis',url('worker-chat',{worker:'ellis'}))+'</nav>';
const link=(label,u)=>u?button(label,esc(u)):'';
const lockedForm=(html,locked)=>locked?html.replace(/(<(?:input|textarea|select)\b)/g,'$1 disabled').replace('<button class="primary">','<button class="primary" disabled>'):html;
const manager=()=>'<section class="panel release-manager-summary"><h2>Ellis · Release Manager</h2><p>Collects bugs and requests, asks for missing details, identifies duplicates and proposes a focused release. You approve its scope before Codex starts. Building and publishing have separate approvals.</p>'+button('Ask Ellis to review backlog',url('software-releases',{manager:'1'}))+'</section>';
function intake(params,data){
 const old=params.get('item')?backlogRecords(data).find(r=>r.id===params.get('item')):null;if(params.get('item')&&!old)throw new HttpError(404,'Backlog item not found.');const f=old?{...old.fields,state:backlogState(old,data)}:{};
 const edit=form('software-backlog-save',hidden('id',old?.id||backlogPrefix+randomUUID())+hidden('revision',old?.revision||0)+
  input('title','Short title',old?.title||'','text','required maxlength="180"')+'<div class="studio-columns">'+select('type','Type',choices(types),f.type||'Bug')+select('priority','Impact / priority',choices(priorities),f.priority||'Normal')+'</div><div class="studio-columns">'+select('platform','Platform',choices(platforms),f.platform||'Website')+select('state','Status',choices(itemStates),f.state||'New')+'</div>'+input('area','Area or screen',f.area||'')+input('pageUrl','Page URL (optional)',f.pageUrl||'','url')+textarea('description','Problem or requested functionality',f.description||'',5)+textarea('steps','Steps to reproduce (for a bug)',f.steps||'')+'<div class="studio-columns">'+textarea('actual','What happens now',f.actual||'')+textarea('expected','What should happen',f.expected||'')+'</div>'+textarea('acceptance','How we will know it is fixed or finished',f.acceptance||'')+textarea('managerNotes','Clarifications and release-manager notes',f.managerNotes||'')+select('duplicateOf','Duplicate of',{'':'Not a duplicate',...Object.fromEntries(backlogRecords(data).filter(r=>r.id!==old?.id).map(r=>[r.id,r.title]))},f.duplicateOf||''),{section:'software-releases'},'Save to backlog');
 return (old?'<article class="document-reader document-sheet">':'')+heading(old?old.title:'Report a bug or request','Keep the problem and the acceptance criteria together.',button('Back to backlog',url('software-releases')))+(old?'<p class="document-meta">'+esc([f.type,f.priority,f.platform,f.state,f.area].filter(Boolean).join(' / '))+'</p>'+documentSection('Problem or requested functionality',f.description)+documentSection('Steps to reproduce',f.steps)+documentSection('What happens now',f.actual)+documentSection('Expected outcome',f.expected)+documentSection('Acceptance criteria',f.acceptance)+documentSection('Release-manager notes',f.managerNotes)+documentEditor('Edit bug or request',edit,{open:params.get('edit')==='1'})+'</article>':edit);
}
function releaseEditor(params,data){
 const old=params.get('id')?releaseRecords(data).find(r=>r.id===params.get('id')):null;if(params.get('id')&&!old)throw new HttpError(404,'Release not found.');const f=old?.fields||{},selected=new Set((f.items||[]).map(i=>i.id));
 const candidates=backlogRecords(data).filter(r=>backlogState(r,data)==='Ready'||selected.has(r.id));
 const edit=lockedForm(form('software-release-save',hidden('id',old?.id||releasePrefix+randomUUID())+hidden('revision',old?.revision||0)+input('title','Release name',old?.title||'','text','required maxlength="160"')+'<div class="studio-columns">'+input('version','Version',f.version||'','text','required maxlength="80"')+select('platform','Platform',choices(platforms),f.platform||'Website')+'</div><div class="studio-columns">'+select('stage','Planning status',choices([...new Set(['Planned','Ready for approval','Changes requested','Blocked',...(f.stage?[f.stage]:[])])]),f.stage||'Planned')+input('target','Target date (optional)',f.target||'','date')+'</div>'+select('project','Project',{'':'No linked project',...Object.fromEntries(data.projects.map(p=>[p.id,p.name]))},f.project||'')+input('owner','Release manager',f.owner||'Ellis')+
  '<fieldset class="release-scope-items"><legend>Backlog items included in this release</legend>'+hidden('selectionPresent','yes')+(candidates.length?candidates.map(r=>'<label class="check"><input type="checkbox" name="include_'+esc(r.id)+'" value="yes"'+(selected.has(r.id)?' checked':'')+'> <span>'+esc(r.title)+'<small>'+esc(r.fields.type)+' · '+esc(r.fields.priority)+' · '+esc(r.fields.state)+'</small></span></label>').join(''):'<p>No ready items yet. Add and clarify bugs or requests in the backlog first.</p>')+'</fieldset>'+textarea('notes','Release scope, deliverables and exclusions',f.notes||'',7)+textarea('testing','Acceptance tests and regression checks',f.testing||'',6)+textarea('deployment','Deployment approach and rollback notes',f.deployment||'')+'<label class="check"><input type="checkbox" name="archived" value="yes"'+(f.archived?' checked':'')+'> Store in Archive</label>',{section:'software-releases'},'Save release scope'),['queued','running'].includes(f.job?.state));
 return (old?'<article class="document-reader document-sheet release-document">':'')+heading(old?old.title:'Prepare a release','Choose the work, define acceptance, then approve a Codex build.',button('All releases',url('software-releases',{tab:'releases'})))+
  (old?releaseDocument(old,data):'')+
  (f.job?'<section class="panel"><h2>'+esc(f.stage)+'</h2><p>'+esc(f.job.kind==='build'?'Codex build request':'Deployment request')+' · '+esc(f.job.state)+'</p><p class="prose">'+esc(f.job.progress||f.job.receipt?.summary||'The approved request is saved in the Codex queue.')+'</p>'+(f.job.receipt?'<p class="prose">'+esc(f.job.receipt.testSummary||'')+'</p>'+link('Review pull request',f.job.receipt.prUrl)+link('Open preview',f.job.receipt.previewUrl)+link('Open production',f.job.receipt.productionUrl):'')+'</section>':'')+
  (old?documentEditor('Edit release scope',edit,{open:params.get('edit')==='1'}):edit)+
  (old?releaseControls(old,data)+'</article>':'');
}
function releaseControls(r,data){
 const job=r.fields.job;if(['queued','running'].includes(job?.state))return '<p role="status">This approved scope is locked while Codex handles the request. Progress and the result will appear here.</p>';
 const blockers=releaseBlockers(r,data),action=(decision,label,description)=>form('software-release-decision',hidden('id',r.id)+hidden('revision',r.revision)+hidden('decision',decision)+'<label class="check"><input type="checkbox" name="confirmed" value="yes" required> '+esc(description)+'</label>',{section:'software-releases',id:r.id},label);
 return '<section class="document-decisions"><h2>Codex handoff</h2>'+(blockers.length?'<p>Before submitting:</p><ul>'+blockers.map(s=>'<li>'+esc(s)+'</li>').join('')+'</ul>':action('build','Approve scope & submit to Codex','I approve this saved scope for implementation, tests and a pull request. Publishing needs a separate approval.'))+
  (r.fields.stage==='Ready for review'?action('deploy','Approve checked build for release','I have reviewed the build and tests and approve this exact build for production deployment.'):'')+
  (job?'<details><summary>Submitted build brief</summary><pre class="source-text">'+esc(job.brief)+'</pre></details>':'')+'</section>';
}
export function softwareReleases(params,data){
 if(data.actor.role!=='admin')throw new HttpError(403,'Administrator access is required.');
 if(params.get('report')==='1'||params.get('item'))return intake(params,data);
 if(params.get('id')||params.get('new')==='1')return releaseEditor(params,data);
 if(params.get('manager')==='1')return heading('Ask Ellis to organise the backlog','Ellis will return clarifications, priorities and a proposed release for your review.',button('Back',url('software-releases')))+form('software-manager-review',hidden('requestId',randomUUID())+textarea('message','Anything Ellis should focus on?','Review new bugs and feature requests, clarify acceptance criteria, identify duplicates and propose the next focused release. Do not approve or start a build.',5),{section:'software-releases'},'Send backlog to Ellis');
 const releases=params.get('tab')==='releases',state=params.get('state')||'',q=(params.get('q')||'').toLowerCase(),rows=(releases?releaseRecords(data).filter(r=>!r.fields.archived):backlogRecords(data)).filter(r=>(!state||(releases?r.fields.stage:backlogState(r,data))===state)&&[r.title,r.fields.description,r.fields.area].join(' ').toLowerCase().includes(q));
 return heading('Software Releases','Collect bugs and functionality, shape the next release, then hand approved work to Codex.',button('Report bug or request',url('software-releases',{report:'1'}),true)+button('Prepare release',url('software-releases',{new:'1'})))+nav()+manager()+
  '<form class="studio-filters" action="/content-library/">'+hidden('work','1')+hidden('studio','software-releases')+hidden('tab',releases?'releases':'backlog')+input('q','Search',params.get('q')||'','search')+select('state','Status',{'':'All statuses',...choices(releases?['Planned','Ready for approval','Queued for Codex','Building','Ready for review','Deploying','Released','Blocked']:itemStates)},state)+'<button>Filter</button></form>'+
  list(rows.sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||'')),r=>'<div><a href="'+url('software-releases',releases?{id:r.id}:{item:r.id})+'">'+esc(r.title)+'</a><small>'+esc(releases?[r.fields.version,r.fields.platform,r.fields.target,r.fields.owner].filter(Boolean).join(' · '):[r.fields.type,r.fields.priority,r.fields.area].filter(Boolean).join(' · '))+'</small>'+(!releases&&itemBlockers(r).length?'<small>Needs: '+esc(itemBlockers(r).join('; '))+'</small>':'')+'</div>'+badge(releases?r.fields.stage:backlogState(r,data)),releases?'No releases yet. Ellis can group ready backlog items into a proposed release.':'No bugs or requests yet. Report the first item above.');
}
export async function changeSoftwareRelease(f,data,api){
 if(f.action==='software-backlog-save'){await saveBacklog(f,data,api);return {section:'software-releases',item:f.id};}
 if(f.action==='software-release-save'){if(f.selectionPresent==='yes')f.itemIds=Object.keys(f).filter(k=>k.startsWith('include_')&&f[k]==='yes').map(k=>k.slice(8));await saveReleaseDraft(f,data,api);return {section:'software-releases',id:f.id};}
 if(f.action==='software-release-decision'){await releaseDecision(f,data,api);return {section:'software-releases',id:f.id};}
 throw new HttpError(400,'Choose a software release action.');
}
export function softwareReleaseErrorForm(f,data){
 if(!['software-backlog-save','software-release-save'].includes(f.action))return softwareReleases(new URLSearchParams({id:f.id}),data);
 const backlog=f.action==='software-backlog-save',old=data.byId.get(f.id),fields={...old?.fields,...f};
 if(!backlog&&f.selectionPresent==='yes')fields.items=Object.keys(f).filter(k=>k.startsWith('include_')&&f[k]==='yes').map(k=>data.byId.get(k.slice(8))).filter(Boolean);
 const record={id:f.id,title:f.title||'',kind:'settings',revision:Number(f.revision)||0,fields};const copy={...data,items:[...data.items.filter(r=>r.id!==f.id),record]};
 return softwareReleases(new URLSearchParams(backlog?{item:f.id,edit:'1'}:{id:f.id,edit:'1'}),copy);
}

function releaseDocument(r,data){
 const f=r.fields,items=f.items||[];
 return '<p class="document-meta">'+esc([f.version,f.platform,f.stage,f.owner,f.target].filter(Boolean).join(' / '))+'</p>'+documentSection('Scope, deliverables & exclusions',f.notes)+
 (items.length?'<section class="document-section"><h2>Included work</h2><ol class="document-stages">'+items.map(item=>'<li><h3>'+esc(item.title||item.id)+'</h3>'+documentText(item.fields?.description||item.description,{headingLevel:4})+'</li>').join('')+'</ol></section>':'')+
 documentSection('Acceptance & regression checks',f.testing)+documentSection('Deployment & rollback',f.deployment);
}
