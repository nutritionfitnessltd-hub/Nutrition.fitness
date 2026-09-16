import {LAUNCH,launchState} from '../public/launch-config.mjs';
export default function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed.'});}
 // App entitlement activation is a separate integration. Never infer it from the clock or CRM tags.
 return res.status(200).json({launchAt:LAUNCH.at,state:launchState(Date.now(),false),turnstileSiteKey:process.env.TURNSTILE_SITE_KEY||null});
}
