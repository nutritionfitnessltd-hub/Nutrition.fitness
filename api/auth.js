import {signInProvisioned} from '../server/provisioned-login.mjs';
import {provisionedReadiness} from '../server/account-readiness.mjs';
import {syncOne} from '../server/crm.mjs';
import {body,reply,fail,session,setSession,clearSession,platform,platformConfigured,passwordConfigured,passwordLoginConfigured,provisionedAccountsOnly,password,verifiedUser,membership,setRecovery,consumeRecovery,verifyBot,email,text,HttpError} from '../server/platform.mjs';

const signupData=input=>({first_name:text(input.firstName,'first name',80),marketing_opt_in:input.marketing===true,signup_source:'website-account',consent_version:'email-optin-v1',consent_wording:'Yes, send me useful Nutrition.Fitness tips, news and offers by email.'});
const code=value=>{if(typeof value!=='string'||!/^\d{6}$/.test(value))throw new HttpError(400,'Enter the six-digit code from your email.');return value;};
function captchaToken(input){if(typeof input.botToken!=='string'||!input.botToken||input.botToken.length>2048)throw new HttpError(400,'Complete the security check first.');return {captcha_token:input.botToken};}
function providerError(error,fallback){if(error.upstreamStatus===429)throw new HttpError(429,'Too many attempts. Please wait a little before trying again.');if(error.upstreamStatus>=400&&error.upstreamStatus<500)throw new HttpError(400,fallback);throw error;}
async function endProviderSession(api,access,scope='global'){try{await api(`/auth/v1/logout?scope=${scope}`,{method:'POST',access});}catch{/* A completed password change must not be reported as failed because logout is unavailable. */}}

