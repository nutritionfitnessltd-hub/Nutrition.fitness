import {esc} from './studio-ui.mjs';
export function productionFileUrl(raw){
 try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&['nutritionfitness.sharepoint.com','www.canva.com','canva.com'].includes(u.hostname)?u.href:'';}catch{return '';}
}
export function productionFileLinks(record,{document=false}={}){
 const f=record.fields||{},seen=new Set(),links=[];
 const add=(raw,label,kind='File')=>{const href=productionFileUrl(raw);if(!href||seen.has(href))return;seen.add(href);links.push({href,label,kind});};
 for(const [name,folder] of Object.entries(f.courseFolders||{}))add(folder?.url,name,'Canva folder');
 add(f.canvaHomeUrl,'All course folders','Canva folder');
 for(const file of f.production?.files||[])add(file.url,file.name||'Open finished file');
 add(f.nativePreviewUrl,'Open saved preview','Preview');
 add(f.canvaUrl||f.production?.canvaUrl,'Open editable Canva copy','Editable design');
 for(const raw of [...(record.assetUrls||[]),...(f.assetUrls||[])]){
  const href=productionFileUrl(raw);if(!href)continue;
  const u=new URL(href),canva=['canva.com','www.canva.com'].includes(u.hostname),folder=canva&&u.pathname.startsWith('/folder/');
  let name='Open file';try{name=decodeURIComponent(u.pathname.split('/').filter(Boolean).at(-1)||name);}catch{}
  add(href,canva?(folder?'Canva folder '+name:'Open editable Canva copy'):name,folder?'Canva folder':canva?'Editable design':'File');
 }
 const rows=entries=>'<ul class="production-file-list">'+entries.map(({href,label,kind})=>'<li><a href="'+esc(href)+'" target="_blank" rel="noopener noreferrer"><span>'+esc(label)+'</span><small>'+esc(kind)+' &nearr;</small></a></li>').join('')+'</ul>';
 const copies=Array.isArray(f.ownedWorkingCopies)?f.ownedWorkingCopies:[],groups=new Map();
 if(document)for(const copy of copies){const href=productionFileUrl(copy.canvaUrl);if(!href)continue;const group=String(copy.collection||'Other working copies');if(!groups.has(group))groups.set(group,[]);groups.get(group).push({href,label:copy.title||'Untitled working copy',kind:Number.isInteger(copy.pageCount)?copy.pageCount+' pages':'Editable design'});}
 const copyCount=[...groups.values()].reduce((n,g)=>n+g.length,0);
 const index=groups.size?'<details class="production-copy-index"><summary>Browse '+copyCount+' working '+(copyCount===1?'copy':'copies')+'</summary>'+[...groups].map(([name,items])=>'<section><h3>'+esc(name)+'</h3>'+rows(items)+'</section>').join('')+'</details>':'';
 return links.length||index?'<section class="panel production-files"><h2>Files &amp; editable copies</h2>'+rows(links)+index+'</section>':'';
}
