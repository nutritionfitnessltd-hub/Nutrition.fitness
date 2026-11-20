import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {shinyAction,ideaDocument,ideaResult} from '../supabase/functions/content-worker-bridge/shiny-things.mjs';
import {changeShinyThing} from '../server/studio-shiny-things.mjs';
const connection={id:'content-manager',namespace:'worker:content-manager:'},website='https://team.nutrition.fitness';
function fixture(){const rows=new Map(),projects=[],writes=[];const api=async(path,method,payload)=>{
 if(path.includes('/rpc/')){writes.push(payload);const current=rows.get(payload.item);if((current?.revision||0)!==payload.expected)return [];const row={id:payload.item,payload:payload.document,revision:payload.expected+1,updated_at:'2026-11-20T15:00:00Z'};rows.set(row.id,row);return [row];}
 const u=new URL(path,'https://fixture');if(path.includes('nufi_library_projects'))return u.searchParams.has('studio->>ideaId')&&u.searchParams.get('studio->>ideaId')!=='not.is.null'?projects.filter(p=>'eq.'+p.studio.ideaId===u.searchParams.get('studio->>ideaId')):projects;
 if(u.searchParams.has('id')&&u.searchParams.get('id').startsWith('eq.'))return [rows.get(u.searchParams.get('id').slice(3))].filter(Boolean);
 return [...rows.values()].slice(Number(u.searchParams.get('offset')||0),Number(u.searchParams.get('offset')||0)+Number(u.searchParams.get('limit')||500));};return {rows,projects,writes,api,call:input=>shinyAction(input,connection,api,website)};}
test('create, list, retrieve and patch use the existing board rows and return saved ID, revision and URL',async()=>{
 const f=fixture(),id='studio:idea:'+randomUUID(),created=await f.call({action:'idea-create',id,title:'Voice idea',description:'Worth exploring',category:'Growth',status:'Saved',priority:'soon'});
 assert.equal(created.id,id);assert.equal(created.revision,1);assert.match(created.url,/studio=shiny-things&id=studio%3Aidea%3A/);assert.equal(f.rows.get(id).payload.kind,'settings');assert.equal(f.rows.get(id).payload.fields.summary,'Worth exploring');assert.equal(f.rows.get(id).payload.fields.urgency,'soon');assert.equal(f.writes[0].editor_name,'worker:content-manager');
 const patched=await f.call({action:'idea-update',id,revision:1,priority:'urgent',status:'Parked'});assert.equal(patched.revision,2);assert.equal(patched.description,'Worth exploring');assert.equal(patched.category,'Growth');assert.equal(patched.status,'Parked');
 assert.deepEqual(await f.call({action:'idea-get',id}),patched);const list=await f.call({action:'idea-list',query:'voice',category:'Growth',priority:'urgent',status:'Parked',limit:1});assert.equal(list.total,1);assert.equal(list.items[0].id,id);
});
test('partial updates preserve project proposals; changed title or description invalidates only the stale proposal',()=>{
 const id='studio:idea:'+randomUUID(),row={id,revision:4,payload:{id,kind:'settings',title:'Old',comments:[{text:'Keep'}],fields:{summary:'Old summary',weeks:8,category:'Growth',urgency:'normal',state:'Ready to review',plan:{title:'Proposal'},requestRevision:2,other:'Keep'}}};
 const priority=ideaDocument({id,revision:4,priority:'soon'},row);assert.deepEqual(priority.fields.plan,row.payload.fields.plan);assert.equal(priority.fields.state,'Ready to review');
 const changed=ideaDocument({id,revision:4,description:'Updated summary'},row);assert.equal(changed.fields.plan,undefined);assert.equal(changed.fields.requestRevision,undefined);assert.equal(changed.fields.state,'Saved');assert.equal(changed.fields.other,'Keep');assert.equal(changed.fields.category,'Growth');assert.deepEqual(changed.comments,row.payload.comments);
});
test('permissions, invalid fields, stale revisions and converted entries reject writes',async()=>{
 const f=fixture(),id='studio:idea:'+randomUUID();await f.call({action:'idea-create',id,title:'Keep'});const initial=f.writes.length;
 await assert.rejects(shinyAction({action:'idea-list'},{id:'another',namespace:'worker:another:'},f.api,website),e=>e.status===403);
 for(const input of [{action:'idea-create',id,title:'Duplicate'},{action:'idea-update',id,revision:0,title:'Stale'},{action:'idea-update',id,revision:1,status:'Converting'},{action:'idea-update',id,revision:1,priority:'high'},{action:'idea-update',id,revision:1,fields:{plan:{}}},{action:'idea-get',id:'worker:content-manager:other'},{action:'idea-list',limit:51}])await assert.rejects(f.call(input));
 assert.equal(f.writes.length,initial);f.projects.push({id:randomUUID(),studio:{ideaId:id}});assert.equal((await f.call({action:'idea-get',id})).status,'Project created');await assert.rejects(f.call({action:'idea-update',id,revision:1,title:'No'}),e=>e.status===409);assert.equal(f.writes.length,initial);
});
test('legacy records retain defaults and categories survive editing on the existing board',async()=>{
 const id='studio:idea:'+randomUUID(),r={id,revision:1,payload:{id,kind:'settings',title:'Legacy',fields:{summary:'Original',weeks:4,state:'Saved'}}};assert.equal(ideaResult(r,website).priority,'normal');assert.equal(ideaResult(r,website).category,'');
 let saved;r.payload.fields.category='Growth';await changeShinyThing(new URLSearchParams(),{action:'idea-save',id,revision:1,title:'Renamed on board',summary:'Updated on board',weeks:4},{actor:{role:'admin',id:randomUUID()},items:[{...r.payload,revision:1}],projects:[]},async(path,options)=>{saved=options.payload.document;return [{}];},{});assert.equal(saved.fields.category,'Growth');
});
test('list pagination and filters do not mutate records',async()=>{const f=fixture();for(let i=0;i<3;i++)await f.call({action:'idea-create',id:'studio:idea:'+randomUUID(),title:'Idea '+i});const writes=f.writes.length;const page=await f.call({action:'idea-list',limit:2});assert.equal(page.total,3);assert.equal(page.items.length,2);assert.equal(page.nextOffset,2);assert.equal((await f.call({action:'idea-list',limit:2,offset:2})).items.length,1);assert.equal(f.writes.length,writes);});
