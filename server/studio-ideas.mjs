import {hqRequest} from './studio-hq.mjs';
import {documentText,documentSection,proposalText} from './document-reader.mjs';
import {esc,url,hidden,form,textarea,list} from './studio-ui.mjs';
export async function workerIdeaSummaries(env,fetcher){
 const entries=await Promise.all(['alex','andy','martina'].map(async worker=>{try{const state=await hqRequest(env,{action:'ideas',worker},fetcher);return [worker,state.ideas?.[0]||null];}catch{return [worker,null];}}));return Object.fromEntries(entries);
}
export async function workerIdeasPanel(worker,env,fetcher){
 if(!['alex','andy','martina'].includes(worker))return '';
 let state;try{state=await hqRequest(env,{action:'ideas',worker},fetcher);}catch(e){return '<section class="panel"><h2>Ideas & plans</h2><p role="alert">'+esc(e.message)+'</p></section>';}
 const action=(idea,kind,label,extra='')=>form('hq-idea',hidden('worker',worker)+hidden('decision',kind)+hidden('ideaId',idea.id)+hidden('expectedVersion',state.version)+extra,{section:'worker-chat',worker},label);
 return '<section data-worker-updates="ideas" class="worker-ideas"><p class="document-kicker">Ideas &amp; plans</p><p class="document-help">Daily at 9 am, London time. Unapproved ideas are replaced by a fresh proposal the next day. Approving an idea starts scoping; approving its scope starts one step at a time.</p>'+list(state.ideas||[],i=>{
  const results=new Map((state.taskResults||[]).map(t=>[t.id,t]));
  const sources=(i.sources||[]).map(s=>'<li><a href="'+esc(/^https:\/\//.test(s.url)?s.url:'#')+'" target="_blank" rel="noopener noreferrer">'+esc(s.title)+'</a></li>').join('');
  return '<article class="document-reader document-sheet worker-proposal"><header class="document-header"><h2>'+esc(i.title)+'</h2><p class="document-meta"><time>'+esc(i.day)+'</time> &middot; '+esc(({pending:'Awaiting your approval',superseded:'Replaced by a newer idea',rejected:'Declined',scoping:'Preparing scope',scoped:'Scope ready for your review',active:'Working through plan',done:'Completed'})[i.state]||i.state)+'</p></header>'+
   (i.summary?'<section class="document-section"><h3>The proposal</h3>'+proposalText(i.summary)+'</section>':'')+documentSection('Why it matters',i.rationale,{level:3})+
   (sources?'<section class="document-section"><h3>Sources &amp; evidence</h3><ul class="document-sources">'+sources+'</ul></section>':'')+
   documentSection('Your feedback',i.feedback,{level:3})+
   (i.scope?'<section class="document-section"><h3>Scope</h3>'+documentText(i.scope.overview,{headingLevel:4})+'<ol class="document-stages">'+(i.scope.stages||[]).map(s=>{const t=results.get(s.taskId);return '<li><h4>'+esc(s.title)+'</h4><p class="document-meta">'+esc(s.worker)+' &middot; '+esc(s.state)+'</p>'+documentText(s.brief,{headingLevel:5})+(t?'<p class="document-meta">Status: '+esc(t.status)+'</p>'+documentText(t.result||'Work is queued in James HQ.',{headingLevel:5}):'')+'</li>';}).join('')+'</ol></section>':'')+
   (['pending','scoped','active'].includes(i.state)?'<footer class="document-decisions"><h3>Your decision</h3>'+
   (i.state==='pending'?action(i,'approve-idea','Approve idea & request scope')+action(i,'reject-idea','Decline — bring a new idea tomorrow',textarea('feedback','Feedback (optional)','',2)):'')+
   (i.state==='scoped'?action(i,'start-scope','Approve scope & start first step'):'')+
   (i.state==='active'&&i.scope?.stages?.some(s=>s.state==='active'&&['ready','done'].includes(results.get(s.taskId)?.status))?action(i,'approve-step','Approve completed step & continue'):'')+'</footer>':'')+'</article>';
 },'Your first researched proposal will appear here after James HQ processes the scheduled work.')+'</section>';
}
