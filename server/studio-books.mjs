import { canAccess, canReadContent, canEditContent } from './library-permissions.mjs';
import {get} from '@vercel/blob';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {HttpError} from './platform.mjs';
import {readable} from './studio-store.mjs';
import {esc,url,button,badge} from './studio-ui.mjs';

export const bookAssetUrl=(id,asset)=>url('book-file',{id,asset});
export function bookFile(params,data){
 const r=data.byId.get(params.get('id')),key=params.get('asset');
 if(r?.kind!=='ebook'||!['front','back','digital','print'].includes(key))throw new HttpError(404,'Book file unavailable.');
 if(key==='digital'||key==='print')readable(data,r.id);
 const file=r.bookAssets?.[key];
 const type=key==='front'||key==='back'?'image/webp':'application/pdf';
 if(!file||file.type!==type||!/^nutrition-library\/books\/v1\/[a-f0-9]{64}\.(?:pdf|webp)$/.test(file.pathname)||!file.pathname.endsWith(type==='image/webp'?'.webp':'.pdf'))throw new HttpError(404,'This book file has not been added yet.');
 return file;
}
export async function sendBookFile(req,res,params,data,fetchFile=name=>get(name,{access:'private'})){
 if(req.method!=='GET')throw new HttpError(405,'Use GET to open a book file.');
 const file=bookFile(params,data),result=await fetchFile(file.pathname);
 if(!result?.stream)throw new HttpError(404,'Book file unavailable.');
 res.setHeader('Cache-Control','private, no-store, max-age=0');
 res.setHeader('Content-Type',file.type);
 if(file.type==='application/pdf')res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'self'; base-uri 'none'");
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Content-Disposition',`inline; filename*=UTF-8''${encodeURIComponent(file.name)}`);
 res.statusCode=200;await pipeline(Readable.fromWeb(result.stream),res);
}
export function bookPage(r,data){
 const allowed=canReadContent(data,r),f=r.fields||{};
 const asset=(key,title)=>'<section class="panel"><h2>'+title+'</h2>'+(r.bookAssets?.[key]?'<a href="'+bookAssetUrl(r.id,key)+'" target="_blank" rel="noopener"><img class="studio-book-cover" src="'+bookAssetUrl(r.id,key)+'" alt="'+esc(r.title+' — '+title)+'" loading="lazy"></a>':'<p>Not added yet.</p>')+'</section>';
 const edition=(key,title,note)=>'<section class="panel"><h2>'+title+'</h2><p>'+esc(note)+'</p>'+(r.bookAssets?.[key]?(allowed?'<a class="btn" href="'+bookAssetUrl(r.id,key)+'" target="_blank" rel="noopener">Open '+title+'</a>':'<p>Available to administrators and the team assigned to this book.</p>'):'<p class="studio-status">Not available yet</p>')+'</section>';
 const reading=r.bookAssets?.digital&&allowed;
 const pdf=bookAssetUrl(r.id,'digital')+'#view=Fit&amp;pagemode=none';
 return '<a class="back" href="'+url('library',{bucket:r.publication?.status==='published'?'published':'drafts',kind:'ebook'})+'">← Books</a>'+
 '<header class="studio-book-banner">'+(r.bookAssets?.front?'<img class="studio-book-banner-cover" src="'+bookAssetUrl(r.id,'front')+'" alt="'+esc(r.title+' cover')+'">':'')+
 '<div class="studio-book-banner-title"><p class="studio-book-eyebrow">'+esc(f.bookType||'Book')+'</p><h1>'+esc(r.title)+'</h1><p>'+badge(r.status)+(f.pageCount?' · '+esc(f.pageCount)+' pages':'')+'</p></div>'+
 (reading?'<a class="btn primary" href="'+pdf+'" target="_blank" rel="noopener">Open full screen</a>':'')+'</header>'+
 (reading?'<iframe class="studio-book-reader" src="'+pdf+'" title="'+esc('Read '+r.title)+'"></iframe>':'<p>'+(r.bookAssets?.digital?'Available to administrators and the team assigned to this book.':'The reading PDF has not been added yet.')+'</p>')+
 '<div class="studio-actions">'+button('Supporting content',url('collection',{id:r.id}))+'</div>'+
 '<details class="panel studio-book-details"><summary>Book details &amp; files</summary>'+
 (f.editionNote?'<p class="prose">'+esc(f.editionNote)+'</p>':'')+
 '<div class="studio-columns">'+asset('front','Front cover')+asset('back','Back cover')+'</div>'+
 '<div class="studio-columns">'+edition('digital','Reading PDF',f.digitalStatus||'Existing digital edition.')+edition('print','Print PDF',f.printStatus||'Print production has not been completed.')+'</div>'+
 (canEditContent(data,r.id)?button('Edit book details',url('item',{id:r.id,tab:'edit'})):'')+'</details>';
}
