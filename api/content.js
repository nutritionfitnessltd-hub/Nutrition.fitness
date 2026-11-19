import {publishedContent} from '../server/studio-publishing.mjs';
import {sendWorkerImage} from '../server/worker-images.mjs';
import {reply,fail,platform,HttpError} from '../server/platform.mjs';
import {managementReady,readPublicOverlays,publicContent} from '../server/website-management.mjs';

export function createContentHandler({env=process.env,fetcher=fetch}={}){
  return async(req,res)=>{try{
    const url = new URL(req.url || '/api/content', 'https://localhost');
    if (url.pathname === '/content-library/' || url.searchParams.get('view') === 'library' || req.query?.view === 'library') {
      const {createLibraryReader} = await import('../server/library-reader.mjs').catch(error=>{console.error('Workspace module load failed',error.name,error.code,error.message);throw error;});
      return await createLibraryReader({env})(req,res);
    }
    if(req.method!=='GET'){res.setHeader('Allow','GET');throw new HttpError(405,'Use GET to read published content.');}
    if(['studio-release','studio-release-image','studio-feed'].includes(url.searchParams.get('view')||req.query?.view)){const params=new URLSearchParams(url.searchParams);for(const [k,v] of Object.entries(req.query||{}))if(typeof v==='string')params.set(k,v);res.setHeader('Cache-Control','private, no-store');return await publishedContent(req,res,params,platform(env,fetcher),r=>sendWorkerImage(res,r,env,fetcher));}
    if(!managementReady(env))return reply(res,200,{pages:[],products:[],recipes:[],settings:null});
    const api=platform(env,fetcher);
    // Database rows are server-only. The explicit projection excludes drafts,
    // all recipe bodies, identities and audit records from the public response.
    const result=publicContent(await readPublicOverlays(api));
    return reply(res,200,result);
  }catch(error){return fail(res,error);}};
}
export default createContentHandler();
