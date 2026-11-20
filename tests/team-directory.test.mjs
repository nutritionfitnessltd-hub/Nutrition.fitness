import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {renderTeamPage,saveTeamProfile,teamWorkSnapshot} from '../server/studio-team.mjs';
import {handleLibraryWork} from '../server/library-work.mjs';
import {teamProfiles,validProfilePhoto} from '../server/team-profiles.mjs';
import {readFile} from 'node:fs/promises';
const actor={role:'admin',id:randomUUID()},person={id:randomUUID(),name:'Test colleague',email:'private@example.test',code_hash:'not-for-the-page'};
function fixture(){
 const project={id:randomUUID(),name:'Launch work',creator_id:person.id,status:'In progress',studio:{projectManager:'morgan'},entries:[{title:'Check the launch',status:'To do',worker:'morgan',week:1},{title:'Finished work',status:'Done',week:0}]};
 const data={projects:[project],tasks:[],items:[],byId:new Map(),activityAvailable:true};
 return {params:new URLSearchParams(),actor,staff:[person],data,accessMarkup:()=>'<button>Save access</button>',createMarkup:'<button>Create user</button>'};
}
test('directory cards show concise actual work and leave contact and controls in the profile',()=>{
 const f=fixture(),html=renderTeamPage(f);
 assert.match(html,/data-team-open/);assert.match(html,/1 open task/);assert.match(html,/Check the launch/);
 assert.doesNotMatch(html,/private@example|not-for-the-page|Save access|<form/);
 const profile=renderTeamPage({...f,params:new URLSearchParams({person:person.id})});
 assert.match(profile,/private@example.test/);assert.match(profile,/Manage access &amp; login|Manage access & login/);assert.match(profile,/Finished work/);
 assert.doesNotMatch(profile,/not-for-the-page/);
});
test('worker profile distinguishes recorded work, confirmed HQ status, and returned results',()=>{
 const f=fixture(),cards=renderTeamPage({...f,params:new URLSearchParams({tab:'workers'})});
 assert.match(cards,/Morgan/);assert.match(cards,/1 open task/);assert.doesNotMatch(cards,/Working in James HQ/);
 const profile=renderTeamPage({...f,params:new URLSearchParams({worker:'morgan'}),hqChat:{task:{status:'working'},employee:{instructions:'Keep approval with James.'},messages:[{role:'assistant',body:'Plan ready <script>',createdAt:'2026-11-19'}]}});
 assert.match(profile,/Working in James HQ/);assert.match(profile,/Check the launch/);assert.match(profile,/Plan ready &lt;script&gt;/);assert.match(profile,/Keep approval with James/);
 const unavailable=renderTeamPage({...f,params:new URLSearchParams({worker:'morgan'}),hqError:'HQ could not connect.'});assert.match(unavailable,/HQ status unavailable/);assert.doesNotMatch(unavailable,/Working in James HQ/);
});
test('role metadata saves with revision protection and cannot create or alter accounts',async()=>{
 const f=fixture();let called;
 const fields={staff:person.id,revision:'0',role:'Editor',responsibilities:'Review content',reportsTo:'Workspace owner'};
 const api=async(path,options)=>{called={path,options};return [{revision:1}];};
 await saveTeamProfile(fields,actor,f.staff,f.data,api);assert.match(called.path,/nufi_studio_save/);assert.equal(called.options.payload.document.fields.role,'Editor');
 f.data.byId.set('studio:team-profile:'+person.id,{revision:1});
 await assert.rejects(saveTeamProfile(fields,actor,f.staff,f.data,api),e=>e.status===409);
 await assert.rejects(saveTeamProfile({...fields,staff:randomUUID()},actor,f.staff,f.data,api),e=>e.status===404);
 await assert.rejects(saveTeamProfile(fields,{role:'staff'},f.staff,f.data,api),e=>e.status===403);
});
test('missing activity is labelled unavailable instead of suggesting availability',async()=>{
 const data=await teamWorkSnapshot(async()=>{throw Error('outage');});assert.equal(data.activityAvailable,false);
 const f=fixture();assert.match(renderTeamPage({...f,data,params:new URLSearchParams({tab:'workers'})}),/Activity unavailable/);
 assert.throws(()=>renderTeamPage({...f,actor:{role:'staff'}}),e=>e.status===403);
});

