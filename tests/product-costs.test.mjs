import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {calculateProductCosts,extraUnitCosts} from '../public/product-cost-math.mjs';
import {changeProductCosts,productCostsPage,productFiguresPage,supplierCostLinks} from '../server/studio-product-costs.mjs';
import {studioData} from '../server/studio-store.mjs';
import {handleStudio} from '../server/studio.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('self-packing reconciles material waste, supplier MOQ, delivery, setup, VAT and fees',()=>{
 const q={mode:'self',materialPrice:8,materialPerUnit:.5,wastePercent:20,minimumOrder:250,purchaseStep:25,packaging:1,label:.25,labour:.5,delivery:50,setup:100};
 const v=calculateProductCosts(q,{quantity:100,sellingPrice:24,vatRate:20,feePercent:2,feeFixed:.3});
 assert.equal(v.complete,true);close(v.materialUsed,62.5);close(v.purchaseQuantity,250);close(v.unusedMaterial,187.5);close(v.repeatUnitCost,7.25);close(v.initialCash,2325);close(v.firstOrderCostPerUnit,23.25);close(v.netSellingPrice,20);close(v.grossProfit,12.75);close(v.grossMargin,63.75);close(v.contribution,11.97);close(v.contributionAfterSetup,1097);
});
test('ready-packed MOQ cash includes spare finished stock without inflating repeat margin',()=>{
 const v=calculateProductCosts({mode:'ready',materialPrice:6,minimumOrder:300,purchaseStep:1,packaging:.5,delivery:30,setup:50},{quantity:100,sellingPrice:12,vatRate:20});
 assert.equal(v.complete,true);close(v.purchaseQuantity,300);close(v.unusedMaterial,200);close(v.repeatUnitCost,6.8);close(v.initialCash,1930);close(v.grossProfit,3.2);close(v.grossMargin,32);
});
test('missing VAT, unknown price, invalid quantity and impossible waste do not invent figures',()=>{
 const q={mode:'self',materialPrice:10,materialPerUnit:1},s={quantity:10,sellingPrice:20,vatRate:0};
 for(const [quote,scenario] of [[null,s],[q,{...s,vatRate:null}],[{...q,materialPrice:null},s],[q,{...s,quantity:1.5}],[q,{...s,quantity:0}],[{...q,wastePercent:100},s],[{...q,purchaseStep:0},s],[{...q,labour:-1},s]])assert.equal(calculateProductCosts(quote,scenario).complete,false);
 close(calculateProductCosts(q,s).netSellingPrice,20);
});
function fixture(){
 const admin={role:'admin',id:randomUUID()},p={id:'studio:product:'+randomUUID(),kind:'product',title:'Whey 1kg',status:'In review',fields:{category:'Supplements',stage:'In development',packSize:'1kg',proposedRrp:30,sku:'WHEY'}},supplier={id:'studio:supplier:'+randomUUID(),kind:'supplier',title:'Sample supplier',status:'Draft',fields:{stage:'Active',services:'Powder and packing'}};
 const rows=new Map([p,supplier].map(payload=>[payload.id,{id:payload.id,payload,revision:1}]));
 const api=async(path,options={})=>{if(path.includes('rpc/nufi_studio_save')){const v=options.payload,old=rows.get(v.item);if((old?.revision||0)!==v.expected)return [];const next={id:v.item,payload:structuredClone(v.document),revision:v.expected+1};rows.set(next.id,next);return [next];}return path.includes('nufi_studio_items?')?[...rows.values()]:[];};
 const load=async()=>({records:[],files:{}}),data=(actor=admin)=>studioData(api,actor,load),quote={action:'product-quote-save',productId:p.id,quoteId:randomUUID(),revision:'0',title:'Bulk powder',mode:'self',grade:'Quoted',supplierId:supplier.id,unit:'kg',materialPrice:'10',materialPerUnit:'1',minimumOrder:'25',purchaseStep:'1',wastePercent:'0',delivery:'20',setup:'50',...Object.fromEntries(extraUnitCosts.map(k=>[k,'0']))};
 return {admin,p,supplier,rows,api,load,data,quote};
}
test('quotes and selected figures persist, reload, compare and link back from suppliers',async()=>{
 const f=fixture();await changeProductCosts(f.quote,await f.data(),f.api);
 await changeProductCosts({...f.quote,quoteId:randomUUID(),revision:'1',title:'Ready-packed',mode:'ready',unit:'unit',materialPrice:'14'},await f.data(),f.api);
 const s={action:'product-cost-scenario',productId:f.p.id,revision:'2',quoteId:f.quote.quoteId,quantity:'100',sellingPrice:'30',vatRate:'20',feePercent:'2',feeFixed:'.2'};
 await changeProductCosts(s,await f.data(),f.api);
 const d=await f.data(),params=new URLSearchParams({id:f.p.id,tab:'costs'}),html=productCostsPage(params,d,d.byId.get(f.p.id));
 for(const value of ['Bulk powder','Ready-packed','Sample supplier','Initial cash required','£1,070.00'])assert.ok(html.includes(value),value);
 assert.match(productFiguresPage(new URLSearchParams(),d),/Whey 1kg/);assert.match(supplierCostLinks(f.supplier,d),/Whey 1kg/);
 await assert.rejects(changeProductCosts(s,await f.data(),f.api),e=>e.status===409);
 await changeProductCosts({action:'product-quote-archive',productId:f.p.id,quoteId:f.quote.quoteId,revision:'3'},await f.data(),f.api);
 const saved=f.rows.get('studio:product-costing:'+f.p.id.replace('studio:product:',''));assert.equal(saved.payload.fields.quotes[0].archived,true);assert.equal(saved.payload.fields.scenario.quoteId,'');
});
test('invalid quotes are rejected, errors retain entries, and saved product copy stays untouched',async()=>{
 const f=fixture();for(const patch of [{supplierId:''},{materialPrice:'NaN'},{materialPrice:' '},{mode:'invalid'},{purchaseStep:'0'},{wastePercent:'100'},{quoteDate:'2026-02-31'},{documentUrl:'javascript:alert(1)'},{mode:'ready',unit:'kg'},{labour:'-1'}])await assert.rejects(changeProductCosts({...f.quote,...patch},await f.data(),f.api),e=>e.status===400);
 const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}};
 await handleStudio({method:'POST',body:{...f.quote,title:'My unsaved quote',materialPrice:'NaN'}},res,{params:new URLSearchParams({studio:'product',id:f.p.id,tab:'costs'}),actor:f.admin,api:f.api,load:f.load,env:{}});
 assert.equal(res.statusCode,400);assert.match(res.body,/My unsaved quote/);assert.equal(f.rows.get(f.p.id).revision,1);
});
test('costs are private to administrators, including broad company readers and direct URLs',async()=>{
 const f=fixture();await changeProductCosts(f.quote,await f.data(),f.api);const staff={role:'staff',id:randomUUID(),access:{library:true,all_library:true,edit:true}};
 const d=await f.data(staff);assert.ok(!d.items.some(r=>r.kind==='product-costing'));assert.throws(()=>productFiguresPage(new URLSearchParams(),d),e=>e.status===403);await assert.rejects(changeProductCosts({...f.quote,revision:'1'},d,f.api),e=>e.status===403);
 for(const params of [new URLSearchParams({studio:'product-figures'}),new URLSearchParams({studio:'product',id:f.p.id,tab:'costs'})]){const res={statusCode:200,setHeader(){},end(){}};await handleStudio({method:'GET'},res,{params,actor:staff,api:async()=>{throw Error('No database access expected');},load:f.load,env:{}});assert.equal(res.statusCode,403);}
});
test('product forms save through the handler and the central figures page reloads the preferred option',async()=>{
 const f=fixture(),params=new URLSearchParams({studio:'product',id:f.p.id,tab:'costs'}),response=()=>({statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}});
 const options={params,actor:f.admin,api:f.api,load:f.load,env:{}};
 const save=response();await handleStudio({method:'POST',body:f.quote},save,options);assert.equal(save.statusCode,303);assert.match(save.headers.Location,/tab=costs/);
 const scenario=response();await handleStudio({method:'POST',body:{action:'product-cost-scenario',productId:f.p.id,revision:'1',quoteId:f.quote.quoteId,quantity:'100',sellingPrice:'30',vatRate:'20',feePercent:'0',feeFixed:'0'}},scenario,options);assert.equal(scenario.statusCode,303);
 const list=response();await handleStudio({method:'GET'},list,{...options,params:new URLSearchParams({studio:'product-figures'})});assert.equal(list.statusCode,200);assert.match(list.body,/Bulk powder|Pack ourselves/);assert.match(list.body,/£1,070.00/);assert.match(list.body,/product-cost-table/);
 const page=response();await handleStudio({method:'GET'},page,options);assert.equal(page.statusCode,200);assert.match(page.body,/data-product-cost-scenario/);assert.match(page.body,/data-product-quote-form/);assert.match(page.body,/src="\/product-costs.js"/);
});
