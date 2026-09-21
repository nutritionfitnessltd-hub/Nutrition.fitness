/** Shared modal presentation. Existing forms, validation and API handlers remain
 * authoritative. Same-origin frames isolate the static site's page controllers;
 * local forms are moved, never cloned, so their listeners and values survive. */
export const FORM_ROUTES = Object.freeze({
 '/get-started/': {title:'Find your programme',label:'Find my programme',selector:'.finder-page',kind:'quiz',remember:true},
 '/contact/': {title:'Get in touch',label:'Open the contact form',selector:'.compact-page',remember:true},
 '/search/': {title:'Search Nutrition.Fitness',label:'Search the website',selector:'.compact-page'},
 '/subscriptions/': {title:'Build your subscription',label:'Build my subscription',selector:'#box-form',kind:'wide'},
 '/checkout/': {title:'Review your order',label:'Review my order',selector:'#checkout-content',kind:'wide'},
 '/meal-planner/add/': {title:'Add a meal',label:'Add a meal to my plan',selector:'[data-food-screen]'},
 '/meal-planner/edit/': {title:'Edit your planned meal',label:'Edit this meal',selector:'[data-food-screen]'},
 '/meal-planner/log/': {title:'Log what you ate',label:'Log my meal',selector:'[data-food-screen]'},
 '/meal-planner/food/': {title:'Log another food',label:'Open my food log',selector:'[data-food-screen]'},
 '/recipe-edit/': {title:'Your recipe',label:'Open the recipe editor',selector:'[data-food-screen]',kind:'wide'},
 '/onboarding/': {title:'Set up your food plan',label:'Set up my food plan',selector:'[data-food-screen]'}
});
export const normalPath = path => `${path.replace(/\/+$/, '')}/`;
export function formRoute(href, base) {
 try {const url=new URL(href,base);return url.origin===new URL(base).origin && /^https?:$/.test(url.protocol) ? FORM_ROUTES[normalPath(url.pathname)] || null : null;} catch {return null;}
}

if (typeof document !== 'undefined' && typeof HTMLDialogElement !== 'undefined' && HTMLDialogElement.prototype.showModal) boot();

