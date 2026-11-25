import {canAccess,canEditContent} from './library-permissions.mjs';
import {esc,url,heading,button,form,hidden,select} from './studio-ui.mjs';

export function unifiedProductPage(r,data,{linked,productPhoto,productAssetPreview,productAssetImage,productWork,productUploader}){
 const f=r.fields,edit=canEditContent(data,r.id),files=linked(data,r.id).filter(a=>a.status!=='Archived');
 const photos=files.filter(a=>a.fields.assetRole!=='advert'&&productAssetImage(a));
 const documents=files.filter(a=>a.fields.assetRole!=='advert'&&!productAssetImage(a));
 const creatives=files.filter(a=>a.fields.assetRole==='advert');
 const state=a=>'<span class="product-state">'+esc(a.status==='In review'?'Needs review':a.status)+'</span>';
 const facts=[['SKU',f.sku],['Pack size',f.packSize||f.variants],['Packaging',f.packaging],['Supplier',f.supplier],['Target launch',f.launchDate],['RRP',Number.isFinite(f.proposedRrp)?new Intl.NumberFormat('en-GB',{style:'currency',currency:f.currency||'GBP'}).format(f.proposedRrp):'']];
 const cards=rows=>'<div class="product-gallery">'+rows.map(a=>'<article class="product-card"><a href="'+url('product-asset',{id:a.id})+'"><div class="product-card-image">'+productAssetPreview(a)+'</div></a><div class="product-card-body"><div class="product-card-meta"><span>'+esc(a.fields.type)+'</span>'+state(a)+'</div><h3><a href="'+url('product-asset',{id:a.id})+'">'+esc(a.title)+'</a></h3>'+(a.fields.body?'<p class="product-copy">'+esc(a.fields.body)+'</p>':'')+(canAccess(data.actor,'work')?button('Review',url('review-preview',{id:a.id})):'')+'</div></article>').join('')+'</div>';
 const sections=[['Ingredients',f.ingredients],['Nutrition information',f.nutrition],['How to use',f.usage],['Allergen information',f.allergenInformation],['Storage',f.storage],['Important information',f.warnings]].filter(([,value])=>value);
 let body='<a class="back-link" href="'+url('products')+'">← Products</a>'+heading(r.title,f.category,edit?button('Edit product',url('product',{id:r.id,tab:'edit'})):'');
 body+='<div class="product-detail-overview"><div class="product-hero-image">'+productPhoto(r,data)+'</div><section class="panel"><div class="product-card-meta"><span>'+esc(f.category)+'</span>'+state(r)+'</div>'+(f.shortDescription?'<p class="product-introduction">'+esc(f.shortDescription)+'</p>':'')+'<p class="product-copy">'+esc(f.fullDescription||f.description||'')+'</p>'+(Array.isArray(f.keyFeatures)&&f.keyFeatures.length?'<ul class="product-features">'+f.keyFeatures.map(v=>'<li>'+esc(v)+'</li>').join('')+'</ul>':'')+'<dl class="product-facts">'+facts.filter(([,v])=>v).map(([k,v])=>'<div><dt>'+k+'</dt><dd>'+esc(v)+'</dd></div>').join('')+'</dl></section></div>';
 body+='<div class="product-info-grid">'+sections.map(([label,value])=>'<section class="panel"><h2>'+label+'</h2><p class="product-copy">'+esc(value)+'</p></section>').join('')+'</div>';
 body+='<section class="product-page-section" id="product-images"><h2>Product & lifestyle images</h2>'+ (photos.length?cards(photos):'<p>No product images have been added yet.</p>')+'</section>';
 if(documents.length)body+='<section class="product-page-section" id="product-documents"><h2>Product copy & documents</h2>'+documents.map(a=>'<details class="panel product-document"><summary>'+esc(a.title)+' '+state(a)+'</summary>'+(a.fields.body?'<p class="product-copy">'+esc(a.fields.body)+'</p>':'')+button('Open details',url('product-asset',{id:a.id}))+ (canAccess(data.actor,'work')?button('Review',url('review-preview',{id:a.id})):'')+'</details>').join('')+'</section>';
 body+='<section class="product-page-section" id="product-creatives"><h2>Ads & creatives</h2>'+(creatives.length?cards(creatives):'<p>No adverts or creatives have been added yet.</p>')+'</section>';
 if(canAccess(data.actor,'work'))body+='<section class="product-page-section" id="product-work"><h2>Work & projects</h2>'+productWork(r,data)+'</section>';
 if(f.notes)body+='<section class="panel"><h2>Notes</h2><p class="product-copy">'+esc(f.notes)+'</p></section>';
 if(edit){
  const existing=data.items.filter(a=>a.kind==='asset'&&canEditContent(data,a.id)&&!a.fields.productIds?.includes(r.id));
  body+='<details class="panel product-manage-files" id="product-files"><summary>Add files, images or creatives</summary>'+productUploader(r)+'<div class="product-toolbar">'+button('Add asset',url('product-asset',{id:'new',product:r.id,role:'product'}))+button('Add creative',url('product-asset',{id:'new',product:r.id,role:'advert'}))+'</div>'+(existing.length?'<details><summary>Link an existing asset</summary>'+form('product-asset-link',hidden('productId',r.id)+hidden('assetRole','product')+select('assetId','Existing asset',{'':'Choose an asset',...Object.fromEntries(existing.map(a=>[a.id,a.title]))}),{section:'product',id:r.id},'Link asset')+'</details>':'')+'</details>';
 }
 return body;
}
