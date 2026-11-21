import {esc,form,hidden,textarea} from './studio-ui.mjs';
export function teamProductionPanel(worker,production){
 if(worker!=='imogen')return '';
 if(!production)return '<section class="team-profile-section"><h2>Production job</h2><p role="status">Production status unavailable. Conversation status is not evidence of production.</p></section>';
 const labels={queued:'Queued for production',working:'Production claim active',needs_input:'All available production needs input',ready:'Production check ended',done:'Job closed'};
 const progress=production.progress,blockers=progress?.blockers||[],ready=progress?.readyItems||[];
 const destination={section:'team',tab:'workers',worker};
 return '<section class="team-profile-section" data-production-job><h2>Production job</h2><p role="status">'+esc(labels[production.status]||production.status)+'</p><p class="meta">Existing job · '+esc(production.jobId)+' · Updated '+esc(production.updatedAt||'')+'</p>'+
 (blockers.length?'<h3>Questions and item blockers</h3>'+blockers.map(b=>'<article class="panel"><strong>'+esc(b.itemId)+'</strong><p class="prose">'+esc(b.detail)+'</p>'+(b.question?'<p><strong>Question for you:</strong> '+esc(b.question)+'</p>':'<p class="meta">Item error recorded; no answer requested.</p>')+'</article>').join(''):'<p>No structured item questions recorded.</p>')+
 (ready.length?'<h3>Work that can continue</h3><ul>'+ready.map(i=>'<li>'+esc(i.title)+' · '+esc(i.itemId)+'</li>').join('')+'</ul>':'')+
 (production.status==='working'?'<p class="meta">An execution claim is active. Refresh for the saved result.</p>':production.status==='done'?'':form('team-production-reply',hidden('worker',worker)+hidden('version',production.version)+textarea('message','Answer a question or resume available work','',4),destination,'Send to existing production job'))+
 '<details><summary>Latest saved production report</summary><p class="prose">'+esc(production.result||'No production result saved yet.')+'</p></details></section>';
}
