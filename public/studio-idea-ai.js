document.addEventListener('click',async event=>{
 const use=event.target.closest?.('[data-idea-ai-use],[data-idea-ai-dismiss]');
 if(use){
  const form=use.closest('form'),suggestion=form.querySelector('[data-idea-ai-suggestion]');
  if(use.hasAttribute('data-idea-ai-use')){form.elements.summary.value=form.querySelector('[data-idea-ai-text]').textContent;form.elements.summary.dispatchEvent(new Event('input',{bubbles:true}));form.elements.summary.focus();}
  suggestion.hidden=true;form.querySelector('[data-idea-ai-status]').textContent=use.hasAttribute('data-idea-ai-use')?'AI text added. Review it before saving.':'Your text is unchanged.';return;
 }
 const button=event.target.closest?.('[data-idea-ai]');if(!button)return;
 const form=button.closest('form'),title=form.elements.title,notes=form.elements.summary,status=form.querySelector('[data-idea-ai-status]');
 if(!title.value.trim()){status.textContent='Add an idea title first.';title.focus();return;}
 if(form.hasAttribute('data-ai-busy'))return;
 const originalTitle=title.value,originalNotes=notes.value;
 form.querySelector('[data-idea-ai-suggestion]').hidden=true;
 button.disabled=true;form.setAttribute('data-ai-busy','');button.setAttribute('aria-busy','true');status.textContent='Generating an explanation…';
 try{
  const response=await fetch(form.getAttribute('action'),{method:'POST',credentials:'same-origin',headers:{Accept:'application/json'},body:new URLSearchParams({action:'idea-generate-summary',title:originalTitle,summary:originalNotes})});
  const result=await response.json().catch(()=>null);if(!response.ok||typeof result?.summary!=='string')throw Error(result?.error||'Could not generate the explanation. Your notes are still here.');
  if(!form.isConnected)return;
  if(!originalNotes.trim()&&notes.value===originalNotes&&title.value===originalTitle){notes.value=result.summary;notes.dispatchEvent(new Event('input',{bubbles:true}));status.textContent='AI draft added. Review and edit it before saving.';}
  else{form.querySelector('[data-idea-ai-text]').textContent=result.summary;form.querySelector('[data-idea-ai-suggestion]').hidden=false;status.textContent='Review the suggestion below. Your current text has been kept.';}
 }catch(error){status.textContent=error.message||'Could not generate the explanation. Your notes are still here.';}
 finally{button.disabled=false;button.removeAttribute('aria-busy');form.removeAttribute('data-ai-busy');}
});
