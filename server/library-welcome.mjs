import { esc } from './library-shelves.mjs';

export function welcomeEmail(person, {origin, password = ''}) {
  const signIn = new URL('/content-library/?work=1', origin).href;
  const subject = 'Your nutrition.fitness Content Manager access';
  const message = `Hi ${person.name},

Welcome to the nutrition.fitness Content Manager — our private workspace for creating, organising and reviewing recipes, meal plans, training programmes, workouts, courses and other content.

YOUR LOGIN DETAILS
Sign in: ${signIn}
Email: ${person.email}
Password: ${password || 'Use your existing team password. Reply to this email if you need a new one.'}

GETTING STARTED
1. Sign in and complete the confidentiality agreement before entering the workspace.
2. Open Work to find your assignments and instructions.
3. Browse Content library and Originals for existing content and source files. Use Studio to create content and edit your assigned work.
4. Save your changes as drafts and mark your work ready for review. An administrator handles approval and publishing.

Please keep your login details private. Reply to this email if you need help.

The nutrition.fitness team`;
  return {to: person.email, subject, message, signIn};
}

export function welcomePanel(person, {origin, password = ''}) {
  const mail = welcomeEmail(person, {origin, password});
  const href = 'mailto:' + encodeURIComponent(mail.to) + '?subject=' + encodeURIComponent(mail.subject) + '&body=' + encodeURIComponent(mail.message);
  return '<section class="team-welcome" data-team-welcome><h3>Welcome email</h3><p>Login details and a quick introduction to the Content Manager. You can edit the message before sending.</p>' +
    '<label>To<input data-welcome-to type="email" readonly value="' + esc(mail.to) + '"></label>' +
    '<label>Subject<input data-welcome-subject maxlength="200" value="' + esc(mail.subject) + '"></label>' +
    '<label>Message<textarea data-welcome-message rows="19" maxlength="10000" spellcheck="true">' + esc(mail.message) + '</textarea></label>' +
    '<div class="studio-actions"><a class="btn primary" data-welcome-email href="' + esc(href) + '">Open email to send</a><button type="button" data-welcome-copy hidden>Copy welcome message</button></div>' +
    '<p class="meta">This opens a draft in your email app. Review it there and press Send. Nothing has been sent from this page.</p>' +
    '<p class="meta" role="status" data-welcome-status></p></section><script type="module" src="/studio-team-welcome.js"></script>';
}
