import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { handleStudio } from '../server/studio.mjs';
import { studioNavigation } from '../server/studio-navigation.mjs';
import { saveSoftwareRelease } from '../server/team-workspace.mjs';

const admin={role:'admin',id:randomUUID()};
const load=async()=>({records:[],files:{}});
function response(){return {statusCode:0,headers:{},setHeader(k,v){this.headers[k]=v;},end(body=''){this.body=body;}};}
test('simple navigation retains seven sections and only three Asset links',()=>{
  const html=studioNavigation('library',admin).html;
  assert.equal((html.match(/studio-nav-section/g)||[]).length,7);
  assert.equal((html.match(/studio-subnav/g)||[]).length,1);
  for(const label of ['Home','Projects','Assets','Software Releases','Team','Archive','Content Studio','Content Library','Brand & Media'])assert.ok(html.includes('>'+label+'<'));
});
test('new workspace destinations render through the authenticated handler',async()=>{
  for(const section of ['assets','brand-media','workspace-archive','software-releases']){
    const res=response();
    await handleStudio({method:'GET'},res,{params:new URLSearchParams({studio:section}),actor:admin,api:async()=>[],load,env:{}});
    assert.equal(res.statusCode,200,section);assert.match(res.body,/Team Workspace/);
  }
});
test('software releases save and reload, preserve conflicts, and deny staff writes',async()=>{
  const rows=new Map();
  const api=async(path,options)=>{
    if(path==='/rest/v1/rpc/nufi_studio_save'){
      const p=options.payload,old=rows.get(p.item);
      if((old?.revision||0)!==p.expected)return [];
      const row={id:p.item,payload:p.document,revision:p.expected+1};rows.set(row.id,row);return [row];
    }
    return path.includes('nufi_studio_items?')?[...rows.values()]:[];
  };
  const id='studio:software-release:'+randomUUID();
  const fields={action:'software-release-save',id,revision:'0',title:'Website update',version:'1.1',platform:'Website',stage:'Planned',target:'2026-12-01'};
  const res=response();
  await handleStudio({method:'POST',body:fields},res,{params:new URLSearchParams({studio:'software-releases'}),actor:admin,api,load,env:{}});
  assert.equal(res.statusCode,303);assert.equal(rows.get(id).revision,1);
  const page=response();await handleStudio({method:'GET'},page,{params:new URLSearchParams({studio:'software-releases',tab:'releases'}),actor:admin,api,load,env:{}});
  assert.equal(page.statusCode,200);assert.match(page.body,/Website update/);assert.match(page.body,/2026-12-01/);
  const conflict=response();await handleStudio({method:'POST',body:fields},conflict,{params:new URLSearchParams({studio:'software-releases'}),actor:admin,api,load,env:{}});
  assert.equal(conflict.statusCode,409);assert.equal(rows.get(id).revision,1);
  await assert.rejects(saveSoftwareRelease(fields,{actor:{role:'staff'},byId:new Map(),projects:[]},api),e=>e.status===403);
  const invalid={...fields,target:'2026-02-30'};
  await assert.rejects(saveSoftwareRelease(invalid,{actor:admin,byId:new Map(),projects:[]},api),e=>e.status===400);
});
