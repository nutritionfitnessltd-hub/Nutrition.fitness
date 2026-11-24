import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionParents,collectionPage,supportingLibrary,applyCollectionPlacement,linkCollection} from '../server/studio-collections.mjs';
import {studioData} from '../server/studio-store.mjs';
import {canEditContent} from '../server/library-permissions.mjs';
import {library,newItem} from '../server/studio-pages.mjs';
import {handleStudio} from '../server/studio.mjs';
function fixture(){
 const items=[{id:'passport',kind:'theme',title:'Passport',status:'Draft',shared:true,fields:{}},{id:'course',kind:'course',title:'Fat Loss Course',status:'Approved',approval:{revision:1},fields:{}},{id:'book',kind:'ebook',title:'Food guide',status:'Draft',fields:{}},{id:'pack',kind:'campaign',title:'Launch pack',status:'Approved',fields:{courseId:'course'}},{id:'social',kind:'campaign',title:'Social copy',status:'Draft',fields:{launchPackId:'pack'}},{id:'picture',kind:'asset',title:'Course picture',status:'Draft',fields:{courseId:'course'}},{id:'mealplan',kind:'mealplan',title:'Mediterranean meal plan',status:'Draft',collectionId:'passport',fields:{}},{id:'unfiled',kind:'campaign',title:'Standalone post',status:'Draft',fields:{}}].map(r=>({...r,revision:1}));
 return {actor:{role:'admin',id:'owner'},items,byId:new Map(items.map(r=>[r.id,r])),assigned:new Set(),projects:[],people:[],collectionLinks:[]};
}
test('existing course and launch-pack links group marketing and images under the course',()=>{
 const data=fixture();assert.deepEqual(collectionParents(data.byId.get('social'),data),['course']);
 const grouped=supportingLibrary(new URLSearchParams(),data,'campaign');assert.match(grouped,/Fat Loss Course|Needs organising/);assert.doesNotMatch(grouped,/Social copy|Standalone post/);
 assert.match(collectionPage(new URLSearchParams({id:'course',part:'campaign'}),data),/Social copy|Launch pack/);
 assert.doesNotMatch(collectionPage(new URLSearchParams({id:'course',part:'campaign'}),data),/<h2>Standalone post<\/h2>/);
 assert.match(collectionPage(new URLSearchParams({id:'passport',part:'mealplan'}),data),/Mediterranean meal plan/);
});
test('Themes are primary library collections and supporting views are grouped',()=>{
 const data=fixture();assert.match(library(new URLSearchParams(),data),/Themes/);
 const marketing=library(new URLSearchParams({kind:'campaign'}),data);assert.match(marketing,/Fat Loss Course|Needs organising/);assert.doesNotMatch(marketing,/Social copy/);
 assert.match(newItem(new URLSearchParams({kind:'theme'}),data),/Create theme/);
 assert.match(newItem(new URLSearchParams({kind:'campaign',collectionId:'course'}),data),/value="course" selected/);
});
test('organising existing checked content does not change content or approval and grants no child edit access',async()=>{
 const data=fixture(),before=structuredClone(data.byId.get('course')),rows=new Map();
 const api=async(path,o={})=>o.method?(rows.set(o.payload.item,{id:o.payload.item,payload:o.payload.document,revision:1}),[rows.get(o.payload.item)]):[];
 await linkCollection({collectionId:'passport',contentId:'course'},data,api);assert.deepEqual(data.byId.get('course'),before);
 const link=[...rows.values()][0];assert.equal(link.payload.createdBy,undefined);
 const records=[...data.items,...[...rows.values()].map(r=>r.payload)];
 const actor={role:'staff',id:'joyce',access:{library:true,all_library:true,edit:true}};
 const loaded=await studioData(async path=>path.includes('nufi_studio_items')?records.map(payload=>({id:payload.id,payload,revision:1})):[],actor,async()=>({records:[]}));
 assert.deepEqual(collectionParents(loaded.byId.get('course'),loaded),['passport']);assert.equal(canEditContent(loaded,'course'),false);assert.equal(loaded.byId.has(link.id),false);assert.equal(loaded.assigned.has(link.id),false);
});
test('staff can file their own content without editing the parent, and cannot organise someone else’s work',async()=>{
 const data=fixture();data.actor={role:'staff',id:'joyce',access:{library:true,all_library:true,edit:true}};data.assigned.add('social');
 const api=async(path,o={})=>o.method?[{revision:1}]:[];
 await linkCollection({collectionId:'passport',contentId:'social'},data,api);
 await assert.rejects(()=>linkCollection({collectionId:'passport',contentId:'picture'},data,api),e=>e.status===403);
 const draft=applyCollectionPlacement({id:'new',kind:'mealplan'},{organisationVersion:'1',collectionId:'course',themeId:'passport'},data);assert.equal(draft.collectionId,'course');assert.equal(draft.themeId,'passport');
 assert.throws(()=>applyCollectionPlacement({id:'passport',kind:'theme'},{organisationVersion:'1',collectionId:'passport'},data),e=>e.status===400);
 data.byId.get('passport').status='Archived';assert.throws(()=>applyCollectionPlacement({id:'new',kind:'mealplan'},{organisationVersion:'1',collectionId:'passport'},data),e=>e.status===400);
});
test('collection route saves and removes links while keeping meal plans and checked courses unchanged',async()=>{
 const data=fixture();delete data.byId.get('mealplan').collectionId;
 const rows=new Map(data.items.map(payload=>[payload.id,{id:payload.id,payload:structuredClone(payload),revision:1}]));
 const api=async(path,o={})=>{if(o.method){const p=o.payload,old=rows.get(p.item);if((old?.revision||0)!==p.expected)return [];const row={id:p.item,payload:structuredClone(p.document),revision:p.expected+1};rows.set(row.id,row);return [row];}if(path.includes('nufi_studio_items')){const id=new URL(path,'https://fixture.test').searchParams.get('id');return structuredClone(id?.startsWith('eq.')?[rows.get(id.slice(3))].filter(Boolean):[...rows.values()]);}return [];};
 async function request(body){const headers={},res={setHeader(k,v){headers[k]=v;},end(body){this.body=body;}};await handleStudio({method:body?'POST':'GET',body},res,{params:new URLSearchParams({studio:'collection',id:'passport'}),actor:data.actor,api,load:async()=>({records:[]}),env:{}});return {...res,headers};}
 let response=await request({action:'collection-link',collectionId:'passport',contentId:'mealplan'});assert.equal(response.statusCode,303);
 response=await request();assert.equal(response.statusCode,200);assert.match(response.body,/<h2>Mediterranean meal plan<\/h2>/);assert.match(response.body,/Remove from collection/);
 assert.equal(rows.get('mealplan').revision,1);assert.equal(rows.get('course').payload.approval.revision,1);
 response=await request({action:'collection-link',collectionId:'passport',contentId:'mealplan',remove:'yes'});assert.equal(response.statusCode,303);
 response=await request();assert.doesNotMatch(response.body,/<h2>Mediterranean meal plan<\/h2>/);
});

