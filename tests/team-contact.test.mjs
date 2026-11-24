import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {saveTeamEmail,teamEmailEditor,loadTeamIdentity,teamIdentityPanel} from '../server/team-contact.mjs';
import {createTeamPasswordLink,readTeamPasswordLink} from '../server/team-passwords.mjs';
import {renderTeamPage} from '../server/studio-team.mjs';
import {handleLibraryWork} from '../server/library-work.mjs';
const actor={id:randomUUID(),role:'admin'},person={id:randomUUID(),name:'Colleague',email:'old@example.test',access_revision:2,code_hash:'existing-password-hash'};
test('email edit changes only the address and revision, and invalidates old password links',async()=>{
 const current=structuredClone(person),writes=[],env={NUFI_LIBRARY_CATALOGUE_KEY:'fixture-key'};
 const oldLink=createTeamPasswordLink(current,env),api=async(path,o={})=>{
  if(o.method==='PATCH'){if(!path.includes('access_revision=eq.'+current.access_revision))return [];writes.push(o.payload);Object.assign(current,o.payload);}
  return [structuredClone(current)];
 };
 await saveTeamEmail({staff:person.id,email:' Joyce.delacruz@nutrition.fitness ',accessRevision:'2'},actor,api);
 assert.equal(current.email,'joyce.delacruz@nutrition.fitness');assert.equal(current.code_hash,person.code_hash);assert.equal(current.access_revision,3);assert.ok(!Object.hasOwn(writes[0],'access'));
 await assert.rejects(readTeamPasswordLink(new URL(oldLink).searchParams.get('token'),api,env),e=>e.status===400);
 await assert.rejects(saveTeamEmail({staff:person.id,email:'new@example.test',accessRevision:'2'},actor,api),e=>e.status===409);
});
test('email changes reject staff, administrator self-edits, unsafe values and duplicates',async()=>{
 const f={staff:person.id,email:'new@example.test',accessRevision:'2'};
 await assert.rejects(saveTeamEmail(f,{role:'staff',id:person.id},()=>{throw Error('No access');}),e=>e.status===403);
 await assert.rejects(saveTeamEmail({...f,staff:actor.id},actor,()=>{throw Error('No access');}),e=>e.status===400);
 await assert.rejects(saveTeamEmail({...f,email:'bad\r\nBcc:secret@example.test'},actor,()=>{throw Error('No write');}),e=>e.status===400);
 await assert.rejects(saveTeamEmail(f,actor,async()=>{throw {status:409};}),/already in use/);
 assert.doesNotMatch(teamEmailEditor(person),/existing-password-hash/);
});
test('onboarding lookup is scoped to one account and omits ID images',async()=>{
 let endpoint='';const receipt={id:randomUUID(),actor_id:person.id,actor_role:'staff',full_name:'Colleague',postal_address:'123 Example Street\nExample Town',identity_received:true};
 assert.equal(await loadTeamIdentity(async path=>{endpoint=path;return [receipt];},actor,person.id),receipt);
 assert.match(endpoint,new RegExp('actor_id=eq.'+person.id));assert.doesNotMatch(endpoint,/identity_image/);
 await assert.rejects(loadTeamIdentity(()=>{throw Error('No query');},{role:'staff'},person.id),e=>e.status===403);
 const html=teamIdentityPanel(receipt);assert.match(html,/123 Example Street/);assert.match(html,/View ID document/);assert.match(html,/not verified/);
 assert.doesNotMatch(teamIdentityPanel({...receipt,identity_removed_at:'2026-11-24'}),/View ID document/);
 assert.match(teamIdentityPanel({...receipt,postal_address:'<script>unsafe</script>'}),/&lt;script&gt;/);
});
test('profile shows submitted address and ID link; directory and staff cannot expose them',()=>{
 const receipt={id:randomUUID(),full_name:'Colleague',postal_address:'Private example address',identity_received:true};
 const data={projects:[],tasks:[],items:[],byId:new Map(),personIdentity:receipt};
 const f={actor,staff:[person],data,accessMarkup:()=>'',createMarkup:''};
 const html=renderTeamPage({...f,params:new URLSearchParams({person:person.id})});assert.match(html,/Private example address/);assert.match(html,/Edit email address/);assert.match(html,/View ID document/);
 assert.doesNotMatch(renderTeamPage({...f,params:new URLSearchParams()}),/Private example address/);
 assert.throws(()=>renderTeamPage({...f,actor:{role:'staff'},params:new URLSearchParams({person:person.id})}),e=>e.status===403);
});
test('email form route saves with revision protection and returns to the same profile',async()=>{
 const current=structuredClone(person),res={headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}};
 const api=async(path,o={})=>{if(o.method==='PATCH'){assert.match(path,/access_revision=eq.2/);Object.assign(current,o.payload);return [current];}return [];};
 await handleLibraryWork({method:'POST',headers:{host:'example.test',origin:'https://example.test'},body:{action:'team-email-save',staff:person.id,email:'new@example.test',accessRevision:'2'}},res,{params:new URLSearchParams({studio:'team',person:person.id}),env:{NUFI_LIBRARY_CATALOGUE_KEY:'fixture-key'},apiFactory:()=>api,copyActor:actor,load:async()=>({records:[],files:{}})});
 assert.equal(res.statusCode,303);assert.match(res.headers.Location,new RegExp(person.id));assert.match(res.headers.Location,/saved=email/);assert.equal(current.email,'new@example.test');
});
