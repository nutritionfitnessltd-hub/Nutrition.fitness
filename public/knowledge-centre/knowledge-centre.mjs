import {matches,textMatches as searchMatches} from './search-core.mjs';
const grid=document.querySelector('#kc-grid');
const cards=[...grid.querySelectorAll('[data-article-id]')];
const form=document.querySelector('#kc-filter-form');
const search=document.querySelector('#kc-query');
const sort=document.querySelector('#kc-sort');
const pager=document.querySelector('.kc-pagination');
const count=document.querySelector('#kc-result-count');
const active=document.querySelector('#kc-active-filters');
const keys=['categories','topics','situations'];
const pageSize=12;
let articles;
let page=1;
const groups=()=>Object.fromEntries(keys.map(key=>[key,[...form.querySelectorAll(`[name="${key}"]:checked`)].map(e=>e.value)]));
const textMatches=a=>searchMatches(a,search.value);
function restore(){const p=new URLSearchParams(location.search);search.value=p.get('q')||'';for(const key of keys){const values=(p.get(key)||'').split(',');form.querySelectorAll(`[name="${key}"]`).forEach(e=>e.checked=values.includes(e.value));}sort.value=[...sort.options].some(o=>o.value===p.get('sort'))?p.get('sort'):'recommended';page=Math.max(1,Math.floor(Number(p.get('page'))||1));}
function syncUrl(mode){const p=new URLSearchParams();if(search.value.trim())p.set('q',search.value.trim());const selected=groups();for(const key of keys)if(selected[key].length)p.set(key,selected[key].join(','));if(sort.value!=='recommended')p.set('sort',sort.value);if(page>1)p.set('page',String(page));const query=p.toString();const url=location.pathname+(query?'?'+query:'');if(url!==location.pathname+location.search)history[mode==='push'?'pushState':'replaceState'](null,'',url);}
function chip(text,onRemove){const b=document.createElement('button');b.type='button';b.textContent=text+' ×';b.setAttribute('aria-label','Remove filter: '+text);b.addEventListener('click',onRemove);active.append(b);}
function render(mode='replace'){
 const selected=groups();const found=articles.filter(a=>textMatches(a)&&matches(a,selected));
 found.sort((a,b)=>sort.value==='az'?a.title.localeCompare(b.title,'en-GB'):sort.value==='za'?b.title.localeCompare(a.title,'en-GB'):sort.value==='newest'?String(b.publishedAt||'').localeCompare(a.publishedAt||''):a.priority-b.priority);
 const pages=Math.max(1,Math.ceil(found.length/pageSize));page=Math.min(page,pages);
 const shown=found.slice((page-1)*pageSize,page*pageSize);const ids=new Set(shown.map(a=>a.id));
 const ordered=found.map(a=>cards.find(c=>Number(c.dataset.articleId)===a.id));for(const c of cards)c.hidden=!ids.has(Number(c.dataset.articleId));for(const c of ordered)grid.append(c);
 const noun=articles.every(a=>a.status==='draft')?'planned guides':'guides';count.textContent=found.length?`${(page-1)*pageSize+1}–${Math.min(page*pageSize,found.length)} of ${found.length} ${noun}`:'0 matching guides';
 document.querySelector('#kc-empty').hidden=found.length>0;pager.hidden=found.length<=pageSize;document.querySelector('#kc-previous').disabled=page===1;document.querySelector('#kc-next').disabled=page===pages;document.querySelector('#kc-page-count').textContent=`Page ${page} of ${pages}`;
 for(const node of document.querySelectorAll('[data-count]')){const [key,value]=node.dataset.count.split(':');node.textContent=articles.filter(a=>textMatches(a)&&matches(a,selected,key)&&(key==='categories'?a.category===value:a[key].includes(value))).length;}
 active.replaceChildren();if(search.value.trim())chip('Search: '+search.value.trim(),()=>{search.value='';page=1;render('push');search.focus()});
 for(const input of form.querySelectorAll('input:checked'))chip(input.nextElementSibling.textContent,()=>{input.checked=false;page=1;render('push');document.querySelector('.kc-filter-toggle').focus()});
 const selectedCount=Object.values(selected).flat().length;document.querySelector('#kc-filter-total').textContent=selectedCount?`(${selectedCount})`:'';
 syncUrl(mode);
}
async function init(){
 try{const response=await fetch('/knowledge-centre/articles.json');if(!response.ok)throw new Error('Guide index unavailable');articles=await response.json();}catch{count.textContent='Search is temporarily unavailable. You can still browse all guides below.';return;}
 document.body.classList.add('kc-enhanced');restore();render();
 document.querySelector('.kc-search').addEventListener('submit',e=>{e.preventDefault();page=1;render('push');});
 let timer;search.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{page=1;render()},180)});
 form.addEventListener('change',()=>{page=1;render('push')});sort.addEventListener('change',()=>{page=1;render('push')});
 for(const b of document.querySelectorAll('[data-clear]'))b.addEventListener('click',()=>{search.value='';form.reset();sort.value='recommended';page=1;render('push');});
 for(const direction of ['previous','next'])document.querySelector('#kc-'+direction).addEventListener('click',()=>{page+=direction==='next'?1:-1;render('push');document.querySelector('.kc-results-top').scrollIntoView({block:'start'});count.tabIndex=-1;count.focus({preventScroll:true});});
 document.querySelector('.kc-filter-toggle').addEventListener('click',e=>{const b=e.currentTarget;const open=b.getAttribute('aria-expanded')!=='true';b.setAttribute('aria-expanded',String(open));document.querySelector('#kc-filters').classList.toggle('is-open',open)});
 window.addEventListener('popstate',()=>{restore();render()});
}
init();
