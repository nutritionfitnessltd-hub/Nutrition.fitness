import {esc} from './studio-ui.mjs';
export function productionFileUrl(raw){
 try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&['nutritionfitness.sharepoint.com','www.canva.com','canva.com'].includes(u.hostname)?u.href:'';}catch{return '';}
}
export function productionFileLinks(record){
 const f=record.fields||{},seen=new Set(),links=[];
 const add=(raw,label)=>{const href=productionFileUrl(raw);if(!href||seen.has(href))return;seen.add(href);links.push({href,label});};
 for(const file of f.production?.files||[])add(file.url,file.name||'Open finished file');
 add(f.nativePreviewUrl,'Open saved preview');
 add(f.canvaUrl||f.production?.canvaUrl,'Open editable Canva copy');
 for(const raw of [...(record.assetUrls||[]),...(f.assetUrls||[])]){
  const href=productionFileUrl(raw);if(!href)continue;
  let name='Open file';try{name=decodeURIComponent(new URL(href).pathname.split('/').filter(Boolean).at(-1)||'Open file');}catch{}
  add(href,new URL(href).hostname.endsWith('canva.com')?'Open editable Canva copy':name);
 }
 return links.length?'<section class="panel production-files"><h2>Files &amp; editable copies</h2><ul>'+links.map(({href,label})=>'<li><a href="'+esc(href)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+' ↗</a></li>').join('')+'</ul></section>':'';
}
