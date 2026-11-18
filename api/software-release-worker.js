import {HttpError,requireSecret,platform,reply,fail} from '../server/platform.mjs';
import {releaseServiceAction} from '../server/software-release-core.mjs';
export function createReleaseWorker({env=process.env,fetcher=fetch,api}={}){return async(req,res)=>{try{requireSecret(req,env.NUFI_RELEASE_WORKER_TOKEN);if(req.method!=='POST'||req.headers.origin)throw new HttpError(403,'Use the private release connection.');const b=typeof req.body==='string'?JSON.parse(req.body):req.body;if(!b||Array.isArray(b)||JSON.stringify(b).length>200000)throw new HttpError(400,'Use a smaller release request.');return reply(res,200,await releaseServiceAction(b,api||platform(env,fetcher)));}catch(e){return fail(res,e);}};}
export default createReleaseWorker();
