import { blankFields } from './studio-model.mjs';
import { articleImageEditor } from './studio-articles.mjs';
import { primaryFields, fieldLabel } from '../public/studio-fields.mjs';
import { esc, url, hidden, input, textarea, button } from './studio-ui.mjs';

export function referenceData(data){
  return '<textarea hidden id="studio-reference-data">'+esc(JSON.stringify(data.items.filter(r=>r.kind!=='settings'&&r.status!=='Archived').map(r=>({id:r.id,title:r.title,kind:r.kind,image:r.fields.imageUrl||r.fields.thumbnailUrl||r.fields.media?.thumbnailUrl||''}))))+'</textarea>';
}
export function editorFields(r){
  return input('title','Title',r.title,'text','required maxlength="200"')+
    '<textarea hidden id="studio-fields" name="fields">'+esc(JSON.stringify({...blankFields(r.kind),...r.fields}))+'</textarea><div id="studio-editor" data-kind="'+esc(r.kind)+'"></div><noscript><p>Enable JavaScript to edit this content.</p></noscript>';
}
export function editorForm(r,data,{create=false,project='',entry='',feedback='',unsaved=false}={}){
  return '<form method="post" action="'+url(create?'new':'item',create?{kind:r.kind}:{id:r.id,tab:'edit'})+'" class="studio-form content-editor" id="studio-editor-form">'+
    hidden('action',create?'content-create':'content-save')+hidden(create?'id':'revision',create?r.id:r.revision)+
    (create?hidden('kind',r.kind)+hidden('entry',entry):'')+editorFields(r)+
    (!create&&r.kind==='article'?articleImageEditor(r):'')+
    (r.source?.needsChecking?'<label class="check"><input type="checkbox" name="sourceChecked" value="yes"> I checked this content against the original</label>':'')+
    (create?'<details class="editor-details"><summary>Assign to a project (optional)</summary><label>Project<select name="project">'+(data.actor.role==='admin'?'<option value="">No project</option>':'')+data.projects.map(p=>'<option value="'+esc(p.id)+'"'+(p.id===project?' selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select></label></details>':
      '<details class="editor-details"><summary>Add a review note (optional)</summary>'+textarea('feedback','Review note',feedback,3)+'</details>')+
    '<div class="studio-save-bar"><span data-editor-status'+(unsaved?' data-unsaved="true"':'')+' role="status">'+(unsaved?'Unsaved changes':create?'New draft':'All changes saved')+'</span><div class="studio-actions">'+
      '<button type="submit" name="intent" value="draft">Save draft</button><button type="submit" name="intent" value="preview">Save &amp; preview</button>'+
      (!create?'<button class="primary" type="submit" name="intent" value="'+(data.actor.role==='admin'?'approve':'review')+'">'+(data.actor.role==='admin'?'Save &amp; mark checked':'Save &amp; send for checking')+'</button>':'')+'</div></div></form>';
}
export function contentPreview(r,data,readable){
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
