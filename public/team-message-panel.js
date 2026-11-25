const panel=document.querySelector('[data-message-panel]'),toggle=document.querySelector('[data-message-panel-toggle]');
if(panel&&toggle&&!new URL(location.href).searchParams.has('accountPreview')){
 const frame=panel.querySelector('iframe'),close=panel.querySelector('[data-message-panel-close]'),full=panel.querySelector('[data-message-panel-full]'),resize=panel.querySelector('[data-message-panel-resize]'),shell=document.querySelector('body>.shell');
 const mobile=matchMedia('(max-width:760px)');let lastFocus,dragging=false;
 const isMessageUrl=value=>{const u=new URL(value,location.href);return u.origin===location.origin&&u.pathname==='/content-library/'&&u.searchParams.get('studio')==='messages'&&!u.searchParams.has('file')&&!u.searchParams.has('poll');};
 const visible=()=>!panel.hidden;
 function tellFrame(){frame.contentWindow?.postMessage({type:'team-message-panel-visibility',visible:visible()},location.origin);}
 function width(value){const max=Math.max(360,Math.min(720,innerWidth-856)),size=Math.round(Math.max(360,Math.min(max,value)));document.body.style.setProperty('--messages-panel-width',size+'px');resize.setAttribute('aria-valuenow',String(size));resize.setAttribute('aria-valuemax',String(max));}
 function modality(){
  const modal=visible()&&mobile.matches;
  panel.setAttribute('role',modal?'dialog':'complementary');
  if(modal)panel.setAttribute('aria-modal','true');else panel.removeAttribute('aria-modal');
  if(shell)shell.inert=modal;
 }
 function show(target){
  lastFocus=document.activeElement;
  if(!frame.getAttribute('src')||target){const u=new URL(target||toggle.href,location.href);if(!isMessageUrl(u))return;u.searchParams.set('panel','1');frame.src=u.href;}
  panel.hidden=false;toggle.hidden=true;toggle.setAttribute('aria-expanded','true');document.body.dataset.messagesOpen='';modality();tellFrame();close.focus();
 }
 function hide(){
  // Keep the same iframe and its composer alive; collapsing never reloads it.
  panel.hidden=true;toggle.hidden=false;toggle.setAttribute('aria-expanded','false');delete document.body.dataset.messagesOpen;modality();tellFrame();(lastFocus?.isConnected?lastFocus:toggle).focus();
 }
 toggle.addEventListener('click',event=>{event.preventDefault();show();});close.addEventListener('click',hide);
 toggle.addEventListener('keydown',event=>{if(event.key===' '){event.preventDefault();show();}});
 frame.addEventListener('load',()=>{
  try{const u=new URL(frame.contentWindow.location.href);if(isMessageUrl(u)){u.searchParams.delete('panel');full.href=u.href;}}catch{}
  tellFrame();
 });
 document.addEventListener('click',event=>{
  if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const link=event.target.closest?.('a[href]');if(!link||panel.contains(link)||link===toggle||link.closest('.team-messages')||link.target==='_blank'||!isMessageUrl(link.href))return;
  event.preventDefault();const u=new URL(link.href);show(u.searchParams.has('conversation')||u.searchParams.has('new')?u.href:undefined);
 });
 addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==frame.contentWindow)return;if(event.data?.type==='team-message-unread'){const n=Math.max(0,Number(event.data.unread)||0);for(const badge of document.querySelectorAll('[data-message-unread]')){badge.hidden=!n;badge.textContent=String(n);badge.setAttribute('aria-label',n+' unread messages');}}if(event.data?.type==='team-message-panel-close'&&visible())hide();if(event.data?.type==='team-message-panel-focus'&&visible()&&mobile.matches)(event.data.edge==='before'?close:full).focus();});
 document.addEventListener('keydown',event=>{
  if(!visible())return;
  if(event.key==='Escape'){event.preventDefault();hide();return;}
  if(mobile.matches&&event.key==='Tab'){
   if(event.shiftKey&&document.activeElement===full){event.preventDefault();frame.focus();frame.contentWindow?.postMessage({type:'team-message-panel-focus-last'},location.origin);}
   else if(!event.shiftKey&&document.activeElement===frame){event.preventDefault();full.focus();}
  }
 });
 resize.addEventListener('pointerdown',event=>{if(event.button!==0||innerWidth<1280)return;dragging=true;resize.setPointerCapture?.(event.pointerId);document.body.dataset.messagesResizing='';event.preventDefault();});
 resize.addEventListener('pointermove',event=>{if(dragging)width(innerWidth-event.clientX);});
 const stopResize=()=>{dragging=false;delete document.body.dataset.messagesResizing;};resize.addEventListener('pointerup',stopResize);resize.addEventListener('pointercancel',stopResize);resize.addEventListener('lostpointercapture',stopResize);
 resize.addEventListener('keydown',event=>{const old=Number(resize.getAttribute('aria-valuenow'));if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();width(event.key==='Home'?360:event.key==='End'?720:old+(event.key==='ArrowLeft'?20:-20));}});
 addEventListener('resize',()=>{width(Number(resize.getAttribute('aria-valuenow')));modality();});mobile.addEventListener('change',modality);width(480);
}else if(panel&&toggle){toggle.hidden=true;panel.hidden=true;}
