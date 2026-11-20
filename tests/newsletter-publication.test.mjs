import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {reviewDecision,reviewWindowDocument} from '../server/studio-review.mjs';
import {changeStudio} from '../server/studio-actions.mjs';
import {publishNewsletterDraft,newsletterHandoffStatus} from '../server/studio-review-newsletter.mjs';
import {runNewsletterSync,sealGhlToken} from '../server/newsletter-sync.mjs';
import {ghlLocation} from '../server/ghl-newsletter-client.mjs';

function fixture(){
 const env={NUFI_GHL_SEAL_KEY:'a'.repeat(64)},actor={role:'admin',id:'admin',name:'James'},calls=[];
 let record={id:'worker:newsletter-test',kind:'communication',workerId:'nina',title:'Newsletter test',revision:4,status:'Approved',approval:{by:'admin',revision:4},fields:{subject:'Hello',body:'Hello there',emailHtml:'<p>Hello there</p>'}},state={},remote;
 const connection={enabled:true,locationId:ghlLocation,sealedToken:sealGhlToken('private-test-token-123456789012345',env)};
 const api=async(path,o={})=>{
  if(path.includes('nufi_studio_save')){assert.equal(o.payload.expected,record.revision);record={...o.payload.document,revision:record.revision+1};return [{revision:record.revision}];}
  if(path.includes('nufi_studio_items'))return [{id:record.id,payload:structuredClone(record),revision:record.revision}];
  if(path.includes('nufi_library_display'))return [{payload:connection}];
  if(path.includes('nufi_claim_newsletter'))return [{state:structuredClone(state)}];
  if(path.includes('nufi_newsletter_sync')){if(o.method==='PATCH'){state=structuredClone(o.payload.state);return [{state}];}return Object.keys(state).length?[{item_id:record.id,state}]:[];}
  throw Error('Unexpected request '+path);
 };
 const fetcher=async(url,o)=>{
  assert.match(url,/^https:\/\/services.leadconnectorhq.com\/emails\/locations\/C0BGBoXIG8FVn9G5mmA3\/campaigns\/emails(?:\?|\/|$)/);
  assert.doesNotMatch(url,/send|schedule|recipients/);
  const payload=o.body?JSON.parse(o.body):null;calls.push({url,method:o.method,payload});
  if(o.method==='POST')remote={id:'test-draft',status:'draft',...payload};
  if(o.method==='PATCH')remote={...remote,...payload};
  return new Response(JSON.stringify(o.method==='GET'?remote:{id:'test-draft'}),{status:200});
 };
 return {env,actor,api,fetcher,calls,connection,get record(){return record;},get state(){return state;},data:()=>({actor,items:[record],byId:new Map([[record.id,record]]),assigned:new Set(),projects:[],people:[]}),mutate:fn=>fn(record)};
}
const act=(f,action,extra={})=>publishNewsletterDraft({action,revision:String(f.record.revision),...extra},f.record,f.data(),f.api,f.env,f.fetcher);
const run=(f,now)=>runNewsletterSync({api:f.api,env:f.env,fetcher:f.fetcher,...(now?{now}:{})});

test('approval opens GHL choices and approval alone does not export',async()=>{
 const f=fixture();f.mutate(r=>{r.status='Draft';delete r.approval;});
 const result=await reviewDecision(new URLSearchParams({id:f.record.id}),{action:'review-decision',decision:'approve',revision:'4',reviewId:randomUUID()},f.data(),f.api,f.env,f.fetcher);
 assert.equal(result.record.status,'Approved');assert.equal(f.calls.length,0);
 const html=reviewWindowDocument(new URLSearchParams({id:f.record.id,reviewed:'approve'}),f.data());
 for(const text of ['data-publication-dialog data-open-on-load','Newsletter approved','Save to GHL now','Schedule for later','Keep here for now','does not send the newsletter to subscribers'])assert.ok(html.includes(text),text);
 assert.equal((await run(f)).processed,0);assert.equal(f.calls.length,0);
 await act(f,'review-keep-draft');assert.equal(f.record.ghlDraftPlan,undefined);
});

test('an existing GHL copy does not label an unapproved newsletter as approved',()=>{
 const f=fixture();f.mutate(r=>{r.status='Draft';delete r.approval;});
 const data={...f.data(),ghlDraftStates:new Map([[f.record.id,{status:'synced',sourceRevision:f.record.revision}]]),ghlDrafts:new Map([[f.record.id,'test-draft']])};
 assert.doesNotMatch(newsletterHandoffStatus(f.record,data),/approved version|scheduled for|draft requested/);
 assert.match(newsletterHandoffStatus(f.record,data),/Open in GHL/);
});

