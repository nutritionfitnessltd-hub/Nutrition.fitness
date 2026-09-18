import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
process.chdir(root);
const source='src/knowledge-centre';
const articles=JSON.parse(fs.readFileSync(`${source}/articles.json`,'utf8'));
const taxonomy=JSON.parse(fs.readFileSync(`${source}/taxonomy.json`,'utf8'));
// Use the freshly built restored site as the shell source. This keeps its exact
// header, footer, sprite, fonts and shared interactions when the base site evolves.
const homepage=fs.readFileSync('dist/index.html','utf8');
if(!/<main id="main"[^>]*>/.test(homepage)||!homepage.includes('/base.css')||!homepage.includes('/site.css'))throw new Error('Build the restored website before the Knowledge Centre.');
const shell=homepage
 // Do not inherit page-local styles when reusing the shared site shell.
 .replace(/<link\b(?=[^>]*\bdata-page-style="home")[^>]*>/g,'')
 .replace(/<title>[\s\S]*?<\/title>/,'<title>{{TITLE}} | Nutrition.Fitness</title>')
 .replace(/<meta name="description" content="[^"]*">/,'<meta name="description" content="{{DESCRIPTION}}">')
 .replace(/<body[^>]*>/,'<body data-page="knowledge-centre" class="kc-page">')
 .replace(/<main id="main"[^>]*>[\s\S]*?<\/main>/,'{{MAIN}}')
 .replace(/<nav class="(?:desktop-nav|mobile-nav)"[^>]*>[\s\S]*?<\/nav>/g,nav=>nav
  .replace(/class="is-active" aria-current="page"/g,'')
  .replace(/(<a href="\/knowledge-centre\/")(?=[ >])/g,'$1 class="is-active" aria-current="page"'))
 .replace('</head>','<link rel="stylesheet" href="/knowledge-centre/knowledge-centre.css"></head>');
