import {platform,reply,fail,requireSecret,HttpError} from '../server/platform.mjs';
import {runRoleTasks} from '../server/people-tasks.mjs';
export function createRoleTaskSyncHandler({env=process.env,fetcher=fetch}={}){
 return async(req,res)=>{try{
  if(!['GET','POST'].includes(req.method))throw new HttpError(405,'Use GET or POST.');
  requireSecret(req,env.CRON_SECRET);if(req.headers.origin)throw new HttpError(403,'Use the private role-task scheduler.');
  return reply(res,200,await runRoleTasks({api:platform(env,fetcher)}));
 }catch(error){return fail(res,error);}};
}
export default createRoleTaskSyncHandler();
