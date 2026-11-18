import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {changeShinyThing,shinyThingsPage,parseMorganPlan} from '../server/studio-shiny-things.mjs';
import {authorizeStudioRequest} from '../server/library-permissions.mjs';
const actor={role:'admin',id:randomUUID()},person={id:randomUUID(),name:'Team owner'};
function fixture(){
 const rows=new Map(),projects=[];
 const data=()=>({actor,items:[...rows.values()],byId:rows,projects,people:[person]});
 const api=async(path,{payload})=>{
  if(path.includes('nufi_studio_save')){
   const old=rows.get(payload.item);if((old?.revision||0)!==payload.expected)return [];
   const r={...payload.document,revision:payload.expected+1};rows.set(r.id,r);return [r];
  }
  if(path.includes('nufi_studio_create_project')){if(!projects.some(p=>p.id===payload.project.id))projects.push(payload.project);return payload.project.id;}
  throw Error(path);
 };
 return {rows,projects,data,api};
}
const response=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
test('ideas persist, are escaped, and stale edits cannot replace them',async()=>{
 const x=fixture(),id='studio:idea:'+randomUUID(),fields={id,revision:0,action:'idea-save',title:'<b>Idea</b>',summary:'A useful outcome',weeks:4};
 await changeShinyThing(new URLSearchParams(),fields,x.data(),x.api,{});
 assert.match(shinyThingsPage(new URLSearchParams(),x.data()),/&lt;b&gt;Idea&lt;\/b&gt;/);
 await assert.rejects(changeShinyThing(new URLSearchParams(),fields,x.data(),x.api,{}),e=>e.status===409);
});
test('Morgan scoping uses the James HQ queue and imports only matching assistant proposals',async()=>{
 const x=fixture(),id='studio:idea:'+randomUUID();
 await changeShinyThing(new URLSearchParams(),{id,revision:0,action:'idea-save',title:'Build a hub',summary:'Join up our work',weeks:4},x.data(),x.api,{});
 let sent;
 await changeShinyThing(new URLSearchParams(),{id,revision:1,action:'idea-scope'},x.data(),x.api,{NUFI_HQ_SITE_TOKEN:'fixture'},async(url,opts)=>{assert.match(url,/james-control-centre/);sent=JSON.parse(opts.body);return response({ok:true});});
 assert.equal(sent.worker,'morgan');assert.equal(sent.action,'message');assert.match(sent.message,/Do not create or start/);
 const plan={ideaId:id,ideaRevision:1,title:'Work hub',objective:'One home for work',overlap:'Check the workspace project',questions:'Confirm owner',tasks:[{title:'Agree scope',notes:'Review with James',week:0,milestone:true}]};
 const answer='```json\n'+JSON.stringify(plan)+'\n```';
 assert.throws(()=>parseMorganPlan([{role:'user',body:answer}],x.rows.get(id)),e=>e.status===409);
 assert.throws(()=>parseMorganPlan([{role:'assistant',body:answer.replace(id,'other')}],x.rows.get(id)),e=>e.status===409);
 await changeShinyThing(new URLSearchParams(),{id,revision:2,action:'idea-fetch'},x.data(),x.api,{NUFI_HQ_SITE_TOKEN:'fixture'},async()=>response({messages:[{role:'assistant',body:answer}]}));
 assert.equal(x.rows.get(id).fields.plan.title,'Work hub');
 // The original idea stays separate from the reviewed proposal.
 assert.equal(x.rows.get(id).title,'Build a hub');
});
test('project creation requires approval, creates tasks once and preserves the source idea',async()=>{
 const x=fixture(),id='studio:idea:'+randomUUID();
 x.rows.set(id,{id,kind:'settings',title:'Original thought',revision:3,fields:{summary:'Original evidence',weeks:4,state:'Ready to review',plan:{title:'Proposed project',objective:'A useful result',tasks:[{title:'Confirm result',notes:'Review',week:1,milestone:true,worker:'Morgan',due:'2026-12-01'}]}}});
 const f={id,revision:3,action:'idea-promote',creator:person.id};
 await assert.rejects(changeShinyThing(new URLSearchParams(),f,x.data(),x.api,{}),e=>e.status===400);
 const result=await changeShinyThing(new URLSearchParams(),{...f,confirmed:'yes'},x.data(),x.api,{});
 assert.equal(result.section,'project');assert.equal(x.projects.length,1);assert.equal(x.projects[0].studio.ideaId,id);
 assert.equal(x.projects[0].entries[0].milestone,true);assert.equal(x.projects[0].entries[0].status,'To do');
 assert.equal(x.rows.get(id).fields.summary,'Original evidence');
 await changeShinyThing(new URLSearchParams(),{...f,confirmed:'yes'},x.data(),x.api,{});assert.equal(x.projects.length,1);
 assert.match(shinyThingsPage(new URLSearchParams({id}),x.data()),/Open project/);
});
test('failed project creation can retry the frozen plan without duplicate projects',async()=>{
 const x=fixture(),id='studio:idea:'+randomUUID();
 x.rows.set(id,{id,kind:'settings',title:'Idea',revision:1,fields:{weeks:2,plan:{title:'Project',objective:'Outcome',tasks:[{title:'Task',week:0}]}}});
 const f={id,revision:1,action:'idea-promote',confirmed:'yes',creator:person.id};
 await assert.rejects(changeShinyThing(new URLSearchParams(),f,x.data(),async(path,args)=>{if(path.includes('create_project'))throw Error('outage');return x.api(path,args);},{}));
 assert.equal(x.rows.get(id).fields.state,'Converting');
 await assert.rejects(changeShinyThing(new URLSearchParams(),{...f,revision:2,action:'idea-save'},x.data(),x.api,{}),e=>e.status===409);
 await changeShinyThing(new URLSearchParams(),{...f,revision:2},x.data(),x.api,{});assert.equal(x.projects.length,1);
});
test('staff cannot read or mutate the private ideas board',async()=>{
 const x=fixture(),staff={role:'staff',id:person.id};
 assert.throws(()=>shinyThingsPage(new URLSearchParams(),{...x.data(),actor:staff}),e=>e.status===403);
 assert.throws(()=>authorizeStudioRequest(staff,'shiny-things','GET'),e=>e.status===403);
 await assert.rejects(changeShinyThing(new URLSearchParams(),{}, {...x.data(),actor:staff},x.api,{}),e=>e.status===403);
});
