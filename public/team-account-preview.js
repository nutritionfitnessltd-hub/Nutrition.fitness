document.addEventListener('click',event=>{
 const button=event.target.closest?.('[data-account-preview]');if(!button)return;
 const name='account-preview-'+crypto.randomUUID();
 const popup=window.open('about:blank',name,'popup,width=1280,height=900,scrollbars=yes,resizable=yes');
 button.formTarget=popup?name:'_blank';
});
