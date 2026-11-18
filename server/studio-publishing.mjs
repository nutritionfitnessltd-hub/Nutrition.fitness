import {HttpError} from './platform.mjs';
import {editable} from './studio-store.mjs';
import {issues} from './studio-model.mjs';
import {esc,url,form,hidden,button,heading} from './studio-ui.mjs';
import {articleHtml} from './studio-articles.mjs';

export const testOrigin='https://nutrition-fitness-website-2.vercel.app';
export const liveOrigin='https://nutrition.fitness';
export const releasePath=id=>'/content/'+encodeURIComponent(id)+'/';
export function releaseEnvironment(req){
 const host=String(req.headers.host||'').toLowerCase();
 if(host===new URL(testOrigin).host)return 'test';
 if(host===new URL(liveOrigin).host||host==='www.nutrition.fitness')return 'live';
 throw new HttpError(404,'This release is unavailable on this website.');
}
export function publicationPanel(r,data){
 if(data.actor.role!=='admin')return '';
 const releases=data.releases||[],test=releases.find(x=>x.item_id===r.id&&x.environment==='test'),live=releases.find(x=>x.item_id===r.id&&x.environment==='live');
 const approved=r.status==='Approved'&&r.approval?.revision===r.revision, currentTest=test?.source_revision===r.revision;
 return '<section class="panel studio-publishing"><h2>Publish this content</h2><p>Approve the draft, check it on the test website, then give final approval for nutrition.fitness.</p>'+
  (test?'<p>Test website · version '+test.source_revision+' '+button('View test page',testOrigin+releasePath(r.id))+'</p>':'')+
  (live?'<p>Live · version '+live.source_revision+' '+button('View live page',liveOrigin+releasePath(r.id))+'</p>':'')+
  (!approved?'<p>Submit this draft for approval before publishing.</p>':form('publish-test',hidden('revision',r.revision),{section:'item',id:r.id},currentTest?'Update test website':'Publish to test website'))+
  (approved&&currentTest&&data.livePublishingReady?form('publish-live',hidden('revision',r.revision)+'<label class="check"><input type="checkbox" name="finalApproval" value="yes" required> I checked this version on the test website and approve it for nutrition.fitness.</label>',{section:'item',id:r.id},'Give final approval & publish live'):approved&&currentTest?'<p>Live publishing will be available when nutrition.fitness is connected. This test version is ready for your review.</p>':'')+'</section>';
}
export async function publishStudio(params,f,data,api){
 if(data.actor.role!=='admin')throw new HttpError(403,'Only the administrator can publish content.');
 const r=editable(data,params.get('id')),target=f.action==='publish-test'?'test':f.action==='publish-live'?'live':null;
 if(!target)throw new HttpError(400,'Choose a publication action.');
 if(Number(f.revision)!==r.revision)throw new HttpError(409,'Content changed. Reopen the latest copy.');
 if(r.status!=='Approved'||r.approval?.revision!==r.revision)throw new HttpError(400,'Approve this saved version before publishing.');
 const missing=issues(r,data.items);if(missing.length)throw new HttpError(400,missing.join(' '));
 if(target==='live'&&f.finalApproval!=='yes')throw new HttpError(400,'Confirm your final approval after checking the test website.');
 if(target==='live'&&!data.livePublishingReady)throw new HttpError(503,'The live nutrition.fitness website is not connected for publishing yet. Your test release is unchanged.');
 await api('/rest/v1/rpc/nufi_studio_release',{service:true,method:'POST',payload:{item:r.id,expected:r.revision,target,approved_by:data.actor.id}});
 return {section:'item',id:r.id,notice:target==='test'?'test-published':'live-published'};
}
export function markdownArticle(text){
 // Imported prose stays data: HTML is escaped, and only HTTPS links are rendered.
 return String(text||'').split(/\n\s*\n/).map(p=>{
  const content=esc(p).replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g,'<a href="$2" rel="noopener noreferrer">$1</a>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
  const h=/^(#{1,4}) (.*)$/.exec(content);return h?'<h'+Math.min(4,h[1].length+1)+'>'+h[2]+'</h'+Math.min(4,h[1].length+1)+'>':'<p>'+content.replaceAll('\n','<br>')+'</p>';
 }).join('');
}
export function releaseBody(r,image=''){
 const f=r.fields||{};let content='';
 if(r.kind==='recipe')content='<h2>Ingredients</h2><ul>'+(f.ingredients||[]).map(v=>'<li>'+esc(v)+'</li>').join('')+'</ul><h2>Method</h2><ol>'+(f.instructions||[]).map(v=>'<li>'+esc(v)+'</li>').join('')+'</ol>';
 else content=f.bodyFormat==='html'?articleHtml(f.body):markdownArticle(f.body||f.introduction||f.purpose||f.brief||'');
 return '<h1>'+esc(r.title)+'</h1>'+(image?'<figure><img class="studio-article-photo" src="'+esc(image)+'" alt="'+esc(f.imageAlt||'')+'"><figcaption>'+esc(f.imageCredit||'')+'</figcaption></figure>':'')+content;
}
export async function publishedContent(req,res,params,api,sendImage){
 const environment=releaseEnvironment(req),id=params.get('id'),mode=params.get('view');
 if(mode==='studio-feed'){
  const rows=await api('/rest/v1/nufi_studio_releases?select=item_id,payload,published_at&environment=eq.'+environment+'&payload->>kind=eq.article&order=published_at.desc&limit=500',{service:true});
  res.setHeader('Content-Type','application/json; charset=utf-8');return res.end(JSON.stringify(rows.map(r=>({id:r.item_id,title:r.payload.title,summary:r.payload.fields?.introduction||'',category:r.payload.fields?.category||'problems',topics:r.payload.fields?.topics||[],situations:r.payload.fields?.situations||[],priority:0,status:'published',publishedAt:r.published_at.slice(0,10),href:releasePath(r.item_id)}))));
 }
 if(!id||id.length>250)throw new HttpError(404,'Content unavailable.');
 const rows=await api('/rest/v1/nufi_studio_releases?select=payload,source_revision&item_id=eq.'+encodeURIComponent(id)+'&environment=eq.'+environment,{service:true});
 const r=rows[0]?.payload;if(!r)throw new HttpError(404,'This content has not been published here.');
 if(mode==='studio-release-image')return sendImage(r);
 const image=r.workerImage||r.articleImage?'/api/content?view=studio-release-image&id='+encodeURIComponent(id):'';
 res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('X-Robots-Tag',environment==='test'?'noindex, nofollow':'index, follow');
 return res.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(r.title)+' | nutrition.fitness</title><link rel="stylesheet" href="/studio.css"></head><body><header class="panel"><a href="/">nutrition.fitness®</a>'+(environment==='test'?'<p>Test website · awaiting final live approval</p>':'')+'</header><main class="studio-article">'+releaseBody(r,image)+'<p><a href="/knowledge-centre/">Back to Knowledge Centre</a></p></main></body></html>');
}
