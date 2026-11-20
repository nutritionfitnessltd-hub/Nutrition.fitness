import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {saveTeamReporting,renderTeamPage,teamWorkSnapshot} from '../server/studio-team.mjs';
import {teamProfiles,teamReportingPanel,profileId} from '../server/team-profiles.mjs';
import {handleLibraryWork} from '../server/library-work.mjs';

function fixture(){
 const actor={role:'admin',id:randomUUID()},kasia={id:randomUUID(),name:'Kasia',email:'kasia@example.test'},joyce={id:randomUUID(),name:'Joyce',email:'joyce@example.test'},staff=[kasia,joyce],rows=new Map();
 const api=async(path,options={})=>{
  if(path.includes('/rpc/nufi_studio_save')){const p=options.payload,old=rows.get(p.item);if((old?.revision||0)!==p.expected)return [];const row={id:p.item,payload:p.document,revision:p.expected+1};rows.set(row.id,row);return [row];}
  if(path.includes('nufi_library_staff'))return staff;
  if(path.includes('nufi_studio_items'))return [...rows.values()];
  return [];
 };
 const data=()=>teamWorkSnapshot(api);
 const save=async fields=>saveTeamReporting(fields,actor,staff,await data(),api);
 return {actor,kasia,joyce,staff,rows,api,data,save};
}

test('assigning and removing direct reports keeps both profiles and the map consistent',async()=>{
 const f=fixture(),manager='person:'+f.kasia.id,fields={memberVersion:'worker:imogen|0',reportsTo:manager,returnTo:manager};
 assert.deepEqual(await f.save(fields),{section:'team',person:f.kasia.id});
 let data=await f.data(),members=teamProfiles(f.actor,f.staff,data),imogen=members.find(m=>m.worker==='imogen'),kasia=members.find(m=>m.key===manager);
 assert.equal(imogen.parent,manager);assert.match(teamReportingPanel(imogen,members),new RegExp('value="'+manager+'" selected'));
 assert.match(teamReportingPanel(kasia,members),/data-team-load href="[^"]*worker=imogen/);
 await f.save({memberVersion:'person:'+f.joyce.id+'|0',reportsTo:manager,returnTo:manager});
 members=teamProfiles(f.actor,f.staff,await f.data());assert.equal(members.filter(m=>m.parent===manager).length,2);
 await f.save({...fields,memberVersion:'worker:imogen|1',reportsTo:''});
 members=teamProfiles(f.actor,f.staff,await f.data());assert.equal(members.find(m=>m.worker==='imogen').parent,null);
 assert.deepEqual(members.filter(m=>m.parent===manager).map(m=>m.name),['Joyce']);
});

test('reporting updates preserve job details and reject stale or unauthorised changes',async()=>{
 const f=fixture(),id=profileId('worker:imogen'),document={id,kind:'settings',fields:{role:'Course lead',responsibilities:'Check the actual exports.',reportsTo:'Workspace owner',team:'Content',otherMetadata:'keep'}};
 f.rows.set(id,{id,payload:document,revision:4});
 const fields={memberVersion:'worker:imogen|4',reportsTo:'person:'+f.kasia.id,returnTo:'person:'+f.kasia.id};
 await f.save(fields);const saved=f.rows.get(id);assert.equal(saved.revision,5);
 assert.equal(saved.payload.fields.role,'Course lead');assert.equal(saved.payload.fields.responsibilities,'Check the actual exports.');assert.equal(saved.payload.fields.otherMetadata,'keep');
 await assert.rejects(f.save(fields),e=>e.status===409);
 await assert.rejects(saveTeamReporting({...fields,memberVersion:'worker:imogen|5'},{role:'staff'},f.staff,await f.data(),f.api),e=>e.status===403);
});

test('a manager cannot report to their direct report, and the owner cannot be reassigned',async()=>{
 const f=fixture(),manager='person:'+f.kasia.id;
 await f.save({memberVersion:'worker:imogen|0',reportsTo:manager,returnTo:manager});
 await assert.rejects(f.save({memberVersion:manager+'|0',reportsTo:'worker:imogen',returnTo:manager}),e=>e.status===400);
 await assert.rejects(f.save({memberVersion:'person:'+f.actor.id+'|0',reportsTo:manager,returnTo:manager}),e=>e.status===400);
 await assert.rejects(f.save({memberVersion:'',reportsTo:manager,returnTo:manager}),e=>e.status===400);
 await assert.rejects(f.save({memberVersion:'worker:missing|0',reportsTo:manager,returnTo:manager}),e=>e.status===404);
});

