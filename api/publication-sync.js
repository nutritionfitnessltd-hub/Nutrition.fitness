import {platform,reply,fail,requireSecret,HttpError} from '../server/platform.mjs';
import {runScheduledPublications} from '../server/studio-review-publication.mjs';
export function createPublicationSyncHandler({env=process.env,fetcher=fetch}={}){
 return async(req,res)=>{try{
  if(req.method!=='GET'&&req.method!=='POST')throw new HttpError(405,'Use GET or POST.');
  requireSecret(req,env.CRON_SECRET);if(req.headers.origin)throw new HttpError(403,'Use the private publication scheduler.');
  return reply(res,200,await runScheduledPublications({api:platform(env,fetcher),env}));
 }catch(error){return fail(res,error);}};
}
export default createPublicationSyncHandler();
