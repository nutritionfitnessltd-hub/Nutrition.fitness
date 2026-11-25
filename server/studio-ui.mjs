import {messagePanel} from './team-message-panel.mjs';
import { canAccess } from './library-permissions.mjs';
import { studioNavigation } from './studio-navigation.mjs';
import { statusLabel } from '../public/studio-fields.mjs';
import { esc, link } from './library-shelves.mjs';
import { icons } from './library-icons.mjs';
export { esc };
export const url=(section='home',values={})=>link({work:'1',studio:section,...values});
export const hidden=(name,value)=>'<input type="hidden" name="'+esc(name)+'" value="'+esc(value)+'">';
export const input=(name,label,value='',type='text',extra='')=>'<label>'+esc(label)+'<input name="'+esc(name)+'" type="'+type+'" value="'+esc(value)+'" '+extra+'></label>';
export const textarea=(name,label,value='',rows=4)=>'<label>'+esc(label)+'<textarea name="'+esc(name)+'" rows="'+rows+'">'+esc(value)+'</textarea></label>';
export const select=(name,label,options,current='')=>'<label>'+esc(label)+'<select name="'+esc(name)+'">'+Object.entries(options).map(([v,t])=>'<option value="'+esc(v)+'"'+(v===String(current)?' selected':'')+'>'+esc(t)+'</option>').join('')+'</select></label>';
export const form=(action,body,values={},label='Save changes',extra='')=>'<form method="post" action="'+url(values.section||'home',values)+'" class="studio-form" '+extra+'>'+hidden('action',action)+body+'<button class="primary">'+esc(label)+'</button></form>';
export const badge=state=>'<span class="studio-status">'+esc(statusLabel(state))+'</span>';
export const heading=(title,description='',actions='')=>'<div class="studio-heading"><div><h1>'+esc(title)+'</h1>'+(description?'<p>'+esc(description)+'</p>':'')+'</div><div class="studio-actions">'+actions+'</div></div>';
export const button=(text,href,primary=false)=>'<a class="btn'+(primary?' primary':'')+'" href="'+href+'">'+esc(text)+'</a>';
export function studioFrame(body,section,actor,meta={}){
  if(meta.messagesEmbedded)return '<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Messages | Nutrition.fitness</title><link rel="stylesheet" href="/library-reader.css"><link rel="stylesheet" href="/studio.css"><link rel="stylesheet" href="/team-messages.css"><link rel="stylesheet" href="/team-message-panel.css"><script src="/team-messages.js" type="module"></script></head><body class="studio messages-embedded" data-messages-embedded data-message-actor="'+esc(actor.id)+'"><main>'+body+'</main></body></html>';
  const menu=studioNavigation(section,actor),nav=menu.html;
  const brand=meta.brand&&(canAccess(actor,'library')||canAccess(actor,'originals'))?'<img class="brand-logo" alt="nutrition.fitness" src="'+url('media',{preview:meta.brand})+'">':'<b>nutrition</b>.fitness';
  return '<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Team Workspace | Nutrition.fitness</title><link rel="stylesheet" href="/library-reader.css"><link rel="stylesheet" href="/studio.css"><link rel="stylesheet" href="/team-messages.css"><link rel="stylesheet" href="/team-message-panel.css"><link rel="stylesheet" href="/product-workspace.css"><link rel="stylesheet" href="/document-reader.css"><link rel="stylesheet" href="/project-document.css"><script src="/studio.js" type="module"></script><script src="/team-messages.js" type="module"></script><script src="/team-message-panel.js" type="module"></script></head><body class="studio" data-message-actor="'+esc(actor.id)+'"'+(meta.workerDeferred?' data-worker-deferred':'')+'><div class="shell"><aside class="side"><a class="brand" href="'+url()+'">'+brand+'</a><strong class="kicker">Team Workspace</strong><div class="side-scroll"><nav aria-label="Studio navigation">'+nav+'</nav></div></aside><div class="workspace" role="region" aria-label="Workspace content" tabindex="0"><header class="top" id="studio-top"><details class="mobile-menu"><summary aria-label="Open studio navigation">'+icons.PanelLeft+'</summary><div class="studio-mobile-links"><nav>'+nav+'<a href="'+url('account')+'">My account</a></nav></div></details><a href="'+url()+'">Team Workspace</a><span>›</span><strong>'+esc(menu.label)+'</strong><a class="studio-person" href="'+url('account')+'" aria-label="My account">'+esc(actor.role==='admin'?'Administrator':actor.name)+' · My account</a>'+form('work-logout','',{},'Sign out')+'</header><main>'+(meta.workerDeferred?'<p class="meta" data-hq-loading role="status">Loading live worker activity… Your saved tasks are ready below.</p>':'')+body+'<footer id="studio-end"><a href="#studio-top">Back to top ↑</a></footer></main></div></div>'+messagePanel(actor)+'</body></html>';
}
export function list(items,render,empty='Nothing here yet.'){
  return items.length?'<ul class="studio-list">'+items.map(r=>'<li>'+render(r)+'</li>').join('')+'</ul>':'<p class="studio-empty">'+esc(empty)+'</p>';
}
export function pages(params,rows,render,size=30){
  if(!rows.length)return render([]);
  const total=Math.max(1,Math.ceil(rows.length/size)),page=Math.max(1,Math.min(total,parseInt(params.get('page'))||1));
  const state=Object.fromEntries(params);delete state.work;delete state.studio;
  return render(rows.slice((page-1)*size,page*size))+'<nav class="pages">'+(page>1?button('Previous',url(params.get('studio'),{...state,page:page-1})):'')+'<span>'+rows.length+' items · Page '+page+' of '+total+'</span>'+(page<total?button('Next',url(params.get('studio'),{...state,page:page+1})):'')+'</nav>';
}
