import test from 'node:test';
import assert from 'node:assert/strict';
import {generateIdeaSummary} from '../server/studio-idea-ai.mjs';
import {handleStudio} from '../server/studio.mjs';
import {shinyThingsPage} from '../server/studio-shiny-things.mjs';
const actor={role:'admin',id:'owner'},env={OPENAI_API_KEY:'fixture-key',OPENAI_STUDIO_MODEL:'gpt-5-mini'};
const completed=summary=>new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({summary})}]}]}),{headers:{'Content-Type':'application/json'}});
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}});
test('idea explanation uses the existing Responses API connection and only the current idea text',async()=>{
 let sent;
 const result=await generateIdeaSummary({actor,title:'Recipe books as lead magnets',summary:'Help members plan meals.',env,fetcher:async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(options.headers.Authorization,'Bearer fixture-key');sent=JSON.parse(options.body);return completed('A useful way to introduce members to meal planning.');}});
 assert.match(result,/meal planning/);assert.equal(sent.store,false);assert.equal(sent.model,env.OPENAI_STUDIO_MODEL);assert.equal(sent.text.format.type,'json_schema');
 assert.deepEqual(JSON.parse(sent.input),{title:'Recipe books as lead magnets',existingNotes:'Help members plan meals.'});assert.doesNotMatch(sent.input,/fixture-key/);assert.match(sent.instructions,/Do not invent/);
});
test('generation rejects missing titles, staff access, unavailable credentials and incomplete provider responses',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return completed('Text');};
 for(const input of [{actor:{role:'staff'},title:'Idea',env},{actor,title:' ',env},{actor,title:'Idea',env:{}},{actor,title:'Idea',summary:'x'.repeat(6001),env}])await assert.rejects(()=>generateIdeaSummary({...input,fetcher}));
 assert.equal(calls,0);
 await assert.rejects(()=>generateIdeaSummary({actor,title:'Idea',env,fetcher:async()=>new Response('{}',{status:429})}),e=>e.status===429);
 await assert.rejects(()=>generateIdeaSummary({actor,title:'Idea',env,fetcher:async()=>new Response('{"status":"incomplete"}')}),e=>e.status===503);
 await assert.rejects(()=>generateIdeaSummary({actor,title:'Idea',env,fetcher:async()=>completed('')}),e=>e.status===503);
});
test('idea generation endpoint returns JSON without loading, saving, dispatching or creating projects',async()=>{
 const res=response();let storage=0;
 await handleStudio({method:'POST',body:{action:'idea-generate-summary',title:'Recipe books as lead magnets',summary:''}},res,{params:new URLSearchParams({studio:'shiny-things'}),actor,env,api:async()=>{storage++;throw Error();},load:async()=>{storage++;throw Error();},fetcher:async()=>completed('Explain the idea and test interest before planning it.')});
 assert.equal(res.statusCode,200);assert.match(JSON.parse(res.body).summary,/test interest/);assert.equal(storage,0);assert.match(res.headers['Cache-Control'],/no-store/);
 const denied=response();await handleStudio({method:'POST',body:{action:'idea-generate-summary',title:'Idea'}},denied,{params:new URLSearchParams({studio:'shiny-things'}),actor:{role:'staff'},env,api:async()=>{throw Error();},load:async()=>{throw Error();},fetcher:async()=>{throw Error();}});
 assert.equal(denied.statusCode,403);assert.ok(JSON.parse(denied.body).error);
 const failed=response();await handleStudio({method:'POST',body:{action:'idea-generate-summary',title:''}},failed,{params:new URLSearchParams({studio:'shiny-things'}),actor,env});assert.equal(failed.statusCode,400);assert.ok(JSON.parse(failed.body).error);
});
test('new and existing ideas offer generation and explicit use/keep controls',()=>{
 const data={actor,items:[],projects:[],people:[]};const html=shinyThingsPage(new URLSearchParams({new:'1'}),data,{},env);
 assert.match(html,/type="button" data-idea-ai/);assert.match(html,/Use this text/);assert.match(html,/Keep my text/);assert.match(html,/name="summary"/);
 assert.match(shinyThingsPage(new URLSearchParams({new:'1'}),data),/data-idea-ai disabled/);
});
