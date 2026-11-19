const previews=new Map();
document.addEventListener('click',event=>{
 const button=event.target.closest?.('[data-account-preview]');if(!button)return;
 const name='account-preview-'+button.form.elements.staff.value;
 const popup=window.open('about:blank',name,'popup,width=1280,height=900,scrollbars=yes,resizable=yes');
 button.formTarget=popup?name:'_blank';
 if(popup)previews.set(button.form,{popup,button});
});
window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.data?.type!=='account-copy-ready'||!/^studio:account-preview:[a-f0-9-]{36}$/.test(event.data.id))return;
 for(const [form,entry] of previews)if(entry.popup===event.source){
  let field=form.elements.accountPreviewId;
  if(!field){field=document.createElement('input');field.type='hidden';field.name='accountPreviewId';form.append(field);}
  field.value=event.data.id;
 }
});
document.addEventListener('change',event=>{
 if(!event.target.matches('input[name^="access_"]'))return;
 const entry=previews.get(event.target.form);if(!entry||entry.popup.closed)return;
 clearTimeout(entry.timer);entry.timer=setTimeout(()=>event.target.form.requestSubmit(entry.button),200);
});
