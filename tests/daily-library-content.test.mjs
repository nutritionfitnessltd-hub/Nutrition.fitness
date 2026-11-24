import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {accountPreview} from '../server/account-preview.mjs';
import {createItem,changeStudio} from '../server/studio-actions.mjs';
import {studioData,editable} from '../server/studio-store.mjs';
import {library,createPage,newItem} from '../server/studio-pages.mjs';
import {brandMediaPage} from '../server/team-workspace.mjs';
const actor={role:'staff',id:randomUUID(),name:'Joyce',access:{library:true,shared_library:true,studio:true,work:true,edit:true}};
test('stale Team form cannot switch saved shared access off in a new preview',async()=>{
 let saved;
 const api=async(path,o={})=>path.includes('nufi_library_staff')?[{id:actor.id,name:'Joyce',access:actor.access,access_revision:7}]:o.method?(saved=o.payload.document,[{id:saved.id,payload:saved,revision:1}]):[];
 await accountPreview({staff:actor.id,accessVersion:'1',accessRevision:'6',access_library:'1',access_edit:'1'},{actor:{id:randomUUID(),role:'admin'},api});
 assert.equal(saved.actor.access.shared_library,true);assert.equal(saved.actor.access.studio,true);
 await accountPreview({staff:actor.id,accessVersion:'1',accessRevision:'7',access_library:'1'},{actor:{id:randomUUID(),role:'admin'},api});
 assert.equal(saved.actor.access.shared_library,false); // An intentional current-form permission test still works.
});
test('daily draft saves with server-owned authorship, reloads for its creator, and stays private',async()=>{
 const rows=new Map();
 const api=async(path,o={})=>{
  if(path.includes('/rpc/nufi_studio_save')){const p=o.payload;assert.equal(p.expected,rows.get(p.item)?.revision||0);const row={id:p.item,payload:structuredClone(p.document),revision:p.expected+1};rows.set(p.item,row);return [row];}
  if(path.includes('/nufi_studio_items'))return [...rows.values()];
  if(path.includes('/nufi_library_staff'))return [{id:actor.id,name:'Joyce'}];
  return [];
 };
 const record={id:'studio:'+randomUUID(),kind:'article',title:'Daily content fixture',status:'Draft',createdBy:'forged',fields:{body:'Draft body'},comments:[]};
 await createItem(record,'','',{actor},api);
 assert.equal(rows.get(record.id).payload.createdBy,actor.id);
 const data=await studioData(api,actor,async()=>({records:[],files:{}}));
 assert.equal(editable(data,record.id).title,record.title);
 assert.ok(data.assigned.has(record.id));
 const other=await studioData(api,{...actor,id:randomUUID()},async()=>({records:[],files:{}}));
 assert.equal(other.byId.has(record.id),false);assert.throws(()=>editable(other,record.id),e=>e.status===403);
 await assert.rejects(()=>createItem({...record,id:'studio:'+randomUUID()},'','',{actor:{...actor,access:{library:true,edit:true}}},api),e=>e.status===403);
});
test('Content Library exposes Add content, personal drafts and an optional project',()=>{
 const own={id:'own',kind:'article',title:'Joyce draft',status:'Draft',createdBy:actor.id,fields:{}},shared={id:'other',kind:'article',title:'Shared article',status:'Approved',fields:{}};
 const data={actor,items:[own,shared],byId:new Map([[own.id,own],[shared.id,shared]]),assigned:new Set(['own']),projects:[],people:[]};
 const hub=library(new URLSearchParams(),data);assert.match(hub,/Add content/);assert.match(hub,/My content/);
 const mine=library(new URLSearchParams({view:'mine'}),data);assert.match(mine,/Joyce draft/);assert.doesNotMatch(mine,/Shared article/);
 assert.match(createPage(new URLSearchParams({view:'daily'}),data),/project is optional/);
 assert.match(newItem(new URLSearchParams({kind:'article'}),data),/No project — save to Content Library/);
});
test('Brand and Media shows the actual brand kit instead of the unrelated file gallery',()=>{
 for(const person of [actor,{role:'admin'}]){
  const html=brandMediaPage({actor:person,byId:new Map()});
  assert.match(html,/Download SVG/);assert.match(html,/Download PNG/);assert.match(html,/DM Sans/);assert.match(html,/Open full guide/);assert.doesNotMatch(html,/Browse shared assets|Browse creative assets|Images & files/);
 }
});
