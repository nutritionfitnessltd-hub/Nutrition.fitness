import { HttpError } from './platform.mjs';
import { mergeStudioRecord } from './studio-store.mjs';
import { esc, heading, button, url } from './studio-ui.mjs';
import { fieldLabel } from '../public/studio-fields.mjs';
import { articleHtml } from './studio-articles.mjs';

const value=v=>Array.isArray(v)?'<ul>'+v.map(x=>'<li>'+value(x)+'</li>').join('')+'</ul>':v&&typeof v==='object'?'<dl>'+Object.entries(v).map(([k,x])=>'<dt>'+esc(fieldLabel(k))+'</dt><dd>'+value(x)+'</dd>').join('')+'</dl>':'<p class="prose">'+esc(v??'')+'</p>';
export async function reviewHistoryPage(params,data,api){
  const entry=(data.reviewHistory||[]).find(f=>f.recordId===params.get('id')&&f.id===params.get('review'));
  if(!entry)throw new HttpError(403,'This review is outside your review history.');
  // Read the exact decision version, never the current draft or arbitrary revisions.
  const revision=entry.reviewedRevision+1;
  const rows=await api('/rest/v1/nufi_studio_versions?item_id=eq.'+encodeURIComponent(entry.recordId)+'&revision=eq.'+revision+'&select=payload,revision&limit=1',{service:true});
  const saved=rows[0],record=saved&&mergeStudioRecord(data.index.records.find(r=>r.id===entry.recordId),saved.payload);
  const verified=record?.reviewFeedback?.some(f=>f.id===entry.id&&f.reviewedRevision===entry.reviewedRevision);
  return heading('Review history',entry.title,button('Back to team work',url('team-work',{state:'completed'})))+
    '<section class="panel"><h2>'+esc(entry.decision==='approve'?'Approved':'Changes requested')+'</h2><p>'+esc(entry.author)+' · '+esc(entry.at)+' · Reviewed version '+entry.reviewedRevision+'</p>'+value(entry.changes||'Approved this saved version.')+(entry.guidance?'<h3>Guidance</h3>'+value(entry.guidance):'')+'</section>'+
    (verified?'<section class="panel"><h2>Content as reviewed</h2><p class="meta">This saved version is read-only. Later drafts are not included.</p>'+(record.kind==='article'?'<h3>'+esc(record.title)+'</h3>'+value(record.fields.shortAnswer||record.fields.introduction||'')+(record.fields.bodyFormat==='html'?articleHtml(record.fields.body||''):value(record.fields.body||'')):value(record.fields))+'</section>':'<p>The decision is saved. The content snapshot is not available.</p>');
}
