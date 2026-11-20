import {launchPackChildren,launchPackFields} from './launch-packs.mjs';
import {canReadContent} from './library-permissions.mjs';
import {workerImagePath} from './worker-images.mjs';
import {esc,url} from './studio-ui.mjs';

export const isLaunchPack=r=>r?.kind==='campaign'&&r.fields?.coursePack===true;
const text=value=>typeof value==='string'?value:'';
const https=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}};
const paragraphs=value=>text(value).split(/\n\s*\n/).filter(Boolean).map(p=>'<p class="prose">'+esc(p)+'</p>').join('');
const copy=(value,label='Copy text')=>text(value).trim()?'<div class="launch-copy"><button type="button" data-launch-copy>'+label+'</button><textarea hidden data-launch-text>'+esc(value)+'</textarea><span role="status" data-launch-status></span></div>':'';
const section=(id,title,value,extra='')=>'<section id="launch-'+id+'" class="launch-section"><header><h2>'+title+'</h2>'+copy(value,id==='video'?'Copy script':'Copy text')+'</header>'+extra+(text(value).trim()?paragraphs(value):'<p class="meta">Not added yet.</p>')+'</section>';

function photo(record,data,fallback=''){
 if(!record||record.status==='Archived'||!canReadContent(data,record))return '';
 return record.workerImage?.bucket==='worker-content'&&workerImagePath(record.workerImage.path)?url('article-image',{id:record.id}).replaceAll('&amp;','&'):https(fallback);
}
export function launchPackPreview(r,data){
 if(!canReadContent(data,r))return '';
 const children=launchPackChildren(r,data),f=launchPackFields(r,data),heroRecord=children.find(x=>x.fields.launchPackPart==='hero')||r,hero=photo(heroRecord,data,f.heroImageUrl),course=data.byId.get(f.courseId);
 const images=[{role:'Course hero',record:heroRecord,src:hero,alt:heroRecord.fields.imageAlt||f.heroImageAlt,credit:heroRecord.fields.imageCredit||f.heroImageCredit},
  ...[['Video thumbnail',f.videoThumbnailAssetId],['Social image',f.socialImageAssetId]].map(([role,id])=>{
   const record=children.find(x=>x.fields.launchPackPart===(role==='Video thumbnail'?'videoThumbnail':'socialImage'))||data.byId.get(id);return {role,record,src:photo(record,data),alt:record?.fields.imageAlt,credit:record?.fields.imageCredit};
  })];
 const seconds=Number(f.introductionScriptTimingEstimateSeconds),timing=Number.isFinite(seconds)&&seconds>0?'Estimated narration: '+Math.round(seconds)+' seconds. Confirm the length after recording.':'Narration length has not been estimated.';
 const nav=[['overview','Overview'],['landing','Landing page'],['video','Intro video'],['email','Welcome email'],['social','Social post'],['images','Images']];
 return '<article class="launch-pack"><nav aria-label="Launch pack sections">'+nav.map(([id,label])=>'<a href="#launch-'+id+'">'+label+'</a>').join('')+'</nav>'+
  '<section id="launch-overview" class="launch-overview">'+(hero?'<img class="launch-hero" src="'+esc(hero)+'" alt="'+esc(f.imageAlt||f.heroImageAlt||'Course hero image')+'">':'')+'<div><p class="launch-kicker">Course launch pack</p><h2>Make the course ready to share</h2>'+paragraphs(f.introduction)+(course&&canReadContent(data,course)?'<a href="'+url('item',{id:course.id})+'">Open course &amp; lesson structure →</a>':'')+'</div></section>'+
  '<div class="launch-overview-details"><section><h3>Who it is for</h3>'+paragraphs(f.audience)+'</section><section><h3>Learning outcomes</h3>'+paragraphs(f.outcome)+'</section></div>'+
  section('landing','Landing page copy',f.marketingCopy)+
  section('video','Introduction video script',f.introductionScript,'<p class="launch-timing">'+esc(timing)+'</p>')+
  section('email','Welcome email',f.welcomeEmail)+section('social','Social post',f.socialCopy)+
  '<section id="launch-images" class="launch-section"><header><h2>Images</h2><span class="meta">'+images.filter(i=>i.src).length+' / 3 added</span></header><div class="launch-image-grid">'+images.map(i=>'<figure><h3>'+i.role+'</h3>'+(i.src?'<a href="'+esc(i.src)+'" target="_blank" rel="noopener"><img src="'+esc(i.src)+'" alt="'+esc(i.alt||i.role)+'" loading="lazy"></a><figcaption>'+esc(i.credit||'Credit not added')+'</figcaption><a class="btn" href="'+esc(i.src)+'" download="'+esc(i.role.toLowerCase().replaceAll(' ','-'))+'.png">Download image</a>':'<p class="meta">Not added yet.</p>')+'</figure>').join('')+'</div></section>'+
  (children.length?'<section class="launch-section"><h2>Launch pack contents</h2><ul>'+children.map(child=>'<li><a href="'+url('item',{id:child.id})+'">'+esc(child.title)+'</a> · '+esc(child.status)+'</li>').join('')+'</ul></section>':'')+
  '<details class="launch-notes"><summary>Production notes &amp; original brief</summary>'+paragraphs(f.productionNotes||'This launch pack is a draft. Check the copy and images before use.')+'<details><summary>Original worker submission</summary><pre>'+esc(f.body||'')+'</pre></details></details></article>';
}
