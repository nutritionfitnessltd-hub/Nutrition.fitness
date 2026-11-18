import {productionAction} from '../server/course-production.mjs';
import {reply,fail,platform,requireSecret,HttpError} from '../server/platform.mjs';
export function createCourseProductionHandler({env=process.env,fetcher=fetch,load}={}){
 return async(req,res)=>{try{
  requireSecret(req,env.NUFI_COURSE_PRODUCTION_TOKEN);
  if(req.method!=='POST')throw new HttpError(405,'Use POST.');
  if(req.headers.origin)throw new HttpError(403,'Use the production connection.');
  const input=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(JSON.stringify(input||{}).length>250000)throw new HttpError(413,'Draft is too large.');
  const index=input?.action==='status'?{records:[]}:await (load||(async()=>{const {readProductionIndex}=await import('../server/library-reader.mjs');return readProductionIndex();}))();
  return reply(res,200,await productionAction(req,input,{env,api:platform(env,fetcher),index}));
 }catch(e){return fail(res,e);}};
}
export default createCourseProductionHandler();
