import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceArchive} from '../server/team-workspace.mjs';
import {archivePage} from '../server/studio-import.mjs';
import {studioNavigation} from '../server/studio-navigation.mjs';
import {library} from '../server/studio-pages.mjs';

function fixture(){
 const records=[{id:'catalogue:lesson',title:'Welcome lesson',group:'Courses',kind:'Video',status:'reference',fields:{collection:'Yoga'},files:[]},{id:'catalogue:book',title:'Yoga workbook',group:'Courses',kind:'Workbook',status:'reference',fields:{collection:'Yoga'},files:[]},{id:'catalogue:recipe',title:'Recipe collection',group:'Recipes',kind:'Recipe book',status:'reference',fields:{},files:[]},{id:'training:plan',title:'Active programme',group:'Programs',kind:'programme',fields:{},files:[]}];
 const items=Array.from({length:26},(_,i)=>({id:'archived:'+i,title:'Archived article '+String(i).padStart(2,'0'),kind:'article',status:'Archived',fields:{}}));
 return {actor:{role:'admin',id:'owner'},index:{records,files:{}},items,byId:new Map(items.map(r=>[r.id,r])),projects:[],tasks:[],assigned:new Set()};
}
test('Archive opens original categories and keeps archived working content separate',()=>{
 const data=fixture(),html=workspaceArchive(new URLSearchParams({studio:'workspace-archive'}),data);
 assert.match(html,/aria-label="Original content categories"/);assert.match(html,/shelf=Courses/);assert.match(html,/2 items/);
 assert.match(html,/Search original content/);assert.match(html,/>Archived content</);assert.doesNotMatch(html,/Archived article 00|Active programme/);
 assert.match(library(new URLSearchParams(),data),/Browse original collections/);
});
test('source courses remain grouped without display metadata and retain authorised detail links',()=>{
 const html=archivePage(new URLSearchParams({studio:'archive',shelf:'Courses'}),fixture());
 assert.equal((html.match(/class="card"/g)||[]).length,1);assert.match(html,/folder=Yoga/);assert.match(html,/All original collections/);
 const detail=archivePage(new URLSearchParams({studio:'archive',shelf:'Courses',folder:'Yoga'}),fixture());
 assert.match(detail,/Welcome lesson/);assert.match(detail,/Yoga workbook/);assert.match(detail,/studio=archive[^" ]*item=catalogue/);
});
test('archived content is grouped, searchable and paginated without dropping records',()=>{
 const data=fixture();let html=workspaceArchive(new URLSearchParams({studio:'workspace-archive',tab:'content'}),data);
 assert.match(html,/26 archived/);assert.doesNotMatch(html,/Archived article 00/);
 html=workspaceArchive(new URLSearchParams({studio:'workspace-archive',tab:'content',kind:'article',page:'2'}),data);
 assert.match(html,/Archived article 25/);assert.match(html,/Page 2 of 2/);assert.doesNotMatch(html,/Archived article 00/);
 html=workspaceArchive(new URLSearchParams({studio:'workspace-archive',tab:'content',q:'article 04'}),data);
 assert.match(html,/Archived article 04/);assert.doesNotMatch(html,/Archived article 05/);
});
test('originals permission governs source collection visibility and Archive is available with originals alone',()=>{
 const data=fixture();data.actor={role:'staff',id:'staff',access:{library:true}};
 assert.doesNotMatch(workspaceArchive(new URLSearchParams({tab:'originals'}),data),/Original content categories|Welcome lesson/);
 assert.doesNotMatch(library(new URLSearchParams(),data),/Browse original collections/);
 data.actor.access={originals:true};const nav=studioNavigation('archive',data.actor);
 assert.equal(nav.label,'Archive');assert.match(nav.html,/studio=workspace-archive" aria-current="page"/);
});
