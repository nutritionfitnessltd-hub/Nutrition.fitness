import {human} from './team-message-store.mjs';
const table='/rest/v1/nufi_team_presence';
export async function touchPresence(api,actor,active,now=Date.now()){
 human(actor);
 await api(table+'?on_conflict=actor_id',{service:true,method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},payload:{actor_id:actor.id,last_seen_at:new Date(now).toISOString(),active:active===true}});
}
export async function teamPresence(api,people,now=Date.now()){
 try{
  const rows=await api(table+'?last_seen_at=gte.'+encodeURIComponent(new Date(now-70000).toISOString())+'&select=actor_id,last_seen_at,active',{service:true});
  return people.map(person=>{const row=rows.find(r=>r.actor_id===person.id&&Date.parse(r.last_seen_at)>=now-70000);return {id:person.id,status:row?(row.active?'online':'away'):'offline'};});
 }catch{return null;}
}
