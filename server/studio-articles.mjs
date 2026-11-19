import {workerImagePath} from './worker-images.mjs';
import { canAccess, canEditContent } from './library-permissions.mjs';
import {esc,url,heading,button,badge} from './studio-ui.mjs';

import {articleUrl} from './article-format.mjs';
export {articleUrl,articleHtml} from './article-format.mjs';
export function articleImage(r){
 if(r.kind==='article'&&r.articleImage?.type==='image/webp'&&/^nutrition-library\/article-images\/v1\/[a-f0-9-]{36}\.webp$/.test(r.articleImage.pathname))return url('article-image',{id:r.id,v:r.articleImage.pathname.split('/').pop()}).replaceAll('&amp;','&');
 if(r.kind==='article'&&r.workerImage?.bucket==='worker-content'&&workerImagePath(r.workerImage.path))return url('article-image',{id:r.id}).replaceAll('&amp;','&');
 const value=r.kind==='article'&&r.fields?.imageUrl;
 return typeof value==='string'&&/^\/assets\/(?:photos\/knowledge-\d+\.jpg|phone-in-hand\.webp)$/.test(value)?value:'';
}
export function articleImageEditor(r){
 const photo=articleImage(r),f=r.fields||{};
 return '<section class="panel article-image-editor" data-article-upload><h2>Article image</h2>'+(!photo&&f.assetUrls?.length?'<p>Photo suggested — image not uploaded yet.</p>'+f.assetUrls.filter(u=>articleUrl(u)).map(u=>'<p><a href="'+esc(articleUrl(u))+'" target="_blank" rel="noopener noreferrer">View proposed image</a></p>').join(''):'')+'<p>Used for this article and its library thumbnail.</p><div class="article-image-drop"><label>Choose an image<input type="file" accept="image/jpeg,image/png,image/webp" data-article-file></label><p>Or drag an image here. JPG, PNG or WebP, up to 10 MB.</p></div><input type="hidden" name="imageUpload" value=""><img class="article-image-preview" data-article-preview'+(photo?' src="'+esc(photo)+'"':' hidden')+' alt="Article image preview"><p data-article-image-status role="status" aria-live="polite"></p><label>Image description<input name="uploadAlt" maxlength="500" value="'+esc(f.imageAlt||'')+'" placeholder="Describe the image"></label><label>Image credit (optional)<input name="uploadCredit" maxlength="500" value="'+esc(f.imageCredit||'')+'"></label><p class="meta">Choose your image, then Save draft to apply it.</p></section><script type="module" src="/article-image-upload.js"></script>';
}
export function articlePage(r,data){
 const f=r.fields||{},canEdit=canEditContent(data,r.id),live=articleUrl(r.publication?.sourceUrl),preview=url('article-preview',{id:r.id}),review=canAccess(data.actor,'work')?url('review-preview',{id:r.id}):preview;
 const salesLabels={buyerConcern:'The question behind it',whenToSend:'When to share',discoveryQuestion:'A useful question',emailSubject:'Email subject',emailBody:'Email message',chatReply:'Chat reply',nextStep:'Next step'};
 return '<a class="back" href="'+url('library',{bucket:r.publication?.status==='published'?'published':'drafts',kind:'article'})+'">← Knowledge Centre</a>'+
 heading(r.title,'Website preview',(canEdit?button('Edit article',url('item',{id:r.id,tab:'edit'}),true):'')+' <a class="button" data-review-preview href="'+review+'" target="_blank" rel="noopener">Open full-width preview ↗</a>'+(live?button('View on website',live):''))+
 '<p>'+badge(r.publication?.status==='published'?'Published':r.status)+' <span class="meta">This preview uses the website article layout.</span></p>'+
 '<iframe class="studio-article-frame" data-article-reader title="Website preview: '+esc(r.title)+'" src="'+preview+'"></iframe><script type="module" src="/article-preview.js"></script>'+
 (f.salesUse?'<details class="panel studio-article-notes"><summary>Sales &amp; sharing notes</summary>'+Object.entries(salesLabels).filter(([key])=>f.salesUse[key]).map(([key,label])=>'<h3>'+label+'</h3><p class="prose">'+esc(f.salesUse[key])+'</p>').join('')+'</details>':'')+
 (f.bodyFormat!=='html'?'<details class="panel studio-article-notes"><summary>Original submission &amp; editorial notes</summary><p>The saved original is preserved here. These notes are not part of the website preview.</p><pre>'+esc(f.body||'')+'</pre></details>':'')+
 (canEdit?'<details class="panel studio-article-notes"><summary>Manage article</summary><div class="studio-actions">'+button('Version history',url('history',{id:r.id}))+(data.actor.role==='admin'?button('Assign work',url('project-from',{id:r.id})):'' )+'</div></details>':'');
}
