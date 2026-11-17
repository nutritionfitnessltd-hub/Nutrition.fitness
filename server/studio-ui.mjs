import { esc, link } from './library-shelves.mjs';
import { icons } from './library-icons.mjs';
export { esc };
export const url=(section='home',values={})=>link({work:'1',studio:section,...values});
export const hidden=(name,value)=>'<input type="hidden" name="'+esc(name)+'" value="'+esc(value)+'">';
export const input=(name,label,value='',type='text',extra='')=>'<label>'+esc(label)+'<input name="'+esc(name)+'" type="'+type+'" value="'+esc(value)+'" '+extra+'></label>';
export const textarea=(name,label,value='',rows=4)=>'<label>'+esc(label)+'<textarea name="'+esc(name)+'" rows="'+rows+'">'+esc(value)+'</textarea></label>';
export const select=(name,label,options,current='')=>'<label>'+esc(label)+'<select name="'+esc(name)+'">'+Object.entries(options).map(([v,t])=>'<option value="'+esc(v)+'"'+(v===String(current)?' selected':'')+'>'+esc(t)+'</option>').join('')+'</select></label>';
export const form=(action,body,values={},label='Save changes',extra='')=>'<form method="post" action="'+url(values.section||'home',values)+'" class="studio-form" '+extra+'>'+hidden('action',action)+body+'<button class="primary">'+esc(label)+'</button></form>';
export const badge=state=>'<span class="studio-status">'+esc(state)+'</span>';
export const heading=(title,description='',actions='')=>'<div class="studio-heading"><div><h1>'+esc(title)+'</h1>'+(description?'<p>'+esc(description)+'</p>':'')+'</div><div class="studio-actions">'+actions+'</div></div>';
export const button=(text,href,primary=false)=>'<a class="btn'+(primary?' primary':'')+'" href="'+href+'">'+esc(text)+'</a>';
export function studioFrame(body,section,actor,meta={}){
  const menu=[['create','Create','FileText'],['library','Our content','Layers'],['archive','Archive','FolderOpen']];
  const active=['create','new'].includes(section)?'create':['archive','import'].includes(section)?'archive':'library';
  const nav=menu.map(([id,title,icon])=>'<a href="'+url(id)+'"'+(active===id?' aria-current="page"':'')+'>'+(icons[icon]||'')+'<span>'+title+'</span></a>').join('');
  const tools='<details class="studio-tools"><summary>Team & tools</summary><nav>'+[['projects','Work in progress'],['review','Review work'],['calendar','Calendar'],...(actor.role==='admin'?[['standards','Brand & settings']]:[])].map(([id,title])=>'<a href="'+url(id)+'">'+title+'</a>').join('')+'<a href="'+link({work:'1'})+'">Team & assignments</a></nav></details>';
  const brand=meta.brand?'<img class="brand-logo" alt="nutrition.fitness" src="'+url('media',{preview:meta.brand})+'">':'<b>nutrition</b>.fitness';
  return '<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Content studio | Nutrition.fitness</title><link rel="stylesheet" href="/library-reader.css"><link rel="stylesheet" href="/studio.css"><script src="/studio.js" type="module"></script></head><body class="studio"><div class="shell"><aside class="side"><a class="brand" href="'+url()+'">'+brand+'</a><strong class="kicker">Content studio</strong><div class="side-scroll"><nav aria-label="Studio navigation">'+nav+'</nav>'+tools+'</div></aside><div class="workspace" id="studio-top"><header class="top"><details class="mobile-menu"><summary aria-label="Open studio navigation">'+icons.PanelLeft+'</summary><div class="studio-mobile-links"><nav>'+nav+'</nav>'+tools+'</div></details><a href="'+url()+'">Content studio</a><span>›</span><strong>'+esc(menu.find(x=>x[0]===active)?.[1]||'Your content')+'</strong><span class="studio-person">'+esc(actor.role==='admin'?'Administrator':actor.name)+'</span>'+form('work-logout','',{},'Sign out')+'</header><main>'+body+'<footer id="studio-end"><a href="#studio-top">Back to top ↑</a></footer></main></div></div></body></html>';
}
export function list(items,render,empty='Nothing here yet.'){
  return items.length?'<ul class="studio-list">'+items.map(r=>'<li>'+render(r)+'</li>').join('')+'</ul>':'<p class="studio-empty">'+esc(empty)+'</p>';
}
export function pages(params,rows,render,size=30){
  const total=Math.max(1,Math.ceil(rows.length/size)),page=Math.max(1,Math.min(total,parseInt(params.get('page'))||1));
  const state=Object.fromEntries(params);delete state.work;delete state.studio;
  return render(rows.slice((page-1)*size,page*size))+'<nav class="pages">'+(page>1?button('Previous',url(params.get('studio'),{...state,page:page-1})):'')+'<span>'+rows.length+' items · Page '+page+' of '+total+'</span>'+(page<total?button('Next',url(params.get('studio'),{...state,page:page+1})):'')+'</nav>';
}
