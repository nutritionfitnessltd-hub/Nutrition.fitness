const panel = document.querySelector('#workout');
const form = panel?.querySelector('[data-workout-inline]');
if (form) {
  const preview = panel.querySelector('[data-workout-preview]'), editor = panel.querySelector('[data-workout-editor]');
  const error = form.querySelector('[data-workout-error]'), submit = form.querySelector('[type=submit]'), cancel = form.querySelector('[data-workout-cancel]');
  let saving = false;
  const showPreview = () => { editor.hidden = true; preview.hidden = false; preview.querySelector('[data-workout-edit]')?.focus({preventScroll:true}); };
  panel.addEventListener('click', event => {
    if (event.target.closest('[data-workout-edit]')) {
      preview.hidden = true; editor.hidden = false; error.hidden = true;
      form.querySelector('[name=title]').focus({preventScroll:true});
    }
    if (event.target.closest('[data-workout-cancel]') && !saving) {
      form.dispatchEvent(new Event('studio-editor-reset')); error.hidden = true; showPreview();
    }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (saving) return;
    form.dispatchEvent(new Event('studio-editor-serialize'));
    const body = new URLSearchParams(new FormData(form));
    const controls = [...form.querySelectorAll('input,textarea,select,button')].map(control=>[control,control.disabled]);
    controls.forEach(([control])=>{control.disabled=true;});
    saving = true; submit.disabled = cancel.disabled = true; submit.textContent = 'Saving…'; error.hidden = true;
    try {
      const response = await fetch(form.getAttribute('action'),{method:'POST',credentials:'same-origin',headers:{Accept:'application/json'},body});
      const result = await response.json().catch(() => { throw new Error('Your session may have expired. Your edits are still here; sign in again before retrying.'); });
      if (!response.ok || !result.record || !result.preview) throw new Error(result.error || 'The workout could not be saved. Your edits are still here.');
      preview.innerHTML = result.preview;
      form.dispatchEvent(new CustomEvent('studio-editor-saved',{detail:result.record}));
      for (const day of document.querySelectorAll('.workout-days a[data-session-id]')) {
        if (day.dataset.sessionId !== result.record.id) continue;
        day.querySelector('strong').textContent = result.record.title.split(' — ').at(-1);
        const duration = day.querySelector('small');
        if (duration) duration.textContent = result.record.fields.duration + ' min';
      }
      showPreview();
      panel.querySelector('[data-workout-saved]').textContent = 'Workout saved as a draft.';
    } catch (e) {
      form.dispatchEvent(new Event('studio-editor-error'));
      error.textContent = e.message || 'Could not save. Your edits are still here.'; error.hidden = false;
      error.scrollIntoView({block:'nearest'});
    } finally {
      controls.forEach(([control,disabled])=>{control.disabled=disabled;});
      saving = false; submit.disabled = cancel.disabled = false; submit.removeAttribute('aria-disabled'); submit.textContent = 'Save workout';
    }
  });
}
