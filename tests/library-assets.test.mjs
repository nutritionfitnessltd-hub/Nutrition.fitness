import test from 'node:test';
import assert from 'node:assert/strict';
import { assetScreen } from '../server/library-assets.mjs';
import { handleLibraryWork } from '../server/library-work.mjs';

const record = {id:'catalogue:sample',title:'Sample lesson'};
const course = {id:'course:Example',title:'Example'};
const load = async () => ({records:[record,course]});
const params = new URLSearchParams({assets:record.id});
const staff = {id:'staff-fixture',role:'staff'};
const display = async key => {
  if(key === 'shelves') return {courses:{Example:{members:[record.id]}}};
  if(key === 'asset-directory')return [record.id];
  return {links:[{label:'Original',url:'https://example.test/shared'},{label:'Invalid',url:'data:text/plain,blocked'}]};
};

test('staff access is checked against the current assignee and server-side membership before reading sources',async()=>{
  let read = false;
  const deny = async (url,opts) => {
    assert.equal(url,'/rest/v1/rpc/nufi_library_can_open_asset');
    assert.deepEqual(opts.payload,{staff:staff.id,items:[record.id,course.id]});
    return false;
  };
  await assert.rejects(assetScreen(params,staff,deny,load,async key=>{
    if(key.startsWith('asset-links:')) read=true;
    return display(key);
  }),e=>e.status===403);
  assert.equal(read,false);
  const page=await assetScreen(params,staff,async()=>true,load,display);
  assert.match(page,/https:\/\/example\.test\/shared/);
  assert.doesNotMatch(page,/data:text|Invalid/);
  const all=new URLSearchParams({assets:'all'});
  await assert.rejects(assetScreen(all,staff,deny,load,display),e=>e.status===403);
  assert.match(await assetScreen(all,{role:'admin'},null,load,display),/Sample lesson/);
});

test('a guest following an asset link signs in to the requested item',async()=>{
  const res={setHeader(){},end(value){this.html=value;}};
  await handleLibraryWork({method:'GET',headers:{cookie:'__Host-nufi-library=guest'}},res,{
    env:{NUFI_LIBRARY_CATALOGUE_KEY:'fixture'},load,params,apiFactory:()=>()=>assert.fail()
  });
  assert.equal(res.statusCode,401);
  assert.match(res.html,/assets=catalogue%3Asample/);
  assert.doesNotMatch(res.html,/example\.test\/shared/);
});
