import {reply,fail,platform,HttpError} from '../server/platform.mjs';
import {managementReady,readPublicOverlays,publicContent} from '../server/website-management.mjs';

export function createContentHandler({env=process.env,fetcher=fetch}={}){
  return async(req,res)=>{try{
    if(req.method!=='GET'){res.setHeader('Allow','GET');throw new HttpError(405,'Use GET to read published content.');}
    if(!managementReady(env))return reply(res,200,{pages:[],products:[],recipes:[],settings:null});
    const api=platform(env,fetcher);
    // Database rows are server-only. The explicit projection excludes drafts,
    // all recipe bodies, identities and audit records from the public response.
    const result=publicContent(await readPublicOverlays(api));
    return reply(res,200,result);
  }catch(error){return fail(res,error);}};
}
export default createContentHandler();
