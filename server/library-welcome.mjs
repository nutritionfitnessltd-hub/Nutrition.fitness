import { esc } from './library-shelves.mjs';
import {randomUUID} from 'node:crypto';
import {HttpError,uuid} from './platform.mjs';
import {deliverNotification} from './studio-notifications.mjs';
import {welcomeGeneration,welcomeRecipient,sealWelcomeMessage} from './studio-mail-private.mjs';

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

export function welcomePanel(person, {origin, password = '', env, draft, result}) {
  const mail = welcomeEmail(person, {origin, password});
  const locked=result&&result.state!=='failed';
  const hidden=(name,value)=>'<input type="hidden" name="'+name+'" value="'+esc(value)+'">';
  return '<form method="post" action="/content-library/?work=1&amp;studio=team" class="team-welcome" data-team-welcome><h3>Welcome email</h3><p>Login details and a quick introduction to the Content Manager. You can edit the message before sending.</p>' +
    hidden('action','send-welcome')+hidden('staff',person.id)+hidden('requestId',draft?.requestId||randomUUID())+hidden('generation',welcomeGeneration(env,person))+
    '<label>To<input data-welcome-to type="email" readonly value="' + esc(mail.to) + '"></label>' +
    '<label>Subject<input name="subject" data-welcome-subject maxlength="200" required'+(locked?' readonly':'')+' value="' + esc(draft?.subject??mail.subject) + '"></label>' +
    '<label>Message<textarea name="message" data-welcome-message rows="19" maxlength="10000" spellcheck="true" required'+(locked?' readonly':'')+'>' + esc(draft?.message??mail.message) + '</textarea></label>' +
    '<div class="studio-actions"><button class="primary" data-welcome-send'+(locked?' disabled':'')+'>'+(result?.state==='failed'?'Retry welcome email':'Send welcome email')+'</button><button type="button" data-welcome-copy hidden>Copy welcome message</button></div>' +
    '<p class="meta">Sends directly from notifications@nutrition.fitness. The result will appear here.</p>' +
    '<p class="meta" role="status" data-welcome-status>'+esc(result?.detail||'')+'</p></form><script type="module" src="/studio-team-welcome.js"></script>';
}

export async function sendWelcome(f,{api,actor,env,origin,fetcher}){
  if(actor.role!=='admin')throw new HttpError(403,'Administrator access is required.');
  const staffId=uuid(f.staff),requestId=uuid(f.requestId);
  if(typeof f.generation!=='string'||!/^[a-f0-9]{64}$/.test(f.generation))throw new HttpError(400,'Reopen this person’s welcome details.');
  if(typeof f.subject!=='string'||!f.subject.trim()||f.subject.length>200||/[\r\n\x00]/.test(f.subject))throw new HttpError(400,'Enter an email subject of up to 200 characters.');
  if(typeof f.message!=='string'||!f.message.trim()||f.message.length>10000||f.message.includes('\0'))throw new HttpError(400,'Enter a welcome message of up to 10,000 characters.');
  const rows=await api('/rest/v1/nufi_library_staff?id=eq.'+staffId+'&select=id,name,email,code_hash',{service:true});
  const person=rows[0];if(!person?.code_hash)throw new HttpError(409,'Enable this account before sending welcome details.');
  const event={type:'welcome',key:'welcome:'+staffId+':'+requestId,staffId,recipient:person.email,generation:f.generation,title:f.subject.trim(),message:'Welcome email with login details.',link:new URL('/content-library/?work=1',origin).href};
  await welcomeRecipient(api,env,event);
  event.encryptedMessage=sealWelcomeMessage(env,event,f.message);
  const result=await deliverNotification({api,actor,env,event,fetcher,retry:true,returnResult:true});
  return {person,...result};
}
