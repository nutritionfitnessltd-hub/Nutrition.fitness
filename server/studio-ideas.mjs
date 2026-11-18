import {hqRequest} from './studio-hq.mjs';
import {esc,url,hidden,form,textarea,list} from './studio-ui.mjs';
export async function workerIdeaSummaries(env,fetcher){
 const entries=await Promise.all(['alex','andy','martina'].map(async worker=>{try{const state=await hqRequest(env,{action:'ideas',worker},fetcher);return [worker,state.ideas?.[0]||null];}catch{return [worker,null];}}));return Object.fromEntries(entries);
}
export async function workerIdeasPanel(worker,env,fetcher){
 if(!['alex','andy','martina'].includes(worker))return '';
 let state;try{state=await hqRequest(env,{action:'ideas',worker},fetcher);}catch(e){return '<section class="panel"><h2>Ideas & plans</h2><p role="alert">'+esc(e.message)+'</p></section>';}
 const action=(idea,kind,label,extra='')=>form('hq-idea',hidden('worker',worker)+hidden('decision',kind)+hidden('ideaId',idea.id)+hidden('expectedVersion',state.version)+extra,{section:'worker-chat',worker},label);
 return '<section data-worker-updates="ideas" class="worker-ideas"><h2>Ideas & plans</h2><p>Daily at 9 am, London time. Unapproved ideas are replaced by a fresh proposal the next day. Approving an idea starts scoping; approving its scope starts one step at a time.</p>'+list(state.ideas||[],i=>{
  const results=new Map((state.taskResults||[]).map(t=>[t.id,t]));
  return '<article class="panel"><h3>'+esc(i.title)+'</h3><p class="meta">'+esc(i.day)+' · '+esc(({pending:'Awaiting your approval',superseded:'Replaced by a newer idea',rejected:'Declined',scoping:'Preparing scope',scoped:'Scope ready for your review',active:'Working through plan',done:'Completed'})[i.state]||i.state)+'</p><p class="prose">'+esc(i.summary)+'</p><p class="prose">'+esc(i.rationale)+'</p><ul>'+(i.sources||[]).map(s=>'<li><a href="'+esc(/^https:\/\//.test(s.url)?s.url:'#')+'" target="_blank" rel="noopener noreferrer">'+esc(s.title)+'</a></li>').join('')+'</ul>'+
   (i.feedback?'<p class="prose">Your feedback: '+esc(i.feedback)+'</p>':'')+
   (i.state==='pending'?action(i,'approve-idea','Approve idea & request scope')+action(i,'reject-idea','Decline — bring a new idea tomorrow',textarea('feedback','Feedback (optional)','',2)):'')+
   (i.scope?'<section><h4>Scope</h4><p class="prose">'+esc(i.scope.overview)+'</p><ol>'+i.scope.stages.map(s=>{const t=results.get(s.taskId);return '<li><strong>'+esc(s.title)+'</strong><small> '+esc(s.worker)+' · '+esc(s.state)+'</small><p class="prose">'+esc(s.brief)+'</p>'+(t?'<p>Status: '+esc(t.status)+'</p><p class="prose">'+esc(t.result||'Work is queued in James HQ.')+'</p>':'')+'</li>';}).join('')+'</ol></section>':'')+
   (i.state==='scoped'?action(i,'start-scope','Approve scope & start first step'):'')+
   (i.state==='active'&&i.scope.stages.some(s=>s.state==='active'&&['ready','done'].includes(results.get(s.taskId)?.status))?action(i,'approve-step','Approve completed step & continue'):'')+'</article>';
 },'Your first researched proposal will appear here after James HQ processes the scheduled work.')+'</section>';
}
