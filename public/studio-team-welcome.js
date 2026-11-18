for (const panel of document.querySelectorAll('[data-team-welcome]')) {
  const to = panel.querySelector('[data-welcome-to]');
  const subject = panel.querySelector('[data-welcome-subject]');
  const message = panel.querySelector('[data-welcome-message]');
  const email = panel.querySelector('[data-welcome-email]');
  const copy = panel.querySelector('[data-welcome-copy]');
  const status = panel.querySelector('[data-welcome-status]');
  const updateLink = () => {
    email.href = 'mailto:' + encodeURIComponent(to.value) + '?subject=' + encodeURIComponent(subject.value) + '&body=' + encodeURIComponent(message.value);
    status.textContent = '';
  };
  subject.addEventListener('input', updateLink);
  message.addEventListener('input', updateLink);
  email.addEventListener('click', () => {
    updateLink();
    status.textContent = 'Your email app should open with the draft. If it does not, use Copy welcome message and paste it into a new email.';
  });
  copy.hidden = false;
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText('To: ' + to.value + '\nSubject: ' + subject.value + '\n\n' + message.value);
      status.textContent = 'Welcome message copied. Paste it into your email app and send it to ' + to.value + '.';
    } catch {
      message.focus();
      message.select();
      status.textContent = 'Copy is unavailable in this browser. The message is selected so you can copy it manually.';
    }
  });
}
