import {HttpError} from './platform.mjs';
import {editable} from './studio-store.mjs';
import {issues} from './studio-model.mjs';
import {isNewsletterContent} from './studio-newsletters.mjs';
import {esc,url,form,hidden,button,heading} from './studio-ui.mjs';
import {articleHtml} from './article-format.mjs';
import {readerDocument,markdownArticle} from './article-reader.mjs';
export {markdownArticle} from './article-reader.mjs';

export const testOrigin='https://nutrition-fitness-website-2.vercel.app';
export const liveOrigin='https://nutrition.fitness';
export function publicationDestination(env={}){return env.NUFI_STUDIO_PUBLISH_TARGET==='vercel'?{environment:'test',origin:testOrigin,label:'the Vercel website',ready:true}:{environment:'live',origin:liveOrigin,label:'nutrition.fitness',ready:env.NUFI_STUDIO_LIVE_READY==='true'};}
export const releasePath=id=>'/content/'+encodeURIComponent(id)+'/';
export function releaseEnvironment(req){
 const host=String(req.headers.host||'').toLowerCase();
 if(host===new URL(testOrigin).host)return 'test';
 if(host===new URL(liveOrigin).host||host==='www.nutrition.fitness')return 'live';
 throw new HttpError(404,'This release is unavailable on this website.');
}
export function publicationPanel(r,data){
 if(data.actor.role!=='admin'||isNewsletterContent(r))return '';
 const approved=r.status==='Approved'&&r.approval?.revision===r.revision;
 const label=approved?'Open approved content options':'Review & approve';
 return '<section class="panel studio-publishing"><h2>'+(approved?'Approved content':'Review this content')+'</h2><p>'+(approved?'Choose the next step for this approved version.':'Open the preview to approve this saved version or request changes.')+'</p>'+button(label,url('review-preview',{id:r.id}),true).replace('<a ','<a data-review-preview target="_blank" rel="noopener" ')+(!['article'].includes(r.kind)?'<p class="meta">Approved content stays in the library. Assign the next step to staff when needed.</p>':'')+'</section>';

}
export async function publishStudio(params,f,data,api){
 if(data.actor.role!=='admin')throw new HttpError(403,'Only the administrator can publish content.');
 const r=editable(data,params.get('id')),target=f.action==='publish-test'?'test':f.action==='publish-live'?'live':null;
 if(isNewsletterContent(r))throw new HttpError(400,'Newsletters are approved for GHL, not published to the website.');
 if(!target)throw new HttpError(400,'Choose a publication action.');
 if(Number(f.revision)!==r.revision)throw new HttpError(409,'Content changed. Reopen the latest copy.');
 if(r.status!=='Approved'||r.approval?.revision!==r.revision)throw new HttpError(400,'Approve this saved version before publishing.');
 const missing=issues(r,data.items);if(missing.length)throw new HttpError(400,missing.join(' '));
 if(target==='live'&&f.finalApproval!=='yes')throw new HttpError(400,'Confirm your final approval after checking the test website.');
 if(target==='live'&&!data.livePublishingReady)throw new HttpError(503,'The live nutrition.fitness website is not connected for publishing yet. Your test release is unchanged.');
 await api('/rest/v1/rpc/nufi_studio_release',{service:true,method:'POST',payload:{item:r.id,expected:r.revision,target,approved_by:data.actor.id}});
 return {section:'item',id:r.id,notice:target==='test'?'test-published':'live-published'};
}
export function releaseBody(r,image=''){
 const f=r.fields||{};let content='';
 if(r.kind==='recipe')content='<h2>Ingredients</h2><ul>'+(f.ingredients||[]).map(v=>'<li>'+esc(v)+'</li>').join('')+'</ul><h2>Method</h2><ol>'+(f.instructions||[]).map(v=>'<li>'+esc(v)+'</li>').join('')+'</ol>';
 else content=f.bodyFormat==='html'?articleHtml(f.body):markdownArticle(f.body||f.introduction||f.purpose||f.brief||'');
 return '<h1>'+esc(r.title)+'</h1>'+(image?'<figure><img class="studio-article-photo" src="'+esc(image)+'" alt="'+esc(f.imageAlt||'')+'"><figcaption>'+esc(f.imageCredit||'')+'</figcaption></figure>':'')+content;
}
export async function publishedContent(req,res,params,api,sendImage,env={}){
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
 if(r.kind==='article')return res.end(readerDocument(r,image,environment==='test'&&env.NUFI_STUDIO_PUBLISH_TARGET!=='vercel'?'Test website · awaiting final live approval':'',environment!=='live'));
 return res.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(r.title)+' | nutrition.fitness</title><link rel="stylesheet" href="/studio.css"></head><body><header class="panel"><a href="/">nutrition.fitness®</a>'+(environment==='test'?'<p>Test website · awaiting final live approval</p>':'')+'</header><main class="studio-article">'+releaseBody(r,image)+'<p><a href="/knowledge-centre/">Back to Knowledge Centre</a></p></main></body></html>');
}
