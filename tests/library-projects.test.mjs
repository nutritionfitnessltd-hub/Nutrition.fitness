import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {changeProject,projectScreen} from '../server/library-projects.mjs';
import {renderLibrary} from '../server/library-view.mjs';
test('six-week project carries weekly library items and new workflow briefs for its assigned creator',async()=>{
  const admin={role:'admin',id:randomUUID()}, creator={role:'staff',id:randomUUID()}, other={role:'staff',id:randomUUID()};
  const record={id:'source:1',title:'PT check-in',group:'Messages'};
  const load=async()=>({records:[record]});
  let saved;
  const api=async(url,opts={})=>{
    if(opts.method==='POST'){saved={...opts.payload,revision:1,status:'Planning',entries:[],creator:{name:'Creator'}};return [];}
    if(url.startsWith('/rest/v1/nufi_library_staff'))return [{id:creator.id,name:'Creator'}];
    if(url.includes('creator_id=eq.')&&!url.includes('creator_id=eq.'+saved.creator_id))return [];
    if(opts.method==='PATCH'){assert.ok(url.includes('revision=eq.'+saved.revision));Object.assign(saved,opts.payload);return [{id:saved.id}];}
    return [saved];
  };
  const p=new URLSearchParams(),id=randomUUID();
  const create={action:'project-create',id,creator:creator.id,weeks:'6',name:'Challenge',brief:'Six weeks of coaching.'};
  await assert.rejects(changeProject(p,create,creator,api,load),/Administrator/);
  await changeProject(p,create,admin,api,load);p.set('project',id);
  await changeProject(p,{action:'project-attach',revision:1,record:record.id,week:'2',notes:'Read first.'},admin,api,load);
  await assert.rejects(changeProject(p,{action:'project-attach',revision:2,record:record.id,week:'2'},admin,api,load),/already/);
  await changeProject(p,{action:'project-brief',revision:2,kind:'GHL workflow',title:'Friday check-in',notes:'Wait for a reply.',week:2},creator,api,load);
  p.set('week','2');assert.match(await projectScreen(p,creator,api,load),/Friday check-in/);
  await assert.rejects(projectScreen(p,other,api,load),/unavailable/);
  await assert.rejects(changeProject(p,{action:'project-entry-save',revision:2},creator,api,load),/changed/);
  await assert.rejects(changeProject(p,{action:'project-settings',week:1,revision:3,weeks:1,status:'Planning'},admin,api,load),/shortening/);
  await changeProject(p,{action:'project-entry-save',revision:3,entry:saved.entries[1].id,week:3,status:'Ready for review',notes:'Test with a team contact.'},creator,api,load);
  assert.equal(saved.entries[1].week,3);
  await changeProject(p,{action:'project-entry-remove',revision:4,entry:saved.entries[1].id,week:3},creator,api,load);
  assert.equal(saved.entries.length,1);
  assert.equal(saved.entries[0].assignedAsset,true);
  await changeProject(p,{action:'project-attach',revision:5,record:record.id,week:4,assignedAsset:true},creator,api,load);
  assert.equal(saved.entries[1].assignedAsset,false);
  const grant={action:'project-allow-asset',revision:6,week:4,entry:saved.entries[1].id};
  await assert.rejects(changeProject(p,grant,creator,api,load),/valid project action/);
  await changeProject(p,grant,admin,api,load);
  assert.equal(saved.entries[1].assignedAsset,true);
});
test('one course card leads to ordered lessons and supporting resources',()=>{
  const base={group:'Courses',status:'reference',fields:{},files:[]};
  const index={files:{},records:[{...base,id:'course:Yoga',title:'Yoga',kind:'Course outline'},{...base,id:'catalogue:1',title:'Welcome',kind:'Video'},{...base,id:'catalogue:2',title:'Workbook',kind:'Workbook'}]};
  const meta={courses:{Yoga:{members:['catalogue:1','catalogue:2'],sections:[{title:'Start here',entries:[{id:'catalogue:1',title:'Welcome'}]}],support:[{id:'catalogue:2',role:'Course resources'}],order:'confirmed'}}};
  const shelf=renderLibrary({index,meta,params:new URLSearchParams({shelf:'Courses'})});
  assert.equal((shelf.match(/class="card"/g)||[]).length,1);
  const page=tab=>renderLibrary({index,meta,params:new URLSearchParams({item:'course:Yoga',tab})});
  assert.match(page('lessons'),/Start here/);assert.match(page('lessons'),/Welcome/);assert.match(page('support'),/Workbook/);
});
