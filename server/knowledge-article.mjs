import {esc,url} from './studio-ui.mjs';
import {articleHtml,articleImage} from './studio-articles.mjs';
import {markdownArticle} from './studio-publishing.mjs';

export function imageCaption(r){
 const f=r.fields||{};
 if(typeof f.marginNote==='string')return f.marginNote.trim().slice(0,160);
 if(typeof f.imageCaption==='string')return f.imageCaption.trim().slice(0,160);
 const notes=[[/magnesium/i,'Magnesium and vitamin D.'],[/red wine/i,'Wine and heart health.'],[/light on/i,'Light, sleep and your heart.'],[/breast cancer/i,'HRT and breast cancer.'],[/dementia/i,'HRT and memory.']];
 return notes.find(([pattern])=>pattern.test(r.title))?.[1]||'Let’s look a little closer.';
}
export function cleanArticleBody(body,title=''){
 let text=String(body||'').trim();
 if(/^:::writing\{[^\n]*\}\s*\n/.test(text))text=text.replace(/^:::writing\{[^\n]*\}\s*\n/,'').replace(/\n:::\s*$/,'');
 const lines=text.split('\n');if(lines[0]?.replace(/^#\s+/,'').trim()===title.trim())lines.shift();
 return lines.join('\n').trim();
}
export function knowledgeArticle(r,image=''){
 const f=r.fields||{},caption=imageCaption(r),body=f.bodyFormat==='html'?articleHtml(f.body):markdownArticle(cleanArticleBody(f.body,r.title));
 const minutes=Math.max(1,Math.ceil(body.replace(/<[^>]*>/g,' ').split(/\s+/).length/200));
 const sources=Array.isArray(f.sources)?f.sources.filter(s=>typeof s.url==='string'&&/^https:\/\//.test(s.url)):[];
 return '<main id="main" class="shell kc-article"><nav class="kc-breadcrumb" aria-label="Breadcrumb"><a href="/knowledge-centre/">Knowledge Centre</a><span aria-hidden="true">/</span><span>'+esc(f.categoryLabel||'Health & wellbeing')+'</span></nav><header class="kc-article-header"><p class="kc-eyebrow">'+esc(f.categoryLabel||'Knowledge Centre')+'</p><h1>'+esc(r.title)+'</h1>'+(f.introduction?'<p class="kc-intro">'+esc(f.introduction)+'</p>':'')+'<p class="kc-byline">By Nutrition.Fitness <span>·</span> '+minutes+' min read</p></header>'+
 (image?'<figure class="kc-article-photo"><div class="kc-article-photo-frame"><img src="'+esc(image)+'" alt="'+esc(f.imageAlt||'')+'" fetchpriority="high">'+(caption?'<p class="kc-photo-note">'+esc(caption)+'</p>':'')+'</div><figcaption>'+esc(f.imageCredit||'')+'</figcaption></figure>':'')+
 '<div class="kc-article-layout"><article class="kc-article-body">'+(f.shortAnswer?'<aside class="kc-quick-answer"><strong>The short answer</strong><p>'+esc(f.shortAnswer)+'</p></aside>':'')+body+(f.takeaway?'<aside class="kc-quick-answer"><strong>The takeaway</strong><p>'+esc(f.takeaway)+'</p></aside>':'')+
 (sources.length?'<section class="kc-sources"><h2>Sources and checks</h2><ul>'+sources.map(s=>'<li><a href="'+esc(s.url)+'" rel="noopener noreferrer">'+esc(s.title||s.url)+'</a></li>').join('')+'</ul></section>':'')+'</article><aside class="kc-article-aside"><h2>A little more support</h2><p>Practical answers for real life.</p><a href="/knowledge-centre/">Explore the Knowledge Centre →</a></aside></div></main>';
}
export function knowledgeDocument(r,{preview=false,image=''}={}){
 return '<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>'+esc(r.title)+' | Nutrition.Fitness</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Kalam:wght@400&display=swap"><link rel="stylesheet" href="/base.css"><link rel="stylesheet" href="/site.css"><link rel="stylesheet" href="/knowledge-centre/knowledge-centre.css"><link rel="stylesheet" href="/knowledge-preview.css"></head><body class="kc-page">'+
 '<header class="knowledge-brand"><a href="/">nutrition.fitness®</a><a href="/knowledge-centre/">Knowledge Centre</a></header>'+(preview?'<p class="knowledge-preview-notice">Private preview · saved draft · not published</p>':'')+knowledgeArticle(r,image)+'</body></html>';
}
export function knowledgePreview(r){
 const source=url('item',{id:r.id,tab:'knowledge-document'});
 return '<section class="knowledge-preview"><div class="studio-actions"><a class="btn" href="'+url('item',{id:r.id,tab:'edit'})+'">Edit article</a><a class="btn" target="_blank" rel="noopener" href="'+source+'">Open full-page preview</a></div><p>This is the saved draft in the Knowledge Centre layout. It has not been published.</p><iframe title="Knowledge Centre article preview" src="'+source+'" class="knowledge-preview-frame"></iframe></section>';
}
