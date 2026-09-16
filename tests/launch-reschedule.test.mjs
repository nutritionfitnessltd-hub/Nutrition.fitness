import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LAUNCH,countdownParts,freeMonthEndsAt,launchState} from '../public/launch-config.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('November launch remains 9am UK and preserves the same trial offer',()=>{
 assert.equal(LAUNCH.at,'2026-11-01T09:00:00.000Z');
 assert.equal(LAUNCH.label,'1 November 2026 · 9am UK time');
 assert.equal(LAUNCH.version,'nufi-launch-2026-12-v1');
 const time=new Intl.DateTimeFormat('en-GB',{timeZone:LAUNCH.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(LAUNCH.at));
 assert.equal(time,'09:00');
});
test('new launch boundary never opens access early or without approval',()=>{
 const t=Date.parse(LAUNCH.at);
 assert.equal(countdownParts(t-1).reached,false);
 assert.equal(countdownParts(t).reached,true);
 assert.equal(launchState(t-1,true),'prelaunch');
 assert.equal(launchState(t,false),'awaiting-release');
 assert.equal(launchState(t,true),'live');
 assert.throws(()=>freeMonthEndsAt(new Date(t-1).toISOString()));
 assert.equal(freeMonthEndsAt(LAUNCH.at),'2026-12-01T09:00:00.000Z');
});
test('late November activation still receives a whole calendar month',()=>{
 assert.equal(freeMonthEndsAt('2026-11-30T12:00:00Z'),'2026-12-30T12:00:00.000Z');
});
test('additive database migration changes only the activation date and retains offer identity',()=>{
 const migration=read('supabase/migrations/202609160002_nufi_november_launch.sql');
 const original=read('supabase/migrations/202609160001_nufi_launch.sql');
 const pattern=/create (?:or replace )?function public\.nufi_activate_trial\(actor uuid\)[\s\S]*?end;\$\$;/;
 const fn=original.match(pattern)[0];
 assert.equal(migration.match(pattern)[0],fn.replace('create function','create or replace function').replace('2026-12-01 09:00:00+00','2026-11-01 09:00:00+00'));
 assert.ok(read('.github/workflows/launch-build.yml').includes('for migration in supabase/migrations/*.sql;'));
});
test('customer-facing launch copy has no stale December launch date',()=>{
 for(const file of ['public/launch-config.mjs','public/launch.mjs','public/food.mjs','src/experience.mjs','src/launch-layout.mjs']){
  const text=read(file);
  assert.ok(!text.includes('1 December'),file+' has stale launch wording');
  assert.ok(!text.includes('2026-12-01T09:00'),file+' has a stale launch instant');
 }
});
