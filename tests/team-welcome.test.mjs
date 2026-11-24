import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requireTeamWelcome,welcomeDocument} from '../server/team-welcome.mjs';
import {engagementFields} from '../server/team-profiles.mjs';
const fields={role:'Editor',engagementType:'freelance',rate:'25',currency:'GBP',rateBasis:'hour',agreedHours:'10',hoursPeriod:'week'};
function fixture(f=fields){
 let receipts=[],page='',hash='',writes=0;
 const api=async(path,options={})=>{
  if(path.includes('nufi_studio_items'))return [{payload:{fields:f}}];
  if(path.includes('nufi_library_staff'))return [{name:'Alex'}];
  if(options.method==='POST'){writes++;receipts.push({id:'receipt'});return [];}
  return receipts;
 };
 const res={setHeader(){},end(){}};
 const run=async(method='GET',body={},origin='https://example.test')=>requireTeamWelcome({method,body,headers:{host:'example.test',origin}},res,{actor:{role:'staff',id:'member'},api,params:new URLSearchParams('work=1'),render(r,status,html){page=html;r.statusCode=status;hash=html.match(/name="document_hash" value="([^"]+)"/)?.[1];}});
 return {run,res,get page(){return page;},get hash(){return hash;},get writes(){return writes;}};
}
test('letter precedes NDA and explicit acknowledgement is durably saved',async()=>{
 const f=fixture();assert.equal(await f.run(),true);assert.match(f.page,/25 GBP per hour/);assert.match(f.page,/10 per week/);
 await f.run('POST',{action:'accept-nda'});assert.equal(f.writes,0);
 await f.run('POST',{action:'acknowledge-welcome',acknowledge:'1',document_hash:f.hash});assert.equal(f.res.statusCode,303);assert.equal(f.writes,1);assert.equal(await f.run(),false);
});
test('missing profile blocks onboarding without accepting anything',async()=>{const f=fixture({});await f.run();assert.equal(f.res.statusCode,403);assert.equal(f.writes,0);});
test('rejects stale letter and foreign-origin submission',async()=>{const f=fixture();await f.run();await f.run('POST',{action:'acknowledge-welcome',acknowledge:'1',document_hash:'stale'});assert.equal(f.res.statusCode,409);assert.equal(f.writes,0);await assert.rejects(f.run('POST',{},'https://other.test'));});
test('profile validation preserves fields on unrelated edits',()=>{assert.equal(engagementFields({},fields).rate,'25');assert.throws(()=>engagementFields({...fields,rate:'-1'}));assert.throws(()=>engagementFields({...fields,engagementType:'unknown'}));});
test('FTE requires separate contract and all arrangements explain flexible working',()=>{const text=welcomeDocument('Alex',{...fields,engagementType:'fte'});assert.match(text,/separate employment contract is required/);assert.match(text,/Flexible working/);});
