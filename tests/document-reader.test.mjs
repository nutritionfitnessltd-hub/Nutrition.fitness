import test from 'node:test';
import assert from 'node:assert/strict';
import {documentText,documentSection} from '../server/document-reader.mjs';
import {workerChatPage} from '../server/studio-hq.mjs';
import {shinyThingsPage} from '../server/studio-shiny-things.mjs';
import {softwareReleases,softwareReleaseErrorForm} from '../server/software-releases.mjs';

test('saved headings follow the page hierarchy and raw HTML stays inert',()=>{
 const html=documentText('# Plan\n\nIntro **with emphasis**.\n\n## Next steps\n- Check the draft\n- Ask for approval\n\n<script>alert(1)</script>');
 assert.match(html,/<h2>Plan<\/h2>/);assert.match(html,/<h3>Next steps<\/h3>/);assert.match(html,/<ul><li>Check the draft/);assert.match(html,/<strong>with emphasis<\/strong>/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<h1|<script>/);
 assert.match(documentText('# Plan\n### Details'),/<h2>Plan<\/h2><h3>Details<\/h3>/);
 assert.match(documentSection('Proposal','# Detail',{level:3}),/<h3>Proposal<\/h3><h4>Detail<\/h4>/);
});

test('a proposal page has one page title, a document title and labelled subsections without changing decisions',async()=>{
 const idea={id:'idea-1',title:'Test the offer',summary:'Show two headline cards.\n\n- Ask six adults\n- Record anonymous feedback',rationale:'Understand the first step.',state:'pending',day:'2026-11-24',sources:[{title:'Evidence',url:'https://example.test/evidence'}]};
 const fetcher=async(u,o)=>({ok:true,status:200,json:async()=>JSON.parse(o.body).action==='ideas'?{version:7,ideas:[idea]}:{messages:[]}});
 const html=await workerChatPage(new URLSearchParams({worker:'andy'}),{actor:{role:'admin',id:'owner'}},{NUFI_HQ_SITE_TOKEN:'fixture'},fetcher);
 assert.equal((html.match(/<h1>/g)||[]).length,1);assert.match(html,/<h2>Test the offer<\/h2>/);for(const title of ['The proposal','Why it matters','Sources &amp; evidence','Your decision'])assert.ok(html.includes('<h3>'+title+'</h3>'));
 assert.match(html,/value="approve-idea"/);assert.match(html,/value="reject-idea"/);assert.match(html,/name="expectedVersion" value="7"/);
});

test('saved Shiny Things read as a document and expose their existing editor on demand',()=>{
 const actor={role:'admin',id:'owner'},r={id:'studio:idea:00000000-0000-4000-8000-000000000001',kind:'settings',title:'A saved idea',revision:1,fields:{ownerId:'owner',visibility:'personal',summary:'# Approach\n\nA readable idea.',weeks:4}};
 const html=shinyThingsPage(new URLSearchParams({id:r.id}),{actor,items:[r],projects:[],people:[]});
 assert.equal((html.match(/<h1>/g)||[]).length,1);assert.match(html,/<h2>The idea<\/h2>/);assert.match(html,/<h3>Approach<\/h3>/);assert.match(html,/<details class="document-edit-form"><summary>Edit idea/);assert.ok(html.indexOf('A readable idea.')<html.indexOf('name="action" value="idea-save"'));
});

test('release scope uses the same reader and keeps failed edits open without queuing work',()=>{
 const id='studio:software-release:00000000-0000-4000-8000-000000000001',r={id,kind:'settings',title:'A reviewed release',revision:1,fields:{items:[],version:'1.0',platform:'Website',stage:'Planned',notes:'Saved scope',testing:'Check it',deployment:'Restore prior deployment'}};
 const data={actor:{role:'admin',id:'owner'},items:[r],byId:new Map([[id,r]]),projects:[]};
 r.fields.items=[{id:'backlog-item',title:'Saved included item',revision:1,fields:{description:'Original saved problem'}}];data.byId.set('backlog-item',{id:'backlog-item',title:'Later title',revision:2,fields:{description:'Later problem'}});
 const html=softwareReleases(new URLSearchParams({id}),data);assert.match(html,/document-reader document-sheet/);assert.match(html.slice(0,html.indexOf('Edit release scope')),/Original saved problem/);assert.doesNotMatch(html.slice(0,html.indexOf('Edit release scope')),/Later problem/);assert.match(html,/<h2>Scope, deliverables &amp; exclusions<\/h2>/);assert.match(html,/<details class="document-edit-form"><summary>Edit release scope/);
 const error=softwareReleaseErrorForm({action:'software-release-save',id,revision:1,title:r.title,notes:'Unsaved correction'},data);assert.match(error,/<details class="document-edit-form" open>/);assert.match(error,/Unsaved correction/);
});
