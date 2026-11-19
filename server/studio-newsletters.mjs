import {cleanNewsletterHtml} from './generated/newsletter-sanitize.mjs';
import {displayEntry} from './library-display.mjs';
import {HttpError} from './platform.mjs';
import {esc, url, button} from './studio-ui.mjs';

export const isNewsletter = r => r?.kind==='communication' && typeof r.fields?.emailHtml==='string' && !!r.fields.emailHtml.trim();
const tokens=['GREETING_IMAGE_URL','HERO_IMAGE_URL','SIGNATURE_IMAGE_URL'];
const raster=/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
export function newsletterDocument(r,assets){
  let html=r.fields.emailHtml;
  // Artwork belongs to this draft. Never resolve an arbitrary private asset reference.
  if(assets?.itemId===r.id)for(const token of tokens){
    const image=assets.images?.[token];
    if(typeof image==='string'&&image.length<2_000_000&&raster.test(image))html=html.replaceAll('{{'+token+'}}',image);
  }
  html=html.replaceAll('{{FIRST_NAME_OR_THERE}}','there');
  return '<!doctype html>'+cleanNewsletterHtml(html);
}
export function newsletterPreview(r){
  const files=[['emailPreviewUrl','Open original design'],['designPackUrl','Download pack'],['outlookDraftUrl','Outlook draft']].filter(([key])=>/^https:\/\//i.test(r.fields[key]||''));
  return '<section class="newsletter-design" data-newsletter-design aria-label="Newsletter design">'+
    '<div class="newsletter-toolbar"><div class="newsletter-view" role="group" aria-label="Preview width"><button type="button" data-newsletter-width="desktop" aria-pressed="true">Desktop</button><button type="button" data-newsletter-width="mobile" aria-pressed="false">Mobile</button></div><div class="studio-actions"><button type="button" data-copy-newsletter>Copy HTML</button>'+button('Download HTML',url('newsletter-html',{id:r.id}))+'</div></div>'+
    '<p class="meta">Designed email preview · Personalisation and sending details are completed in your email platform.</p><span role="status" data-newsletter-status></span>'+
    '<textarea hidden data-newsletter-source>'+esc(r.fields.emailHtml)+'</textarea>'+
    (!r.newsletterAssetsId&&tokens.some(token=>r.fields.emailHtml.includes('{{'+token+'}}'))?'<p class="notice">The HTML layout is saved. Its image placeholders still need linking; the original design is available under Design files.</p>':'')+
    '<div class="newsletter-canvas"><iframe title="Newsletter design preview" sandbox="" referrerpolicy="no-referrer" src="'+url('newsletter-preview',{id:r.id})+'"></iframe></div>'+
    '<details class="panel"><summary>Plain-text version</summary><p><strong>Subject:</strong> '+esc(r.fields.subject||'')+'</p><pre class="newsletter-plain">'+esc(r.fields.plainText||r.fields.body||'')+'</pre></details>'+
    (files.length?'<details class="panel"><summary>Design files</summary><div class="studio-actions">'+files.map(([key,label])=>'<a class="btn" href="'+esc(r.fields[key])+'" target="_blank" rel="noopener noreferrer">'+label+'</a>').join('')+'</div></details>':'')+'</section>';
}
export async function sendNewsletter(req,res,r,section,env,loadAssets=displayEntry){
  if(req.method!=='GET')throw new HttpError(405,'Use GET to open this newsletter.');
  if(!isNewsletter(r))throw new HttpError(404,'Newsletter unavailable.');
  res.statusCode=200;
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox");
  if(section==='newsletter-html'){
    const filename=(r.title||'newsletter').normalize('NFKD').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').slice(0,120)||'newsletter';
    res.setHeader('Content-Type','application/octet-stream');
    res.setHeader('Content-Disposition','attachment; filename="'+filename+'.html"');
    return res.end(r.fields.emailHtml);
  }
  const assets=/^newsletter-artwork:[a-f0-9-]{36}$/.test(r.newsletterAssetsId||'')?await loadAssets(env,r.newsletterAssetsId):null;
  res.setHeader('Content-Type','text/html; charset=utf-8');
  return res.end(newsletterDocument(r,assets));
}
