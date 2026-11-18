import {esc,url,heading,button,badge} from './studio-ui.mjs';

const origin='https://nutrition-fitness-website-2.vercel.app';
export function articleUrl(value){
 if(typeof value!=='string'||!(/^(?:https?:\/\/|\/(?!\/))/.test(value)))return '';
 try{const u=new URL(value,origin);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}
}
export function articleImage(r){
 const value=r.kind==='article'&&r.fields?.imageUrl;
 return typeof value==='string'&&/^\/assets\/(?:photos\/knowledge-\d+\.jpg|phone-in-hand\.webp)$/.test(value)?value:'';
}
// Preserve the source's headings, lists and tables, without executing imported markup.
export function articleHtml(value){
 const allowed=new Set(['p','h2','h3','h4','ul','ol','li','strong','em','b','i','table','thead','tbody','tr','th','td','br','blockquote']);
 return String(value||'').split(/(<[^>]*>)/g).map(part=>{
  if(!part.startsWith('<'))return esc(part).replace(/&amp;(amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-f]+);/gi,'&$1;');
  const tag=/^<(\/)?([a-z0-9]+)\b[^>]*>$/i.exec(part);if(!tag)return '';
  const name=tag[2].toLowerCase();
  if(name==='a'){
   if(tag[1])return '</a>';
   const raw=/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(part),href=articleUrl(raw?.[1]??raw?.[2]);
   return href?'<a href="'+esc(href)+'" target="_blank" rel="noopener noreferrer">':'<a>';
  }
  if(!allowed.has(name))return '';
  return '<'+(tag[1]?'/':'')+name+'>';
 }).join('');
}
export function articlePage(r,data){
 const f=r.fields||{},canEdit=data.actor.role==='admin'||data.assigned.has(r.id),image=articleImage(r),live=articleUrl(r.publication?.sourceUrl);
 const link=(title,value)=>{const href=articleUrl(value);return href?'<a href="'+esc(href)+'" target="_blank" rel="noopener noreferrer">'+esc(title)+'</a>':esc(title);};
 const salesLabels={buyerConcern:'The question behind it',whenToSend:'When to share',discoveryQuestion:'A useful question',emailSubject:'Email subject',emailBody:'Email message',chatReply:'Chat reply',nextStep:'Next step'};
 return '<a class="back" href="'+url('library',{bucket:r.publication?.status==='published'?'published':'drafts',kind:'article'})+'">← Knowledge Centre</a>'+
 heading(r.title,f.category||'Knowledge Centre',live?button('View on website',live):'')+
 '<p>'+badge(r.publication?.status==='published'?'Published':r.status)+(f.publishedAt?' · '+esc(f.publishedAt):'')+'</p>'+
 '<article class="studio-article"><p class="studio-article-intro">'+esc(f.introduction||'')+'</p>'+
 (image?'<figure><img class="studio-article-photo" src="'+esc(image)+'" alt="'+esc(f.imageAlt||'')+'"><figcaption>'+link(f.imageCredit||'',f.imageCreditUrl)+'</figcaption></figure>':'')+
 (f.shortAnswer?'<aside class="panel"><h2>The short answer</h2><p>'+esc(f.shortAnswer)+'</p></aside>':'')+
 '<div class="studio-article-body">'+articleHtml(f.body)+'</div>'+
 (f.sources?.length?'<section><h2>Sources and checks</h2><ul>'+f.sources.map(s=>'<li>'+link(s.title,s.url)+(s.checkedAt?' · Checked '+esc(s.checkedAt):'')+'</li>').join('')+'</ul></section>':'')+'</article>'+
 (f.salesUse?'<details class="panel studio-article-notes"><summary>Sales & sharing notes</summary>'+Object.entries(salesLabels).filter(([key])=>f.salesUse[key]).map(([key,label])=>'<h3>'+label+'</h3><p class="prose">'+esc(f.salesUse[key])+'</p>').join('')+'</details>':'')+
 (canEdit?'<details class="panel studio-article-notes"><summary>Manage article</summary><div class="studio-actions">'+button('Edit article',url('item',{id:r.id,tab:'edit'}))+(data.actor.role==='admin'?button('Assign work',url('project-from',{id:r.id})):'' )+'</div></details>':'');
}
