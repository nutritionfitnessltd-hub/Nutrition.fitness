import test from 'node:test';
import assert from 'node:assert/strict';
import {touchPresence,teamPresence} from '../server/team-presence.mjs';
import {messageFixture} from './team-messages-fixture.mjs';
test('presence uses the authenticated actor, expires heartbeats, and degrades honestly on failure',async()=>{
 const f=messageFixture(),now=Date.now();let written;
 await touchPresence(async(url,options)=>{written=options;},f.staff,true,now);
 assert.equal(written.payload.actor_id,f.staff.id);assert.equal(written.headers.Prefer,'resolution=merge-duplicates,return=minimal');
 await assert.rejects(()=>touchPresence(async()=>[],{role:'worker',id:f.staff.id},true),/human/);
 const rows=[{actor_id:f.staff.id,last_seen_at:new Date(now-1000).toISOString(),active:true},{actor_id:f.other.id,last_seen_at:new Date(now-1000).toISOString(),active:false}];
 let states=await teamPresence(async()=>rows,f.people,now);assert.equal(states.find(p=>p.id===f.staff.id).status,'online');assert.equal(states.find(p=>p.id===f.other.id).status,'away');
 states=await teamPresence(async()=>rows,f.people,now+71000);assert.ok(states.every(p=>p.status==='offline'));
 assert.equal(await teamPresence(async()=>{throw Error('unavailable');},f.people,now),null);
});
