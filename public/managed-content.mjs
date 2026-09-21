/** Apply only published CMS copy. All administrator-entered text stays plain text. */
const routes={
  '/':['#hero-heading','.hero-description'],
  '/nufi/':['.nufi-mast h1','.nufi-mast .lead'],
  '/programmes/':['.food-intro h1','.food-intro .lead'],
  '/courses/':['.food-intro h1','.food-intro .lead'],
  '/recipes/':['.food-intro h1','.food-intro .lead'],
  '/shop/':['.shop-mast h1','.shop-mast .lead'],
  '/about/':['.mast-split h1','.mast-split .lead'],
  '/help/':['.page-intro h1','.page-intro .lead'],
  '/contact/':['.page-intro h1','.page-intro .lead']
};
const normal=value=>String(value||'').replace(/\s+/g,' ').trim();
function copy(node,value){if(node&&typeof value==='string'&&normal(node.innerText||node.textContent)!==normal(value))node.textContent=value;}
function note(parent,key,value){
  if(!parent)return;let node=parent.querySelector(`[data-managed-note="${key}"]`);
  if(!value){node?.remove();return;}
  if(!node){node=document.createElement('p');node.className='small-print managed-price-note';node.dataset.managedNote=key;parent.append(node);}
  copy(node,value);
}
function applyProduct(product,path){
  if(typeof product.id!=='string'||!/^[a-z0-9][a-z0-9-]{0,79}$/.test(product.id))return;
  const href=`/shop/${product.id}/`;
  for(const link of document.querySelectorAll(`.product-card .card-name-row a[href="${href}"]`))copy(link,product.name);
  for(const card of document.querySelectorAll('.product-card'))if(card.querySelector(`a[href="${href}"]`))note(card.querySelector('.product-card-copy'),product.id,product.priceLabel);
  if(path!==href)return;
  const detail=document.querySelector(`.product-detail[data-product-id="${product.id}"]`);
  if(detail){
    copy(detail.querySelector('.product-buybox h1'),product.name);
    copy(detail.querySelector('.product-buybox > .product-quip + p'),product.description);
    note(detail.querySelector('.detail-price'),product.id,product.priceLabel);
  }else{
    const book=document.querySelector('.cookbook-product');if(!book)return;
    if(product.id==='high-protein-kitchen'){
      copy(book.querySelector('.cookbook-buybox > .eyebrow'),product.name);
      copy(book.querySelector('.cookbook-buybox .lead'),product.description);
    }else{
      copy(book.querySelector('.cookbook-buybox h1'),product.name);
      copy(book.querySelector('.cookbook-contents > div > p:not(.eyebrow)'),product.description);
    }
    note(book.querySelector('.cookbook-order-status'),product.id,product.priceLabel);
  }
}
function applySettings(settings,page){
  if(!settings)return;
  if(typeof settings.siteTitle==='string'&&settings.siteTitle){
    const base=page?.metaTitle||document.title.replace(/\s*\|\s*Nutrition\.Fitness$/i,'');
    document.title=`${base} | ${settings.siteTitle}`;
  }
  let announcement=document.querySelector('[data-managed-announcement]');
  if(settings.announcement){
    if(!announcement){announcement=document.createElement('aside');announcement.dataset.managedAnnouncement='';announcement.className='managed-announcement';announcement.setAttribute('aria-label','Website announcement');const anchor=document.querySelector('.launch-banner')||document.querySelector('.site-header');anchor?.after(announcement);}
    copy(announcement,settings.announcement);
  }else announcement?.remove();
  let support=document.querySelector('[data-managed-support]');
  if(typeof settings.supportEmail==='string'&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(settings.supportEmail)){
    if(!support){support=document.createElement('a');support.dataset.managedSupport='';const footer=document.querySelector('.new-footer .footer-links > div:last-child')||document.querySelector('footer');footer?.append(support);}
    support.href=`mailto:${settings.supportEmail}`;copy(support,settings.supportEmail);
  }else support?.remove();
}
export function applyManagedContent(data,{path=location.pathname}={}){
  if(!data||typeof data!=='object')return;
  if(!path.endsWith('/'))path+='/';
  const page=Array.isArray(data.pages)?data.pages.find(p=>p.path===path):null;
  const selectors=routes[path];
  if(page&&selectors){copy(document.querySelector(selectors[0]),page.title);copy(document.querySelector(selectors[1]),page.intro);if(typeof page.metaTitle==='string')document.title=`${page.metaTitle} | Nutrition.Fitness`;const description=document.querySelector('meta[name="description"]');if(description&&typeof page.metaDescription==='string')description.content=page.metaDescription;}
  if(Array.isArray(data.products))for(const product of data.products)applyProduct(product,path);
  applySettings(data.settings,page);
  document.dispatchEvent(new CustomEvent('nufi:published-content',{detail:{recipes:Array.isArray(data.recipes)?data.recipes:[]}}));
}
if(typeof document!=='undefined'){
  const style=document.createElement('style');style.textContent='.managed-announcement{padding:12px 24px;text-align:center;background:#e9f3ee;color:#1d493b;font:600 14px/1.5 "DM Sans",sans-serif;overflow-wrap:anywhere}.managed-price-note{font-size:13px;line-height:1.5;color:#45564e;margin:8px 0 0;max-width:38rem}.detail-price{flex-wrap:wrap}.detail-price>.managed-price-note{flex-basis:100%}';document.head.append(style);
  const load=async()=>{try{const response=await fetch('/api/content',{headers:{Accept:'application/json'},credentials:'same-origin',cache:'no-store'});if(response.ok)applyManagedContent(await response.json());}catch{/* Published source content stays available during a network interruption. */}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
}
