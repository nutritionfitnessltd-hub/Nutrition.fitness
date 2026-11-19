// Keep workspace navigation and forms inside this window's working copy.
(()=>{
 const id=new URL(location.href).searchParams.get('accountPreview');if(!id)return;
 function target(value){
  const url=new URL(value,location.href);
  if(url.origin===location.origin&&url.pathname==='/content-library/'){url.searchParams.set('work','1');url.searchParams.set('accountPreview',id);}
  return url.href;
 }
 function prepare(root){
  for(const node of root.querySelectorAll('a[href],form[action],button[formaction]')){
   const attr=node.matches('a')?'href':node.matches('form')?'action':'formaction';node.setAttribute(attr,target(node.getAttribute(attr)));
  }
  for(const form of root.querySelectorAll('form'))if(form.method.toLowerCase()==='get'){
   for(const [name,value] of [['accountPreview',id],['work','1']])if(!form.elements.namedItem(name)){
    const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.append(input);
   }
  }
 }
 document.addEventListener('DOMContentLoaded',()=>{prepare(document);new MutationObserver(()=>prepare(document)).observe(document.body,{childList:true,subtree:true});});
 document.addEventListener('submit',event=>prepare(event.target.parentNode),true);
 const request=window.fetch;window.fetch=(input,options)=>request(input instanceof Request?new Request(target(input.url),input):target(input),options);
 const open=window.open;window.open=function(url,...args){return open.call(this,url&&url!=='about:blank'?target(url):url,...args);};
})();
