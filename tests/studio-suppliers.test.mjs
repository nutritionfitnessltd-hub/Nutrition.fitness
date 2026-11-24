import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {studioData} from '../server/studio-store.mjs';
import {handleStudio} from '../server/studio.mjs';
import {saveSupplier,supplierPage,suppliersPage} from '../server/studio-suppliers.mjs';
import {studioNavigation} from '../server/studio-navigation.mjs';
const admin={role:'admin',id:randomUUID()},staff={role:'staff',id:randomUUID(),access:{library:true}},blocked={...staff,access:{}};
const params=(id='new',extra={})=>new URLSearchParams({work:'1',studio:'supplier',id,...extra});
function fixture(){
 const rows=new Map(),load=async()=>({records:[],files:{}});
 const api=async(path,opt={})=>{
  if(path.includes('rpc/nufi_studio_save')){const p=opt.payload,old=rows.get(p.item);if((old?.revision||0)!==p.expected)return [];const r={id:p.item,payload:structuredClone(p.document),revision:p.expected+1};rows.set(p.item,r);return [r];}
  return path.includes('nufi_studio_items?')?[...rows.values()]:[];
 };
 const data=(actor=admin)=>studioData(api,actor,load);
 const form={id:randomUUID(),revision:'0',title:'Example supplier',services:'Packaging and labels',contact:'Jane Example',email:'jane@example.com',phone:'+44 20 1234 5678',website:'https://example.com',stage:'Active'};
 return {rows,api,load,data,form};
}
test('suppliers save and reload with contacts, search, document view and separate editing',async()=>{
 const f=fixture(),id=await saveSupplier(f.form,await f.data(),f.api),d=await f.data();
 const html=supplierPage(params(id),d);assert.match(html,/What they do/);assert.match(html,/mailto:jane@example.com/);assert.match(html,/tel:\+442012345678/);assert.doesNotMatch(html,/<textarea/);
 assert.match(supplierPage(params(id,{tab:'edit'}),d),/<textarea/);
 assert.match(suppliersPage(new URLSearchParams({q:'labels',studio:'suppliers'}),d),/Example supplier/);
 assert.doesNotMatch(suppliersPage(new URLSearchParams({q:'unmatched',studio:'suppliers'}),d),/Example supplier/);
 await saveSupplier({...f.form,id,revision:'1',stage:'Inactive'},d,f.api);
 assert.match(supplierPage(params(id),await f.data()),/Inactive/);
 await assert.rejects(saveSupplier({...f.form,id,revision:'1'},await f.data(),f.api),e=>e.status===409);
});
test('staff can read the directory but cannot edit; restricted accounts cannot enter',async()=>{
 const f=fixture(),id=await saveSupplier(f.form,await f.data(),f.api),d=await f.data(staff);
 assert.ok(d.byId.has(id));assert.doesNotMatch(supplierPage(params(id),d),/Edit supplier/);
 assert.throws(()=>supplierPage(params(id,{tab:'edit'}),d),e=>e.status===403);
 await assert.rejects(saveSupplier(f.form,d,f.api),e=>e.status===403);
 assert.ok(!(await f.data(blocked)).byId.has(id));
 assert.match(studioNavigation('suppliers',staff).html,/Suppliers/);
 assert.doesNotMatch(studioNavigation('suppliers',blocked).html,/Suppliers/);
 const res={statusCode:200,setHeader(){},end(body){this.body=body;}};
 await handleStudio({method:'GET'},res,{params:params(id),actor:blocked,api:f.api,load:f.load,env:{}});assert.equal(res.statusCode,403);
});
test('unsafe data is rejected, escaped or retained for correction without overwriting contacts',async()=>{
 const f=fixture();for(const extra of [{website:'javascript:alert(1)'},{email:'bad\r\nBcc:secret@example.com'},{stage:'Unknown'},{title:''},{services:''}])await assert.rejects(saveSupplier({...f.form,...extra},await f.data(),f.api),e=>e.status===400);
 const id=await saveSupplier({...f.form,title:'<script>unsafe</script>',services:'<img onerror=alert(1)>'},await f.data(),f.api);
 assert.doesNotMatch(supplierPage(params(id),await f.data()),/<script>unsafe|<img onerror/);
 const res={statusCode:200,setHeader(){},end(body){this.body=body;}};
 await handleStudio({method:'POST',body:{...f.form,id,revision:'1',action:'supplier-save',website:'http://unsafe.example'}},res,{params:params(id,{tab:'edit'}),actor:admin,api:f.api,load:f.load,env:{}});
 assert.equal(res.statusCode,400);assert.match(res.body,/http:\/\/unsafe.example/);assert.equal(f.rows.get(id).revision,1);
});
