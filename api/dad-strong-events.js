/** Authenticated, server-to-server NUFI+ coaching-event ingress; no public browser access. */
import {platform,requireSecret,reply,fail,HttpError} from '../server/platform.mjs';
import {validateDadEvent,planDadEvent,cohortWeek} from '../server/dad-strong.mjs';

export function readMachineBody(req,max=8192){
 if(!/^application\/json(?:;|$)/i.test(req.headers?.['content-type']||''))throw new HttpError(415,'JSON required.');
 try{
  const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);
  if(!raw||Buffer.byteLength(raw)>max)throw new Error();
  const parsed=JSON.parse(raw);
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error();
  return parsed;
 }catch{throw new HttpError(400,'Invalid coaching-event JSON.');}
}
const headers={Prefer:'resolution=ignore-duplicates,return=representation'};
const insert=async(api,table,unique,record)=>api(`/rest/v1/${table}?on_conflict=${unique}`,{method:'POST',service:true,headers,payload:record});
export async function ingestDadEvent(api,event,when=new Date()){
 const rows=await api(`/rest/v1/nufi_dad_members?user_id=eq.${encodeURIComponent(event.memberId)}&select=user_id,email,first_name,coach_name,start_date,status,whatsapp_opt_in_at,paused&limit=1`,{service:true});
 const member=rows?.[0];
 if(!member)throw new HttpError(404,'Dad Strong enrolment not found.');
 if(member.status==='completed'&&event.kind!=='programme_completed')return {status:'inactive',messagesQueued:0,tasksCreated:0};
 // Event IDs are globally unique. Retries must never create a second task/message.
 const added=await insert(api,'nufi_dad_events','event_id',{event_id:event.eventId,member_id:event.memberId,kind:event.kind,occurred_at:event.occurredAt,metrics:event.metrics});
 if(!Array.isArray(added)||added.length===0)return {status:'duplicate',messagesQueued:0,tasksCreated:0};
 const week=cohortWeek(member.start_date,new Date(event.occurredAt));
 const plan=planDadEvent({...event,week},member,when);
 let messagesQueued=0,tasksCreated=0;
 for(const item of plan.messages){const saved=await insert(api,'nufi_dad_messages','dedup_key',item);messagesQueued+=saved?.length||0;}
 for(const item of plan.tasks){const saved=await insert(api,'nufi_dad_coach_tasks','dedup_key',item);tasksCreated+=saved?.length||0;}
 return {status:'recorded',messagesQueued,tasksCreated};
}
export function createDadEventHandler({env=process.env,fetcher=fetch,now=()=>Date.now()}={}){
 return async(req,res)=>{
  try{
   if(req.method!=='POST')throw new HttpError(405,'Method not allowed.');
   requireSecret(req,env.DAD_STRONG_EVENTS_SECRET);
   const event=validateDadEvent(readMachineBody(req),now());
   const api=platform(env,fetcher);
   return reply(res,202,await ingestDadEvent(api,event,new Date(now())));
  }catch(e){return fail(res,e);}
 };
}
export default createDadEventHandler();
