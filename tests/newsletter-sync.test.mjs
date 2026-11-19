import test from 'node:test';
import assert from 'node:assert/strict';
import {newsletterEligible,newsletterSource,newsletterPayload} from '../server/newsletter-sync-html.mjs';
import {syncNewsletter,sealGhlToken,openGhlToken,runNewsletterSync} from '../server/newsletter-sync.mjs';
import {ghlClient,ghlLocation} from '../server/ghl-newsletter-client.mjs';
import {createNewsletterSyncHandler} from '../api/newsletter-sync.js';
const source=()=>({id:'worker:newsletter',workerId:'nina',kind:'communication',status:'Draft',title:'Newsletter — hello',fields:{subject:'Hello -- everyone',emailHtml:'<!doctype html><!--[if mso]>keep--><![endif]--><html><head><style>.one{--colour:red;color:var(--colour)}</style></head><body><p>Hi {{FIRST_NAME_OR_THERE}}, good — news.</p><img src="{{HERO_IMAGE_URL}}" alt="Food"><a href="{{UNSUBSCRIBE_URL}}">Unsubscribe</a></body></html>',ghlImageUrls:{HERO_IMAGE_URL:'https://files.leadconnectorhq.com/file/abc/food.jpg'}}});
function fixture(){
 const record=source(),db={state:{}},remote=new Map(),createdKeys=new Map(),calls=[];let sourceRevision=1,creates=0;
 const api=async(path,o={})=>{
  if(path.includes('nufi_claim_newsletter'))return [{state:structuredClone(db.state)}];
  if(path.startsWith('/rest/v1/nufi_newsletter_sync?')&&o.method==='PATCH'){db.state=structuredClone(o.payload.state);return [{state:db.state}];}
  if(path.includes('nufi_studio_items?select=id,payload,revision&id='))return [{payload:record,revision:sourceRevision}];
  if(path.includes('nufi_library_display'))return [];
  throw Error('Unexpected fixture request '+path);
 };
 const client={upload:async()=>{throw Error('Existing GHL image must be reused');},get:async id=>structuredClone(remote.get(id)),create:async(payload,key)=>{
  calls.push(['create',key,structuredClone(payload)]);if(createdKeys.has(key))return {id:createdKeys.get(key)};
  const id='draft-'+(++creates);createdKeys.set(key,id);remote.set(id,{...payload,subject:'',previewText:'',fromName:'',fromEmail:'',id,status:'draft'});return {id};
 },update:async(id,payload)=>{calls.push(['update',id,structuredClone(payload)]);remote.set(id,{...remote.get(id),...payload});return {id};}};
 return {record,api,client,db,remote,calls,get creates(){return creates;},setRevision:n=>sourceRevision=n};
}
test('newsletter scope is Nina only and respects archive and newsletter type',()=>{
 assert.ok(newsletterEligible(source()));assert.ok(!newsletterEligible({...source(),title:'Welcome email sequence',workerSource:{kind:'email'}}));for(const patch of [{workerId:'rory'},{status:'Archived'},{kind:'article'},{fields:{body:'ordinary email'},title:'Welcome message'}])assert.ok(!newsletterEligible({...source(),...patch}));
});
test('HTML keeps tables, styles and Outlook comments while resolving images, merge fields and punctuation',async()=>{
 const prepared=newsletterSource(source());const payload=await newsletterPayload(prepared,{},async()=>{throw Error('No upload needed');},async()=>{});
 assert.match(payload.editorContent,/\[if mso\]>keep/);assert.match(payload.editorContent,/--colour/);assert.match(payload.editorContent,/good, news/);assert.match(payload.editorContent,/default contact.first_name "there"/);assert.match(payload.editorContent,/email.unsubscribe_link/);assert.match(payload.editorContent,/files.leadconnectorhq.com/);assert.equal(payload.name,'Newsletter, hello');assert.equal(payload.subject,'Hello, everyone');
 const missing=source();missing.fields.ghlImageUrls={};assert.throws(()=>newsletterSource(missing),/Add the hero/);
 for(const src of ['http://example.com/a.png','https://127.0.0.1/a.png','https://internal.local/a.png','javascript:alert(1)'])assert.throws(()=>newsletterSource({...source(),fields:{emailHtml:'<img src="'+src+'">'}}));
});
test('owned embedded artwork is uploaded once and the hosted URL is cached',async()=>{
 const r=source();delete r.fields.ghlImageUrls;const image='data:image/png;base64,'+Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.alloc(32)]).toString('base64');
 const prepared=newsletterSource(r,{itemId:r.id,images:{HERO_IMAGE_URL:image}}),media={};let uploads=0,persists=0;
 const upload=async()=>{uploads++;return 'https://files.leadconnectorhq.com/file/abc/art.png';};
 await newsletterPayload(prepared,media,upload,async()=>{persists++;});await newsletterPayload(prepared,media,upload,async()=>{persists++;});assert.equal(uploads,1);assert.equal(persists,1);
 assert.throws(()=>newsletterSource(r,{itemId:'someone-else',images:{HERO_IMAGE_URL:image}}),/Add the hero/);
});
test('create, persisted mapping, metadata and later edits use one draft without send actions',async()=>{
 const f=fixture();assert.equal((await syncNewsletter({...f,revision:1})).status,'synced');assert.equal(f.creates,1);assert.equal(f.db.state.campaignId,'draft-1');
 assert.equal((await syncNewsletter({...f,revision:1})).status,'unchanged');assert.equal(f.creates,1);
 f.record.fields.subject='A new subject';assert.equal((await syncNewsletter({...f,revision:1})).status,'synced');assert.equal(f.creates,1);assert.equal(f.remote.get('draft-1').subject,'A new subject');
 assert.ok(f.calls.every(c=>['create','update'].includes(c[0])));
});
test('ambiguous create retries the frozen body with the same idempotency key',async()=>{
 const f=fixture(),create=f.client.create;let timeout=true;f.client.create=async(...args)=>{const r=await create(...args);if(timeout){timeout=false;throw Error('Lost response');}return r;};
 assert.equal((await syncNewsletter({...f,revision:1})).status,'attention');assert.ok(f.db.state.pendingCreate);f.record.fields.subject='Changed during retry';
 assert.equal((await syncNewsletter({...f,revision:1})).status,'synced');assert.equal(f.creates,1);assert.deepEqual(f.calls.filter(c=>c[0]==='create')[0],f.calls.filter(c=>c[0]==='create')[1]);
});
test('uncertain creates past the provider idempotency window are held, never duplicated',async()=>{
 const f=fixture();f.db.state.pendingCreate={at:'2026-11-01T00:00:00Z',key:'old',payload:{}};
 assert.equal((await syncNewsletter({...f,revision:1,now:Date.parse('2026-11-19T00:00:00Z')})).status,'held');assert.equal(f.creates,0);
});
test('manual GHL edits and every non-draft lifecycle state stop updates',async()=>{
 for(const status of ['scheduled','processing','sent','paused','cancelled','archived']){
  const f=fixture();await syncNewsletter({...f,revision:1});f.remote.get('draft-1').status=status;f.record.fields.subject='Changed';const before=f.calls.length;
  assert.equal((await syncNewsletter({...f,revision:1})).status,'held');assert.equal(f.calls.length,before);
 }
 const f=fixture();await syncNewsletter({...f,revision:1});f.remote.get('draft-1').editorContent='<p>Owner changes</p>';assert.equal((await syncNewsletter({...f,revision:1})).status,'held');assert.match(f.db.state.detail,/edited/);
});
test('a source edit during processing prevents all campaign writes',async()=>{
 const f=fixture();f.setRevision(2);assert.equal((await syncNewsletter({...f,revision:1})).status,'attention');assert.equal(f.creates,0);
});
test('lease contention cannot create a second draft',async()=>{
 const f=fixture(),api=async(path,o)=>path.includes('nufi_claim_newsletter')?[]:f.api(path,o);assert.equal((await syncNewsletter({...f,api,revision:1})).status,'busy');assert.equal(f.creates,0);
});
test('connection token is authenticated encrypted and no cron runs without its secret',async()=>{
 const env={NUFI_GHL_SEAL_KEY:'a'.repeat(64)},token='private-token-12345678901234567890',sealed=sealGhlToken(token,env);assert.ok(!sealed.includes(token));assert.equal(openGhlToken(sealed,env),token);assert.throws(()=>openGhlToken(sealed,{NUFI_GHL_SEAL_KEY:'b'.repeat(64)}));
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;}};await createNewsletterSyncHandler({env:{CRON_SECRET:'secret'}})({method:'GET',headers:{}},res);assert.equal(res.code,401);
});
test('GHL client only exposes draft and image endpoints; recipients and schedules are rejected',async()=>{
 const calls=[],client=ghlClient('token-12345678901234567890',async(url,o)=>{calls.push([url,o]);return new Response(JSON.stringify({id:'draft',campaigns:[],total:0}),{status:200});});
 await client.check();await client.create({name:'Draft',editorType:'html',editorContent:'<p>Hi</p>'},'unique-key');await client.update('draft',{name:'Draft',editorType:'html',editorContent:'<p>Hi</p>',subject:'Hello'});
 assert.equal(calls[1][1].headers['Idempotency-Key'],'unique-key');assert.ok(calls.every(([url])=>url.startsWith('https://services.leadconnectorhq.com/emails/locations/'+ghlLocation+'/campaigns/emails')));
 assert.throws(()=>client.create({name:'Bad',editorType:'html',editorContent:'',recipients:['someone']},'key'));assert.throws(()=>client.get('../schedule'));assert.equal(client.schedule,undefined);assert.equal(client.send,undefined);
});

 test('lost update confirmations recover without overwriting unrelated GHL edits',async()=>{
 const f=fixture();await syncNewsletter({...f,revision:1});f.record.fields.subject='Updated subject';const update=f.client.update;let fail=true;f.client.update=async(...args)=>{const v=await update(...args);if(fail){fail=false;throw Error('Lost response');}return v;};assert.equal((await syncNewsletter({...f,revision:1})).status,'attention');assert.equal((await syncNewsletter({...f,revision:1})).status,'synced');assert.equal(f.creates,1);
 });

test('provider validation details are useful without retaining credentials',async()=>{
 const token='pit-us-private-credential-12345';const client=ghlClient(token,async()=>new Response(JSON.stringify({message:['editorType must be supported',token]}),{status:422}));
 await assert.rejects(client.create({name:'Draft',editorType:'html',editorContent:'<p>Hi</p>'},'key'),e=>e.upstreamStatus===422&&e.message.includes('editorType')&&!e.message.includes(token));
});
test('confirmed create validation failures allow corrected drafts to retry',async()=>{
 const f=fixture();f.client.create=async()=>{throw Object.assign(new Error('Rejected'),{upstreamStatus:422});};await syncNewsletter({...f,revision:1});assert.equal(f.db.state.pendingCreate,undefined);
});