export function createAuthHandler({env=process.env,fetcher=fetch}={}){return async(req,res)=>{try{
 const provisioned=provisionedAccountsOnly(env);
 const otpReady=!provisioned&&platformConfigured(env)&&!!env.TURNSTILE_SECRET_KEY&&!!env.TURNSTILE_SITE_KEY&&env.NUFI_EMAIL_OTP_READY==='true'&&env.NUFI_AUTH_CAPTCHA_READY==='true';
 const passwordReady=passwordConfigured(env);
 if(req.method==='GET'){
  let loginReady=passwordLoginConfigured(env);
  const connection=provisioned?await provisionedReadiness(env,fetcher):null;
  if(connection)loginReady=connection.ready;
  return reply(res,200,{configured:otpReady,passwordConfigured:loginReady,signupConfigured:!provisioned&&(otpReady||passwordReady),recoveryConfigured:!provisioned&&passwordReady,passwordChangeConfigured:passwordReady,provisionedAccountsOnly:provisioned,captchaRequired:!provisioned||!!env.TURNSTILE_SITE_KEY,turnstileSiteKey:env.TURNSTILE_SITE_KEY||null,...(connection?{connection}: {})});
 }
 if(req.method!=='POST'){res.setHeader('Allow','GET, POST');throw new HttpError(405,'Method not allowed.');}
 const input=body(req,env,16384);
 if(input.action==='logout'){
  try{const {api,access}=await session(req,res,env,fetcher);await api('/auth/v1/logout?scope=local',{method:'POST',access});}catch{/* Local sign-out remains available when the provider cannot revoke its session. */}finally{clearSession(res);}
  return reply(res,200,{status:'signed-out'});
 }
 if(provisioned){
  if(input.action!=='login-password')throw new HttpError(503,'Registration and email recovery are not enabled during this account test. Use your existing account to sign in.');
  if(!passwordLoginConfigured(env))throw new HttpError(503,'Password sign-in is not connected in this deployment.');
  const api=platform(env,fetcher),result=await signInProvisioned(email(input.email),input,api,env,res);
  setSession(res,result);return reply(res,200,{status:'signed-in'});
 }
 const passwordActions=['login-password','signup-password','request-reset','verify-recovery','reset-password'];
 if(passwordActions.includes(input.action)&&!passwordReady)throw new HttpError(503,'Password sign-in has not been configured and tested yet.');
 if(input.action==='send-code'&&!otpReady||input.action==='verify-code'&&!otpReady&&!passwordReady)throw new HttpError(503,'Email sign-in has not been configured and tested yet.');
 if(!passwordActions.includes(input.action)&&!['send-code','verify-code'].includes(input.action))throw new HttpError(400,'Unknown account action.');
 const api=platform(env,fetcher);
 if(input.action==='reset-password'){
  const nextPassword=password(input.password),recovery=await consumeRecovery(req,res,api,env);
  try{await api('/auth/v1/user',{method:'PUT',access:recovery.access,payload:{password:nextPassword}});}catch(e){providerError(e,'The password could not be changed. Request a new reset code and use a different password.');}
  await endProviderSession(api,recovery.access);clearSession(res);return reply(res,200,{status:'password-reset',message:'Your password has changed. Sign in with your new password.'});
 }
 const address=email(input.email),security=captchaToken(input);
 if(input.action==='send-code'){
  if(!['signup','login'].includes(input.flow))throw new HttpError(400,'Choose sign in or create an account.');
  const data=input.flow==='signup'?signupData(input):undefined;
  try{await api('/auth/v1/otp',{method:'POST',payload:{email:address,create_user:input.flow==='signup',...(data?{data}:{}),gotrue_meta_security:security}});}catch(e){if(!['otp_disabled','user_not_found'].includes(e.upstreamCode))throw e;}
  return reply(res,200,{status:'code-sent',message:'Check your email for a one-time code. Sign-in requests only send a code to an existing account. Codes expire and can be used once.'});
 }
 if(input.action==='signup-password'){
  const nextPassword=password(input.password),data=signupData(input);let result;
  try{result=await api('/auth/v1/signup',{method:'POST',payload:{email:address,password:nextPassword,data,gotrue_meta_security:security}});}catch(e){if(!['user_already_exists','email_exists'].includes(e.upstreamCode))providerError(e,'The account could not be created. Check the security check and use a stronger password.');}
  // A deployment with email auto-confirm enabled must never silently activate website signups.
  if(result?.access_token){await endProviderSession(api,result.access_token,'local');throw new HttpError(503,'Email confirmation must be enabled before website accounts can be created.');}
  return reply(res,200,{status:'verification-required',message:'Check your email for the six-digit verification code. If you already have an account, sign in instead.'});
 }
 if(input.action==='login-password'){
  let result;try{result=await api('/auth/v1/token?grant_type=password',{method:'POST',payload:{email:address,password:password(input.password,{existing:true}),gotrue_meta_security:security}});}catch(e){providerError(e,'The email or password was not recognised, or the email still needs verification.');}
  const user=verifiedUser(result?.user);await membership(user,api,env);setSession(res,result);return reply(res,200,{status:'signed-in'});
 }
 if(input.action==='request-reset'){
  try{await api('/auth/v1/recover',{method:'POST',payload:{email:address,gotrue_meta_security:security}});}catch(e){if(!['user_not_found','email_not_found'].includes(e.upstreamCode))providerError(e,'The reset request could not be sent. Complete a fresh security check and try again.');}
  return reply(res,200,{status:'code-sent',message:'If an account matches that email, you will receive a six-digit password reset code.'});
 }
 if(input.action==='verify-code'||input.action==='verify-recovery'){
  const token=code(input.code);await verifyBot(input.botToken,'nufi-account',env,fetcher);
  // Generic email OTP also accepts recovery tokens in GoTrue. Keep that only
  // when passwordless sign-in is intentionally enabled; password-only signup
  // verification must be restricted to a signup confirmation code.
  const verificationType=input.action==='verify-recovery'?'recovery':otpReady?'email':'signup';
  let result;try{result=await api('/auth/v1/verify',{method:'POST',payload:{email:address,token,type:verificationType}});}catch(e){if(e.upstreamStatus===429)providerError(e);throw new HttpError(400,'The code is invalid or has expired. Request a new one and try again.');}
  const user=verifiedUser(result?.user);
  if(input.action==='verify-recovery'){await setRecovery(res,result,api,env);return reply(res,200,{status:'recovery-verified',message:'Choose your new password. This reset expires in ten minutes.'});}
  await membership(user,api,env);setSession(res,result);let crm='queued';
  try{crm=(await syncOne(api,env,fetcher)).status;}catch{/* Verified signup is already durable; retry from the outbox, never discard the session. */}
  return reply(res,200,{status:'signed-in',crm});
 }
 throw new HttpError(400,'Unknown account action.');
 }catch(e){return fail(res,e);}};}
export default createAuthHandler();
