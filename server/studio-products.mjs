import {randomUUID,createHash} from 'node:crypto';
import {unifiedProductPage} from './studio-product-page.mjs';
import {workerImagePath} from './worker-images.mjs';
import {productCostsPage} from './studio-product-costs.mjs';
import {HttpError,uuid} from './platform.mjs';
import {cleanText} from './studio-model.mjs';
import {readable,editable,saveRecord,projectFor} from './studio-store.mjs';
import {canAccess,canEditContent,canReviewContent,requireAccess} from './library-permissions.mjs';
import {changeStudio} from './studio-actions.mjs';
import {esc,url,heading,button,hidden,input,textarea,select,form,pages} from './studio-ui.mjs';

export const productCategories=['Supplements','Equipment','Clothing','Accessories','Other'];
export const productStages=['Idea','In development','Ready to launch','Live','Retired'];
export const assetTypes=['Product photo','Lifestyle image','Photography','Packaging & labels','Mock-up','Video','Ad copy','Social graphic','Website copy','Supplier document','Other'];
export const channels=['Unspecified','Meta','Instagram','Facebook','TikTok','Google','YouTube','Email','Website','Print','Other'];
const assetStates={'Draft':'Draft','In review':'Needs review','Changes requested':'Changes requested','Approved':'Approved','Archived':'Retired'};
const options=values=>Object.fromEntries(values.map(v=>[v,v]));
export const isProductAsset=r=>r?.kind==='asset'&&r.fields?.productAsset===true;
export const productStoragePrefix=id=>'nutrition-library/product-assets/v1/'+createHash('sha256').update(id).digest('hex')+'/';
export const productRecords=data=>data.items.filter(r=>r.kind==='product');
const assets=data=>data.items.filter(isProductAsset);
const linked=(data,id)=>assets(data).filter(r=>r.fields.productIds?.includes(id));
const stateBadge=r=>'<span class="product-state state-'+esc(r.status.toLowerCase().replaceAll(' ','-'))+'">'+esc(assetStates[r.status]||r.status)+'</span>';
export function productLink(value){
 if(!value)return '';
 try{const u=new URL(value);if(u.protocol==='https:'&&!u.username&&!u.password)return u.href;}catch{}
 return '';
}
function checkedLink(value){const text=cleanText(value||'',2000);if(text&&!productLink(text))throw new HttpError(400,'Use a complete HTTPS link.');return text;}
const recordId=value=>'studio:product:'+uuid(String(value||'').replace(/^studio:product:/,''));
const imageFile=r=>(r.productFiles||[]).find(f=>f.slot==='Thumbnail'&&f.type?.startsWith('image/'))||(r.productFiles||[]).find(f=>f.type?.startsWith('image/'));
export function productAssetImage(r){
 const f=imageFile(r);if(f)return url('product-file',{id:r.id,file:f.id,inline:'1'}).replaceAll('&amp;','&');
 if(r.workerImage?.bucket==='worker-content'&&workerImagePath(r.workerImage.path)&&['image/jpeg','image/png','image/webp'].includes(r.workerImage.type))return url('product-image',{id:r.id,v:r.workerImage.sha256||r.revision||''}).replaceAll('&amp;','&');
 return productLink(r.fields.thumbnailUrl);
}
export function productAssetPreview(r){
 const src=productAssetImage(r);
 return src?'<img src="'+esc(src)+'" alt="'+esc(r.fields.altText||r.title)+'" loading="lazy">':'<div class="product-placeholder" aria-hidden="true"><span>'+(r.fields.type==='Video'?'▶':r.fields.type==='Ad copy'?'Aa':'▧')+'</span><small>'+esc(r.fields.type||'Asset')+'</small></div>';
}
const productPhoto=(r,data)=>{const cover=linked(data,r.id).filter(a=>a.status!=='Archived').find(a=>a.id===r.fields.coverAssetId)||linked(data,r.id).find(a=>a.status!=='Archived'&&productAssetImage(a));return cover?productAssetPreview(cover):'<div class="product-placeholder product-placeholder-'+esc((r.fields.category||'Other').toLowerCase())+'" aria-hidden="true"><span>◒</span><small>'+esc(r.fields.category||'Product')+'</small></div>';};
function filters(section,params,body,keep={}){return '<form class="product-filters" action="/content-library/">'+hidden('work','1')+hidden('studio',section)+Object.entries(keep).map(([k,v])=>hidden(k,v)).join('')+input('q','Search',params.get('q')||'','search')+body+'<button>Filter</button></form>';}
function filterAssets(rows,params){const q=(params.get('q')||'').trim().toLowerCase();return rows.filter(r=>(!params.get('status')?r.status!=='Archived':r.status===params.get('status'))&&(!params.get('product')||r.fields.productIds?.includes(params.get('product')))&&(!params.get('campaign')||r.fields.campaign===params.get('campaign'))&&(!params.get('channel')||r.fields.channel===params.get('channel'))&&(!q||(r.title+' '+r.fields.campaign+' '+r.fields.body+' '+r.fields.type).toLowerCase().includes(q)));}
function assetFilters(rows,params,data){return select('status','Status',{'':'Active assets',...assetStates},params.get('status'))+select('campaign','Campaign',{'':'All campaigns',...options([...new Set(rows.map(r=>r.fields.campaign).filter(Boolean))].sort())},params.get('campaign'))+select('channel','Channel',{'':'All channels',...options(channels)},params.get('channel'));}
function assetGallery(rows,params,data){
 return pages(params,rows,batch=>batch.length?'<div class="product-gallery">'+batch.map(r=>'<a class="product-card" href="'+url('product-asset',{id:r.id})+'"><div class="product-card-image">'+productAssetPreview(r)+'</div><div class="product-card-body"><div class="product-card-meta"><span>'+esc(r.fields.category||r.fields.type)+'</span>'+stateBadge(r)+'</div><h2>'+esc(r.title)+'</h2><p>'+esc([r.fields.campaign,r.fields.channel!=='Unspecified'&&r.fields.channel,r.fields.dimensions].filter(Boolean).join(' · ')||'Product asset')+'</p><small>'+esc((r.fields.productIds||[]).map(id=>data.byId.get(id)?.title).filter(Boolean).join(' · ')||'Shared creative')+'</small></div></a>').join('')+'</div>':'<div class="product-empty"><h2>No assets here yet</h2><p>Add a file, Canva original, SharePoint link or copy draft.</p></div>',24);
}
export function productsPage(params,data){
 const all=productRecords(data),q=(params.get('q')||'').toLowerCase(),rows=all.filter(r=>(!params.get('category')||r.fields.category===params.get('category'))&&(!params.get('stage')?r.fields.stage!=='Retired':r.fields.stage===params.get('stage'))&&(!q||(r.title+' '+r.fields.sku+' '+r.fields.supplier).toLowerCase().includes(q)));
 return heading('Products','A home for your supplements, physical products and the creative work behind them.',button('All ads & creatives',url('product-creatives'))+(data.actor.role==='admin'?button('Add product',url('product',{id:'new'}),true):''))+
 '<div class="product-overview"><div><strong>'+all.filter(r=>r.fields.stage!=='Retired').length+'</strong><span>Active products</span></div><div><strong>'+assets(data).filter(r=>r.status==='In review').length+'</strong><span>Assets to review</span></div><div><strong>'+assets(data).filter(r=>r.status==='Approved').length+'</strong><span>Approved assets</span></div></div>'+
 filters('products',params,select('category','Category',{'':'All products',...options(productCategories)},params.get('category'))+select('stage','Progress',{'':'Active products',...options(productStages)},params.get('stage')))+
 pages(params,rows,batch=>batch.length?'<div class="product-gallery">'+batch.map(r=>{const files=linked(data,r.id).filter(a=>a.status!=='Archived');return '<a class="product-card" href="'+url('product',{id:r.id})+'"><div class="product-card-image">'+productPhoto(r,data)+'</div><div class="product-card-body"><div class="product-card-meta"><span>'+esc(r.fields.category)+'</span><span class="product-state">'+esc(r.fields.stage)+'</span></div><h2>'+esc(r.title)+'</h2><p>'+esc(r.fields.sku||r.fields.supplier||'Product workspace')+'</p><small>'+files.length+' assets · '+files.filter(a=>a.status==='Approved').length+' approved</small></div></a>';}).join('')+'</div>':'<div class="product-empty"><h2>Give your products a home</h2><p>Start with a supplement or another physical product, then bring its photographs, labels and adverts together.</p>'+(data.actor.role==='admin'?button('Add your first product',url('product',{id:'new'}),true):'<p>Your assigned products will appear here.</p>')+'</div>',24);
}
export function creativesPage(params,data){
 const rows=assets(data).filter(r=>r.fields.assetRole==='advert');
 return heading('Ads & creatives','Every product campaign, in one place.',button('Products',url('products'))+(data.actor.role==='admin'?button('Add creative',url('product-asset',{id:'new',role:'advert'}),true):''))+
 filters('product-creatives',params,select('product','Product',{'':'All products',...Object.fromEntries(productRecords(data).map(r=>[r.id,r.title]))},params.get('product'))+assetFilters(rows,params,data))+assetGallery(filterAssets(rows,params),params,data);
}
function productForm(params,data,values){
 const existing=params.get('id')!=='new'?editable(data,params.get('id')):null;
 if(existing&&existing.kind!=='product')throw new HttpError(404,'Product unavailable.');
 const f=values||{...existing?.fields,title:existing?.title,id:existing?.id||randomUUID(),revision:existing?.revision||0};
 const covers=existing?linked(data,existing.id).filter(productAssetImage):[];
 return heading(existing?'Edit '+existing.title:'Add a product','Keep the essentials together.',button('Back',existing?url('product',{id:existing.id}):url('products')))+
 form('product-save',hidden('id',f.id)+hidden('revision',f.revision)+input('title','Product name',f.title||'','text','maxlength="200" required')+'<div class="product-form-grid">'+select('category','Category',options(productCategories),f.category||'Supplements')+select('stage','Progress',options(productStages),f.stage||'Idea')+input('sku','SKU / product code',f.sku||'','text','maxlength="100"')+input('supplier','Supplier',f.supplier||'','text','maxlength="200"')+input('variants','Sizes, flavours or variants',f.variants||'','text','maxlength="1000"')+input('launchDate','Target launch date',f.launchDate||'','date')+'</div>'+textarea('description','Product description',f.description||'')+textarea('notes','Notes',f.notes||'',5)+input('folderUrl','Team folder link (optional)',f.folderUrl||'','url','placeholder="https://…" maxlength="2000"')+(covers.length?select('coverAssetId','Cover image',{'':'Choose automatically',...Object.fromEntries(covers.map(r=>[r.id,r.title]))},f.coverAssetId||''):'')+
 '<details class="product-details"><summary>Supplement information</summary>'+textarea('ingredients','Ingredients',f.ingredients||'')+textarea('nutrition','Nutrition information',f.nutrition||'')+textarea('usage','Suggested usage',f.usage||'')+'</details><section class="panel"><h2>Images, labels & creatives</h2><p>Save the product to upload product photos, lifestyle images, front and back labels, adverts and other creatives. You can select several files at once.</p></section>',{section:'product',id:params.get('id')},'Save product & add files');
}
function productUploader(r){
 return '<section class="panel product-upload" data-product-upload data-id="'+esc(r.id)+'" data-prefix="'+esc(productStoragePrefix(r.id))+'"><h2>Upload images, labels & creatives</h2><p>Choose a category, then select one or more files. Each file is saved with this product. Adverts appear in Ads & creatives.</p>'+select('fileSlot','File category',options(['Product photo','Lifestyle image','Front label','Back label','Advert / creative','Other']),'Product photo')+'<label>Choose files<input type="file" multiple data-product-file accept=".jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx,.pptx,.zip,.mp4,.webm,.mp3"></label><p>Images, PDFs, documents, video and editable ZIP files; up to 250 MB per file.</p><button class="primary" type="button" data-product-upload-button>Upload files</button><progress hidden max="100" value="0" aria-label="Upload progress"></progress><p role="status" aria-live="polite" data-product-upload-status></p></section><script type="module" src="/product-upload.js"></script>';
}
function productWork(r,data){
 const projects=data.projects.filter(p=>(r.fields.projectIds||[]).includes(p.id)||p.studio?.rootId===r.id||p.entries.some(e=>e.record===r.id||linked(data,r.id).some(a=>a.id===e.record)));
 const entries=projects.flatMap(p=>p.entries),done=entries.filter(e=>e.status==='Done').length;
 return '<div class="product-overview"><div><strong>'+projects.length+'</strong><span>Linked projects</span></div><div><strong>'+done+' / '+entries.length+'</strong><span>Tasks complete</span></div></div>'+
 (entries.length?'<progress class="product-progress" value="'+done+'" max="'+entries.length+'" aria-label="Product work completed"></progress>':'')+
 (projects.length?'<div class="product-work-list">'+projects.map(p=>'<a class="panel" href="'+url('project',{project:p.id})+'"><h2>'+esc(p.name)+'</h2><p>'+esc(p.status||'Planning')+' · '+p.entries.filter(e=>e.status==='Done').length+' of '+p.entries.length+' tasks complete</p><small>'+esc(data.people.find(x=>x.id===p.creator_id)?.name||'Assigned team')+'</small></a>').join('')+'</div>':'<p class="studio-empty">Link a project to track its tasks and launch progress here.</p>')+
 (data.actor.role==='admin'?'<details class="product-details"><summary>Link a project</summary>'+form('product-project-link',hidden('revision',r.revision)+select('projectId','Project',{'':'Choose a project',...Object.fromEntries(data.projects.filter(p=>!projects.some(x=>x.id===p.id)).map(p=>[p.id,p.name]))}),{section:'product',id:r.id},'Link project')+button('Create a project',url('project-create'))+'</details>':'');
}
export function productPage(params,data,values){
 if(params.get('id')==='new'){if(data.actor.role!=='admin')throw new HttpError(403,'An administrator can add products.');return productForm(params,data,values);}
 const r=readable(data,params.get('id'));if(r.kind!=='product')throw new HttpError(404,'Product unavailable.');
 if(params.get('tab')==='edit'||values)return productForm(params,data,values);
 if(params.get('tab')==='costs')return productCostsPage(params,data,r);
 const tab=params.get('tab')||'overview';
 if(!['overview','assets','creatives','work'].includes(tab))throw new HttpError(404,'Product tab unavailable.');
 return unifiedProductPage(r,data,{linked,productPhoto,productAssetPreview,productAssetImage,productWork,productUploader});
}
function assetForm(params,data,values){
 const existing=params.get('id')!=='new'?editable(data,params.get('id')):null;
 if(existing&&!isProductAsset(existing))throw new HttpError(404,'Product asset unavailable.');
 const f=values||{...existing?.fields,title:existing?.title,id:existing?.id||randomUUID(),revision:existing?.revision||0,productIds:existing?.fields.productIds||[params.get('product')].filter(Boolean),assetRole:existing?.fields.assetRole||params.get('role')||'product'};
 const products=productRecords(data).filter(p=>canEditContent(data,p.id)||existing?.fields.productIds?.includes(p.id));
 return heading(existing?'Edit asset':'Add '+(f.assetRole==='advert'?'creative':'asset'),'Save the details, then upload files or add your source links.',button('Back',existing?url('product-asset',{id:existing.id}):url('products')))+
 form('product-asset-save',hidden('id',f.id)+hidden('revision',f.revision)+input('title','Asset name',f.title||'','text','maxlength="200" required')+'<div class="product-form-grid">'+select('assetRole','Keep in',{'product':'Product assets','advert':'Ads & creatives'},f.assetRole)+select('type','Asset type',options(assetTypes),f.type||'Photography')+'</div><fieldset class="product-picks"><legend>Products</legend>'+products.map(p=>'<label><input type="checkbox" name="product_'+esc(p.id)+'" value="1"'+((f.productIds||[]).includes(p.id)?' checked':'')+'>'+esc(p.title)+'</label>').join('')+'</fieldset><div class="product-form-grid">'+input('campaign','Campaign (optional)',f.campaign||'','text','maxlength="200"')+select('channel','Channel',options(channels),f.channel||'Unspecified')+input('dimensions','Format / dimensions',f.dimensions||'','text','placeholder="e.g. 1080 × 1920 story" maxlength="120"')+input('altText','Image description',f.altText||'','text','maxlength="500"')+'</div>'+textarea('brief','Notes / creative brief',f.brief||'')+textarea('body','Ad copy / caption',f.body||'',6)+input('headline','Headline',f.headline||'','text','maxlength="300"')+input('callToAction','Call to action',f.callToAction||'','text','maxlength="300"')+'<details class="product-details"'+(!existing?' open':'')+'><summary>Originals, exports & preview links</summary>'+input('sourceUrl','Editable original (Canva or other HTTPS link)',f.sourceUrl||'','url','maxlength="2000"')+input('url','Finished file / SharePoint link',f.url||'','url','maxlength="2000"')+input('thumbnailUrl','Thumbnail image link (optional)',f.thumbnailUrl||'','url','maxlength="2000"')+'</details>',{section:'product-asset',id:params.get('id')},'Save draft');
}
export function productAssetPage(params,data,values){
 if(params.get('id')==='new'){
  if(data.actor.role!=='admin'){const p=editable(data,params.get('product'));if(p.kind!=='product')throw new HttpError(403,'Choose an assigned product.');}
  return assetForm(params,data,values);
 }
 const r=readable(data,params.get('id'));if(!isProductAsset(r))throw new HttpError(404,'Product asset unavailable.');
 if(params.get('tab')==='edit'||values)return assetForm(params,data,values);
 const preview=params.get('tab')==='review',edit=!preview&&canEditContent(data,r.id),f=r.fields,products=(f.productIds||[]).map(id=>data.byId.get(id)).filter(Boolean),review=!preview&&canReviewContent(data,r);
 return '<a class="back-link" href="'+(products[0]?url('product',{id:products[0].id,tab:f.assetRole==='advert'?'creatives':'assets'}):url('product-creatives'))+'">← '+esc(products[0]?.title||'Ads & creatives')+'</a>'+heading(r.title,[f.type,f.campaign].filter(Boolean).join(' · '),(edit?button('Edit details',url('product-asset',{id:r.id,tab:'edit'})):'')+(review&&canAccess(data.actor,'work')?button('Review asset',url('review-preview',{id:r.id})):'')+(edit?button('Version history',url('history',{id:r.id})):''))+
 '<div class="product-asset-layout"><div><div class="product-asset-large">'+productAssetPreview(r)+'</div><div class="product-file-list">'+(r.productFiles||[]).map(file=>'<div><div><strong>'+esc(file.name)+'</strong><small>'+esc(file.slot)+' · '+(file.bytes/1024/1024).toFixed(1)+' MB</small></div>'+button('Download',url('product-file',{id:r.id,file:file.id}))+'</div>').join('')+'</div>'+((r.productFiles||[]).some(file=>file.type?.startsWith('video/'))?(r.productFiles||[]).filter(file=>file.type?.startsWith('video/')).map(file=>'<video class="product-video" controls preload="none" aria-label="'+esc(file.name)+'" src="'+url('product-file',{id:r.id,file:file.id,inline:'1'})+'"></video>').join(''):'')+'</div><section class="panel product-asset-info">'+stateBadge(r)+'<dl class="product-facts">'+[['Campaign',f.campaign],['Channel',f.channel],['Format',f.dimensions]].filter(([,v])=>v).map(([k,v])=>'<div><dt>'+k+'</dt><dd>'+esc(v)+'</dd></div>').join('')+'</dl><div class="product-chips">'+products.map(p=>button(p.title,url('product',{id:p.id}))).join('')+'</div>'+[['Editable original',f.sourceUrl],['Finished file / team file',f.url]].filter(([,v])=>productLink(v)).map(([k,v])=>'<p><a class="btn" href="'+esc(productLink(v))+'" target="_blank" rel="noopener noreferrer">'+k+' ↗</a></p>').join('')+(f.brief?'<h2>Creative brief</h2><p class="product-copy">'+esc(f.brief)+'</p>':'')+(f.headline?'<h2>'+esc(f.headline)+'</h2>':'')+(f.body?'<h2>Ad copy</h2><p class="product-copy">'+esc(f.body)+'</p>':'')+(f.callToAction?'<p><strong>Call to action:</strong> '+esc(f.callToAction)+'</p>':'')+
 (edit?form('product-asset-status',hidden('revision',r.revision)+select('status','Review status',data.actor.role==='admin'?assetStates:{Draft:'Draft','In review':'Needs review'},r.status),{section:'product-asset',id:r.id},'Update status'):'')+'</section></div>'+
 (edit?'<section class="panel product-upload" data-product-upload data-id="'+esc(r.id)+'" data-prefix="'+esc(productStoragePrefix(r.id))+'"><h2>Add a file</h2><p>Upload an original, finished export or thumbnail. Images, PDF, Office files, ZIP, MP4, WebM or MP3; up to 250 MB. Files stay private to the workspace.</p>'+select('fileSlot','File purpose',options(['Finished export','Editable original','Thumbnail','Supporting document']),'Finished export')+'<label>Choose file<input type="file" data-product-file accept=".jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx,.pptx,.zip,.mp4,.webm,.mp3"></label><button class="primary" type="button" data-product-upload-button>Upload file</button><progress hidden max="100" value="0" aria-label="Upload progress"></progress><p role="status" aria-live="polite" data-product-upload-status></p><noscript>Enable JavaScript to upload files, or add a SharePoint link in Edit details.</noscript></section><script type="module" src="/product-upload.js"></script>':'');
}
function revision(record,f){if(!Number.isSafeInteger(Number(f.revision))||Number(f.revision)!==(record?.revision||0))throw new HttpError(409,'This record changed. Open the latest saved copy before combining your edits.');}
const withoutVersion=r=>{const n=structuredClone(r);delete n.revision;delete n.updatedAt;return n;};
export async function changeProducts(params,f,data,api){
 requireAccess(data.actor,'library','edit');
 if(f.action==='product-save'){
  const id=recordId(f.id),old=data.byId.get(id);if(old){editable(data,id);if(old.kind!=='product')throw new HttpError(400,'Choose a product.');}else if(data.actor.role!=='admin')throw new HttpError(403,'An administrator can add products.');
  revision(old,f);const fields={...old?.fields};
  for(const [key,max] of Object.entries({category:100,stage:100,sku:100,supplier:200,variants:1000,description:8000,notes:8000,ingredients:8000,nutrition:8000,usage:8000}))fields[key]=cleanText(f[key]||'',max);
  if(!productCategories.includes(fields.category)||!productStages.includes(fields.stage))throw new HttpError(400,'Choose a product category and progress.');
  fields.folderUrl=checkedLink(f.folderUrl);fields.launchDate=cleanText(f.launchDate||'',10);
  if(fields.launchDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(fields.launchDate)||!Number.isFinite(Date.parse(fields.launchDate))||new Date(fields.launchDate).toISOString().slice(0,10)!==fields.launchDate))throw new HttpError(400,'Choose a valid launch date.');
  fields.coverAssetId=cleanText(f.coverAssetId??old?.fields.coverAssetId??'',240);if(fields.coverAssetId&&!linked(data,id).some(a=>a.id===fields.coverAssetId&&productAssetImage(a)))throw new HttpError(400,'Choose an image linked to this product.');
  const title=cleanText(f.title||'',200);if(!title)throw new HttpError(400,'Give the product a name.');
  const record={...(old?withoutVersion(old):{comments:[]}),id,kind:'product',title,status:fields.stage==='Retired'?'Archived':'Draft',fields};delete record.approval;
  await saveRecord(api,data.actor,record,old?.revision||0);return {section:'product',id,tab:'assets'};
 }
 if(f.action==='product-project-link'){
  if(data.actor.role!=='admin')throw new HttpError(403,'An administrator can link projects.');
  const r=editable(data,params.get('id'));if(r.kind!=='product')throw new HttpError(400,'Choose a product.');revision(r,f);projectFor(data,f.projectId);
  const n=withoutVersion(r);n.fields.projectIds=[...new Set([...(r.fields.projectIds||[]),f.projectId])];await saveRecord(api,data.actor,n,r.revision);return {section:'product',id:r.id,tab:'work'};
 }
 if(f.action==='product-asset-link'){
  const p=editable(data,f.productId),r=editable(data,f.assetId);if(p.kind!=='product'||r.kind!=='asset'||!['product','advert'].includes(f.assetRole))throw new HttpError(400,'Choose a product and asset.');
  const n=withoutVersion(r);n.fields={...n.fields,productAsset:true,productIds:[...new Set([...(n.fields.productIds||[]),p.id])],assetRole:isProductAsset(r)?r.fields.assetRole:f.assetRole,type:assetTypes.includes(r.fields.type)?r.fields.type:r.fields.type==='Image'?'Photography':'Other',channel:r.fields.channel||'Unspecified'};
  n.status='Draft';delete n.approval;await saveRecord(api,data.actor,n,r.revision);return {section:'product-asset',id:r.id};
 }
 if(f.action==='product-asset-save'){
  const id=data.byId.has(f.id)?f.id:recordId(f.id),old=data.byId.get(id);if(old){editable(data,id);if(!isProductAsset(old))throw new HttpError(400,'Choose a product asset.');}revision(old,f);
  const productIds=Object.keys(f).filter(k=>k.startsWith('product_')&&f[k]==='1').map(k=>k.slice(8));if(productIds.length>30)throw new HttpError(400,'Choose up to 30 products.');
  for(const id of productIds){const p=readable(data,id);if(p.kind!=='product'||!canEditContent(data,id)&&!old?.fields.productIds?.includes(id))throw new HttpError(403,'Choose a product you can edit.');}
  if(!old&&data.actor.role!=='admin'&&!productIds.some(id=>data.assigned.has(id)))throw new HttpError(403,'Choose an assigned product.');
  // Keep associations outside this editor's visibility; they are not editable here.
  for(const id of old?.fields.productIds||[])if(!data.byId.has(id)&&!productIds.includes(id))productIds.push(id);
  if(data.actor.role!=='admin'&&old&&!data.tasks?.some(t=>t.record_id===old.id)&&!data.projects.some(p=>p.entries.some(e=>e.record===old.id))&&!productIds.some(id=>data.assigned.has(id)))throw new HttpError(400,'Keep at least one assigned product linked to this asset.');
  const fields={...old?.fields,productAsset:true,productIds};for(const [key,max] of Object.entries({type:100,assetRole:30,campaign:200,channel:100,dimensions:120,altText:500,brief:8000,body:20000,headline:300,callToAction:300}))fields[key]=cleanText(f[key]||'',max);
  if(!assetTypes.includes(fields.type)||!['product','advert'].includes(fields.assetRole)||!channels.includes(fields.channel))throw new HttpError(400,'Choose the asset type, location and channel.');
  for(const key of ['sourceUrl','url','thumbnailUrl'])fields[key]=checkedLink(f[key]);
  const title=cleanText(f.title||'',200);if(!title)throw new HttpError(400,'Give the asset a name.');
  const record={...(old?withoutVersion(old):{comments:[]}),id,kind:'asset',title,status:'Draft',fields};delete record.approval;
  await saveRecord(api,data.actor,record,old?.revision||0);return {section:'product-asset',id};
 }
 if(f.action==='product-asset-status'){
  const r=editable(data,params.get('id'));if(!isProductAsset(r))throw new HttpError(400,'Choose a product asset.');revision(r,f);
  if(f.status==='Draft'){const next=withoutVersion(r);next.status='Draft';delete next.approval;await saveRecord(api,data.actor,next,r.revision);}
  else await changeStudio(new URLSearchParams({id:r.id}),{action:'content-review',revision:f.revision,status:f.status},data,api);
  return {section:'product-asset',id:r.id};
 }
 throw new HttpError(400,'Choose a valid product action.');
}
export function productErrorForm(params,f,data){
 if(f.action==='product-save')return productForm(params,data,f);
 if(f.action==='product-asset-save')return assetForm(params,data,{...f,productIds:Object.keys(f).filter(k=>k.startsWith('product_')&&f[k]==='1').map(k=>k.slice(8))});
 return button('Back to products',url('products'));
}