function boot() {
 // Account and management workflows have their own full-screen navigation.
 if (/^\/(?:login|register|forgot-password|reset-password|account|admin)(?:\/|$)/.test(location.pathname)) {document.documentElement.dataset.nfFormModals='ready';return;}
 const $=(s,r=document)=>r.querySelector(s);
 const embedded=(()=>{try{return window.parent!==window && window.frameElement?.hasAttribute('data-nf-modal-frame');}catch{return false;}})();
 const route=FORM_ROUTES[normalPath(location.pathname)];
 const entries=new Map(),remote=new Map(),prepared=new WeakSet();
 let active=null,sequence=0,scrollLock=null,primary=null,historyClosing=false,pendingRefresh=false;
 const post=(type,extra={})=>parent.postMessage({type,...extra},location.origin);
 const titleOf=node=>node.querySelector('h1,h2,h3,legend')?.textContent.trim();
 const hasModifier=e=>e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey;

 if(embedded){
  document.documentElement.classList.add('nf-modal-embedded');
  // A completed form may use its existing controller to navigate. Continue that
  // navigation in the outer page, never strand a full website inside the modal.
  if(!route){post('nf-form:navigate',{href:location.href});return;}
  let lastStep=null;
  const reveal=()=>{
   const target=$(route.selector)||$('#main');if(!target)return;
   document.querySelectorAll('[data-nf-modal-path],[data-nf-modal-content]').forEach(n=>{delete n.dataset.nfModalPath;delete n.dataset.nfModalContent;});
   target.dataset.nfModalContent='';
   for(let n=target.parentElement;n;n=n.parentElement)n.dataset.nfModalPath='';
   const step=$('[data-step-title]');if(step&&step!==lastStep){if(lastStep)step.scrollIntoView({block:'start',behavior:'instant'});lastStep=step;}
  };
  reveal();
  const watch=new MutationObserver(()=>reveal());watch.observe(document.body,{childList:true,subtree:true});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();post('nf-form:close');}},true);
  document.addEventListener('click',e=>{
   const a=e.target.closest('a[href]');if(!a||hasModifier(e)||a.hasAttribute('download')||a.target==='_blank'||a.getAttribute('href').startsWith('#'))return;
   const url=new URL(a.href,location.href);if(url.origin!==location.origin)return;
   e.preventDefault();post('nf-form:navigate',{href:url.href});
  });
  // Forward the launch link's attribution without changing the page's URL.
  post('nf-form:ready',{title:route.title});return;
 }

 function lock(){
  if(scrollLock)return;
  scrollLock={x:scrollX,y:scrollY,bodyStyle:document.body.getAttribute('style')};
  document.documentElement.classList.add('nf-modal-open');
  Object.assign(document.body.style,{position:'fixed',top:`-${scrollLock.y}px`,left:'0',right:'0',width:'100%'});
 }
 function unlock(){
  if(!scrollLock)return;const saved=scrollLock;scrollLock=null;
  if(saved.bodyStyle===null)document.body.removeAttribute('style');else document.body.setAttribute('style',saved.bodyStyle);
  document.documentElement.classList.remove('nf-modal-open');
  window.scrollTo({left:saved.x,top:saved.y,behavior:'instant'});
 }
 function dismiss(entry,{restore=true}={}){
  if(!entry)return;
  if(entry.dialog.open)entry.dialog.close();
  entry.opener?.setAttribute('aria-expanded','false');
  if(active===entry){active=null;unlock();}
  if(restore&&entry.opener?.isConnected)entry.opener.focus({preventScroll:true});
  if(entry.frame&&!entry.remember){remote.delete(entry.url);entry.frame.remove();entry.dialog.remove();entries.delete(entry.id);}
 }
 function close(){
  if(!active)return;const entry=active;
  const ownsHistory=entry.useHistory&&history.state?.nfFormModal===entry.id;
  const refresh=entry.refreshOnClose;
  dismiss(entry);
  if(ownsHistory){historyClosing=true;pendingRefresh=!!refresh;history.back();}
  else if(refresh)location.reload();
 }
 function open(entry,opener,{push=true}={}){
  if(historyClosing)return;
  if(active===entry){entry.dialog.focus();return;}
  const replace=!!active&&history.state?.nfFormModal===active.id;
  if(active)dismiss(active,{restore:false});
  entry.opener=opener||entry.opener;active=entry;lock();
  // Close the mobile menu before opening the top-layer dialog.
  const menu=$('.menu-toggle'),nav=$('#mobile-nav');
  if(menu&&nav){nav.hidden=true;menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','Open navigation');}
  entry.dialog.showModal();entry.opener?.setAttribute('aria-expanded','true');
  if(entry.useHistory&&push){try{history[replace?'replaceState':'pushState']({...history.state,nfFormModal:entry.id},'',location.href);}catch{/* Sandboxed/offline pages retain native close and Escape. */}}
  requestAnimationFrame(()=>{
   if(active!==entry||!entry.dialog.open)return;
   const heading=entry.frame||$('[data-step-title],h1,h2,h3',entry.body)||entry.heading;
   if(!entry.frame)heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});
  });
 }
 function makeDialog(spec,parentNode,before=null){
  const id=`nf-form-${++sequence}`,dialog=document.createElement('dialog');
  dialog.id=id;dialog.className=`nf-form-dialog nf-form-${spec.kind||'standard'}`;
  dialog.setAttribute('aria-labelledby',`${id}-title`);dialog.setAttribute('aria-modal','true');
  const header=document.createElement('header');header.className='nf-form-header';
  const heading=document.createElement('h2');heading.id=`${id}-title`;heading.textContent=spec.title;heading.tabIndex=-1;
  const x=document.createElement('button');x.type='button';x.className='nf-form-close';x.setAttribute('aria-label',`Close ${spec.title.toLowerCase()}`);x.textContent='×';
  header.append(heading,x);
  const body=document.createElement('div');body.className='nf-form-content';
  const status=document.createElement('div');status.className='nf-form-status';status.setAttribute('role','status');status.hidden=true;
  dialog.append(header,body,status);parentNode.insertBefore(dialog,before);
  const entry={id,dialog,body,heading,status,...spec};entries.set(id,entry);
  x.addEventListener('click',close);
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  // Require both ends of the pointer gesture outside: selecting text must not dismiss.
  let outside=false;
  dialog.addEventListener('pointerdown',e=>{const r=dialog.getBoundingClientRect();outside=e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom);});
  dialog.addEventListener('click',e=>{if(outside&&e.target===dialog)close();outside=false;});
  // The native close event is queued. Ignore a stale event if Back/Forward
  // or a rapid reopen has already shown this same dialog again.
  dialog.addEventListener('close',()=>{if(active===entry&&!dialog.open)close();});
  return entry;
 }
 function local(node,spec,{auto=false}={}){
  if(prepared.has(node)||node.closest('dialog,[role="dialog"]'))return null;
  prepared.add(node);
  const slot=document.createElement('div');slot.className='nf-form-launcher'+(auto?' nf-primary-launcher':'');
  const button=document.createElement('button');button.type='button';button.className='button nf-form-trigger';button.textContent=spec.label||`Open ${spec.title.toLowerCase()}`;
  slot.append(button);node.before(slot);
  const entry=makeDialog({...spec,useHistory:!!spec.useHistory},node.parentNode,node);
  entry.body.append(node);entry.opener=button;
  button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls',entry.id);button.setAttribute('aria-expanded','false');
  button.addEventListener('click',()=>open(entry,button));
  if(auto)open(entry,button);
  return entry;
 }
 function openRemote(url,trigger){
  const spec=formRoute(url,location.href);if(!spec)return;
  const u=new URL(url,location.href);
  // Preserve campaign attribution for existing reservation/CRM handlers.
  for(const [k,v]of new URLSearchParams(location.search))if(k.startsWith('utm_')&&!u.searchParams.has(k))u.searchParams.set(k,v);
  if(primary&&normalPath(u.pathname)===normalPath(location.pathname)&&u.search===location.search){open(primary,trigger);return;}
  let entry=remote.get(u.href);
  if(!entry){
   entry=makeDialog({...spec,url:u.href,useHistory:true},document.body);
   entry.dialog.classList.add('nf-form-remote');
   const loading=document.createElement('p');loading.className='nf-form-loading';loading.setAttribute('role','status');loading.textContent='Opening…';
   const frame=document.createElement('iframe');frame.title=spec.title;frame.dataset.nfModalFrame='';frame.setAttribute('referrerpolicy','same-origin');
   entry.frame=frame;entry.body.append(loading,frame);remote.set(u.href,entry);
   let timer=setTimeout(()=>{
    if(!loading.isConnected||loading.hidden)return;
    loading.textContent='Taking a little longer than expected. ';
    const fallback=document.createElement('a');fallback.href=u.href;fallback.dataset.nfNoModal='';fallback.textContent='Open the form directly';loading.append(fallback);
   },12000);
   frame.addEventListener('load',()=>{try{if(frame.contentDocument?.querySelector('#main')){loading.hidden=true;clearTimeout(timer);}}catch{/* A readable fallback stays available. */}});
   frame.src=u.href;
  }
  open(entry,trigger);
 }
 function formSpec(form){
  if(form.id==='product-form')return {title:'Choose your options',label:'Choose options'};
  if(form.matches('[data-system-base]'))return {title:`${form.dataset.systemBase} — choose your focus`,label:'Choose my focus'};
  if(form.id==='kc-filter-form')return {title:'Filter the Knowledge Centre',label:'Choose filters',filter:true};
  if(form.matches('.kc-search')||form.querySelector('input[type="search"]'))return {title:'Search',label:'Open search',search:true};
  const labels={
   'data-new-plan':'Create a new meal plan','data-copy-plan':'Copy this meal plan','data-rename-plan':'Rename this meal plan',
   'data-extra-item':'Add a shopping-list item','data-new-collection':'Create a recipe collection',
   'data-send-code':'Sign in or create an account','data-recipe-editor':'Edit your recipe'
  };
  for(const [attr,title]of Object.entries(labels))if(form.hasAttribute(attr))return {title,label:title};
  const title=titleOf(form)||form.getAttribute('aria-label')||'Complete this form';return {title,label:`Open ${title.toLowerCase()}`};
 }
 function scan(){
  // Page controllers can replace their screen after a successful save.
  if(active&&!active.dialog.isConnected){const old=active;const owns=history.state?.nfFormModal===old.id;dismiss(old);if(owns){historyClosing=true;history.back();}}
  for(const [id,entry]of entries)if(!entry.dialog.isConnected)entries.delete(id);
  if(!primary&&route){
   const target=$(route.selector);
   if(target)primary=local(target,{...route,useHistory:normalPath(location.pathname)!=='/search/'},{auto:true});
  }
  document.querySelectorAll('form,[data-quiz],[data-form-modal]').forEach(form=>{
   if(form.closest('dialog,[role="dialog"],template')||form.hasAttribute('hidden')||form.dataset.nfNoModal!==undefined||prepared.has(form))return;
   const entry=local(form,formSpec(form));
   if(entry?.filter){
    const toggle=$('.kc-filter-toggle');
    if(toggle&&!toggle.dataset.nfModalBound){toggle.dataset.nfModalBound='';toggle.setAttribute('aria-haspopup','dialog');toggle.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();open(entry,toggle);},true);}
    const done=document.createElement('button');done.className='button nf-form-done';done.type='button';done.textContent='Show results';done.addEventListener('click',close);entry.body.append(done);
   }
   if(entry?.search)form.addEventListener('submit',()=>queueMicrotask(()=>{if(active===entry)close();}));
  });
  // Existing messages remain the source of truth; relay them above the inert page.
  if(active&&!active.frame){
   const step=$('[data-step-title]',active.body);if(step&&step!==active.lastStep){if(active.lastStep)step.scrollIntoView({block:'start',behavior:'instant'});active.lastStep=step;}
   const notices=[...document.querySelectorAll('[data-food-message],.notification')].filter(n=>!n.hidden&&!n.closest('dialog'));
   const last=notices.at(-1);if(last&&active.status.textContent!==last.textContent){active.status.replaceChildren(...[...last.childNodes].map(n=>n.cloneNode(true)));active.status.setAttribute('role',last.getAttribute('role')==='alert'?'alert':'status');active.status.hidden=false;}
  }
 }
 document.addEventListener('click',e=>{
  const a=e.target.closest('a[href]');if(!a||hasModifier(e)||a.target==='_blank'||a.hasAttribute('download')||a.dataset.nfNoModal!==undefined)return;
  if(!formRoute(a.href,location.href))return;
  e.preventDefault();openRemote(a.href,a);
 });
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&active){e.preventDefault();e.stopImmediatePropagation();close();}},true);
 // Existing shop controllers hold their basket in memory. A box added in a
 // different page controller must refresh the parent before another purchase.
 window.addEventListener('storage',e=>{if(e.key==='nutrition-fitness-site-v2'&&active?.frame)active.refreshOnClose=true;});
 window.addEventListener('popstate',e=>{
  historyClosing=false;const next=entries.get(e.state?.nfFormModal);
  if(active&&active!==next){pendingRefresh=pendingRefresh||!!active.refreshOnClose;dismiss(active);}
  if(pendingRefresh){pendingRefresh=false;location.reload();return;}
  if(next&&!next.dialog.open)open(next,next.opener,{push:false});
 });
 window.addEventListener('message',e=>{
  if(e.origin!==location.origin||!active?.frame||e.source!==active.frame.contentWindow||!e.data)return;
  if(e.data.type==='nf-form:close')close();
  if(e.data.type==='nf-form:ready'){$('.nf-form-loading',active.body).hidden=true;}
  if(e.data.type==='nf-form:navigate'){
   let url;try{url=new URL(e.data.href,location.href);}catch{return;}
   if(url.origin!==location.origin||!/^https?:$/.test(url.protocol))return;
   // Preserve normal post-save destinations and existing links, outside the frame.
   dismiss(active,{restore:false});location.assign(url.href);
  }
 });
 // Child-list observation catches asynchronous sign-in, checkout and planner forms.
 const observer=new MutationObserver(scan);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
 scan();document.documentElement.dataset.nfFormModals='ready';
}
