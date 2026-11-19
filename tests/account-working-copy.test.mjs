import test from 'node:test';
import assert from 'node:assert/strict';
import {accountPreview,workingCopy} from '../server/account-preview.mjs';
const owner={role:'admin',id:'owner'},staff='00000000-0000-4000-8000-000000000002';
function fixture(){
 const rows=new Map([['article:one',{id:'article:one',revision:1,payload:{id:'article:one',kind:'article',title:'Original'}}]]),writes=[];
 const api=async(path,options={})=>{
  if(options.method){
   writes.push([path,structuredClone(options.payload)]);
   assert.equal(path,'/rest/v1/rpc/nufi_studio_save');
   const p=options.payload,old=rows.get(p.item);if((old?.revision||0)!==p.expected)return [];
   const row={id:p.item,revision:p.expected+1,payload:structuredClone(p.document)};rows.set(p.item,row);return [structuredClone(row)];
  }
  if(path.includes('nufi_library_staff'))return [{id:staff,name:'Joyce'}];
  const query=new URL(path,'https://fixture.test').searchParams,id=query.get('id');
  return structuredClone(id?.startsWith('eq.')?[rows.get(id.slice(3))].filter(Boolean):[...rows.values()]);
 };
 return {rows,writes,api};
}
test('working copy saves and reloads edits without modifying the live record',async()=>{
 const f=fixture(),location=await accountPreview({staff,accessVersion:'1',access_library:'1',access_edit:'1'},{actor:owner,api:f.api});
 const id=new URL(location,'https://fixture.test').searchParams.get('accountPreview');
 let copy=await workingCopy(f.api,owner,id);
 assert.equal(copy.actor.role,'staff');assert.equal(copy.actor.access.library,true);
 const save={method:'POST',payload:{item:'article:one',expected:1,document:{id:'article:one',kind:'article',title:'Copy edit'}}};
 assert.equal((await copy.api('/rest/v1/rpc/nufi_studio_save',save))[0].revision,2);
 assert.equal(f.rows.get('article:one').payload.title,'Original');
 copy=await workingCopy(f.api,owner,id);
 const [saved]=await copy.api('/rest/v1/nufi_studio_items?select=*&id=eq.article:one');assert.equal(saved.payload.title,'Copy edit');
 assert.deepEqual(await copy.api('/rest/v1/rpc/nufi_studio_save',save),[]);
 assert.ok(f.writes.every(([,p])=>p.item.startsWith('studio:account-preview:')));
 assert.ok((await copy.api('/rest/v1/nufi_studio_items?select=*')).every(r=>r.payload.kind!=='account-preview'));
 assert.deepEqual(await copy.api('/rest/v1/nufi_studio_items?id=like.studio:notification:*'),[]);
 await assert.rejects(()=>copy.api('/auth/v1/logout',{method:'POST'}),e=>e.status===403);
 await assert.rejects(()=>workingCopy(f.api,{role:'admin',id:'other'},id),e=>e.status===404);
 await assert.rejects(()=>workingCopy(f.api,{role:'staff',id:staff},id),e=>e.status===403);
 f.rows.get(id).payload.expiresAt=Date.now()-1;
 await assert.rejects(()=>workingCopy(f.api,owner,id),e=>e.status===410);
});
test('project updates and new assigned drafts stay inside the copy and retain revision checks',async()=>{
 const f=fixture(),project={id:'project',creator_id:staff,revision:1,entries:[],name:'Original project'};
 const api=(path,options={})=>path.includes('nufi_library_projects')?Promise.resolve([structuredClone(project)]):f.api(path,options);
 const location=await accountPreview({staff,accessVersion:'1',access_library:'1',access_edit:'1',access_work:'1'},{actor:owner,api});
 const id=new URL(location,'https://fixture.test').searchParams.get('accountPreview');
 let copy=await workingCopy(api,owner,id);
 const query='/rest/v1/nufi_library_projects?id=eq.project&revision=eq.1&creator_id=eq.'+staff;
 await copy.api(query,{method:'PATCH',payload:{name:'Copied project',revision:2}});
 assert.equal(project.name,'Original project');
 copy=await workingCopy(api,owner,id);
 assert.equal((await copy.api('/rest/v1/nufi_library_projects?select=*'))[0].name,'Copied project');
 assert.deepEqual(await copy.api(query,{method:'PATCH',payload:{name:'Stale edit',revision:2}}),[]);
 await copy.api('/rest/v1/rpc/nufi_studio_attach_item',{method:'POST',payload:{project_id:'project',expected:2,document:{id:'new:article',kind:'article',title:'Copy draft'},entry:{id:'entry',record:'new:article'}}});
 copy=await workingCopy(api,owner,id);
 assert.equal((await copy.api('/rest/v1/nufi_studio_items?id=eq.new:article'))[0].payload.title,'Copy draft');
 assert.equal((await copy.api('/rest/v1/nufi_library_projects?select=*'))[0].entries[0].record,'new:article');
 assert.equal(f.rows.has('new:article'),false);assert.deepEqual(project.entries,[]);
});
