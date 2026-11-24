import {portfolioSchedule} from './studio-project-schedule.mjs';
import {allRows} from './studio-store.mjs';
export async function loadPlanner(data,api){
 try{
  const [projects,profiles]=await Promise.all([
   data.actor?.role==='admin'?Promise.resolve(data.projects):allRows(api,'/rest/v1/nufi_library_projects?select=id,creator_id,entries,status&order=id'),
   data.actor?.role==='admin'&&data.byId?Promise.resolve([...data.byId.values()].filter(r=>r.id.startsWith('studio:team-profile:')).map(r=>({id:r.id,payload:r}))):allRows(api,'/rest/v1/nufi_studio_items?select=id,payload&order=id&id=like.studio:team-profile:*')
  ]);
  const fields=Object.fromEntries(profiles.map(r=>[r.id.slice('studio:team-profile:'.length),r.payload?.fields||{}]));
  const visible=new Set([data.actor?.id,...(data.people||[]).map(p=>p.id),...(data.projects||[]).flatMap(p=>[p.creator_id,...(p.entries||[]).map(e=>e.assignee)])]);
  data.planner={rows:portfolioSchedule(projects,fields),directorIds:Object.keys(fields).filter(id=>visible.has(id)&&fields[id].engagementType==='owner_director')};
 }catch{data.planner={unavailable:true};}
}
