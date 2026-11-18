import test from 'node:test';
import assert from 'node:assert/strict';
import { deliverNotification, sendExchange, workflowNotifications, changeNotifications } from '../server/studio-notifications.mjs';
import { handleStudio } from '../server/studio.mjs';
import { brandInstructions, sendBrandFile } from '../server/studio-brand.mjs';
import { studioData } from '../server/studio-store.mjs';
const actor={role:'admin',id:'admin'},env={EXCHANGE_TENANT_ID:'tenant',EXCHANGE_CLIENT_ID:'client',EXCHANGE_CLIENT_SECRET:'test-only'};
const event={key:'review:item:1',recipient:'kasia@nutrition.fitness',title:'Please review <example>',message:'Ready & waiting',link:'https://example.test/content-library/?id=one&tab=preview'};
function fixture(){
  const rows=new Map(),calls=[];
  const api=async(endpoint,options={})=>{
    calls.push(endpoint);
    if(endpoint.includes('rpc/nufi_studio_save')){
      const {item,expected,document}=options.payload;
      if((rows.get(item)?.revision||0)!==expected)return [];
      const row={id:item,payload:structuredClone(document),revision:expected+1,updated_at:new Date().toISOString()};rows.set(item,row);return [row];
    }
    if(endpoint.includes('nufi_studio_items')){
      const filter=new URL('https://test'+endpoint).searchParams.get('id');
      if(filter?.startsWith('eq.'))return rows.has(filter.slice(3))?[rows.get(filter.slice(3))]:[];
      return [...rows.values()].filter(row=>filter==='not.like.studio:notification:*'?!row.id.startsWith('studio:notification:'):true);
    }
    return [];
  };
  return {api,rows,calls};
}
const graph=(requests,status=202)=>async(url,options)=>{requests.push({url,options});return url.includes('/token')?new Response(JSON.stringify({access_token:'test-token'})):new Response(null,{status});};
test('concurrent and repeated event requests send only one mail and store the outcome',async()=>{
  const {api,rows}=fixture(),requests=[];
  await Promise.all(Array.from({length:3},()=>deliverNotification({api,actor,env,event,fetcher:graph(requests)})));
  await deliverNotification({api,actor,env,event,fetcher:graph(requests),retry:true});
  assert.equal(requests.filter(r=>r.url.endsWith('/sendMail')).length,1);
  assert.equal([...rows.values()][0].payload.fields.state,'accepted');
  const message=JSON.parse(requests[1].options.body).message;
  assert.match(message.body.content,/Please review &lt;example&gt;/);
  assert.match(message.body.content,/id=one&amp;tab=preview/);
  assert.equal(message.toRecipients[0].emailAddress.address,'kasia@nutrition.fitness');
  assert.match(requests[1].url,/notifications%40nutrition.fitness/);
  assert.doesNotMatch(JSON.stringify([...rows.values()]),/test-token|test-only/);
});
test('uncertain sends are never retried, while a rejected send can be retried explicitly',async()=>{
  const a=fixture(),requests=[];
  const uncertain=async(url,options)=>url.includes('/token')?graph(requests)(url,options):Promise.reject(new Error('timeout'));
  assert.equal(await deliverNotification({api:a.api,actor,env,event,fetcher:uncertain}),'unknown');
  const before=requests.length;
  assert.equal(await deliverNotification({api:a.api,actor,env,event,fetcher:graph(requests),retry:true}),'unknown');
  assert.equal(requests.length,before);
  const b=fixture();
  assert.equal(await deliverNotification({api:b.api,actor,env,event,fetcher:graph([],403)}),'failed');
  assert.equal(await deliverNotification({api:b.api,actor,env,event,fetcher:graph([])}),'failed');
  assert.equal(await deliverNotification({api:b.api,actor,env,event,fetcher:graph([]),retry:true}),'accepted');
});
test('token errors never attempt a send or expose Microsoft response contents',async()=>{
  let requests=0;
  const result=await sendExchange(env,event,async()=>{requests++;return new Response('private token error',{status:401});});
  assert.equal(requests,1);assert.equal(result.state,'failed');assert.doesNotMatch(result.detail,/private token/);
});
test('workflow mails require an explicit transition, never ordinary draft saves',()=>{
  const r={id:'training:message',kind:'communication',title:'Hello',revision:3,status:'Draft',fields:{}};
  const data={byId:new Map([[r.id,r],['studio:notifications',{fields:{enabled:true,reviewer:event.recipient}}]]),people:[{id:'creator',email:'joyce@nutrition.fitness'}],projects:[{id:'p',revision:2,creator_id:'creator',name:'Example',status:'Planning',entries:[{record:r.id}]}]};
  const params=new URLSearchParams({id:r.id});
  assert.deepEqual(workflowNotifications(params,{action:'content-save',intent:'draft'},data,env),[]);
  assert.deepEqual(workflowNotifications(params,{action:'content-save',intent:'preview'},data,env),[]);
  assert.equal(workflowNotifications(params,{action:'content-save',intent:'review'},data,env)[0].recipient,event.recipient);
  assert.equal(workflowNotifications(params,{action:'content-review',status:'Approved'},data,env)[0].recipient,'joyce@nutrition.fitness');
  data.byId.get('studio:notifications').fields.enabled=false;
  assert.deepEqual(workflowNotifications(params,{action:'content-save',intent:'review'},data,env),[]);
});
test('email actions and private brand files require administrator access',async()=>{
  const data={actor:{role:'staff'},byId:new Map()};
  await assert.rejects(changeNotifications({action:'notifications-test'},data,()=>{throw Error('No access');},env,fetch),{status:403});
  await assert.rejects(sendBrandFile({method:'GET'},{},new URLSearchParams({file:'guide'}),data.actor),{status:403});
  await assert.rejects(sendBrandFile({method:'GET'},{},new URLSearchParams({file:'../platform.mjs'}),actor),{status:404});
});
test('notification records are excluded from workspace content loads',async()=>{
  const {api,calls}=fixture();await studioData(api,actor,async()=>({records:[],files:{}}));
  assert.ok(calls.some(c=>c.includes('id=not.like.studio:notification:*')));
});
test('routes split settings, preserve saved brand guidance, and serve a private complete PDF',async()=>{
  const {api,rows}=fixture();const load=async()=>({records:[],files:{}});
  const request=async(section,body)=>{
    const headers={};let output;
    const res={setHeader:(k,v)=>headers[k]=v,end:value=>output=value};
    await handleStudio({method:body?'POST':'GET',body},res,{params:new URLSearchParams({studio:section}),actor,api,load,env:{}});
    return {res,headers,output};
  };
  const settings=await request('settings');assert.match(settings.output,/Brand guide/);assert.match(settings.output,/studio=connections/);assert.doesNotMatch(settings.output,/Brand &amp; connections/);
  const brand=await request('standards');assert.match(brand.output,/Open full guide/);assert.match(brand.output,/#06475E/);assert.match(brand.output,/Download SVG/);assert.doesNotMatch(brand.output,/<h2>Connections/);assert.doesNotMatch(brand.output,/ style=/); // Production CSP allows external stylesheets only.
  const connection=await request('connections');assert.match(connection.output,/Not connected/);assert.match(connection.output,/notifications@nutrition.fitness/);assert.match(connection.output,/kasia@nutrition.fitness/);
  rows.set('studio:standards',{id:'studio:standards',revision:1,payload:{fields:{guidance:'Original',retained:'keep'}}});
  assert.equal((await request('standards',{action:'standards-save',revision:'1',guidance:'Updated voice'})).res.statusCode,303);
  assert.deepEqual(rows.get('studio:standards').payload.fields,{guidance:'Updated voice',retained:'keep'});
  assert.match(brandInstructions('Updated voice'),/DM Sans/);assert.match(brandInstructions('Updated voice'),/Updated voice/);
  const headers={};let body;await sendBrandFile({method:'GET'},{setHeader:(k,v)=>headers[k]=v,end:v=>body=v},new URLSearchParams({file:'guide'}),actor);
  assert.equal(headers['Content-Type'],'application/pdf');assert.equal(headers['Cache-Control'],'private, no-store');assert.ok(body.length<4500000);assert.equal(body.subarray(0,5).toString(),'%PDF-');
});
test('stale content writes send nothing and mail failure does not roll back a successful save',async()=>{
  const f=fixture(),r={id:'training:test',kind:'communication',title:'Hello',status:'Draft',fields:{body:'A message',subject:'Subject'},revision:1};
  f.rows.set(r.id,{id:r.id,revision:1,payload:r});
  f.rows.set('studio:notifications',{id:'studio:notifications',revision:1,payload:{fields:{enabled:true,reviewer:event.recipient}}});
  let sends=0;
  const call=async(revision)=>{
    let output;const headers={};const res={setHeader:(k,v)=>headers[k]=v,end:v=>output=v};
    await handleStudio({method:'POST',body:{action:'content-save',intent:'review',revision,title:'Updated',fields:JSON.stringify(r.fields)}},res,{params:new URLSearchParams({studio:'item',id:r.id}),actor,api:f.api,load:async()=>({records:[],files:{}}),env,fetcher:async()=>{sends++;return new Response(null,{status:401});}});
    return {res,headers,output};
  };
  assert.equal((await call('0')).res.statusCode,409);assert.equal(sends,0);
  const saved=await call('1');assert.equal(saved.res.statusCode,303);assert.match(saved.headers.Location,/notification=pending/);
  assert.equal(f.rows.get(r.id).revision,2);assert.equal(f.rows.get(r.id).payload.status,'In review');assert.equal(sends,1);
});
