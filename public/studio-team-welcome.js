for (const form of document.querySelectorAll('[data-team-welcome]')) {
  const to = form.querySelector('[data-welcome-to]');
  const subject = form.querySelector('[data-welcome-subject]');
  const message = form.querySelector('[data-welcome-message]');
  const send = form.querySelector('[data-welcome-send]');
  const copy = form.querySelector('[data-welcome-copy]');
  const status = form.querySelector('[data-welcome-status]');
  let busy=false,locked=send.disabled;
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy||locked)return;
    const body=new URLSearchParams(new FormData(form));busy=true;send.disabled=true;
    subject.readOnly=message.readOnly=true;status.textContent='Sending email…';
    try{
      const response=await fetch(form.getAttribute('action'),{method:'POST',headers:{Accept:'application/json'},body});
      const result=await response.json().catch(()=>({error:'Your session may have ended. Sign in again before sending; your message is still here.'}));
      if(!response.ok||result.error)throw new Error(result.error||'The email could not be sent. Your message is still here.');
      locked=result.state!=='failed';status.textContent=result.detail;
      send.textContent=result.state==='accepted'?'Accepted by Microsoft':locked?'Check email activity':'Retry email';
    }catch(error){status.textContent=error.message;send.textContent='Retry email';}
    finally{busy=false;send.disabled=locked;subject.readOnly=message.readOnly=locked;}
  });
  copy.hidden = false;
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText('To: ' + to.value + '\nSubject: ' + subject.value + '\n\n' + message.value);
      status.textContent = 'Email wording copied. The secure password link is added only when you send from this page.';
    } catch {
      message.focus();
      message.select();
      status.textContent = 'Copy is unavailable in this browser. The message is selected so you can copy it manually.';
    }
  });
}
