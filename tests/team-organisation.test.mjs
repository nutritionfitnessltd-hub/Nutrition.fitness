import test from 'node:test';
import assert from 'node:assert/strict';
import {includeAdministrator} from '../server/team-owner.mjs';
import {organisationMap} from '../server/team-organisation.mjs';
test('administrator becomes assignable using verified account identity without creating login access',async()=>{
 const writes=[],actor={role:'admin',id:'owner-id'};
 const api=async(path,options)=>{if(path.startsWith('/auth/'))return {id:actor.id,email:'James@example.com',user_metadata:{full_name:'James Calam'}};writes.push(options.payload);return [options.payload];};
 const people=await includeAdministrator(api,actor,[]);assert.equal(people[0].name,'James Calam');assert.equal(people[0].id,actor.id);assert.equal(people[0].email,'james@example.com');assert.equal(writes[0].code_hash,undefined);
 await includeAdministrator(api,actor,people);assert.equal(writes.length,1);
 await includeAdministrator(()=>{throw Error('Staff cannot read auth users');},{role:'staff',id:'staff'},[]);
});
test('organisation map renders saved hierarchy, unknown managers and circular lines safely',()=>{
 const staff=[{id:'owner',name:'James Calam'},{id:'a',name:'A'},{id:'b',name:'B'},{id:'c',name:'<script>bad</script>'}],byId=new Map([['studio:team-profile:a',{fields:{reportsTo:'James Calam',role:'Director'}}],['studio:team-profile:b',{fields:{reportsTo:'B'}}]]);
 const html=organisationMap({id:'owner'},staff,{byId});assert.match(html,/James Calam/);assert.match(html,/Director/);assert.match(html,/Reporting line needs setting/);assert.match(html,/Nina/);assert.doesNotMatch(html,/<script>/);
});

test('organisation cards use portraits and modal links without CSP-blocked inline styling',()=>{
 const html=organisationMap({id:'owner'},[{id:'owner',name:'James Calam'}],{byId:new Map()});
 assert.match(html,/class="team-directory organisation-directory"/);
 assert.equal((html.match(/data-team-open/g)||[]).length,11);
 assert.match(html,/src="\/assets\/studio-team\/imogen-aligned.png"/);
 assert.match(html,/Reports to James Calam/);
 assert.doesNotMatch(html,/<style|style=|Course structure, lesson scripts/);
});
