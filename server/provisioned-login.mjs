/** Password login for explicitly provisioned website members. No signup or email side effects. */
import {createHmac} from 'node:crypto';
import {HttpError, membership, password, verifiedUser} from './platform.mjs';

export async function provisionedLoginAvailable(api) {
  // No rows or secrets are returned. This verifies the server credential and limiter migration.
  const rows=await api('/rest/v1/nufi_login_limits?select=bucket&limit=0',{service:true});
  if(!Array.isArray(rows)||rows.length!==0)throw new HttpError(503,'Password sign-in is not connected in this deployment.');
  return true;
}

export async function signInProvisioned(address,input,api,env,res) {
  const suppliedPassword=password(input.password,{existing:true});
  const bucket=createHmac('sha256',env.SUPABASE_SERVICE_ROLE_KEY).update('nufi-login-v1:'+address).digest('hex');
  const budget=await api('/rest/v1/rpc/nufi_consume_password_attempt',{
    method:'POST',service:true,payload:{account_bucket:bucket},
  });
  if(!budget||typeof budget.allowed!=='boolean'||!Number.isInteger(budget.retry_after)||budget.retry_after<0||budget.retry_after>900){
    throw new HttpError(503,'Sign-in protection could not be confirmed. Please try again.');
  }
  if(!budget.allowed){res.setHeader('Retry-After',String(Math.max(1,budget.retry_after)));throw new HttpError(429,'Too many sign-in attempts. Please wait before trying again.');}
  // Do not disable provider protection. When Turnstile is configured, send its real token.
  let security={};
  if(env.TURNSTILE_SITE_KEY||env.TURNSTILE_SECRET_KEY){
    if(!env.TURNSTILE_SITE_KEY||!env.TURNSTILE_SECRET_KEY||env.NUFI_AUTH_CAPTCHA_READY!=='true')throw new HttpError(503,'The sign-in security check needs to be configured.');
    if(typeof input.botToken!=='string'||!input.botToken||input.botToken.length>2048)throw new HttpError(400,'Complete the security check first.');
    security={gotrue_meta_security:{captcha_token:input.botToken}};
  }
  let result;
  try{
    result=await api('/auth/v1/token?grant_type=password',{method:'POST',payload:{email:address,password:suppliedPassword,...security}});
  }catch(error){
    if(error.upstreamStatus===429)throw new HttpError(429,'Too many sign-in attempts. Please wait before trying again.');
    if(error.upstreamStatus>=400&&error.upstreamStatus<500)throw new HttpError(400,'The email or password was not recognised, or this account is not enabled.');
    throw error;
  }
  try{
    const user=verifiedUser(result?.user);
    await membership(user,api,env); // No missing-member backfill in provisioned mode.
  }catch(error){
    if(result?.access_token){try{await api('/auth/v1/logout?scope=local',{method:'POST',access:result.access_token});}catch{}}
    if(error.status===401||error.status===403)throw new HttpError(400,'The email or password was not recognised, or this account is not enabled.');
    throw error;
  }
  return result;
}
