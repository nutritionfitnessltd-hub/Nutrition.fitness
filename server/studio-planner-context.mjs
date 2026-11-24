import {portfolioSchedule} from './studio-project-schedule.mjs';
import {allRows} from './studio-store.mjs';
export async function loadPlanner(data,api){
 try{
  const [projects,profiles]=await Promise.all([
   allRows(api,'/rest/v1/nufi_library_projects?select=id,creator_id,entries,status&order=id'),
   allRows(api,'/rest/v1/nufi_studio_items?select=id,payload&order=id&id=like.studio:team-profile:*')
  ]);
  const fields=Object.fromEntries(profiles.map(r=>[r.id.slice('studio:team-profile:'.length),r.payload?.fields||{}]));
  data.planner={rows:portfolioSchedule(projects,fields)};
 }catch{data.planner={unavailable:true};}
}
