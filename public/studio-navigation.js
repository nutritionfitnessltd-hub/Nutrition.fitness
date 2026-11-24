// Keep native navigation, form validation and unsaved-edit protection intact.
let indicator;
const reset=()=>{indicator?.remove();indicator=null;document.documentElement.removeAttribute('data-navigating');};
const pending=()=>{
 if(indicator)return;
 document.documentElement.setAttribute('data-navigating','');
 indicator=document.createElement('div');indicator.className='studio-navigation-progress';
 indicator.setAttribute('role','status');indicator.textContent='Loading…';document.body.append(indicator);
 // A cancelled beforeunload prompt must not leave the page looking busy.
 window.setTimeout(reset,15000);
};
window.addEventListener('click',event=>{
 if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
 const link=event.target.closest?.('a[href]');
 if(!link||link.hasAttribute('download')||link.target&&link.target!=='_self')return;
 const next=new URL(link.href,location.href),current=new URL(location.href);
 if(next.origin!==current.origin||next.pathname!=='/content-library/'||next.searchParams.has('file')||next.searchParams.has('preview'))return;
 if(next.pathname===current.pathname&&next.search===current.search)return;
 pending();
});
window.addEventListener('submit',event=>{if(!event.defaultPrevented&&event.target.target!=='_blank')pending();});
window.addEventListener('pageshow',reset);
window.addEventListener('focus',reset);
