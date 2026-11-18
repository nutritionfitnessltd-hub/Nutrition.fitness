import { canAccess, canEditContent } from './library-permissions.mjs';
import {esc,url,heading,button,badge} from './studio-ui.mjs';

const origin='https://nutrition-fitness-website-2.vercel.app';
export function articleUrl(value){
 if(typeof value!=='string'||!(/^(?:https?:\/\/|\/(?!\/))/.test(value)))return '';
 try{const u=new URL(value,origin);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}
}
export function articleImage(r){
 if(r.kind==='article'&&r.articleImage?.type==='image/webp'&&/^nutrition-library\/article-images\/v1\/[a-f0-9-]{36}\.webp$/.test(r.articleImage.pathname))return url('article-image',{id:r.id,v:r.articleImage.pathname.split('/').pop()}).replaceAll('&amp;','&');
 const value=r.kind==='article'&&r.fields?.imageUrl;
 return typeof value==='string'&&/^\/assets\/(?:photos\/knowledge-\d+\.jpg|phone-in-hand\.webp)$/.test(value)?value:'';
}
export function articleImageEditor(r){
 const photo=articleImage(r),f=r.fields||{};
 return '<section class="panel article-image-editor" data-article-upload><h2>Article image</h2><p>Used for this article and its library thumbnail.</p><div class="article-image-drop"><label>Choose an image<input type="file" accept="image/jpeg,image/png,image/webp" data-article-file></label><p>Or drag an image here. JPG, PNG or WebP, up to 10 MB.</p></div><input type="hidden" name="imageUpload" value=""><img class="article-image-preview" data-article-preview'+(photo?' src="'+esc(photo)+'"':' hidden')+' alt="Article image preview"><p data-article-image-status role="status" aria-live="polite"></p><label>Image description<input name="uploadAlt" maxlength="500" value="'+esc(f.imageAlt||'')+'" placeholder="Describe the image"></label><label>Image credit (optional)<input name="uploadCredit" maxlength="500" value="'+esc(f.imageCredit||'')+'"></label><p class="meta">Choose your image, then Save draft to apply it.</p></section><script type="module" src="/article-image-upload.js"></script>';
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
 const f=r.fields||{},canEdit=canEditContent(data,r.id),image=articleImage(r),live=articleUrl(r.publication?.sourceUrl);
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
