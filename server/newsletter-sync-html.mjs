import {Parser} from 'htmlparser2';
import {createHash} from 'node:crypto';
import {HttpError} from './platform.mjs';
import {esc} from './studio-ui.mjs';
import {trustedGhlImage} from './ghl-newsletter-client.mjs';
export const digest=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
export const newsletterCopy=value=>String(value||'').replace(/(?:&[mn]dash;|&#(?:8211|8212);|&#x201[34];)/gi,', ').replace(/\s*(?:--+|[\u2013\u2014])\s*/g,', ');
const tokens=['GREETING_IMAGE_URL','HERO_IMAGE_URL','SIGNATURE_IMAGE_URL'];
export const newsletterEligible=r=>r.workerId==='nina'&&r.kind==='communication'&&['Draft','In review','Changes requested','Approved'].includes(r.status)&&
 (r.workerSource?.kind==='newsletter'||/\bnewsletter\b/i.test([r.fields?.contentType,r.fields?.type,r.fields?.channel,r.title].filter(Boolean).join(' ')));
function publicImage(value){
 let u;try{u=new URL(value);}catch{throw new HttpError(400,'A newsletter image needs a valid HTTPS address.');}
 const h=u.hostname.toLowerCase();
 if(u.protocol!=='https:'||u.username||u.password||u.port||!h.includes('.')||/^(?:localhost|127\.|0\.|10\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(h)||h.includes(':')||/\.(?:local|internal|localhost)$/.test(h))throw new HttpError(400,'Use a public HTTPS image address.');
 return u.href;
}
function raster(value){
 const m=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
 if(!m)throw new HttpError(400,'Use PNG, JPEG or WebP newsletter images.');
 const bytes=Buffer.from(m[2],'base64');if(bytes.length<24||bytes.length>6000000)throw new HttpError(400,'Use newsletter images up to 6 MB.');
 const valid=m[1]==='png'?bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a':m[1]==='jpeg'?bytes.subarray(0,3).toString('hex')==='ffd8ff':bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
 if(!valid)throw new HttpError(400,'The newsletter image bytes do not match the image type.');
 return {bytes,type:'image/'+m[1],extension:m[1]==='jpeg'?'jpg':m[1]};
}
export function newsletterSource(record,assets){
 const f=record.fields||{},body=f.body||f.plainText||'';
 if(f.emailHtml!==undefined&&typeof f.emailHtml!=='string')throw new HttpError(400,'Save valid newsletter HTML before syncing.');
 let html=f.emailHtml?.trim();
 if(!html){
  if(!body.trim())throw new HttpError(400,'The newsletter needs saved copy before syncing.');
  html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#FAF6EF;color:#092A3E;font-family:Arial,sans-serif"><table role="presentation" width="100%"><tr><td align="center"><table role="presentation" width="640" style="max-width:640px;width:100%;background:white"><tr><td style="padding:30px 24px;border-top:5px solid #863954"><p style="font-size:26px"><strong>nutrition</strong>.fitness</p><h1>'+esc(record.title)+'</h1>'+body.split(/\n\s*\n/).map(p=>'<p style="font-size:17px;line-height:1.65">'+esc(p).replaceAll('\n','<br>')+'</p>').join('')+'<p><a href="{{email.unsubscribe_link}}">Unsubscribe</a></p></td></tr></table></td></tr></table></body></html>';
 }
 if(html.length>500000)throw new HttpError(400,'The newsletter HTML is too large.');
 const images=assets?.itemId===record.id?assets.images||{}:{};
 for(const token of tokens){
  if(!html.includes('{{'+token+'}}'))continue;
  const value=images[token]||f.newsletterImages?.[token]||(trustedGhlImage(f.ghlImageUrls?.[token])?f.ghlImageUrls[token]:null);
  if(!value)throw new HttpError(400,'Add the '+token.replaceAll('_',' ').toLowerCase()+' before syncing.');
  html=html.replaceAll('{{'+token+'}}',value);
 }
 html=html.replaceAll('{{FIRST_NAME_OR_THERE}}','{{default contact.first_name "there"}}').replaceAll('{{UNSUBSCRIBE_URL}}','{{email.unsubscribe_link}}').replaceAll('{{default contact.firstname "there"}}','{{default contact.first_name "there"}}');
 if(/\{\{[A-Z][A-Z_]+\}\}/.test(html))throw new HttpError(400,'Replace the newsletter’s unfinished image or link placeholders.');
 const edits=[],pictures=[];let ignored=0;
 const parser=new Parser({
  onopentag(name,attrs){
   if(['style','script'].includes(name))ignored++;
   if(['script','iframe','form','object','embed'].includes(name)||Object.keys(attrs).some(k=>/^on/i.test(k))||/^(?:javascript|vbscript|data):/i.test(attrs.href||''))throw new HttpError(400,'Remove active scripts from newsletter HTML.');
   if(name!=='img')return;
   if(pictures.length>=20)throw new HttpError(400,'Use up to 20 newsletter images.');
   if(!attrs.src)throw new HttpError(400,'A newsletter image is missing its source.');
   const source=attrs.src.startsWith('data:')?raster(attrs.src):publicImage(attrs.src);
   const key=digest(typeof source==='string'?source:source.bytes);
   pictures.push({key,source,start:parser.startIndex,end:parser.endIndex+1,raw:html.slice(parser.startIndex,parser.endIndex+1)});
  },
  onclosetag(name){if(['style','script'].includes(name))ignored--;},
  ontext(){if(ignored)return;const raw=html.slice(parser.startIndex,parser.endIndex+1),next=newsletterCopy(raw);if(next!==raw)edits.push({start:parser.startIndex,end:parser.endIndex+1,value:next});}
 },{decodeEntities:true});parser.write(html);parser.end();
 const payload={name:newsletterCopy(record.title).slice(0,200),editorType:'html',subject:newsletterCopy(f.subject||record.title).slice(0,500),previewText:newsletterCopy(f.previewText||'').slice(0,1000),fromName:newsletterCopy(f.fromName||'James & Kasia | nutrition.fitness'),fromEmail:f.fromEmail||'hello@nutrition.fitness'};
 if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(payload.fromEmail))throw new HttpError(400,'Choose a valid newsletter sender address.');
 return {html,edits,pictures,payload,fingerprint:digest([html,payload])};
}
export async function newsletterPayload(source,media,upload,persist){
 const edits=[...source.edits];
 for(const image of source.pictures){
  let address=media[image.key];
  if(!trustedGhlImage(address)){
   address=trustedGhlImage(image.source)?image.source:await upload(image.source,'nufi-newsletter-'+image.key.slice(0,24)+'.'+(image.source.extension||'png'));
   media[image.key]=address;await persist();
  }
  const raw=image.raw.replace(/\bsrc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i,'src="'+esc(address)+'"');
  edits.push({start:image.start,end:image.end,value:raw});
 }
 let html=source.html;for(const e of edits.sort((a,b)=>b.start-a.start))html=html.slice(0,e.start)+e.value+html.slice(e.end);
 return {...source.payload,editorContent:html};
}
