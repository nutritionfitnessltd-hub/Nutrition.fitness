for(const frame of document.querySelectorAll('[data-article-reader]')){
 const resize=()=>{try{frame.style.height=frame.contentDocument.documentElement.scrollHeight+'px';}catch{}};
 let observer;
 const watch=()=>{observer?.disconnect();resize();try{observer=new ResizeObserver(resize);observer.observe(frame.contentDocument.body);frame.contentDocument.fonts?.ready.then(resize);}catch{}};
 frame.addEventListener('load',watch);
 if(frame.contentDocument?.readyState==='complete')watch();
}