test('reporting controls appear before role details for people and AI workers',async()=>{
 const f=fixture(),data=await f.data();
 for(const params of [{person:f.kasia.id},{worker:'imogen'}]){
  const html=renderTeamPage({params:new URLSearchParams(params),actor:f.actor,staff:f.staff,data,accessMarkup:()=>''});
  assert.ok(html.indexOf('Reporting & team')<html.indexOf('Role & responsibilities'));
  for(const label of ['Reports to','Reports to them','Save reporting details','Add direct report'])assert.ok(html.includes(label));
 }
 const members=teamProfiles(f.actor,f.staff,data),owner=members.find(m=>m.owner);
 assert.match(teamReportingPanel(owner,members),/Account owner · no manager/);
});

test('reporting action redirects back to the manager who assigned the report',async()=>{
 const f=fixture(),res={headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}};
 await handleLibraryWork({method:'POST',headers:{host:'example.test',origin:'https://example.test'},body:{action:'team-reporting-save',memberVersion:'worker:imogen|0',reportsTo:'person:'+f.kasia.id,returnTo:'person:'+f.kasia.id}},res,{env:{NUFI_LIBRARY_CATALOGUE_KEY:'fixture'},params:new URLSearchParams({studio:'team',person:f.kasia.id}),copyActor:f.actor,apiFactory:()=>f.api,load:async()=>({records:[]})});
 assert.equal(res.statusCode,303);assert.match(res.headers.Location,new RegExp('person='+f.kasia.id+'&saved=reporting'));
 assert.equal(f.rows.get(profileId('worker:imogen')).payload.fields.reportsTo,'person:'+f.kasia.id);
});

test('team membership is independent of reporting lines and appears on profiles and the map',async()=>{
 const f=fixture(),kasia='person:'+f.kasia.id,joyce='person:'+f.joyce.id;
 await f.save({memberVersion:kasia+'|0',reportsTo:'Workspace owner',team:'Content',returnTo:kasia});
 await f.save({memberVersion:joyce+'|0',reportsTo:'Workspace owner',team:'content',returnTo:joyce});
 let data=await f.data(),members=teamProfiles(f.actor,f.staff,data),person=members.find(m=>m.key===kasia);
 assert.equal(members.find(m=>m.key===joyce).team,'Content');
 assert.equal(members.find(m=>m.key===joyce).parent,'person:'+f.actor.id);
 const html=teamReportingPanel(person,members);
 assert.match(html,/Content team/);assert.match(html,new RegExp('data-team-load href="[^\"]*person='+f.joyce.id));
 assert.match(renderTeamPage({params:new URLSearchParams({tab:'organisation'}),actor:f.actor,staff:f.staff,data}),/class="org-team">Content/);
 await f.save({memberVersion:'worker:imogen|0',reportsTo:kasia,returnTo:kasia});
 assert.equal(f.rows.get(profileId(f.kasia.id)).payload.fields.team,'Content');
 await f.save({memberVersion:joyce+'|1',reportsTo:'Workspace owner',team:'',returnTo:joyce});
 members=teamProfiles(f.actor,f.staff,await f.data());assert.equal(members.find(m=>m.key===joyce).team,'');
 await assert.rejects(f.save({memberVersion:kasia+'|1',reportsTo:'Workspace owner',team:'x'.repeat(81),returnTo:kasia}),e=>e.status===400);
});

test('the owner can join a team while remaining at the top of the reporting structure',async()=>{
 const f=fixture(),owner='person:'+f.actor.id;
 await f.save({memberVersion:owner+'|0',reportsTo:'',team:'Operations',returnTo:owner});
 const member=teamProfiles(f.actor,f.staff,await f.data()).find(m=>m.owner);
 assert.equal(member.team,'Operations');assert.equal(member.parent,null);
});
