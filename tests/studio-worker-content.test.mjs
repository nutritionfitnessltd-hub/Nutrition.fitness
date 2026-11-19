import test from 'node:test';
import assert from 'node:assert/strict';
import {contentWorker,workerContent} from '../server/studio-worker-content.mjs';
import {workspaceDashboard} from '../server/studio-dashboard.mjs';
import {library} from '../server/studio-pages.mjs';
import {changeStudio} from '../server/studio-actions.mjs';
import {editorForm} from '../server/studio-editor.mjs';

function fixture(){
 const items=['nina','imogen','marcus','rory'].map((workerId,i)=>({id:workerId,title:workerId+' content',workerId,kind:'article',status:i===1?'In review':'Draft',revision:1,fields:{body:'Saved content'},comments:[]}));
 return {actor:{role:'admin',id:'owner'},index:{records:[]},items,byId:new Map(items.map(r=>[r.id,r])),assigned:new Set(),projects:[],tasks:[],people:[]};
}
test('team work links to each saved item with attribution and review actions',()=>{
 const d=fixture(),html=workspaceDashboard(d);
 for(const id of ['nina','imogen','marcus','rory']){
  const row=html.split('data-work-id="content:'+id+'"')[1].split('</li>')[0];
  assert.match(row,new RegExp('>'+id+' content</a>'));
  assert.match(row,new RegExp('studio='+(id==='imogen'?'review-preview':'item')+'[^"\\s]*id='+id));
  for(const other of d.items.filter(r=>r.id!==id))assert.ok(!row.includes('>'+other.title+'</a>'));
 }
 assert.match(html,/Needs attention \(1\)/);
});

test('worker library keeps scope across status tabs, search and pagination',()=>{
 const d=fixture();for(let i=0;i<32;i++)d.items.push({...d.items[0],id:'nina-'+i,title:'Nina extra '+i});
 const params=new URLSearchParams({work:'1',studio:'library',worker:'nina',view:'all',page:'2'}),html=library(params,d);
 assert.match(html,/Nina’s work/);assert.match(html,/name="worker" value="nina"/);assert.match(html,/worker=nina[^\"]*page=1/);
 assert.doesNotMatch(html,/imogen content|marcus content|rory content/);
 assert.match(library(new URLSearchParams({worker:'imogen',bucket:'checked'}),d),/Nothing here yet/);
});
test('older completed work stays in the checked library and requested changes return to the dashboard',()=>{
 const d=fixture(),nina=d.byId.get('nina');nina.status='Approved';
 let html=workspaceDashboard(d);assert.doesNotMatch(html,/dashboard-worker worker-nina|No unfinished content/);
 assert.match(library(new URLSearchParams({worker:'nina',bucket:'checked'}),d),/nina content/);
 assert.equal(workerContent(d,'nina').length,1,'Approval must not remove the saved content');
 nina.status='Changes requested';html=workspaceDashboard(d);const card=html.split('data-work-id="content:nina"')[1].split('</li>')[0];
 assert.match(card,/>nina content</);assert.match(card,/Needs changes/);
});
test('attribution respects explicit choices, inherited work and legacy Nina articles without claiming manual content',()=>{
 const d=fixture(),legacy={id:'legacy',kind:'article',workerSource:{system:'Content Manager connector',kind:'article'}};
 assert.equal(contentWorker(legacy),'nina');assert.equal(contentWorker({...legacy,workerId:'rory'}),'rory');
 assert.equal(contentWorker({...legacy,workerId:'none'}),'');assert.equal(contentWorker({id:'manual',kind:'article'}),'');
 assert.equal(contentWorker({id:'child',parent:'imogen'},d.byId),'imogen');
 assert.equal(contentWorker({id:'produced-lesson',fields:{production:{worker:'Imogen'}}}),'imogen');
 const cycle=new Map([['a',{id:'a',parent:'b'}],['b',{id:'b',parent:'a'}]]);assert.equal(contentWorker(cycle.get('a'),cycle),'');
 d.items.push({...d.items[0],id:'archived',status:'Archived'});assert.equal(workerContent(d,'nina').length,1);
 d.actor.role='staff';assert.equal(workerContent(d,'nina').length,0);d.assigned.add('nina');assert.equal(workerContent(d,'nina').length,1);
 assert.match(workspaceDashboard(d),/nina content/);assert.doesNotMatch(workspaceDashboard(d),/imogen content|marcus content|rory content/);
});
test('worker selection is validated, survives submit and approval, and cannot grant staff access',async()=>{
 const d=fixture(),params=new URLSearchParams({id:'nina'});let saved;
 const api=async(_,o)=>{saved=o.payload.document;return [{revision:o.payload.expected+1}];};
 assert.match(editorForm(d.items[0],d),/name="workerId"/);
 const f={action:'content-save',revision:1,intent:'review',title:'nina content',fields:JSON.stringify(d.items[0].fields),workerId:'rory'};
 await changeStudio(params,f,d,api);assert.equal(saved.workerId,'rory');assert.equal(saved.status,'In review');
 d.byId.set('nina',{...saved,revision:2});
 assert.match(editorForm(d.byId.get('nina'),d),/Approve content/);
 await changeStudio(params,{...f,revision:2,intent:'approve'},d,api);assert.equal(saved.status,'Approved');assert.equal(saved.workerId,'rory');
 await assert.rejects(()=>changeStudio(params,{...f,revision:2,workerId:'unknown'},d,api),/valid worker/);
 d.actor.role='staff';d.assigned.add('nina');
 await assert.rejects(()=>changeStudio(params,{...f,revision:2},d,api),/Administrator/);
});
