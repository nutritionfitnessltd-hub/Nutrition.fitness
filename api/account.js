import {body,reply,fail,session,accountManagementConfigured,passwordConfigured,password,clearSession,HttpError,text} from '../server/platform.mjs';

export function createAccountHandler({env=process.env,fetcher=fetch}={}){return async(req,res)=>{try{
 if(!['GET','PATCH','POST'].includes(req.method)){res.setHeader('Allow','GET, PATCH, POST');throw new HttpError(405,'Method not allowed.');}
 const input=req.method==='GET'?null:body(req,env,16384);
 if(!accountManagementConfigured(env))throw new HttpError(503,'Account management has not been connected in this deployment.');
 const {user,access,api,member}=await session(req,res,env,fetcher);
 if(req.method==='GET'){
  const rows=await api(`/rest/v1/nufi_workspaces?user_id=eq.${encodeURIComponent(user.id)}&select=version,updated_at,onboarding:state->onboarding&limit=1`,{access});
  if(!Array.isArray(rows))throw new HttpError(503,'Your saved account could not be confirmed.');
  const workspace=rows[0];
  const otpReady=env.NUFI_EMAIL_OTP_READY==='true'&&env.NUFI_AUTH_CAPTCHA_READY==='true'&&!!env.TURNSTILE_SITE_KEY&&!!env.TURNSTILE_SECRET_KEY;
  const recipesReady=env.NUFI_RECIPE_CONTENT_READY==='true'&&(otpReady||passwordConfigured(env));
  const recipes=recipesReady&&env.NUFI_RECIPE_ACCESS_MODE==='registered'?'account':recipesReady&&['membership','membership-or-book'].includes(env.NUFI_RECIPE_ACCESS_MODE)?'membership-required':'pending';
  return reply(res,200,{user:{id:user.id,email:user.email,firstName:member.first_name,admin:member.role==='admin',status:member.status},profile:{firstName:member.first_name},workspace:{version:workspace?.version??0,updatedAt:workspace?.updated_at??null},access:{recipes},onboarding:workspace?.onboarding??null});
 }
 if(req.method==='PATCH'){
  if(Object.keys(input).some(key=>key!=='firstName'))throw new HttpError(400,'Only your first name can be changed here.');
  const firstName=text(input.firstName,'first name',80);
  const rows=await api(`/rest/v1/nufi_members?user_id=eq.${encodeURIComponent(user.id)}&status=eq.active&select=first_name`,{method:'PATCH',service:true,headers:{Prefer:'return=representation'},payload:{first_name:firstName,updated_at:new Date().toISOString()}});
  if(!Array.isArray(rows)||rows.length!==1||rows[0].first_name!==firstName)throw new HttpError(409,'Your profile changed. Reload your account before trying again.');
  return reply(res,200,{status:'saved',profile:{firstName}});
 }
 if(input.action!=='change-password')throw new HttpError(400,'Unknown account action.');
 if(!passwordConfigured(env))throw new HttpError(503,'Password sign-in has not been configured and tested yet.');
 const nextPassword=password(input.password),currentPassword=password(input.currentPassword,{existing:true});
 if(nextPassword===currentPassword)throw new HttpError(400,'Choose a different new password.');
 if(typeof input.botToken!=='string'||!input.botToken||input.botToken.length>2048)throw new HttpError(400,'Complete the security check first.');
 let confirmed;
 try{confirmed=await api('/auth/v1/token?grant_type=password',{method:'POST',payload:{email:user.email,password:currentPassword,gotrue_meta_security:{captcha_token:input.botToken}}});}catch(e){if(e.upstreamStatus===429)throw new HttpError(429,'Too many attempts. Please wait before trying again.');if(e.upstreamStatus>=400&&e.upstreamStatus<500)throw new HttpError(400,'Your current password or security check was not accepted.');throw e;}
 if(confirmed?.user?.id!==user.id||confirmed.user.is_anonymous===true||!confirmed.user.email_confirmed_at||!confirmed.access_token)throw new HttpError(401,'Your current password could not be verified.');
 try{await api('/auth/v1/user',{method:'PUT',access:confirmed.access_token,payload:{password:nextPassword}});}catch(e){if(e.upstreamStatus>=400&&e.upstreamStatus<500)throw new HttpError(400,'The new password was not accepted. Use a different password and try again.');throw e;}
 try{await api('/auth/v1/logout?scope=global',{method:'POST',access:confirmed.access_token});}catch{/* The password update already succeeded; local cookies are always cleared. */}
 clearSession(res);return reply(res,200,{status:'password-changed',message:'Your password has changed. Sign in again with your new password.'});
 }catch(e){return fail(res,e);}};}
export default createAccountHandler();
