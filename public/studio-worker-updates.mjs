export function startWorkerUpdates({doc=document,win=window,fetcher=fetch,Parser=DOMParser}={}){
 const url=new URL(win.location.href),section=url.searchParams.get('studio')||'home';
 if(!['home','library','worker-chat','team-work','project'].includes(section)||!doc.querySelector('[data-worker-updates]'))return;
 let busy=false;
 const update=async()=>{
  if(section==='worker-chat'&&[...doc.querySelectorAll('.worker-ideas textarea')].some(x=>x.value))return;
  if(busy||doc.visibilityState!=='visible'||doc.querySelector('#studio-editor-form')||doc.querySelector('dialog[open]')||doc.activeElement?.matches('input,select,textarea,button,summary'))return;
  busy=true;
  try{
   const response=await fetcher(url.href,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});
   if(!response.ok||response.redirected)return;
   const next=new Parser().parseFromString(await response.text(),'text/html');
   for(const node of doc.querySelectorAll('[data-worker-updates]')){
    if(node.contains(doc.activeElement))continue;
    const replacement=next.querySelector('[data-worker-updates="'+node.dataset.workerUpdates+'"]');
    if(replacement&&node.innerHTML!==replacement.innerHTML)node.replaceWith(doc.importNode(replacement,true));
   }
  }catch{}finally{busy=false;}
 };
 win.setInterval(update,30000);win.addEventListener('focus',update);return update;
}
