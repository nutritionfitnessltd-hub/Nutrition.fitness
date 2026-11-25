import fs from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {messagesPage} from '../server/team-messages.mjs';
import {studioFrame} from '../server/studio-ui.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {validateHours,saveHours,sharedHours,hoursEditor} from '../server/team-working-hours.mjs';
import {localInstant,upcomingHours} from '../public/working-hours.mjs';
import {changeMyAccount} from '../server/my-account.mjs';
import {messageFixture} from './team-messages-fixture.mjs';
test('local schedules validate zones, enabled days and overnight times',()=>{
 const v=validateHours({timeZone:'America/New_York',day0:'1',start0:'22:00',end0:'06:00'});assert.equal(v.time_zone,'America/New_York');assert.deepEqual(v.days[0],{start:'22:00',end:'06:00'});assert.equal(v.days[1],null);
 for(const f of [{timeZone:'bad/zone'},{timeZone:'UTC',day0:'1',start0:'25:00',end0:'09:00'},{timeZone:'UTC',day0:'1',start0:'09:00',end0:'09:00'}])assert.throws(()=>validateHours(f));
 assert.ok(validateHours({timeZone:'Europe/London'}).days.every(d=>d===null));
});
test('conversions follow different countries DST dates and preserve overnight date changes',()=>{
 assert.equal(new Date(localInstant('2026-01-12','09:00','America/New_York')).toISOString(),'2026-01-12T14:00:00.000Z');
 assert.equal(new Date(localInstant('2026-03-16','09:00','America/New_York')).toISOString(),'2026-03-16T13:00:00.000Z');
 assert.equal(new Date(localInstant('2026-06-15','09:00','Europe/London')).toISOString(),'2026-06-15T08:00:00.000Z');
 assert.equal(localInstant('2026-03-29','01:30','Europe/London'),null);
 assert.equal(localInstant('2026-10-25','01:30','Europe/London',true)-localInstant('2026-10-25','01:30','Europe/London'),3600000);
 const days=Array(7).fill(null);days[0]={start:'22:00',end:'06:00'};const result=upcomingHours({timeZone:'America/New_York',days},'Asia/Tokyo',Date.parse('2026-01-12T00:00:00Z'));
 assert.equal(result.rows[0].end-result.rows[0].start,8*3600000);assert.match(result.rows[0].label,/Tue 13 Jan, 12:00/);assert.match(result.rows[0].label,/Tue 13 Jan, 20:00/);
});
test('working hours save only the signed-in person and refuse stale edits',async()=>{
 const f=messageFixture(),calls=[],api=async(url,o={})=>{calls.push({url,o});if(url.includes('nufi_library_staff'))return [{...f.staff,email:'sample@example.test'}];return [{...o.payload}];};
 const fields={action:'account-hours',actor_id:f.other.id,staff:f.other.id,timeZone:'Asia/Kolkata',hoursRevision:'0',day0:'1',start0:'09:00',end0:'17:00'};
 assert.deepEqual(await changeMyAccount(fields,{actor:f.staff,api,env:{}}),{saved:'hours'});const saved=calls.find(c=>c.o.method==='POST');assert.equal(saved.o.payload.actor_id,f.staff.id);assert.equal(saved.o.payload.time_zone,'Asia/Kolkata');assert.equal(saved.o.payload.days.length,7);
 await assert.rejects(()=>saveHours(async()=>[],f.staff,{...fields,hoursRevision:'1'}),/changed/);
 await assert.rejects(()=>saveHours(api,{...f.staff,role:'worker'},fields),/human/);
 const shared=await sharedHours(async()=>[{actor_id:f.staff.id,time_zone:'UTC',days:[]},{actor_id:f.other.id,time_zone:'UTC',days:[]}],[f.staff]);assert.equal(shared.length,1);assert.equal(shared[0].id,f.staff.id);
 assert.match(hoursEditor(null),/data-zone-auto/);assert.doesNotMatch(hoursEditor(null,true),/account-hours/);
});

test('clock beside a person opens converted hours in the viewer zone',async()=>{
 const f=messageFixture(),html=studioFrame(await messagesPage(new URLSearchParams(),f.staff,f.api,{}),'messages',f.staff,{messagesEmbedded:true}),dom=new JSDOM(html,{url:'https://team.example/content-library/?work=1&studio=messages&panel=1',runScripts:'outside-only'}),w=dom.window;
 try{w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};w.upcomingHours=upcomingHours;const days=Array(7).fill({start:'09:00',end:'17:00'});w.fetch=async()=>({ok:true,json:async()=>({workingHours:[{id:f.other.id,timeZone:'Asia/Kolkata',days}]})});const source=await fs.readFile(new URL('../public/team-working-hours.js',import.meta.url),'utf8');w.eval(source.replace("import {upcomingHours} from './working-hours.mjs';",''));w.document.querySelector('[data-person-hours="'+f.other.id+'"]').click();await new Promise(r=>setTimeout(r,10));const dialog=w.document.querySelector('[data-hours-dialog]');assert.ok(dialog.open);assert.match(dialog.textContent,/Shown in your time/);assert.match(dialog.textContent,/Asia\/Kolkata/);assert.ok(dialog.querySelectorAll('li').length>=6);dialog.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.ok(!dialog.open);
 }finally{dom.window.close();}
});
