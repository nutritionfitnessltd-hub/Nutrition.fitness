document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-newsletter-width],[data-copy-newsletter]');
  const area=button?.closest('[data-newsletter-design]');if(!area)return;
  if(button.dataset.newsletterWidth){
    area.querySelector('.newsletter-canvas').dataset.width=button.dataset.newsletterWidth;
    area.querySelectorAll('[data-newsletter-width]').forEach(option=>option.setAttribute('aria-pressed',String(option===button)));
  }else{
    const source=area.querySelector('[data-newsletter-source]'),status=area.querySelector('[data-newsletter-status]');
    try{await navigator.clipboard.writeText(source.value);status.textContent='HTML copied';}
    catch{source.hidden=false;source.readOnly=true;source.focus();source.select();status.textContent='Select and copy the HTML below, or use Download HTML.';}
  }
});
