import {canReadContent,canEditContent} from './library-permissions.mjs';
import {workerImagePath} from './worker-images.mjs';
import {esc,url,heading,button,badge} from './studio-ui.mjs';

export const launchPackParts=[
 ['overview','Course overview, outcomes & audience','marketing'],
 ['landingPage','Landing-page copy','marketing'],['introScript','Introduction video script','marketing'],
 ['welcomeEmail','Welcome email','email'],['socialCopy','Social launch copy','marketing'],
 ['hero','Course hero image','asset'],['videoThumbnail','Video thumbnail','asset'],['socialImage','Social image','asset']
];
export function launchPackParent(record,data){
 const id=record?.fields?.launchPackId||record?.parent,parent=id&&data.byId.get(id);
 return parent&&parent.id!==record.id&&parent.fields?.coursePack===true&&parent.status!=='Archived'&&canReadContent(data,parent)&&(!record.fields?.courseId||!parent.fields.courseId||record.fields.courseId===parent.fields.courseId)?parent:null;
}
export function launchPackChildren(pack,data){
 return data.items.filter(r=>r.status!=='Archived'&&canReadContent(data,r)&&launchPackParent(r,data)?.id===pack.id);
}
export function launchPackPage(pack,data){
 const children=launchPackChildren(pack,data),f=pack.fields||{};
 const image=r=>r.workerImage?.bucket==='worker-content'&&workerImagePath(r.workerImage.path)?url('article-image',{id:r.id}):'';
 const part=r=>r.fields?.launchPackPart||(f.videoThumbnailAssetId===r.id?'videoThumbnail':f.socialImageAssetId===r.id?'socialImage':'');
 const card=r=>{const src=image(r);return '<article class="panel"><h3><a href="'+url('item',{id:r.id})+'">'+esc(r.title)+'</a></h3><p>'+badge(r.status)+'</p>'+(src?'<a href="'+url('item',{id:r.id})+'"><img class="launch-pack-image" src="'+src+'" alt="'+esc(r.fields.imageAlt||r.title)+'" loading="lazy"></a>':'')+'</article>';};
 return heading(pack.title,'One launch pack. Review each deliverable separately.',canEditContent(data,pack.id)?button('Edit pack',url('item',{id:pack.id,tab:'edit'})):'')+
  (f.courseId&&data.byId.has(f.courseId)?'<p>'+button('Open course',url('item',{id:f.courseId}))+'</p>':'')+
  (f.introduction?'<p class="prose">'+esc(f.introduction)+'</p>':'')+
  '<section class="launch-pack-contents"><h2>Launch pack contents</h2>'+launchPackParts.map(([key,label])=>{
   const rows=children.filter(r=>part(r)===key);
   const attached=key==='hero'&&!rows.length&&image(pack);
   return '<details class="panel"'+(rows.length||attached?' open':'')+'><summary>'+esc(label)+' · '+(rows.length?rows.length+' saved':attached?'Attached to pack':'Not saved separately yet')+'</summary>'+rows.map(card).join('')+(attached?'<figure><img class="launch-pack-image" src="'+attached+'" alt="'+esc(f.imageAlt||f.heroImageAlt||'Course hero image')+'" loading="lazy"></figure>':'')+'</details>';
  }).join('')+children.filter(r=>!launchPackParts.some(([key])=>part(r)===key)).map(card).join('')+'</section>';
}
