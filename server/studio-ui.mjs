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
  const menu=studioNavigation(section,actor),nav=menu.html;
  const brand=meta.brand&&(canAccess(actor,'library')||canAccess(actor,'originals'))?'<img class="brand-logo" alt="nutrition.fitness" src="'+url('media',{preview:meta.brand})+'">':'<b>nutrition</b>.fitness';
  return '<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Content workspace | Nutrition.fitness</title><link rel="stylesheet" href="/library-reader.css"><link rel="stylesheet" href="/studio.css"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Kalam:wght@400&display=swap"><script src="/studio.js" type="module"></script></head><body class="studio"><div class="shell"><aside class="side"><a class="brand" href="'+url()+'">'+brand+'</a><strong class="kicker">Content workspace</strong><div class="side-scroll"><nav aria-label="Studio navigation">'+nav+'</nav></div></aside><div class="workspace" id="studio-top"><header class="top"><details class="mobile-menu"><summary aria-label="Open studio navigation">'+icons.PanelLeft+'</summary><div class="studio-mobile-links"><nav>'+nav+'</nav></div></details><a href="'+url()+'">Content workspace</a><span>›</span><strong>'+esc(menu.label)+'</strong><span class="studio-person">'+esc(actor.role==='admin'?'Administrator':actor.name)+'</span>'+form('work-logout','',{},'Sign out')+'</header><main>'+body+'<footer id="studio-end"><a href="#studio-top">Back to top ↑</a> · <a href="/content-library/?work=1&amp;nda=record">Your confidentiality agreement</a></footer></main></div></div></body></html>';
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
