import { esc } from './library-shelves.mjs';
import {randomUUID} from 'node:crypto';
import {HttpError,uuid} from './platform.mjs';
import {deliverNotification} from './studio-notifications.mjs';
import {welcomeGeneration,welcomeRecipient,sealWelcomeMessage} from './studio-mail-private.mjs';
import {createTeamPasswordLink,setupPlaceholder,resetPlaceholder,teamOrigin} from './team-passwords.mjs';
import {consumePasswordAttempt} from './provisioned-login.mjs';
import {email} from './platform.mjs';

export function welcomeEmail(person, {origin}) {
  const signIn = new URL('/content-library/?work=1', origin).href;
  const subject = 'Welcome to your nutrition.fitness Team Workspace';
  const message = `Hi ${person.name},

Welcome to the nutrition.fitness Team Workspace — our private workspace for creating, organising and reviewing recipes, meal plans, training programmes, workouts, courses and other content.

SET YOUR PASSWORD
Choose your own password using this secure link:
${setupPlaceholder}
This link works once and expires after 24 hours.

Email: ${person.email}
Sign in: ${signIn}

GETTING STARTED
1. Sign in and complete the confidentiality agreement before entering the workspace.
2. Open Home and Projects to find your assignments and instructions.
3. Browse Assets and Archive for existing content and source files. Use Content Studio to create content and edit your assigned work.
4. Save your changes as drafts and mark your work ready for review. An administrator handles approval and publishing.

Please keep your login details private. Reply to this email if you need help.

The nutrition.fitness team`;
  return {to: person.email, subject, message, signIn};
}

export function welcomePanel(person, {origin, env, draft, result, purpose='setup'}) {
  origin=teamOrigin(env);
  const reset=purpose==='reset',mail=reset?resetEmail(person):welcomeEmail(person, {origin});
  const locked=result&&result.state!=='failed';
  const hidden=(name,value)=>'<input type="hidden" name="'+name+'" value="'+esc(value)+'">';
  return '<form method="post" action="/content-library/?work=1&amp;studio=team" class="team-welcome" data-team-welcome><h3>'+(reset?'Password reset email':'Welcome email')+'</h3><p>'+(reset?'Send a secure link to choose a new password. Their current password keeps working until they use the link.':'A welcome message with a secure link to choose their own password.')+' You can edit the message before sending. The password link is added when you send.</p>' +
    hidden('action',reset?'send-password-reset':'send-welcome')+hidden('staff',person.id)+hidden('requestId',draft?.requestId||randomUUID())+hidden('generation',welcomeGeneration(env,person))+
    '<label>To<input data-welcome-to type="email" readonly value="' + esc(mail.to) + '"></label>' +
    '<label>Subject<input name="subject" data-welcome-subject maxlength="200" required'+(locked?' readonly':'')+' value="' + esc(draft?.subject??mail.subject) + '"></label>' +
    '<label>Message<textarea name="message" data-welcome-message rows="19" maxlength="10000" spellcheck="true" required'+(locked?' readonly':'')+'>' + esc(draft?.message??mail.message) + '</textarea></label>' +
    '<div class="studio-actions"><button class="primary" data-welcome-send'+(locked?' disabled':'')+'>'+(result?.state==='failed'?'Retry email':reset?'Send password reset email':'Send welcome email')+'</button><button type="button" data-welcome-copy hidden>Copy email wording</button></div>' +
    '<p class="meta">Sends directly from notifications@nutrition.fitness. The result will appear here.</p>' +
    '<p class="meta" role="status" data-welcome-status>'+esc(result?.detail||'')+'</p></form><script type="module" src="/studio-team-welcome.js"></script>';
}

export function resetEmail(person){
  return {to:person.email,subject:'Reset your nutrition.fitness Team Workspace password',message:`Hi ${person.name},\n\nUse the secure link below to choose a new password for your Team Workspace account:\n${resetPlaceholder}\n\nThis link works once and expires in one hour. Your current password will keep working until you save a new one.\n\nIf you did not request this email, you can ignore it.\n\nThe nutrition.fitness team`};
}
async function deliverAccessEmail(f,{api,actor,env,fetcher},purpose){
  const staffId=uuid(f.staff),requestId=uuid(f.requestId);
  if(typeof f.generation!=='string'||!/^[a-f0-9]{64}$/.test(f.generation))throw new HttpError(400,'Reopen this person’s welcome details.');
  if(typeof f.subject!=='string'||!f.subject.trim()||f.subject.length>200||/[\r\n\x00]/.test(f.subject))throw new HttpError(400,'Enter an email subject of up to 200 characters.');
  if(typeof f.message!=='string'||!f.message.trim()||f.message.length>10000||f.message.includes('\0'))throw new HttpError(400,'Enter a welcome message of up to 10,000 characters.');
  const rows=await api('/rest/v1/nufi_library_staff?id=eq.'+staffId+'&select=id,name,email,code_hash',{service:true});
  const person=rows[0];if(!person?.code_hash)throw new HttpError(409,'Enable this account before sending welcome details.');
  const event={type:'team-access',key:'team-access:'+staffId+':'+requestId,staffId,recipient:person.email,generation:f.generation,passwordLinkExpiresAt:Date.now()+(purpose==='setup'?86400000:3600000),title:f.subject.trim(),message:purpose==='reset'?'Password reset email.':'Welcome email with a password setup link.',link:teamOrigin(env)+'/content-library/?work=1'};
  await welcomeRecipient(api,env,event);
  const link=createTeamPasswordLink(person,env,purpose),placeholder=purpose==='reset'?resetPlaceholder:setupPlaceholder;
  const message=f.message.includes(placeholder)?f.message.replaceAll(placeholder,link):f.message+'\n\n'+(purpose==='reset'?'Reset':'Set')+' your password: '+link;
  event.encryptedMessage=sealWelcomeMessage(env,event,JSON.stringify({message,link,actionLabel:purpose==='reset'?'Reset your password':'Set your password'}));
  const result=await deliverNotification({api,actor,env,event,fetcher,retry:true,returnResult:true});
  return {person,...result};
}
export async function sendWelcome(f,context,purpose='setup'){
  if(context.actor.role!=='admin')throw new HttpError(403,'Administrator access is required.');
  return deliverAccessEmail(f,context,purpose);
}
export async function requestTeamReset(address,{api,env,res,fetcher}){
  const recipient=email(address);
  // Separate account budget from sign-in attempts; the existing global budget
  // also bounds requests for invented addresses and prevents mail flooding.
  await consumePasswordAttempt('team-reset:'+recipient,api,env,res);
  const [person]=await api('/rest/v1/nufi_library_staff?email=eq.'+encodeURIComponent(recipient)+'&select=id,name,email,code_hash',{service:true});
  if(!person?.code_hash)return;
  const mail=resetEmail(person);
  await deliverAccessEmail({staff:person.id,requestId:randomUUID(),generation:welcomeGeneration(env,person),subject:mail.subject,message:mail.message},{api,env,fetcher,actor:{role:'system',id:'team-password-reset'}},'reset');
}
