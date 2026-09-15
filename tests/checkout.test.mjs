import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/checkout.js';
const single={id:'plain-whey',qty:1,mode:'once',cadence:null};
async function invoke({method='POST',body={items:[single]},origin='https://example.test',key='preview-test-request-12345',secret='sk_test_placeholder',base='https://example.test',fakeFetch=null}={}){
 const oldSecret=process.env.STRIPE_TEST_SECRET_KEY,oldSite=process.env.SITE_URL,oldFetch=globalThis.fetch;
 if(secret===null)delete process.env.STRIPE_TEST_SECRET_KEY;else process.env.STRIPE_TEST_SECRET_KEY=secret;
 process.env.SITE_URL=base;
 globalThis.fetch=fakeFetch||(async()=>{throw new Error('Unexpected network request in a unit test.');});
 const res={code:200,headers:{},body:null,setHeader(k,v){this.headers[k]=v;},status(c){this.code=c;return this;},json(b){this.body=b;return this;}};
 try{await handler({method,body,headers:{origin,'x-idempotency-key':key}},res);return res;}
 finally{globalThis.fetch=oldFetch;if(oldSecret===undefined)delete process.env.STRIPE_TEST_SECRET_KEY;else process.env.STRIPE_TEST_SECRET_KEY=oldSecret;if(oldSite===undefined)delete process.env.SITE_URL;else process.env.SITE_URL=oldSite;}
}
test('test adapter rejects GET',async()=>assert.equal((await invoke({method:'GET'})).code,405));
test('test adapter disabled without a test key',async()=>assert.equal((await invoke({secret:null})).code,503));
test('test adapter refuses live-key prefixes',async()=>assert.equal((await invoke({secret:'sk_live_not_a_real_key'})).code,503));
test('test adapter requires HTTPS site origin',async()=>assert.equal((await invoke({base:'http://example.test'})).code,503));
test('test adapter rejects another origin',async()=>assert.equal((await invoke({origin:'https://other.test'})).code,403));
test('test adapter requires idempotency key',async()=>assert.equal((await invoke({key:'bad'})).code,400));
test('test adapter rejects invalid JSON',async()=>assert.equal((await invoke({body:'broken'})).code,400));
test('test adapter rejects empty basket',async()=>assert.equal((await invoke({body:{items:[]}})).code,400));
test('test adapter rejects unknown products',async()=>assert.equal((await invoke({body:{items:[{...single,id:'fake'}]}})).code,400));
test('test adapter rejects combined incompatible billing cadences',async()=>assert.equal((await invoke({body:{items:[{...single,mode:'subscription',cadence:'4w'},{id:'nufi-membership',qty:1,mode:'subscription',cadence:'month'}]}})).code,400));
test('test adapter rejects today/renewal delivery mismatch',async()=>assert.equal((await invoke({body:{items:[{...single,mode:'subscription',cadence:'4w'},{...single,qty:2}]}})).code,400));
test('test adapter constructs checkout from server prices, not client prices',async()=>{
 let payload;
 const r=await invoke({body:{items:[{...single,price:1}]},fakeFetch:async(url,opts)=>{assert.equal(url,'https://api.stripe.com/v1/checkout/sessions');payload=opts.body;return {ok:true,json:async()=>({url:'https://checkout.stripe.com/test-placeholder',id:'cs_test_placeholder'})};}});
 assert.equal(r.code,200);assert.equal(payload.get('line_items[0][price_data][unit_amount]'),'2900');assert.equal(payload.get('line_items[1][price_data][unit_amount]'),'395');assert.equal(payload.get('mode'),'payment');assert.equal(r.body.test,true);
});
test('test adapter retains four-week rather than monthly cadence',async()=>{
 let payload;
 const r=await invoke({body:{items:[{...single,mode:'subscription',cadence:'4w'}]},fakeFetch:async(url,opts)=>{payload=opts.body;return {ok:true,json:async()=>({url:'https://checkout.stripe.com/test-placeholder',id:'cs_test_placeholder'})};}});
 assert.equal(r.code,200);assert.equal(payload.get('line_items[0][price_data][recurring][interval]'),'week');assert.equal(payload.get('line_items[0][price_data][recurring][interval_count]'),'4');assert.equal(payload.get('line_items[1][price_data][unit_amount]'),'395');
});
test('test adapter surfaces processor failure without claiming fulfilment',async()=>assert.equal((await invoke({fakeFetch:async()=>({ok:false,json:async()=>({error:{message:'test error'}})})})).code,502));
