import {isNewsletter,isNewsletterContent,newsletterPreview} from './studio-newsletters.mjs';
import {isLaunchPack,launchPackPreview} from './studio-launch-pack.mjs';
import { workerNames, contentWorker } from './studio-worker-content.mjs';
import { blankFields } from './studio-model.mjs';
import { articleImageEditor } from './studio-articles.mjs';
import { primaryFields, fieldLabel } from '../public/studio-fields.mjs';
import { esc, url, hidden, input, textarea, button, select } from './studio-ui.mjs';

const workerAssignment=(r,data)=>data.actor.role==='admin'?select('workerId','Worker',{'none':'No worker',...workerNames},contentWorker(r,data.byId)||'none'):'';

export function referenceData(data){
  return '<textarea hidden id="studio-reference-data">'+esc(JSON.stringify(data.items.filter(r=>r.kind!=='settings'&&r.status!=='Archived').map(r=>({id:r.id,title:r.title,kind:r.kind,image:r.fields.imageUrl||r.fields.thumbnailUrl||r.fields.media?.thumbnailUrl||''}))))+'</textarea>';
}
export function editorFields(r){
  return input('title',r.kind==='communication'?'Name':'Title',r.title,'text','required maxlength="200"')+
    '<textarea hidden id="studio-fields" name="fields">'+esc(JSON.stringify({...blankFields(r.kind),...r.fields}))+'</textarea><div id="studio-editor" data-kind="'+esc(r.kind)+'"></div><noscript><p>Enable JavaScript to edit this content.</p></noscript>';
}
export function editorForm(r,data,{create=false,project='',entry='',feedback='',unsaved=false}={}){
  if(r.kind==='communication')return messageEditorForm(r,data,{create,project,entry,unsaved});
  return '<form method="post" action="'+url(create?'new':'item',create?{kind:r.kind}:{id:r.id,tab:'edit'})+'" class="studio-form content-editor" id="studio-editor-form">'+
    hidden('action',create?'content-create':'content-save')+hidden(create?'id':'revision',create?r.id:r.revision)+
    (create?hidden('kind',r.kind)+hidden('entry',entry):'')+
    (!create?'<div class="studio-editor-preview-top"><a class="btn primary" data-review-preview target="_blank" rel="noopener" href="'+url('review-preview',{id:r.id})+'">Preview for approval</a></div>':'')+(r.source?.needsChecking?'<label class="check"><input type="checkbox" name="sourceChecked" value="yes"> I checked this content against the original</label>':'')+editorFields(r)+workerAssignment(r,data)+
    (!create&&r.kind==='article'?articleImageEditor(r):'')+
    (create?'<details class="editor-details"><summary>Assign to a project (optional)</summary><label>Project<select name="project">'+'<option value="">No project — save to Content Library</option>'+data.projects.map(p=>'<option value="'+esc(p.id)+'"'+(p.id===project?' selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select></label></details>':
      '<details class="editor-details"><summary>Add a review note (optional)</summary>'+textarea('feedback','Review note',feedback,3)+'</details>')+
    '<div class="studio-save-bar"><span data-editor-status'+(unsaved?' data-unsaved="true"':'')+' role="status">'+(unsaved?'Unsaved changes':create?'New draft':'All changes saved')+'</span><div class="studio-actions">'+
      '<button type="submit" name="intent" value="draft">Save draft</button><button type="submit" name="intent" value="preview">Save &amp; preview</button>'+
      (!create&&data.actor.role!=='admin'?'<button class="primary" type="submit" name="intent" value="review">Submit for review</button>':'')+'</div></div></form>';
}
function messageEditorForm(r,data,{create,project,entry,unsaved}){
  return '<form method="post" action="'+url(create?'new':'item',create?{kind:r.kind}:{id:r.id,tab:'edit'})+'" class="studio-form content-editor message-editor" id="studio-editor-form">'+
    hidden('action',create?'content-create':'content-save')+hidden(create?'id':'revision',create?r.id:r.revision)+
    (create?hidden('kind',r.kind)+hidden('entry',entry):'')+(isNewsletter(r)?'<p>'+button('Back to design',url('item',{id:r.id}))+'</p><p class="meta">Edit the HTML layout below. Save &amp; preview to check the design.</p>':'')+(r.source?.needsChecking?'<label class="check"><input type="checkbox" name="sourceChecked" value="yes"> Checked against the original</label>':'')+editorFields(r)+workerAssignment(r,data)+
    '<div class="studio-save-bar"><span data-editor-status'+(unsaved?' data-unsaved="true"':'')+' role="status">'+(unsaved?'Unsaved changes':create?'New message':'Saved')+'</span><div class="studio-actions">'+
      '<button type="submit" name="intent" value="preview">Save &amp; preview</button><button class="primary" type="submit" name="intent" value="draft">Save</button>'+(!create&&isNewsletterContent(r)?'<button type="submit" name="intent" value="review">Submit for Approval</button>':'')+'</div></div>'+
    '<details class="message-options"><summary>Options</summary><div id="studio-message-options"></div>'+
    (create?'<label>Project<select name="project">'+(data.actor.role==='admin'?'<option value="">None</option>':'')+data.projects.map(p=>'<option value="'+esc(p.id)+'"'+(p.id===project?' selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select></label>':
      '<div class="studio-actions">'+(!isNewsletterContent(r)?(data.actor.role==='admin'?'<button class="primary" type="submit" name="intent" value="approve">Approve content</button>':'<button class="primary" type="submit" name="intent" value="review">Submit for Approval</button>'):'')+button('History',url('history',{id:r.id}))+'</div>')+
    '</details></form>';
}
export function contentPreview(r,data,readable,{document=false}={}){
  if(isLaunchPack(r))return launchPackPreview(r,data);
  if(isNewsletter(r))return newsletterPreview(r);
  if(r.kind==='communication')return '<article class="studio-content-preview message-preview">'+
    (r.fields.subject?'<h2>'+esc(r.fields.subject)+'</h2>':'')+'<div class="prose">'+readable(r.fields.body,data)+'</div>'+
    (r.fields.callToAction?'<p class="message-link-text">'+esc(r.fields.callToAction)+'</p>':'')+'</article>';
  if(document)return documentContent(r,data,readable);
  const main=primaryFields[r.kind]||Object.keys(r.fields),has=v=>v!==null&&v!==undefined&&v!==''&&(!Array.isArray(v)||v.length);
  const draw=key=>has(r.fields[key])?'<section><h2>'+esc(fieldLabel(key))+'</h2><div class="prose">'+readable(r.fields[key],data)+'</div></section>':'';
  return '<article class="studio-content-preview">'+main.filter(k=>!['videoUrl','script','durationSeconds'].includes(k)&&!(r.kind==='course'&&k==='lessonIds')).map(draw).join('')+'</article>'+
    '<details class="panel"><summary>More details</summary>'+Object.keys(r.fields).filter(k=>!main.includes(k)).map(draw).join('')+'</details>';
}
export function videoTools(r){
  const f=r.fields,script=typeof f.script==='string'?f.script:typeof f.voiceoverScript==='string'?f.voiceoverScript:typeof f.narration==='string'?f.narration:'';
  const seconds=Math.round(Number(f.durationSeconds||f.videoDurationSeconds)),time=seconds>0?Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0'):'';
  if(!f.videoUrl&&!f.media?.videoUrl&&!script)return '';
  const video=f.videoUrl||f.media?.videoUrl;
  const safe=typeof video==='string'&&/^https?:\/\//i.test(video);
  return '<section class="studio-video-tools" aria-label="Video and script">'+(safe?button('Open video',esc(video)):'')+
    (script?'<button type="button" data-copy-script>Copy script</button><textarea hidden data-script-text>'+esc(script)+'</textarea>':'<span>Script not added</span>')+
    '<span>'+(time?'Video length: '+time:'Video length not recorded')+'</span><span role="status" data-copy-status></span></section>';
}

// The approval reader shows narrative first. Production indexes have named file lists.
function documentContent(r,data,readable){
 const fields=r.fields||{},has=v=>v!==null&&v!==undefined&&v!==''&&(!Array.isArray(v)||v.length)&&(!(v&&typeof v==='object'&&!Array.isArray(v))||Object.keys(v).length);
 const technical=new Set(['workerId','previewOnly','production','assetUrls','url','nativePreviewUrl','canvaUrl','canvaHomeUrl','courseFolders','ownedWorkingCopies','blockedSources','copyVerification','copySetupStatus','productionOwner','archiveRecordCount','canvaSourceCount','ownedSourceCount','sourceText','sourceRecordId']);
 const keys=[...new Set([...(r.kind==='asset'?['body','brief']:primaryFields[r.kind]||[]),'body','description','summary',...Object.keys(fields)])].filter(k=>!technical.has(k)&&has(fields[k]));
 const render=(value)=>typeof value==='string'?value.split(/\n\s*\n/).filter(Boolean).map(p=>'<p>'+readable(p,data).replaceAll('\n','<br>')+'</p>').join(''):readable(value,data);
 const counts=[['Working copies',fields.ownedSourceCount],['Canva sources',fields.canvaSourceCount],['Archive records',fields.archiveRecordCount]].filter(([,n])=>Number.isFinite(n));
 const summary=counts.length?'<dl class="approval-summary">'+counts.map(([label,n])=>'<div><dt>'+label+'</dt><dd>'+n+'</dd></div>').join('')+'</dl>':'';
 const blocked=(Array.isArray(fields.blockedSources)?fields.blockedSources:[]).map(source=>'<li><strong>'+esc(source.title||'Source needing attention')+'</strong><p>'+esc(source.reason||'Access needs checking.')+'</p></li>').join('');
 return summary+'<article class="studio-content-preview approval-reading">'+keys.map(k=>'<section>'+(keys.length===1||k==='body'?'':'<h2>'+esc(fieldLabel(k))+'</h2>')+'<div class="prose">'+render(fields[k])+'</div></section>').join('')+(blocked?'<aside class="approval-attention"><h2>Needs attention</h2><ul>'+blocked+'</ul></aside>':'')+(!keys.length&&!counts.length&&!blocked?'<p class="meta">No written description has been added. Review the attached files below.</p>':'')+'</article>';
}
