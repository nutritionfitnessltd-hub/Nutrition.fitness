import {renderTeamPage} from '../server/studio-team.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {canSeeIdea} from '../server/idea-visibility.mjs';
import {changeShinyThing,shinyThingsPage} from '../server/studio-shiny-things.mjs';
import {studioData} from '../server/studio-store.mjs';
import {authorizeStudioRequest} from '../server/library-permissions.mjs';
import {shinyAction} from '../supabase/functions/content-worker-bridge/shiny-things.mjs';
const owner={id:randomUUID(),role:'staff'},peer={id:randomUUID(),role:'staff'},other={id:randomUUID(),role:'staff'},admin={id:randomUUID(),role:'admin'};
const teams=new Map([[owner.id,'Content'],[peer.id,'Content'],[other.id,'Marketing']]);
const idea=(visibility='personal')=>({id:'studio:idea:'+randomUUID(),kind:'settings',title:'Secret thought',revision:1,fields:{ownerId:owner.id,visibility,team:visibility==='team'?'Content':'',summary:'Private body',weeks:4,state:'Saved'}});
function fixture(r){const rows=new Map(r?[[r.id,r]]:[]),data=actor=>({actor,items:[...rows.values()],byId:rows,projects:[],people:[owner,peer,other].map(p=>({...p,name:p.id})),ideaTeams:teams});const api=async(path,{payload})=>{const next={...payload.document,revision:payload.expected+1};rows.set(next.id,next);return [next];};return {rows,data,api};}
test('personal, team and company visibility is enforced without an administrator bypass',()=>{
 const r=idea();assert.ok(canSeeIdea(owner,r,teams));for(const p of [peer,other,admin])assert.equal(canSeeIdea(p,r,teams),false);
 r.fields.visibility='team';r.fields.team='Content';assert.ok(canSeeIdea(peer,r,teams));assert.equal(canSeeIdea(other,r,teams),false);assert.equal(canSeeIdea(admin,r,teams),false);
 r.fields.visibility='company';assert.ok(canSeeIdea(other,r,teams));assert.ok(canSeeIdea(admin,r,teams));
 r.fields.visibility='unknown';assert.equal(canSeeIdea(owner,r,teams),false);
});
test('new ideas default personal; only owner can share and only to their current team',async()=>{
 const x=fixture(),id='studio:idea:'+randomUUID(),f={action:'idea-save',id,revision:0,title:'Thought',summary:'Notes',weeks:4};
 await changeShinyThing(new URLSearchParams(),f,x.data(owner),x.api,{});assert.equal(x.rows.get(id).fields.visibility,'personal');assert.equal(x.rows.get(id).fields.ownerId,owner.id);
 await assert.rejects(changeShinyThing(new URLSearchParams(),{...f,revision:1,visibility:'company'},x.data(peer),x.api,{}),e=>e.status===404);
 await assert.rejects(changeShinyThing(new URLSearchParams(),{...f,revision:1,visibility:'team',team:'Marketing'},x.data(owner),x.api,{}),e=>e.status===400);
 await changeShinyThing(new URLSearchParams(),{...f,revision:1,visibility:'team',team:'Content'},x.data(owner),x.api,{});
 assert.match(shinyThingsPage(new URLSearchParams(),x.data(peer)),/Thought/);assert.doesNotMatch(shinyThingsPage(new URLSearchParams(),x.data(other)),/Thought/);
 assert.throws(()=>shinyThingsPage(new URLSearchParams({id}),x.data(other)),e=>e.status===404);
 await assert.rejects(changeShinyThing(new URLSearchParams(),{...f,revision:2,visibility:'company'},x.data(peer),x.api,{}),e=>e.status===403);
});
test('meeting agenda excludes personal ideas; discussion records decisions and follow-up without creating projects',async()=>{
 const r=idea('team'),x=fixture(r),f={id:r.id,revision:1,action:'idea-discussion',forDiscussion:'yes'};
 await changeShinyThing(new URLSearchParams(),f,x.data(peer),x.api,{});
 assert.match(shinyThingsPage(new URLSearchParams({view:'meeting'}),x.data(peer)),/Secret thought/);
 await assert.rejects(changeShinyThing(new URLSearchParams(),{...f,revision:2,decision:'Explore'},x.data(peer),x.api,{}),e=>e.status===400);
 await assert.rejects(changeShinyThing(new URLSearchParams(),{...f,revision:2,decision:'Explore',followUpOwner:other.id},x.data(peer),x.api,{}),e=>e.status===400);
 await changeShinyThing(new URLSearchParams(),{...f,revision:2,decision:'Explore',decisionNote:'Check demand',followUpOwner:peer.id,followUpDue:'2026-12-01'},x.data(peer),x.api,{});
 const saved=x.rows.get(r.id);assert.equal(saved.fields.decision,'Explore');assert.equal(saved.fields.followUpOwner,peer.id);assert.equal(saved.fields.forDiscussion,false);assert.doesNotMatch(shinyThingsPage(new URLSearchParams({view:'meeting'}),x.data(peer)),/Secret thought/);
 const privateIdea=idea();privateIdea.fields.forDiscussion=true;const y=fixture(privateIdea);assert.doesNotMatch(shinyThingsPage(new URLSearchParams({view:'meeting'}),y.data(owner)),/Secret thought/);
 await assert.rejects(changeShinyThing(new URLSearchParams(),{...f,id:privateIdea.id},y.data(owner),y.api,{}),e=>e.status===400);
});
test('studio data removes private ideas even for administrators before rendering other pages',async()=>{
 const privateIdea=idea(),company=idea('company'),team=idea('team');privateIdea.title='Private idea never listed';
 const api=async path=>path.includes('nufi_studio_items')?[privateIdea,company,team].map(r=>({id:r.id,payload:r,revision:1})):path.includes('/auth/')?{}:[];
 const data=await studioData(api,admin,async()=>({records:[]}));assert.deepEqual(data.items.map(r=>r.id),[company.id]);assert.equal(data.byId.has(privateIdea.id),false);
 const profile=renderTeamPage({params:new URLSearchParams({worker:'morgan'}),actor:admin,staff:[],data:{items:[privateIdea,company],byId:new Map([[privateIdea.id,privateIdea],[company.id,company]]),projects:[],tasks:[]}});
 assert.doesNotMatch(profile,/Private idea never listed/);
});
test('staff can save ideas but cannot run administrator project actions',()=>{
 assert.doesNotThrow(()=>authorizeStudioRequest(owner,'shiny-things','POST',{action:'idea-save'}));
 assert.throws(()=>authorizeStudioRequest(owner,'shiny-things','POST',{action:'idea-promote'}),e=>e.status===403);
});
test('service connector cannot list, retrieve or overwrite owned private ideas',async()=>{
 const r=idea(),row={id:r.id,payload:r,revision:1},connection={id:'content-manager',namespace:'worker:content-manager:'};
 const api=async path=>path.includes('nufi_studio_items')?[row]:[];
 const list=await shinyAction({action:'idea-list'},connection,api,'https://team.nutrition.fitness');assert.equal(list.total,0);
 for(const action of ['idea-get','idea-update'])await assert.rejects(shinyAction({action,id:r.id,revision:1,title:'No'},connection,api,''),e=>e.status===404);
});