const builtRoutes=[];
const includeDrafts=process.env.KC_PUBLISHED_ONLY!=='1';
const siteOrigin='https://nutrition-fitness-website-2.vercel.app';
const readingTime=a=>Math.max(1,Math.ceil(a.bodyHtml.replace(/<[^>]+>/g,' ').trim().split(/\s+/).length/200));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label=(group,id)=>taxonomy[group].find(x=>x[0]===id)?.[1]??id;
const visible=articles.filter(a=>includeDrafts||a.status==='published').sort((a,b)=>a.priority-b.priority);
fs.rmSync('dist/knowledge-centre',{recursive:true,force:true});
const ids=new Set(), slugs=new Set();
for(const a of articles){
 if(ids.has(a.id)||slugs.has(a.slug))throw new Error(`Duplicate article ${a.id}`);ids.add(a.id);slugs.add(a.slug);
 for(const [group,values] of [['categories',[a.category]],['topics',a.topics],['situations',a.situations]])for(const value of values)if(!taxonomy[group].some(x=>x[0]===value))throw new Error(`Invalid ${group}: ${value}`);
 if(!['draft','published'].includes(a.status))throw new Error(`Invalid status: ${a.slug}`);
 if(a.status==='published'&&(!a.bodyHtml||!a.publishedAt||!a.shortAnswer||!a.sources?.length))throw new Error(`Published article needs body, date, direct answer and sources: ${a.slug}`);
 if(a.image&&(!a.imageAlt||!a.imageCredit))throw new Error(`Photograph needs alt text and credit: ${a.slug}`);
 if(/<(script|iframe|form|object)\b|javascript:|\son\w+=/i.test(a.bodyHtml))throw new Error(`Unsafe article markup: ${a.slug}`);
}
const photoUrl=(a,width)=>{const url=new URL(a.image,siteOrigin);if(url.hostname==='images.unsplash.com')url.searchParams.set('w',String(width));return url.origin===siteOrigin?url.pathname+url.search:url.href;};
const photograph=(a,{hero=false,card=false}={})=>`<img src="${esc(photoUrl(a,card?640:1200))}" srcset="${[480,800,1200].map(w=>`${esc(photoUrl(a,w))} ${w}w`).join(', ')}" sizes="${card?'(max-width: 460px) calc(100vw - 44px), (max-width: 1050px) 45vw, 340px':'(max-width: 700px) calc(100vw - 44px), 900px'}" alt="${card?'':esc(a.imageAlt)}" ${hero?'fetchpriority="high"':'loading="lazy"'} decoding="async" width="1200" height="750"${a.imagePosition?` style="object-position:${esc(a.imagePosition)}"`:''}>`;
const photoCredit=a=>a.imageCreditUrl?`<a href="${esc(a.imageCreditUrl)}" rel="noopener">${esc(a.imageCredit)}</a>`:esc(a.imageCredit);
const card=a=>`<article class="kc-card" data-article-id="${a.id}">${a.image?`<a tabindex="-1" aria-hidden="true" class="kc-card-image" href="/knowledge-centre/${a.slug}/">${photograph(a,{card:true})}${a.marginNote&&(a.priority<=10||a.id%3===0)?`<span class="kc-photo-note">${esc(a.marginNote)}</span>`:''}</a>`:''}<div class="kc-card-copy"><div class="kc-card-meta"><span>${esc(label('categories',a.category))}</span><span>${a.status==='draft'?'In preparation':`${Math.max(1,Math.ceil(a.bodyHtml.replace(/<[^>]+>/g,' ').split(/\s+/).length/200))} min read`}</span></div><h2><a href="/knowledge-centre/${a.slug}/">${esc(a.title)}</a></h2><p>${esc(a.summary)}</p><div class="kc-card-foot"><span>${esc(label('topics',a.topics[0]))}</span><a href="/knowledge-centre/${a.slug}/" aria-label="${a.status==='draft'?'View planned guide':'Read guide'}: ${esc(a.title)}">${a.status==='draft'?'View planned guide':'Read guide'} <span aria-hidden="true">↗</span></a></div></div></article>`;
function write(route,main,title,description,extra=''){
 const file=path.join('dist',route,'index.html');fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(file,shell.replace('{{MAIN}}',()=>main).replaceAll('{{TITLE}}',()=>esc(title)).replaceAll('{{DESCRIPTION}}',()=>esc(description)).replace('</body>',()=>extra+'</body>'));
 builtRoutes.push({url:`/${route}/`,title,file:path.relative('dist',file)});
}
const filters=Object.entries({categories:'Your question',topics:'Your topic',situations:'Your situation'}).map(([group,title])=>`<fieldset><legend>${title}</legend>${taxonomy[group].map(([id,name])=>`<label class="kc-checkbox"><input type="checkbox" name="${group}" value="${id}"><span>${name}</span><span class="kc-count" data-count="${group}:${id}">${visible.filter(a=>group==='categories'?a.category===id:a[group].includes(id)).length}</span></label>`).join('')}</fieldset>`).join('');
const heroMeal=articles.find(a=>a.id===25),heroMovement=articles.find(a=>a.id===22);
const heroPhotos=heroMeal.image&&heroMovement.image?`<div class="kc-hero-photos"><figure class="kc-hero-photo kc-hero-photo-main"><a href="/knowledge-centre/${heroMeal.slug}/" aria-label="Read guide: ${esc(heroMeal.title)}">${photograph(heroMeal,{hero:true})}<span class="kc-photo-note">Your dinner doesn’t need a rebrand.</span></a></figure><figure class="kc-hero-photo kc-hero-photo-small"><a href="/knowledge-centre/${heroMovement.slug}/" aria-label="Read guide: ${esc(heroMovement.title)}">${photograph(heroMovement,{card:true})}<span class="kc-photo-note">Start where you are.</span></a></figure><p class="kc-handnote kc-hero-photo-aside">A little more real life. <span aria-hidden="true">↗</span></p></div>`:'';
const listing=`<main id="main"><section class="kc-hero"><div class="shell"><div class="kc-hero-head"><div class="kc-hero-copy"><p class="kc-eyebrow">THE KNOWLEDGE CENTRE</p><h1>Good questions.<br><span>Useful answers.</span></h1><p class="kc-intro">Food, fitness and what it all costs.<br>Honest answers to the things you’re wondering about.</p><p class="kc-handnote kc-hero-aside">Yes, the money questions too. <span aria-hidden="true">↘</span></p></div>${heroPhotos}</div><form class="kc-search" role="search" action="/knowledge-centre/"><label for="kc-query" class="sr-only">Search the Knowledge Centre</label><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6"/></svg><input id="kc-query" name="q" type="search" placeholder="What would you like help with?" autocomplete="off"><button type="submit">Search</button></form><div class="kc-suggestions"><span>Start with:</span><a href="?categories=cost">What will it cost?</a><a href="?q=not+losing+weight">Not losing weight</a><a href="?q=protein&amp;categories=cost">Protein on a budget</a><a href="?situations=starting">Getting started</a></div></div></section><section class="shell kc-browser" aria-label="Browse guides">${visible.some(a=>a.status==='draft')?`<div class="kc-preview-note"><strong>Content preview</strong><span>Guides marked in preparation are still being written.</span></div>`:''}<div class="kc-browser-top"><div><h2>Find your next answer</h2><p class="kc-section-aside">Have a question you’d usually keep to yourself? Start here.</p></div><button type="button" class="kc-filter-toggle" aria-expanded="false" aria-controls="kc-filters">Filters <span id="kc-filter-total"></span></button></div><div class="kc-layout"><aside id="kc-filters" class="kc-filters"><div class="kc-filter-heading"><strong>Filter guides</strong><button type="button" data-clear>Clear all</button></div><form id="kc-filter-form">${filters}</form><p class="kc-handnote kc-filter-aside">A bit less guesswork.<br>A bit more getting on with it.</p></aside><div class="kc-results"><div class="kc-results-top"><p id="kc-result-count" role="status" aria-live="polite">${visible.length} ${visible.every(a=>a.status==='draft')?'planned guides':'guides'}</p><label for="kc-sort">Sort by <select id="kc-sort"><option value="recommended">Recommended</option><option value="az">Title A–Z</option><option value="za">Title Z–A</option>${visible.some(a=>a.publishedAt)?'<option value="newest">Newest</option>':''}</select></label></div><div class="kc-active-filters" id="kc-active-filters" aria-label="Active filters"></div><div class="kc-grid" id="kc-grid">${visible.map(card).join('')}</div><div id="kc-empty" class="kc-empty" hidden><h3>No guides match that combination.</h3><p>Try a shorter search or remove a filter.</p><button type="button" class="button" data-clear>Show all guides</button></div><nav class="kc-pagination" aria-label="Guide result pages" hidden><button type="button" id="kc-previous">← Previous</button><span id="kc-page-count"></span><button type="button" id="kc-next">Next →</button></nav><noscript><p>All guides are available below. Enable JavaScript to search, filter and sort.</p></noscript></div></div></section></main>`;
write('knowledge-centre',listing,'Knowledge Centre','Straightforward answers about nutrition, workouts, costs, problems and choosing the right support.','<script type="module" src="/knowledge-centre/knowledge-centre.mjs"></script>');
for(const a of visible){
 const related=visible.filter(b=>b.id!==a.id).map(b=>({article:b,score:(b.category===a.category?2:0)+b.topics.filter(t=>a.topics.includes(t)).length*3+b.situations.filter(t=>a.situations.includes(t)).length})).sort((x,y)=>y.score-x.score||x.article.priority-y.article.priority).slice(0,3).map(x=>x.article);
 const toc=[];
 let articleHtml=a.bodyHtml.replace(/<h2(?:\s[^>]*)?>([\s\S]*?)<\/h2>/g,(_,text)=>{const id=`section-${toc.length+1}`;toc.push({id,title:text.replace(/<[^>]+>/g,'')});return `<h2 id="${id}">${text}</h2>`;});
 articleHtml=articleHtml.replace(/<table(?:\s[^>]*)?>/g,'<div class="kc-table-scroll" role="region" aria-label="Comparison table" tabindex="0"><table>').replace(/<\/table>/g,'</table></div>');
 const sources=a.sources?.length?`<section class="kc-sources" aria-labelledby="sources-heading"><h2 id="sources-heading">Sources and checks</h2><p>Information checked on 15 September 2026.${['cost','comparisons','reviews'].includes(a.category)?' Prices, availability and subscriptions can change; check the linked provider before paying.':''}</p><ul>${a.sources.map(s=>`<li><a href="${esc(s.url)}" rel="noopener">${esc(s.title)}</a></li>`).join('')}</ul></section>`:'';
 const draft='<div class="kc-draft"><strong>This guide is in preparation.</strong><p>The full answer has not been published yet.</p></div>';
 const quick=a.shortAnswer?`<aside class="kc-quick-answer"><strong>The short answer</strong><p>${esc(a.shortAnswer)}</p></aside>`:'';
 const body=`<main id="main" class="shell kc-article"><nav class="kc-breadcrumb" aria-label="Breadcrumb"><a href="/knowledge-centre/">Knowledge Centre</a><span aria-hidden="true">/</span><a href="/knowledge-centre/?categories=${a.category}">${esc(label('categories',a.category))}</a></nav><header class="kc-article-header"><p class="kc-eyebrow">${esc(label('categories',a.category))}</p><h1>${esc(a.title)}</h1><p class="kc-intro">${esc(a.summary)}</p>${a.publishedAt?`<p class="kc-byline">By Nutrition.Fitness <span>·</span> <time datetime="${esc(a.publishedAt)}">15 September 2026</time> <span>·</span> ${readingTime(a)} min read</p>`:''}</header>${a.image?`<figure class="kc-article-photo"><div class="kc-article-photo-frame">${photograph(a,{hero:true})}${a.marginNote?`<p class="kc-photo-note">${esc(a.marginNote)}</p>`:''}</div><figcaption>${photoCredit(a)}${['reviews','comparisons'].includes(a.category)?' · Illustrative photograph.':''}</figcaption></figure>`:''}<div class="kc-article-layout"><article class="kc-article-body">${a.status==='draft'?draft:quick+articleHtml+sources}<a class="kc-back" href="/knowledge-centre/">← Back to all questions</a></article><aside class="kc-article-aside">${toc.length?`<nav class="kc-toc" aria-label="In this guide"><h2>In this guide</h2>${toc.map(t=>`<a href="#${t.id}">${t.title}</a>`).join('')}</nav>`:''}<h2>Explore this topic</h2>${a.topics.map(t=>`<a href="/knowledge-centre/?topics=${t}">${esc(label('topics',t))} →</a>`).join('')}<h2>Find something else</h2><form action="/knowledge-centre/"><label class="sr-only" for="article-search">Search guides</label><input id="article-search" name="q" type="search" placeholder="Your question…"><button type="submit">Search</button></form></aside></div><section class="kc-related"><h2>Related questions</h2><div class="kc-grid">${related.map(card).join('')}</div></section></main>`;
 const schema=a.status==='published'?'<script type="application/ld+json">'+JSON.stringify({'@context':'https://schema.org','@type':'Article',headline:a.title,description:a.summary,datePublished:a.publishedAt,dateModified:a.publishedAt,author:{'@type':'Organization',name:'Nutrition.Fitness'},mainEntityOfPage:siteOrigin+'/knowledge-centre/'+a.slug+'/'}).replace(/</g,'\\u003c')+'</script>':'';
 write(`knowledge-centre/${a.slug}`,body,a.title,a.summary,schema);
}
fs.mkdirSync('dist/knowledge-centre',{recursive:true});
for(const name of ['knowledge-centre.css','knowledge-centre.mjs','search-core.mjs'])fs.copyFileSync(`public/knowledge-centre/${name}`,`dist/knowledge-centre/${name}`);
fs.writeFileSync('dist/knowledge-centre/articles.json',JSON.stringify(visible.map(a=>({id:a.id,slug:a.slug,title:a.title,category:a.category,topics:a.topics,situations:a.situations,summary:a.summary,status:a.status,priority:a.priority,publishedAt:a.publishedAt}))));
// Keep all original pages (including the journal) intact. Only add the old hub
// address when the restored build has no page at that address already.
const blogFile='dist/blog/index.html';
if(!fs.existsSync(blogFile)){
 fs.mkdirSync(path.dirname(blogFile),{recursive:true});
 fs.copyFileSync('dist/knowledge-centre/index.html',blogFile);
 builtRoutes.push({url:'/blog/',title:'Knowledge Centre',file:'blog/index.html'});
}
const routesFile='dist/routes.json';
const originalRoutes=JSON.parse(fs.readFileSync(routesFile,'utf8')).filter(r=>!r.url.startsWith('/knowledge-centre/'));
const allRoutes=[...originalRoutes,...builtRoutes.filter(r=>!originalRoutes.some(existing=>existing.url===r.url))];
fs.writeFileSync(routesFile,JSON.stringify(allRoutes,null,2));
const indexFile='dist/search-index.json';
const originalIndex=JSON.parse(fs.readFileSync(indexFile,'utf8')).filter(r=>!r.url.startsWith('/knowledge-centre/'));
const entries=builtRoutes.filter(r=>r.url!=='/blog/').map(r=>{
 const article=visible.find(a=>r.url===`/knowledge-centre/${a.slug}/`);
 return {title:r.title,url:r.url,keywords:article?[article.summary,label('categories',article.category),...article.topics.map(t=>label('topics',t)),...article.situations.map(t=>label('situations',t))].join(' '):'Questions answers knowledge centre costs prices problems nutrition training supplements reviews comparisons'};
});
fs.writeFileSync(indexFile,JSON.stringify([...originalIndex,...entries]));
console.log(`Knowledge Centre built: ${visible.length} guides (${visible.filter(a=>a.status==='draft').length} drafts). Original website pages retained.`);