test('AI profiles save through the team handler and reload in the editor, directory and map',async()=>{
 const f=fixture(),rows=new Map(),writes=[];
 const api=async(path,options)=>{
  if(path.includes('/rpc/nufi_studio_save')){const p=options.payload,old=rows.get(p.item);if((old?.revision||0)!==p.expected)return [];const row={id:p.item,payload:p.document,revision:p.expected+1};rows.set(p.item,row);writes.push(path);return [row];}
  if(path.includes('nufi_library_staff'))return f.staff;
  if(path.includes('nufi_studio_items'))return [...rows.values()];
  return [];
 };
 const res={statusCode:0,headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}};
 const fields={action:'team-profile-save',worker:'imogen',revision:'0',role:'Course production lead',responsibilities:'Brand lessons and prepare exports.',reportsTo:'person:'+person.id};
 await handleLibraryWork({method:'POST',headers:{host:'example.test',origin:'https://example.test'},body:fields},res,{env:{NUFI_LIBRARY_CATALOGUE_KEY:'fixture'},params:new URLSearchParams({studio:'team',worker:'imogen'}),copyActor:actor,apiFactory:()=>api,load:async()=>({records:[]})});
 assert.equal(res.statusCode,303);assert.match(res.headers.Location,/worker=imogen&saved=profile/);
 assert.deepEqual(writes,['/rest/v1/rpc/nufi_studio_save']);
 const data=await teamWorkSnapshot(api);
 for(const params of [{worker:'imogen'},{tab:'workers'},{tab:'organisation'}])assert.match(renderTeamPage({...f,data,params:new URLSearchParams(params)}),/Course production lead/);
 const members=teamProfiles(actor,f.staff,data);assert.equal(members.find(m=>m.worker==='imogen').parent,'person:'+person.id);
 await assert.rejects(saveTeamProfile(fields,actor,f.staff,data,api),e=>e.status===409);
 await assert.rejects(saveTeamProfile({...fields,worker:'missing'},actor,f.staff,data,api),e=>e.status===404);
 await assert.rejects(saveTeamProfile(fields,{role:'staff'},f.staff,data,api),e=>e.status===403);
});

test('reporting lines reject self-reporting and indirect loops without changing accounts',async()=>{
 const f=fixture();let writes=0;const api=async()=>{writes++;return [{revision:1}];};
 const fields={worker:'morgan',revision:0,role:'Project lead',responsibilities:'',reportsTo:'worker:morgan'};
 await assert.rejects(saveTeamProfile(fields,actor,f.staff,f.data,api),e=>e.status===400);
 f.data.byId.set('studio:team-profile:worker:imogen',{revision:1,fields:{reportsTo:'worker:morgan'}});
 await assert.rejects(saveTeamProfile({...fields,reportsTo:'worker:imogen'},actor,f.staff,f.data,api),e=>e.status===400);
 await assert.rejects(saveTeamProfile({...fields,reportsTo:'not a team member'},actor,f.staff,f.data,api),e=>e.status===400);
 assert.equal(writes,0);
});

test('the account owner can edit their profile without receiving staff login controls',async()=>{
 const f=fixture();let saved;
 const api=async(path,options)=>{assert.match(path,/nufi_studio_save/);saved=options.payload.document;return [{revision:1}];};
 await saveTeamProfile({staff:actor.id,revision:0,role:'Founder',responsibilities:'Set direction and approve work.'},actor,f.staff,f.data,api);
 f.data.byId.set(saved.id,{...saved,revision:1});
 const html=renderTeamPage({...f,params:new URLSearchParams({person:'owner'})});
 assert.match(html,/Founder/);assert.match(html,/Save profile/);assert.doesNotMatch(html,/Save access|Access disabled|<select name="reportsTo"/);
 assert.match(renderTeamPage({...f,params:new URLSearchParams({tab:'organisation'})}),/Founder/);
});

test('profile photos save as bounded JPEGs, reject unsafe content and can be reset',async()=>{
 const f=fixture(),photo='data:image/jpeg;base64,'+(await readFile(new URL('../public/assets/studio-team/nina.jpg',import.meta.url))).toString('base64');
 assert.ok(validProfilePhoto(photo));let saved;
 const api=async(path,options)=>{saved=options.payload.document;return [{revision:1}];};
 const fields={staff:person.id,revision:0,role:'Editor',portrait:photo};
 await saveTeamProfile(fields,actor,f.staff,f.data,api);assert.equal(saved.fields.portrait,photo);
 f.data.byId.set(saved.id,{...saved,revision:1});
 assert.match(renderTeamPage({...f,params:new URLSearchParams({person:person.id})}),/data:image\/jpeg;base64,/);
 for(const portrait of ['javascript:alert(1)','https://example.test/photo.jpg','data:image/svg+xml,<svg onload="alert(1)"/>',photo+'A'.repeat(120000)])await assert.rejects(saveTeamProfile({...fields,revision:1,portrait},actor,f.staff,f.data,api),e=>e.status===400);
 await saveTeamProfile({...fields,revision:1,portrait:''},actor,f.staff,f.data,api);assert.equal(saved.fields.portrait,'');
});
