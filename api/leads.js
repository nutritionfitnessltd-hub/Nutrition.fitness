import {recommend} from '../public/programme-finder.mjs';
import {LAUNCH} from '../public/launch-config.mjs';
const API='https://services.leadconnectorhq.com';
export function validateLead(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Please submit the signup form again.');
 const firstName=String(raw.firstName??'').trim(),email=String(raw.email??'').trim().toLowerCase();
 if(!firstName||firstName.length>80||/[<>\x00-\x1f]/.test(firstName))throw new Error('Please enter your first name.');
 if(email.length>254||! /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))throw new Error('Please enter a valid email address.');
 if(typeof raw.marketing!=='boolean')throw new Error('Please confirm your email preference.');
 if(raw.website)throw new Error('We could not verify this signup.');
 if(!/^[a-f0-9-]{36}$/i.test(raw.requestId??''))throw new Error('Please reload the form and try again.');
 if(raw.source!=='programme-finder')throw new Error('Unknown signup form.');
 const result=recommend(raw.answers,raw.chosenBase),utm={};
 for(const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'])if(typeof raw.utm?.[key]==='string')utm[key]=raw.utm[key].replace(/[<>\x00-\x1f]/g,'').slice(0,150);
 return {firstName,email,marketing:raw.marketing,result,utm,requestId:raw.requestId,source:raw.source};
}
function settings(env){
 const required=['GHL_PRIVATE_TOKEN','GHL_LOCATION_ID','GHL_PROGRAMME_FIELD_ID','GHL_QUIZ_FIELD_ID','SITE_URL','TURNSTILE_SECRET_KEY','TURNSTILE_SITE_KEY'];
 if(required.some(k=>!env[k]))return null;
 const origins=[env.SITE_URL,...(env.NUFI_ALLOWED_ORIGINS||'').split(',').filter(Boolean)].map(x=>new URL(x).origin);
 if(origins.some(x=>!x.startsWith('https://')&&!x.startsWith('http://localhost:')))return null;
 return {origins};
}
export function createLeadHandler({env=process.env,fetchImpl=fetch,now=()=>Date.now()}={}){
 return async(req,res)=>{
  const reply=(status,payload)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.status(status).json(payload);};
  if(req.method!=='POST'){res.setHeader('Allow','POST');return reply(405,{error:'Use the signup form to submit your details.'});}
  let config;try{config=settings(env);}catch{config=null;}
  if(!config)return reply(503,{error:'Signup is not connected yet. Your programme result is ready, but your reservation has not been saved.'});
  if(!config.origins.includes(req.headers.origin))return reply(403,{error:'Please use the signup form on our website.'});
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return reply(415,{error:'The signup format was not recognised.'});
  let raw,lead;try{const text=typeof req.body==='string'?req.body:JSON.stringify(req.body);if(!text||Buffer.byteLength(text)>16384)return reply(413,{error:'This signup is too large.'});raw=JSON.parse(text);lead=validateLead(raw);}catch(e){return reply(400,{error:e.message||'Please check your details.'});}
  if(typeof raw.botToken!=='string'||!raw.botToken||raw.botToken.length>4096)return reply(400,{error:'Please complete the security check, then try again.'});
  try{
   const verification=await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({secret:env.TURNSTILE_SECRET_KEY,response:raw.botToken}),signal:AbortSignal.timeout(8000)});
   const check=await verification.json();if(!verification.ok||check.success!==true||check.action!=='nufi-signup'||!config.origins.some(x=>new URL(x).hostname===check.hostname))return reply(400,{error:'The security check expired or failed. Refresh the page and try again.'});
   const submittedAt=new Date(now()).toISOString();
   const record={form:lead.source,requestId:lead.requestId,submittedAt,offerVersion:LAUNCH.version,launchAt:LAUNCH.at,recommendation:lead.result,utm:lead.utm,marketing:{requested:lead.marketing,wording:'Yes, send me useful Nutrition.Fitness tips, news and offers by email.',version:'email-optin-v1'}};
   const request=async(endpoint,payload)=>{const response=await fetchImpl(`${API}${endpoint}`,{method:'POST',headers:{'Authorization':`Bearer ${env.GHL_PRIVATE_TOKEN}`,'Version':env.GHL_API_VERSION||'v3','Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('CRM write failed');return response.json();};
   // Do not pass tags, DND or subscription status to upsert: these can overwrite existing values.
   const upsert=await request('/contacts/upsert',{email:lead.email,firstName:lead.firstName,locationId:env.GHL_LOCATION_ID,createNewIfDuplicateAllowed:false,customFields:[{id:env.GHL_PROGRAMME_FIELD_ID,fieldValue:lead.result.name},{id:env.GHL_QUIZ_FIELD_ID,fieldValue:JSON.stringify(record)}]});
   const contactId=upsert.contact?.id;if(typeof contactId!=='string'||!contactId)throw new Error('CRM did not confirm the contact');
   // Append an auditable request. This is a reservation, never proof of activated app access.
   await request(`/contacts/${encodeURIComponent(contactId)}/notes`,{body:`NUFI launch reservation ${lead.requestId}\n${JSON.stringify(record,null,2)}`});
   await request(`/contacts/${encodeURIComponent(contactId)}/tags`,{tags:['nufi-programme-finder','nufi-free-month-eligible']});
   return reply(200,{status:'reserved',launchAt:LAUNCH.at});
  }catch{return reply(502,{error:'We could not confirm your reservation with our CRM. Please retry with the same email. No app month has started.'});}
 };
}
export default createLeadHandler();