test('Save to GHL now creates only a draft and repeated requests reuse the saved mapping',async()=>{
 const f=fixture(),result=await act(f,'review-publish');
 assert.equal(result.reviewed,'ghl-saved');assert.equal(f.record.approval.revision,f.record.revision);assert.equal(f.state.campaignId,'test-draft');
 assert.equal(f.calls.filter(c=>c.method==='POST').length,1);assert.equal(f.calls.filter(c=>c.method==='PATCH').length,1);
 assert.ok(f.calls.every(c=>!c.payload||!('recipients' in c.payload)&&!('scheduledAt' in c.payload)&&!('send' in c.payload)));
 assert.equal((await run(f)).processed,0);
 await act(f,'review-publish');assert.equal(f.calls.filter(c=>c.method==='POST').length,1);assert.equal(f.state.sourceRevision,f.record.revision);
});

test('a scheduled GHL draft waits until its chosen London time and can be cancelled',async()=>{
 const f=fixture();assert.equal((await act(f,'review-schedule',{scheduledAt:'2099-06-01T10:00'})).reviewed,'ghl-scheduled');
 assert.equal(f.record.ghlDraftPlan.scheduledAt,'2099-06-01T09:00:00.000Z');assert.equal(f.calls.length,0);
 assert.equal((await run(f,Date.parse('2099-06-01T08:59:59Z'))).processed,0);
 assert.equal((await run(f,Date.parse('2099-06-01T09:00:00Z'))).processed,1);assert.equal(f.state.status,'synced');
 const cancelled=fixture();await act(cancelled,'review-schedule',{scheduledAt:'2099-06-01T10:00'});await act(cancelled,'review-keep-draft');
 assert.equal((await run(cancelled,Date.parse('2099-06-01T10:00:00Z'))).processed,0);assert.equal(cancelled.calls.length,0);
});

test('editing or requesting changes cancels transfer eligibility and needs a new approval and choice',async()=>{
 const f=fixture();await act(f,'review-schedule',{scheduledAt:'2099-06-01T10:00'});
 await changeStudio(new URLSearchParams({id:f.record.id}),{action:'content-save',revision:String(f.record.revision),title:f.record.title,intent:'draft',fields:JSON.stringify({...f.record.fields,subject:'Changed'})},f.data(),f.api);
 assert.equal(f.record.ghlDraftPlan,undefined);assert.equal(f.record.approval,undefined);assert.equal((await run(f,Date.parse('2100-01-01'))).processed,0);
 const g=fixture();await act(g,'review-schedule',{scheduledAt:'2099-06-01T10:00'});
 await reviewDecision(new URLSearchParams({id:g.record.id}),{action:'review-decision',decision:'changes',revision:String(g.record.revision),reviewId:randomUUID(),feedback:'Shorten it'},g.data(),g.api,{},g.fetcher);
 assert.equal(g.record.ghlDraftPlan,undefined);assert.equal((await run(g,Date.parse('2100-01-01'))).processed,0);assert.equal(g.calls.length,0);
});

test('stale, unapproved, unauthorised, past-date and disconnected requests do not reach GHL',async()=>{
 const f=fixture();
 await assert.rejects(publishNewsletterDraft({action:'review-publish',revision:'3'},f.record,f.data(),f.api,f.env,f.fetcher),e=>e.status===409);
 await assert.rejects(publishNewsletterDraft({action:'review-publish',revision:'4'},f.record,{...f.data(),actor:{role:'staff'}},f.api,f.env,f.fetcher),e=>e.status===403);
 await assert.rejects(act(f,'review-schedule',{scheduledAt:'2020-01-01T10:00'}),e=>e.status===400);
 f.connection.enabled=false;await assert.rejects(act(f,'review-publish'),e=>e.status===503);
 f.mutate(r=>{r.status='Draft';});await assert.rejects(act(f,'review-publish'),e=>e.status===400);
 assert.equal(f.calls.length,0);assert.equal(f.record.revision,4);
});

test('a change while a new GHL draft is being created blocks the subsequent update',async()=>{
 const f=fixture(),fetcher=async(...args)=>{const response=await f.fetcher(...args);if(args[1].method==='POST')f.mutate(r=>{r.revision++;r.status='Draft';delete r.approval;});return response;};
 const result=await publishNewsletterDraft({action:'review-publish',revision:'4'},f.record,f.data(),f.api,f.env,fetcher);
 assert.equal(result.reviewed,'ghl-attention');assert.equal(f.calls.filter(c=>c.method==='PATCH').length,0);assert.equal(f.state.status,'attention');
});
