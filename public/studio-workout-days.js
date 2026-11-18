const form = document.querySelector('[data-week-days]');
if (form) {
  let dirty = form.hasAttribute('data-unsaved'), submitting = false;
  const changed = () => { dirty = true; form.querySelector('[data-days-status]').textContent = 'Unsaved changes'; };
  const rows = () => [...form.querySelectorAll('[data-day-row]')];
  function renumber() {
    const days = rows();
    days.forEach((row, i) => {
      row.querySelector('legend').textContent = 'Day ' + (i + 1);
      row.querySelector('[data-day-label]').name = 'label' + i;
      row.querySelector('select').name = 'session' + i;
      for (const button of row.querySelectorAll('[data-move-day]')) {
        const offset = Number(button.dataset.moveDay);
        button.disabled = i + offset < 0 || i + offset >= days.length;
        button.setAttribute('aria-label', 'Move Day ' + (i + 1) + (offset < 0 ? ' earlier' : ' later'));
      }
    });
  }
  form.addEventListener('click', event => {
    const button = event.target.closest('[data-move-day]');
    if (!button) return;
    const row = button.closest('[data-day-row]'), offset = Number(button.dataset.moveDay);
    const days = rows(), index = days.indexOf(row), target = days[index + offset];
    if (!target) return;
    if (offset < 0) target.before(row); else target.after(row);
    renumber(); changed();
    row.querySelector('legend').setAttribute('tabindex', '-1');
    row.querySelector('legend').focus();
  });
  form.addEventListener('change', event => {
    // Changing the assignment must not leave an edit link pointing at the old workout.
    if (event.target.matches('select')) event.target.closest('[data-day-row]').querySelector('a.btn')?.remove();
    changed();
  });
  form.addEventListener('input', changed);
  form.addEventListener('submit', () => { submitting = true; renumber(); });
  window.addEventListener('beforeunload', event => { if (dirty && !submitting) { event.preventDefault(); event.returnValue = ''; } });
  renumber();
}
