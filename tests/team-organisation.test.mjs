import {includeAdministrator} from '../server/team-owner.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {organisation,organisationMap,saveOrganisation,organisationId} from '../server/team-organisation.mjs';
const actor={id:'owner',role:'admin'},staff=[{id:'colleague',name:'Joyce'}];
const data=()=>({byId:new Map(),items:[],projects:[],tasks:[],activityAvailable:true});
function record(roles,revision=2){const d=data();d.byId.set(organisationId,{fields:{roles},revision});return d;}
const ceo={id:'ceo',title:'CEO',parent:'',occupants:[{member:'person:owner',acting:false}],support:['morgan'],responsibilities:''};
const cto={id:'cto',title:'CTO',parent:'ceo',occupants:[{member:'person:owner',acting:true},{member:'person:colleague',acting:false}],support:['morgan'],responsibilities:''};
test('one person and one worker can appear in several roles; support never fills a vacancy',()=>{
 const d=record([ceo,cto,{...cto,id:'vacant',title:'Finance',occupants:[]}]);const html=organisationMap(actor,staff,d);
 assert.equal((html.match(/James Calam/g)||[]).length,2);assert.equal((html.match(/AI support · Morgan/g)||[]).length,3);assert.match(html,/Joyce/);assert.match(html,/Acting/);assert.match(html,/Vacant · needs filling/);
 const hidden=organisationMap(actor,staff,d,new URLSearchParams({ai:'hide'}));assert.doesNotMatch(hidden,/AI support/);assert.deepEqual(organisation(actor,staff,d).roles,[ceo,cto,{...cto,id:'vacant',title:'Finance',occupants:[]}]);
});
test('saving many-to-many role assignments uses the versioned organisation record',async()=>{
 let request;await saveOrganisation({action:'team-role-save',revision:'2',role:'cto',title:'CTO',parent:'ceo','occupant:person:owner':'acting','occupant:person:colleague':'permanent','support:morgan':'yes','support:ellis':'yes'},actor,staff,record([ceo,cto]),async(path,options)=>{request=options.payload;return [{}];});
 assert.equal(request.expected,2);const roles=request.document.fields.roles;assert.equal(roles.find(r=>r.id==='cto').occupants.length,2);assert.deepEqual(roles.find(r=>r.id==='cto').support,['morgan','ellis']);assert.deepEqual(roles.find(r=>r.id==='ceo'),ceo);
});
test('cycles, missing identities, stale versions, unavailable data and non-admins cannot mutate roles',async()=>{
 let writes=0;const api=async()=>{writes++;return [{}];},base={action:'team-role-save',revision:'2',role:'ceo',title:'CEO',parent:''},d=record([ceo,cto]);
 for(const f of [{...base,parent:'cto'},{...base,parent:'missing'},{...base,'occupant:person:fake':'acting'},{...base,'support:fake':'yes'},{...base,revision:'1'},{...base,action:'team-role-delete'}])await assert.rejects(saveOrganisation(f,actor,staff,d,api));
 await assert.rejects(saveOrganisation(base,{...actor,role:'staff'},staff,d,api));await assert.rejects(saveOrganisation(base,actor,staff,{...d,activityAvailable:false},api));assert.equal(writes,0);
});
test('role editing and worker controls open within the existing modal mechanism',()=>{
 const d=record([ceo,cto]);assert.match(organisationMap(actor,staff,d),/data-team-open[^>]+role=new/);const editor=organisationMap(actor,staff,d,new URLSearchParams({role:'cto'}));assert.match(editor,/data-team-profile/);assert.match(editor,/occupant:person:owner/);assert.match(editor,/support:morgan/);
 d.hqStatus={version:5,workers:{morgan:{paused:true}}};const workers=organisationMap(actor,staff,d,new URLSearchParams({role:'workers'}));assert.match(workers,/Resume worker/);assert.match(workers,/name="version" value="5"/);
});

test('administrator becomes assignable using verified account identity without creating login access',async()=>{
 const writes=[],actor={role:'admin',id:'owner-id'};
 const api=async(path,options)=>{if(path.startsWith('/auth/'))return {id:actor.id,email:'James@example.com',user_metadata:{full_name:'James Calam'}};writes.push(options.payload);return [options.payload];};
 const people=await includeAdministrator(api,actor,[]);assert.equal(people[0].name,'James Calam');assert.equal(people[0].id,actor.id);assert.equal(people[0].email,'james@example.com');assert.equal(writes[0].code_hash,undefined);
 await includeAdministrator(api,actor,people);assert.equal(writes.length,1);
 await includeAdministrator(()=>{throw Error('Staff cannot read auth users');},{role:'staff',id:'staff'},[]);
});
