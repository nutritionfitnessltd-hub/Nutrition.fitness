import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDocument} from 'htmlparser2';
import {projectPage} from '../server/studio-pages.mjs';
const project={id:'project',name:'Supplement launch',brief:'Choose and prepare the launch range.',creator_id:'owner',revision:3,weeks:1,status:'In progress',studio:{type:'blank'},entries:[{id:'task',title:'Confirm sourcing and delivery',kind:'Task',week:0,status:'To do',notes:'Confirm supplier prices.\nCheck packaging and fulfilment.\nObtain specifications.',assignee:'owner'}]};
const fixture=actor=>({actor,projects:[project],people:[{id:'owner',name:'Kasia'}],items:[],byId:new Map(),assigned:new Set()});
const walk=(n,fn)=>{fn(n);for(const c of n.children||[])walk(c,fn);};
const nodes=(html,fn)=>{const found=[];walk(parseDocument(html),n=>{if(fn(n))found.push(n);});return found;};
test('project uses one H1, H2 sections and H3 tasks with readable instructions',()=>{
 const html=projectPage(new URLSearchParams({project:'project'}),fixture({role:'admin'}));
 assert.equal(nodes(html,n=>n.name==='h1').length,1);
 assert.match(html,/<h2>Tasks<\/h2>/);assert.match(html,/<h3>Confirm sourcing and delivery<\/h3>/);
 assert.match(html,/<ul><li>Confirm supplier prices\.<\/li><li>Check packaging and fulfilment\.<\/li><li>Obtain specifications\.<\/li><\/ul>/);
 assert.doesNotMatch(html,/simple-planner-task|<aside class="panel"/);
});
test('all mutation forms are inside closed details until explicitly opened',()=>{
 const data=fixture({role:'admin'}),html=projectPage(new URLSearchParams({project:'project'}),data);
 for(const form of nodes(html,n=>n.name==='form'&&n.attribs?.method==='post')){
  let ancestor=form.parent,closed=false;
  while(ancestor){if(ancestor.name==='details'&&!Object.hasOwn(ancestor.attribs,'open'))closed=true;ancestor=ancestor.parent;}
  assert.ok(closed,'write form must be behind an explicit edit/add control');
 }
 assert.match(html,/name="projectRevision" value="3"/);
 const add=projectPage(new URLSearchParams({project:'project',add:'1'}),data);assert.match(add,/<details open><summary>Add work/);
});
test('read-only project retains headings and never shows editor controls',()=>{
 const html=projectPage(new URLSearchParams({project:'project'}),fixture({role:'staff',id:'owner',access:{work:true}}));
 assert.match(html,/<h3>Confirm sourcing and delivery/);assert.match(html,/Check packaging and fulfilment/);
 assert.doesNotMatch(html,/<form|Edit task|Delete task|Add work/);
});
