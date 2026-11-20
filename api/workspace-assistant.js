import {createHash} from 'node:crypto';
import {platform,reply,fail,HttpError,uuid} from '../server/platform.mjs';
import {hqRequest} from '../server/studio-hq.mjs';
import {workers} from '../server/studio-workers.mjs';
const website='https://team.nutrition.fitness';
const workerUrl=key=>website+'/content-library/?work=1&studio=team&tab=workers&worker='+encodeURIComponent(key);
async function queueRequest(env,fetcher,body){
 if(!env.NUFI_HQ_SITE_TOKEN)throw new HttpError(503,'James HQ is not connected.');
 const response=await fetcher('https://james-control-centre.james615845.chatgpt.site/api/worker',{method:body?'POST':'GET',redirect:'manual',headers:{'Content-Type':'application/json','OAI-Sites-Authorization':'Bearer '+env.NUFI_HQ_SITE_TOKEN},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});
 const result=await response.json().catch(()=>null);if(!response.ok||result?.error)throw new HttpError(response.status===409?409:503,result?.error||'James HQ did not confirm the request.');return result;
}
function validate(input,keys){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!keys.includes(k)))throw new HttpError(400,'Use only the documented worker fields.');}
function brief(value,max){if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw new HttpError(400,'Check the worker message and its length.');return value.trim();}
export function createWorkspaceAssistant({env=process.env,fetcher=fetch,api}={}){
 return async(req,res)=>{try{
  if(req.method!=='POST')throw new HttpError(405,'Use POST.');
  if(req.headers.origin)throw new HttpError(403,'Use the authenticated connector.');
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw new HttpError(415,'Use application/json.');
  const token=req.headers['x-nufi-worker-token']||'';if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw new HttpError(401,'Worker connection required.');
  const db=api||platform(env,fetcher),connections=await db('/rest/v1/nufi_worker_connections?select=id,namespace&enabled=eq.true&token_hash=eq.'+createHash('sha256').update(token).digest('hex'),{service:true});
  if(!connections.length)throw new HttpError(401,'Worker connection required.');
  if(connections[0].id!=='content-manager'||connections[0].namespace!=='worker:content-manager:')throw new HttpError(403,'This connection cannot assign Nutrition.fitness workers.');
  let input;try{const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);if(!raw||Buffer.byteLength(raw)>18000)throw Error();input=JSON.parse(raw);}catch{throw new HttpError(400,'Use a smaller valid worker request.');}
  validate(input,['action','worker','message','requestId','title','brief','priority','taskId']);
  if(!['worker-list','worker-get','worker-message','worker-assign','worker-task'].includes(input.action))throw new HttpError(400,'Choose an available worker action.');
  if(input.action!=='worker-list'&&!Object.hasOwn(workers,input.worker))throw new HttpError(400,'Choose a Nutrition.fitness worker.');
  // Validate every mutation before contacting HQ. Only explicit message/task actions can write.
  if(input.action==='worker-message'){brief(input.message,8000);uuid(input.requestId);}
  if(input.action==='worker-assign'){brief(input.title,160);brief(input.brief,2700);uuid(input.requestId);if(input.priority!==undefined&&!['Normal','High'].includes(input.priority))throw new HttpError(400,'Choose Normal or High priority.');}
  if(input.action==='worker-task'){if(typeof input.taskId!=='string'||!input.taskId.startsWith('studio-voice:'))throw new HttpError(400,'Use the task ID returned by assignment.');uuid(input.taskId.slice(13));}
  const status=await hqRequest(env,{action:'status'},fetcher);
  const identity=(key)=>{const saved=status.workers?.[key];return saved?{key,id:saved.employeeId,name:saved.name,role:saved.role,paused:saved.paused===true,description:workers[key].reason,url:workerUrl(key)}:null;};
  if(input.action==='worker-list')return reply(res,200,{workers:Object.keys(workers).map(identity).filter(Boolean),queueEnabled:status.queueEnabled,queue:'James HQ'});
  const worker=identity(input.worker);if(!worker)throw new HttpError(409,'This worker is not available in James HQ.');
  if(input.action==='worker-get'){
   const chat=await hqRequest(env,{action:'chat',worker:input.worker},fetcher);return reply(res,200,{worker,queueEnabled:status.queueEnabled,conversation:{taskId:chat.task?.id||null,status:chat.task?.status||'No conversation',messages:(chat.messages||[]).slice(-30).map(m=>({role:m.role,body:m.body,createdAt:m.createdAt}))},url:workerUrl(input.worker)});
  }
  if(input.action==='worker-message'){
   if(worker.paused)throw new HttpError(409,'This worker is paused. Resume them in Team before sending work.');
   const chat=await hqRequest(env,{action:'message',worker:input.worker,message:input.message,clientMessageId:input.requestId},fetcher);
   if(!chat.task?.id)throw new HttpError(503,'HQ did not confirm a saved conversation. Retrieve the worker before retrying.');
   return reply(res,200,{worker:input.worker,id:chat.task.id,status:chat.task?.status||'queued',url:workerUrl(input.worker),queue:'James HQ',duplicate:chat.duplicate===true,confirmation:'Message saved in James HQ. A queued message is not a completed task.'});
  }
  const id=input.action==='worker-task'?input.taskId:'studio-voice:'+input.requestId;
  const readTask=async()=>{const state=await queueRequest(env,fetcher);const t=(state.tasks||[]).find(t=>t.id===id&&t.employeeId===worker.id&&t.area==='Nutrition.Fitness');return t;};
  const result=t=>({id:t.id,worker:input.worker,title:t.title,status:t.status,result:t.result||'',createdAt:t.createdAt,updatedAt:t.updatedAt,url:workerUrl(input.worker),queue:'James HQ'});
  if(input.action==='worker-task'){const t=await readTask();if(!t)throw new HttpError(404,'This worker task is not in the recent HQ queue. Check James HQ for older tasks.');return reply(res,200,result(t));}
  const title=input.title.trim()+'\n\n'+input.brief.trim(),priority=input.priority||'Normal',existing=await readTask();
  if(existing){if(existing.title!==title||existing.priority!==priority)throw new HttpError(409,'This request ID was already used. Retrieve that task before retrying.');return reply(res,200,{...result(existing),duplicate:true});}
  if(worker.paused)throw new HttpError(409,'This worker is paused. Resume them in Team before assigning work.');
  await queueRequest(env,fetcher,{action:'create',id,title,employeeId:worker.id,agent:worker.name,area:'Nutrition.Fitness',priority});
  const saved=await readTask();if(!saved||saved.title!==title||saved.priority!==priority)throw new HttpError(409,'HQ did not confirm this exact assignment. Retrieve the task before retrying.');
  return reply(res,200,{...result(saved),confirmation:'Task saved in the existing James HQ queue. Queued does not mean completed; existing worker permissions and approval rules still apply.'});
 }catch(error){return fail(res,error);}};
}
export default createWorkspaceAssistant();
