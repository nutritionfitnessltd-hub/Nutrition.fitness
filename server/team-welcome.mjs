import {createHash} from 'node:crypto';
import {esc} from './library-shelves.mjs';
import {engagementTypes,profileId} from './team-profiles.mjs';
import {HttpError} from './platform.mjs';
const table='/rest/v1/nufi_team_welcome_acknowledgements';
const version='welcome-v1';
const service={service:true};
export function welcomeDocument(name,f){
 return `Welcome to Nutrition.fitness

Dear ${name},

We’re pleased to welcome you to the team and look forward to working with you.

Role: ${f.role}
Engagement: ${engagementTypes[f.engagementType]}
Agreed rate: ${f.rate} ${f.currency} per ${f.rateBasis}
Agreed hours: ${f.agreedHours} per ${f.hoursPeriod}
Start date: ${f.startDate||'To be confirmed'}

Responsibilities
${f.responsibilities||'Please discuss your responsibilities with your team contact.'}

Your team workspace
Your shared workspace brings together assigned tasks, relevant resources, team updates and collaboration tools. Access reflects your role and permissions. Keep your work up to date, share progress and raise questions or anything that could affect delivery.

Flexible working
We support flexibility in how you organise your agreed hours, subject to your role and agreed availability. Coordinate working times with the team, attend agreed meetings and communicate changes in advance wherever possible. Tell your team contact promptly if a deadline or commitment may be affected. Scheduling flexibility does not automatically change your rate or agreed hours; changes must be discussed and confirmed before taking effect.
Agreed availability: ${f.availability||'Coordinate availability and meetings with your team contact.'}

${['fte','part_time','intern'].includes(f.engagementType)?'A separate employment contract is required for this arrangement. Contract preparation is deferred. This letter does not complete that contract.\n\n':''}Please check these details and contact your administrator if anything is incorrect. Acknowledge this letter before proceeding to the separate NDA. This acknowledgement records that you have read and reviewed this letter; NDA acceptance is recorded separately.

The Nutrition.fitness Team`;
}
export async function requireTeamWelcome(req,res,{actor,api,params,render}){
 if(actor.role!=='staff')return false;
 const rows=await api('/rest/v1/nufi_studio_items?id=eq.'+encodeURIComponent(profileId(actor.id))+'&select=payload&limit=1',service);
 const f=rows[0]?.payload?.fields||{};
 const people=await api('/rest/v1/nufi_library_staff?id=eq.'+encodeURIComponent(actor.id)+'&select=name&limit=1',service);
 const name=people[0]?.name||actor.name||'Team member';
 const complete=['role','engagementType','rate','currency','rateBasis','agreedHours','hoursPeriod'].every(k=>typeof f[k]==='string'&&f[k].trim())&&Boolean(engagementTypes[f.engagementType]);
 if(!complete){render(res,403,'<h1>Your welcome letter is being prepared</h1><p>Your administrator needs to complete your role, engagement type, rate and hours in your profile before you can continue to the NDA. Please contact them to check these details.</p>');return true;}
 const document=welcomeDocument(name,f),hash=createHash('sha256').update(version+'\n'+document).digest('hex');
 const filter='actor_id=eq.'+encodeURIComponent(actor.id)+'&document_hash=eq.'+hash;
 const accepted=()=>api(table+'?'+filter+'&select=id&limit=1',service);
 if((await accepted()).length)return false;
 const fields=typeof req.body==='string'?Object.fromEntries(new URLSearchParams(req.body)):req.body||{};
 let error='',status=200;
 if(req.method==='POST'){
  if(req.headers.origin!=='https://'+req.headers.host)throw new HttpError(403,'Open the welcome letter on the workspace to continue.');
  if(fields.action==='acknowledge-welcome'&&fields.acknowledge==='1'&&fields.document_hash===hash){
   await api(table+'?on_conflict=actor_id,document_hash',{service:true,method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},payload:{actor_id:actor.id,full_name:name,letter_version:version,document_hash:hash,document_text:document,profile_snapshot:Object.fromEntries(['role','engagementType','rate','currency','rateBasis','agreedHours','hoursPeriod','startDate','availability','responsibilities'].map(key=>[key,f[key]||'']))}});
   if(!(await accepted()).length)throw new Error('Welcome acknowledgement was not saved');
   res.statusCode=303;res.setHeader('Location','/content-library/?'+new URLSearchParams([...params].filter(([key])=>!['nda','receipt','identity','download'].includes(key))));res.end();return true;
  }
  status=fields.document_hash&&fields.document_hash!==hash?409:403;
  error='Please review the current letter and tick the acknowledgement before continuing. Your requested action has not been saved.';
 }
 render(res,status,'<h1>Welcome to Nutrition.fitness</h1><p>Step 1: welcome letter · Step 2: NDA</p>'+(error?'<p role="alert">'+esc(error)+'</p>':'')+'<section class="nda-document" style="white-space:pre-wrap">'+esc(document)+'</section><form method="post"><input type="hidden" name="action" value="acknowledge-welcome"><input type="hidden" name="document_hash" value="'+hash+'"><label class="remember-me"><input type="checkbox" name="acknowledge" value="1" required>I acknowledge that I have read this welcome letter and reviewed my role, engagement type, rate and hours. I understand the team workspace and flexible working arrangements.</label><button class="btn primary">Acknowledge and continue to NDA</button></form>');
 return true;
}
