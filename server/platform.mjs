/** Server-only platform access. Tokens never enter browser storage or JSON responses. */
import {timingSafeEqual, randomBytes, createHash, createCipheriv, createDecipheriv} from 'node:crypto';
export class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
export function reply(res,status,data){res.setHeader('Cache-Control','no-store, private');res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Vary','Cookie');return res.status(status).json(data);}
export function fail(res,error){return reply(res,error.status||503,{error:error.status?error.message:'The service could not confirm this request. Your existing data has not been replaced.'});}
export function origins(env){const values=[env.SITE_URL,...(env.NUFI_ALLOWED_ORIGINS||'').split(',')].filter(Boolean);if(!values.length)throw new HttpError(503,'The website connection has not been configured.');return values.map(v=>{const u=new URL(v);if(u.protocol!=='https:'&&!(env.NODE_ENV==='test'&&u.hostname==='localhost'))throw new HttpError(503,'The website origin needs HTTPS.');return u.origin;});}
export function body(req,env,max=2000000){if(!origins(env).includes(req.headers.origin))throw new HttpError(403,'Please make this change from the Nutrition.Fitness website.');if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw new HttpError(415,'Use the website form to submit this change.');let b;try{const s=typeof req.body==='string'?req.body:JSON.stringify(req.body);if(!s||Buffer.byteLength(s)>max)throw new Error();b=JSON.parse(s);}catch{throw new HttpError(400,'The request could not be read or was too large.');}if(!b||typeof b!=='object'||Array.isArray(b))throw new HttpError(400,'Check the request format.');return b;}
export const email=v=>{if(typeof v!=='string'||v.length>254||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v.trim()))throw new HttpError(400,'Enter a valid email address.');return v.trim().toLowerCase();};
export function text(v,label,max=100){if(typeof v!=='string'||!v.trim()||v.length>max||/[<>\x00-\x1f]/.test(v))throw new HttpError(400,`Check ${label}.`);return v.trim();}
export const uuid=v=>{if(typeof v!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v))throw new HttpError(400,'A valid request identifier is required.');return v;};
export function platformConfigured(env){try{return !!(env.SUPABASE_URL&&new URL(env.SUPABASE_URL).protocol==='https:'&&env.SUPABASE_ANON_KEY&&env.SUPABASE_SERVICE_ROLE_KEY&&env.SITE_URL);}catch{return false;}}
export function platform(env,fetcher=fetch){if(!platformConfigured(env))throw new HttpError(503,'Account storage is not connected in this deployment. Your browser plan is still available.');const base=env.SUPABASE_URL.replace(/\/$/,'');return async(endpoint,{method='GET',payload,access,service=false,headers={}}={})=>{const key=service?env.SUPABASE_SERVICE_ROLE_KEY:env.SUPABASE_ANON_KEY;const response=await fetcher(base+endpoint,{method,headers:{apikey:key,Authorization:`Bearer ${access||key}`,'Content-Type':'application/json',...headers},body:payload===undefined?undefined:JSON.stringify(payload),signal:AbortSignal.timeout(10000)});const data=await response.json().catch(()=>null);if(!response.ok){const code=data?.code||data?.error_code;const status=code==='40001'||response.status===409?409:code==='PT400'?400:code==='PT403'?403:code==='PT404'?404:response.status===401?401:response.status===429?429:503;const messages={400:'Check this change and try again.',401:'Please sign in again.',403:'You no longer have permission to make this change.',404:'The requested record was not found.',409:'A newer copy has been saved. Reload the account copy before editing.',429:'Too many attempts. Please wait before trying again.'};const error=new HttpError(status,messages[status]||'The account service did not confirm this change. Please try again.');error.upstreamCode=code;error.upstreamStatus=response.status;throw error;}return data;};}
export function cookies(req){const values={};for(const part of (req.headers.cookie||'').split(';')){const p=part.trim().indexOf('=');if(p<1)continue;const k=part.trim().slice(0,p);try{values[k]=decodeURIComponent(part.trim().slice(p+1));}catch{}}return values;}
const ACCESS='__Host-nufi-access',REFRESH='__Host-nufi-refresh',RECOVERY='__Host-nufi-recovery';
const cookie=(name,value,maxAge)=>`${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
function appendCookies(res,values){const previous=res.getHeader?.('Set-Cookie')||res.headers?.['Set-Cookie']||[];res.setHeader('Set-Cookie',[...(Array.isArray(previous)?previous:[previous]),...values]);}
export function setSession(res,next){
 if(typeof next?.access_token!=='string'||!next.access_token||next.access_token.length>6000||typeof next.refresh_token!=='string'||!next.refresh_token||next.refresh_token.length>6000)throw new HttpError(503,'Sign-in did not return a valid session.');
 const maxAge=Number.isFinite(next.expires_in)?Math.max(1,Math.min(Math.floor(next.expires_in),3600)):3600;
 appendCookies(res,[cookie(ACCESS,next.access_token,maxAge),cookie(REFRESH,next.refresh_token,2592000)]);
}
export function clearSession(res){appendCookies(res,[ACCESS,REFRESH,RECOVERY].map(k=>cookie(k,'',0)));}
export function accountManagementConfigured(env){return platformConfigured(env)&&env.NUFI_ACCOUNT_MANAGEMENT_READY==='true';}
export function provisionedAccountsOnly(env){return env.NUFI_AUTH_MODE==='provisioned';}
function passwordCaptchaConfigured(env){
 const site=!!env.TURNSTILE_SITE_KEY,secret=!!env.TURNSTILE_SECRET_KEY;
 return !site&&!secret || (site&&secret&&env.NUFI_AUTH_CAPTCHA_READY==='true');
}
export function passwordLoginConfigured(env){return provisionedAccountsOnly(env)?accountManagementConfigured(env):accountManagementConfigured(env)&&env.NUFI_PASSWORD_AUTH_READY==='true'&&passwordCaptchaConfigured(env);}
export function publicSignupConfigured(env){return !provisionedAccountsOnly(env)&&passwordLoginConfigured(env)&&env.NUFI_PUBLIC_SIGNUP_READY==='true';}
export function passwordConfigured(env){return !provisionedAccountsOnly(env)&&passwordLoginConfigured(env)&&env.NUFI_PASSWORD_RECOVERY_READY==='true'&&recoveryKey(env,false)!==null;}
export function password(value,{existing=false}={}){if(typeof value!=='string'||value.length<(existing?1:12)||value.length>128||/[\x00]/.test(value))throw new HttpError(400,existing?'Enter your current password.':'Use a password with 12 to 128 characters.');return value;}
export function verifiedUser(user){if(!user?.id||!user.email_confirmed_at||!user.email||user.is_anonymous===true)throw new HttpError(401,'Verify your email before using this account.');return user;}
export async function membership(user,api,env){
 verifiedUser(user);
 if(!accountManagementConfigured(env)){if(provisionedAccountsOnly(env))throw new HttpError(503,'Account permissions are not connected.');return null;}
 const endpoint=`/rest/v1/nufi_members?user_id=eq.${encodeURIComponent(user.id)}&select=user_id,first_name,role,status,created_at,updated_at&limit=1`;
 let rows=await api(endpoint,{service:true});
 if(!Array.isArray(rows))throw new HttpError(503,'Your account permissions could not be confirmed.');
 if(!rows.length){
  if(provisionedAccountsOnly(env))throw new HttpError(403,'This account has not been enabled for the website test.');
  // User-editable metadata is display content only. Roles come from protected records.
  const firstName=typeof user.user_metadata?.first_name==='string'?user.user_metadata.first_name.replace(/[<>\x00-\x1f]/g,'').trim().slice(0,80):'';
  await api('/rest/v1/nufi_members?on_conflict=user_id',{method:'POST',service:true,headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},payload:{user_id:user.id,first_name:firstName,role:isAdmin(user,env)?'admin':'member',status:'active'}});
  rows=await api(endpoint,{service:true});
 }
 const member=rows?.[0];
 if(member?.user_id!==user.id||!['member','admin'].includes(member.role)||!['active','suspended'].includes(member.status))throw new HttpError(503,'Your account permissions could not be confirmed.');
 if(member.status==='suspended')throw new HttpError(403,'Your account access is paused. Please contact Nutrition.Fitness.');
 return member;
}
export async function requireAdmin(user,api,env){
 const member=await membership(user,api,env);
 if(member?member.role!=='admin':!isAdmin(user,env))throw new HttpError(403,'Admin access is required.');
 return member;
}
export async function session(req,res,env,fetcher=fetch){
 const c=cookies(req),api=platform(env,fetcher);
 const confirm=async access=>{const user=verifiedUser(await api('/auth/v1/user',{access}));const member=await membership(user,api,env);return {user,access,api,member};};
 if(c[ACCESS]){try{return await confirm(c[ACCESS]);}catch(e){if(e.status===403){clearSession(res);throw e;}if(e.status!==401)throw e;}}
 if(c[REFRESH]){try{const next=await api('/auth/v1/token?grant_type=refresh_token',{method:'POST',payload:{refresh_token:c[REFRESH]}});const current=await confirm(next.access_token);setSession(res,next);return current;}catch(e){if(e.status===401||e.status===403){clearSession(res);throw new HttpError(e.status,e.status===403?e.message:'Your session ended. Sign in again; your local account copy has not been deleted.');}throw e;}}
 throw new HttpError(401,'Sign in to use your account copy.');
}
function recoveryKey(env,required=true){
 const value=env.NUFI_RECOVERY_ENCRYPTION_KEY;
 if(typeof value==='string'&&/^[A-Za-z0-9+/]{43}=$/.test(value)){const key=Buffer.from(value,'base64');if(key.length===32)return key;}
 if(required)throw new HttpError(503,'Password recovery has not been configured.');
 return null;
}
function sealRecovery(access,env,userId){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',recoveryKey(env),iv);cipher.setAAD(Buffer.from(`nufi-recovery-v1:${userId}`));const encrypted=Buffer.concat([cipher.update(access,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64');}
function openRecovery(record,env){try{const raw=Buffer.from(record.access_ciphertext,'base64');if(raw.length<29||raw.length>10000)throw new Error();const decipher=createDecipheriv('aes-256-gcm',recoveryKey(env),raw.subarray(0,12));decipher.setAAD(Buffer.from(`nufi-recovery-v1:${record.user_id}`));decipher.setAuthTag(raw.subarray(12,28));return Buffer.concat([decipher.update(raw.subarray(28)),decipher.final()]).toString('utf8');}catch{throw new HttpError(401,'This password reset expired. Request a new code.');}}
const recoveryHash=value=>createHash('sha256').update(value).digest('hex');
export async function setRecovery(res,result,api,env,now=Date.now()){
 const user=verifiedUser(result.user);await membership(user,api,env);
 if(typeof result.access_token!=='string'||!result.access_token||result.access_token.length>6000)throw new HttpError(503,'Password recovery did not return a valid session.');
 const secret=randomBytes(32).toString('base64url');
 // Expired rows are cleared on each successful recovery; only an opaque random cookie reaches the browser.
 await api(`/rest/v1/nufi_password_recoveries?expires_at=lte.${encodeURIComponent(new Date(now).toISOString())}`,{method:'DELETE',service:true});
 await api(`/rest/v1/nufi_password_recoveries?user_id=eq.${encodeURIComponent(user.id)}`,{method:'DELETE',service:true});
 await api('/rest/v1/nufi_password_recoveries',{method:'POST',service:true,payload:{token_hash:recoveryHash(secret),user_id:user.id,access_ciphertext:sealRecovery(result.access_token,env,user.id),expires_at:new Date(now+600000).toISOString()}});
 appendCookies(res,[cookie(RECOVERY,secret,600)]);
}
export async function consumeRecovery(req,res,api,env,now=Date.now()){
 const secret=cookies(req)[RECOVERY];
 if(typeof secret!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(secret))throw new HttpError(401,'Verify the code in your reset email first.');
 appendCookies(res,[cookie(RECOVERY,'',0)]);
 // DELETE RETURNING is atomic: a reset grant can authorize at most one password update.
 const rows=await api(`/rest/v1/nufi_password_recoveries?token_hash=eq.${recoveryHash(secret)}&expires_at=gt.${encodeURIComponent(new Date(now).toISOString())}&select=user_id,access_ciphertext,expires_at`,{method:'DELETE',service:true,headers:{Prefer:'return=representation'}});
 const record=rows?.[0];if(!record||!Number.isFinite(Date.parse(record.expires_at))||Date.parse(record.expires_at)<=now)throw new HttpError(401,'This password reset expired or has already been used. Request a new code.');
 const access=openRecovery(record,env),user=verifiedUser(await api('/auth/v1/user',{access}));
 if(user.id!==record.user_id)throw new HttpError(401,'This password reset could not be verified. Request a new code.');
 await membership(user,api,env);return {access,user};
}
export async function verifyBot(token,action,env,fetcher=fetch){if(!env.TURNSTILE_SECRET_KEY||!env.TURNSTILE_SITE_KEY)throw new HttpError(503,'Signup verification is not connected yet.');if(typeof token!=='string'||!token||token.length>2048)throw new HttpError(400,'Complete the security check and try again.');const res=await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:env.TURNSTILE_SECRET_KEY,response:token}),signal:AbortSignal.timeout(7000)});const data=await res.json();if(!res.ok||data.success!==true||data.action!==action||!origins(env).some(o=>new URL(o).hostname===data.hostname))throw new HttpError(400,'The security check expired or failed. Refresh it and try again.');}
export function isAdmin(user,env){return (env.NUFI_ADMIN_USER_IDS||'').split(',').map(v=>v.trim()).includes(user.id);}
export function requireSecret(req,value){const token=(req.headers.authorization||'').replace(/^Bearer /,'');if(!value||!token||Buffer.byteLength(token)!==Buffer.byteLength(value)||!timingSafeEqual(Buffer.from(token),Buffer.from(value)))throw new HttpError(401,'Not authorised.');}
