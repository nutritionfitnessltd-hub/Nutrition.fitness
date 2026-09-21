import {reply,fail,body,session,requireAdmin,HttpError} from '../server/platform.mjs';
import {requireManagement,readManageQuery,readManagementSection,writeManagement} from '../server/website-management.mjs';

export function createManageHandler({env=process.env,fetcher=fetch}={}){
  return async(req,res)=>{try{
    if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');throw new HttpError(405,'Use GET to read or POST to save.');}
    requireManagement(env);
    const input=req.method==='POST'?body(req,env,200000):null;
    const query=req.method==='GET'?readManageQuery(req):null;
    const {user,api}=await session(req,res,env,fetcher);
    await requireAdmin(user,api,env);
    return reply(res,200,input?await writeManagement(api,user,input):await readManagementSection(api,query,env));
  }catch(error){return fail(res,error);}};
}
export default createManageHandler();
