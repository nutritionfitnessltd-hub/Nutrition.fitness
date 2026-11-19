import {createHash,createHmac,randomBytes,scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {HttpError,uuid} from './platform.mjs';
import {esc} from './library-shelves.mjs';
const derive=promisify(scrypt),service={service:true};
const digest=value=>createHash('sha256').update(value).digest('hex');
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const mac=(env,value)=>createHmac('sha256',env.NUFI_LIBRARY_CATALOGUE_KEY).update('team-password-link:v1:'+value).digest('base64url');
const generation=(env,person)=>mac(env,JSON.stringify([person.id,person.email,person.code_hash]));
export const setupPlaceholder='{{SET_PASSWORD_LINK}}';
export const resetPlaceholder='{{RESET_PASSWORD_LINK}}';
export function teamOrigin(env){
  const origin=new URL(env.NUFI_NOTIFICATION_BASE_URL||'https://team.nutrition.fitness');
  if(origin.protocol!=='https:'||origin.username||origin.password)throw new HttpError(503,'The team email address must use HTTPS.');
  return origin.origin;
}
// The UUID is a unique per-account salt. Keep the existing 64-character column;
// legacy random-password hashes remain readable until that member changes password.
export async function hashTeamPassword(password,id){
  return (await derive(password,'nufi-team-password:v1:'+uuid(id),32,{N:32768,r:8,p:3,maxmem:64*1024*1024})).toString('hex');
}
export async function verifyTeamPassword(password,person){
  if(typeof password!=='string'||password.length<12||password.length>128||!person?.code_hash)return false;
  if(equal(digest(password),person.code_hash))return true;
  return equal(await hashTeamPassword(password,person.id),person.code_hash);
}
export function createTeamPasswordLink(person,env,purpose='setup',now=Date.now()){
  if(!person?.code_hash||!['setup','reset'].includes(purpose))throw new HttpError(409,'Enable this team account before sending an email.');
  const payload=Buffer.from(JSON.stringify({v:1,id:uuid(person.id),purpose,generation:generation(env,person),expires:Math.floor(now/1000)+(purpose==='setup'?86400:3600),nonce:randomBytes(24).toString('base64url')})).toString('base64url');
  return teamOrigin(env)+'/content-library/?work=1&teamPassword=1&token='+payload+'.'+mac(env,payload);
}
export async function readTeamPasswordLink(token,api,env,now=Date.now()){
  const invalid=()=>new HttpError(400,'This password link has expired, has already been used, or is no longer valid. Request a new email.');
  if(typeof token!=='string'||token.length>1500||!/^[-\w]+\.[-\w]{43}$/.test(token))throw invalid();
  const [payload,signature]=token.split('.');if(!equal(mac(env,payload),signature))throw invalid();
  let claims;try{claims=JSON.parse(Buffer.from(payload,'base64url'));}catch{throw invalid();}
  const nowSeconds=Math.floor(now/1000);
  if(claims.v!==1||!['setup','reset'].includes(claims.purpose)||!Number.isInteger(claims.expires)||claims.expires<=nowSeconds||claims.expires>nowSeconds+86400)throw invalid();
  const [person]=await api('/rest/v1/nufi_library_staff?id=eq.'+uuid(claims.id)+'&select=id,name,email,code_hash',service);
  if(!person?.code_hash||!equal(claims.generation,generation(env,person)))throw invalid();
  return {person,purpose:claims.purpose};
}
export async function completeTeamPassword(fields,api,env){
  const {person}=await readTeamPasswordLink(fields.token,api,env);
  const next=fields.password;
  if(typeof next!=='string'||next.length<12||next.length>128||next.trim()!==next||next.includes('\0'))throw new HttpError(400,'Use 12 to 128 characters without spaces at either end.');
  if(next!==fields.confirmPassword)throw new HttpError(400,'Your new passwords do not match.');
  if(await verifyTeamPassword(next,person))throw new HttpError(400,'Choose a different new password.');
  const code_hash=await hashTeamPassword(next,person.id);
  // Compare-and-swap consumes every link for this password generation atomically.
  // A disable, password change or competing reset wins over a stale reset form.
  const rows=await api('/rest/v1/nufi_library_staff?id=eq.'+person.id+'&email=eq.'+encodeURIComponent(person.email)+'&code_hash=eq.'+person.code_hash,{...service,method:'PATCH',headers:{Prefer:'return=representation'},payload:{code_hash}});
  if(!rows.length)throw new HttpError(409,'This password link has already been used or the account changed. Request a new email.');
}
const route='/content-library/?work=1';
export function teamPasswordPage({token='',purpose='setup',error='',done=false,requested=false,forgot=false}={}){
  const title=done?'Your password is saved':forgot?'Reset your team password':purpose==='reset'?'Choose a new password':'Set your team password';
  const hidden=(name,value)=>'<input type="hidden" name="'+name+'" value="'+esc(value)+'">';
  const form=done?'<p>Sign in with your email address and new password.</p><a class="btn primary" href="'+route+'">Sign in</a>':forgot?
    (requested?'<p role="status">If this email belongs to an enabled team member, a password reset email is on its way. Check your inbox and junk folder. The link lasts one hour.</p>':'<p>We’ll email you a secure link to choose a new password.</p><form method="post" action="'+route+'&amp;teamPassword=forgot">'+hidden('action','request-team-reset')+'<label>Email<input name="email" type="email" autocomplete="username" maxlength="254" required></label><button class="primary">Send reset email</button></form>'):
    token?'<p>Choose a password just for your Team Workspace account.</p><form method="post" action="'+route+'&amp;teamPassword=1">'+hidden('action','complete-team-password')+hidden('token',token)+'<label>New password<input type="password" name="password" minlength="12" maxlength="128" autocomplete="new-password" required></label><label>Confirm password<input type="password" name="confirmPassword" minlength="12" maxlength="128" autocomplete="new-password" required></label><p class="meta">Use at least 12 characters. A long, unique passphrase works well.</p><button class="primary">Save password</button></form>':'';
  return '<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="strict-origin"><title>'+title+' | Nutrition.fitness</title><link rel="stylesheet" href="/library-reader.css"><link rel="stylesheet" href="/studio.css"></head><body class="studio login-page"><main class="login-shell"><a class="brand" href="'+route+'"><b>nutrition</b>.fitness</a><section class="auth"><h1>'+title+'</h1>'+(error?'<p role="alert">'+esc(error)+'</p>':'')+form+(!done?'<p><a href="'+route+'&amp;teamPassword=forgot">Request a new password email</a> · <a href="'+route+'">Back to sign in</a></p>':'')+'</section></main></body></html>';
}
