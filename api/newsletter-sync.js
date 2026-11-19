import {platform,reply,fail,requireSecret,HttpError} from '../server/platform.mjs';
import {runNewsletterSync} from '../server/newsletter-sync.mjs';
export function createNewsletterSyncHandler({env=process.env,fetcher=fetch}={}){
 return async(req,res)=>{try{
  if(req.method!=='GET'&&req.method!=='POST')throw new HttpError(405,'Use GET or POST.');
  requireSecret(req,env.CRON_SECRET);
  if(req.headers.origin)throw new HttpError(403,'Use the private newsletter sync connection.');
  return reply(res,200,await runNewsletterSync({api:platform(env,fetcher),env,fetcher}));
 }catch(error){return fail(res,error);}};
}
export default createNewsletterSyncHandler();
