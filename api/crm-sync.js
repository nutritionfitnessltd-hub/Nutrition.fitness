import {platform,reply,fail,requireSecret,HttpError} from '../server/platform.mjs';
import {syncOne} from '../server/crm.mjs';
export function createSyncHandler({env=process.env,fetcher=fetch}={}){return async(req,res)=>{try{if(req.method!=='GET'&&req.method!=='POST')throw new HttpError(405,'Method not allowed.');requireSecret(req,env.CRON_SECRET);const api=platform(env,fetcher);await api('/rest/v1/rpc/nufi_expire_trials',{method:'POST',service:true,payload:{}});return reply(res,200,await syncOne(api,env,fetcher));}catch(e){return fail(res,e);}};}
export default createSyncHandler();
