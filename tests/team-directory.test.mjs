import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {renderTeamPage,saveTeamProfile,teamWorkSnapshot} from '../server/studio-team.mjs';
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
