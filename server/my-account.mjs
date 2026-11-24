import {teamOnboardingProfile} from './team-welcome.mjs';
import {hashTeamPassword,verifyTeamPassword} from './team-passwords.mjs';
import {HttpError,email,password,text,uuid,verifiedUser} from './platform.mjs';
import {signInProvisioned,consumePasswordAttempt} from './provisioned-login.mjs';
import {esc,url,heading,form,input,button} from './studio-ui.mjs';
const service={service:true},staffTable='/rest/v1/nufi_library_staff';
async function ownProfile(actor,api){
 if(actor.role==='staff'){
  const [person]=await api(staffTable+'?id=eq.'+uuid(actor.id)+'&select=id,name,email,code_hash',service);
  if(!person)throw new HttpError(404,'Your account could not be found.');return person;
 }
 if(actor.role!=='admin')throw new HttpError(403,'Sign in to open My account.');
 const user=await api('/auth/v1/admin/users/'+uuid(actor.id),service);
 return {id:actor.id,name:user.user_metadata?.full_name||user.user_metadata?.name||'Administrator',email:email(user.email),metadata:user.user_metadata||{}};
}
export async function myAccountScreen(actor,api,params,env,{copy=false}={}){
 const person=await ownProfile(actor,api),saved=params.get('saved');
 const ownerDirector=(await teamOnboardingProfile(actor,api))?.engagementType==='owner_director';
 const security='<label>Current password<input type="password" name="currentPassword" autocomplete="current-password" maxlength="128" required></label><label>New password<input type="password" name="newPassword" autocomplete="new-password" minlength="12" maxlength="128" required></label><label>Confirm new password<input type="password" name="confirmPassword" autocomplete="new-password" minlength="12" maxlength="128" required></label>';
 const captcha=actor.role==='admin'&&env.TURNSTILE_SITE_KEY?'<div class="cf-turnstile" data-sitekey="'+esc(env.TURNSTILE_SITE_KEY)+'" data-response-field-name="botToken"></div><script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>':'';
 return heading('My account','Your profile, sign-in security and signed agreement.')+
  (saved==='profile'||saved==='password'?'<p class="panel" role="status">'+(saved==='profile'?'Your display name has been saved.':'Your password has been changed.')+'</p>':'')+
  '<div class="studio-columns"><section class="panel"><h2>Profile</h2><p><strong>Email</strong><br>'+esc(person.email)+'</p><p><strong>Account type</strong><br>'+esc(actor.role==='admin'?'Administrator':'Team member')+'</p>'+
  (copy?'<p><strong>Display name</strong><br>'+esc(person.name)+'</p>':form('account-profile',input('name','Display name',person.name,'text','maxlength="100" autocomplete="name" required'),{section:'account'},'Save profile'))+
  '<p class="meta">Contact your administrator if your sign-in email needs to change.</p></section>'+
  '<section class="panel"><h2>Security</h2>'+(copy?'<p>Open your own My account page to change your password.</p>':form('account-password',security+'<p class="meta">Use 12 to 128 characters. A long, unique passphrase works well.</p>'+captcha,{section:'account'},'Change password'))+'</section></div>'+
  (ownerDirector?'<section class="panel"><h2>Owner / Director</h2><p>A welcome letter and NDA are not required for your ownership role.</p></section>':'<section class="panel"><h2>My confidentiality agreement</h2><p>Read or download the agreement signed by your account.</p><div class="studio-actions">'+button('Read signed agreement',url('account',{nda:'record'}))+button('Download signed agreement',url('account',{nda:'copy'}))+'</div></section>')+
  '<section class="panel"><h2>Sign out</h2>'+form('work-logout','',{},'Sign out of this workspace')+'</section>';
}
export async function changeMyAccount(fields,{actor,api,env,res}){
 const profile=await ownProfile(actor,api);
 if(fields.action==='account-profile'){
  const name=text(fields.name,'your display name',100);
  if(actor.role==='staff'){
   const rows=await api(staffTable+'?id=eq.'+uuid(actor.id)+'&name=eq.'+encodeURIComponent(profile.name),{...service,method:'PATCH',headers:{Prefer:'return=representation'},payload:{name}});
   if(!rows.length)throw new HttpError(409,'Your profile changed. Reload before saving.');
  }else await api('/auth/v1/admin/users/'+uuid(actor.id),{...service,method:'PUT',payload:{user_metadata:{...profile.metadata,full_name:name}}});
  return {saved:'profile'};
 }
 if(fields.action!=='account-password')throw new HttpError(400,'Choose an account action.');
 const next=password(fields.newPassword),current=password(fields.currentPassword,{existing:true});
 if(next!==fields.confirmPassword)throw new HttpError(400,'The new passwords do not match.');
 if(next===current)throw new HttpError(400,'Choose a different new password.');
 if(actor.role==='staff'){
  if(next.trim()!==next)throw new HttpError(400,'Use 12 to 128 characters without spaces at either end.');
  await consumePasswordAttempt(profile.email,api,env,res);
  if(!await verifyTeamPassword(current.trim(),profile))throw new HttpError(400,'Your current password was not recognised.');
  const codeHash=await hashTeamPassword(next,profile.id);
  const rows=await api(staffTable+'?id=eq.'+uuid(actor.id)+'&code_hash=eq.'+profile.code_hash,{...service,method:'PATCH',headers:{Prefer:'return=representation'},payload:{code_hash:codeHash}});
  if(!rows.length)throw new HttpError(409,'Your password changed. Sign in again before continuing.');
  return {saved:'password',codeHash};
 }
 const scoped={...env,NUFI_ACCOUNT_MANAGEMENT_READY:'true',NUFI_AUTH_MODE:'provisioned'};
 const session=await signInProvisioned(profile.email,{password:current,botToken:fields.botToken},api,scoped,res);
 try{
  if(verifiedUser(session.user).id!==actor.id)throw new HttpError(403,'Sign in again before changing your password.');
  if(!session.access_token)throw new HttpError(503,'Your sign-in could not be verified.');
  await api('/auth/v1/user',{method:'PUT',access:session.access_token,payload:{password:next,current_password:current}});
 }finally{if(session.access_token)try{await api('/auth/v1/logout?scope=local',{method:'POST',access:session.access_token});}catch{}}
 return {saved:'password'};
}
