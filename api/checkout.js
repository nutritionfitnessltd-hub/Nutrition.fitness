/** Optional Stripe TEST adapter. Never accepts live secret keys.
 * This is not the default browser checkout and performs no fulfilment.
 * Production requires verified prices, stock, tax, auth and idempotent webhooks.
 */
import { quoteCart } from '../src/commerce.mjs';
export default async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Use POST.'});}
 const secret=process.env.STRIPE_TEST_SECRET_KEY,base=process.env.SITE_URL;
 if(!secret||!base)return res.status(503).json({error:'Test checkout is not configured. No payment or order has been created.'});
 if(!secret.startsWith('sk_test_'))return res.status(503).json({error:'This preview intentionally refuses live payment keys.'});
 let origin;
 try{origin=new URL(base).origin;if(!origin.startsWith('https://'))throw new Error();}catch{return res.status(503).json({error:'A valid HTTPS SITE_URL is required.'});}
 if(req.headers.origin!==origin)return res.status(403).json({error:'Origin not allowed.'});
 const requestId=req.headers['x-idempotency-key'];
 if(typeof requestId!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(requestId))return res.status(400).json({error:'Provide a unique X-Idempotency-Key (16–80 letters, numbers, underscores or hyphens).'});
 try{
  const raw=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(JSON.stringify(raw).length>16000)return res.status(413).json({error:'Request too large.'});
  const q=quoteCart(raw?.items);
  if(!q.lines.length)return res.status(400).json({error:'Your basket is empty.'});
  if(q.recurring.length>1)return res.status(400).json({error:'This test adapter accepts one recurring cadence per checkout. Split membership and box cadence groups into separate test checkouts.'});
  const recurring=q.recurring[0],form=new URLSearchParams();
  form.set('mode',recurring?'subscription':'payment');form.set('success_url',origin+'/payment-test/?session_id={CHECKOUT_SESSION_ID}');form.set('cancel_url',origin+'/basket/');
  form.set('payment_method_types[0]','card');form.set('metadata[preview]','true');form.set('metadata[source]','nutrition-fitness-review');
  let index=0;
  const add=(name,amount,qty,cadence)=>{const p=`line_items[${index++}]`;form.set(`${p}[quantity]`,String(qty));form.set(`${p}[price_data][currency]`,'gbp');form.set(`${p}[price_data][unit_amount]`,String(amount));form.set(`${p}[price_data][product_data][name]`,'TEST ONLY · '+name);
   if(cadence){form.set(`${p}[price_data][recurring][interval]`,cadence.endsWith('w')?'week':cadence);if(cadence.endsWith('w'))form.set(`${p}[price_data][recurring][interval_count]`,cadence==='4w'?'4':'8');}
  };
  q.lines.forEach(l=>add(l.product.name,l.unit,l.qty,l.mode==='subscription'?l.cadence:null));
  if(recurring){
   // A one-time physical extra must not change all future shipment fees.
   // Refuse differing shipping totals instead of silently quoting a different charge.
   if(q.delivery!==recurring.delivery)return res.status(400).json({error:'Today’s and recurring shipping differ. Use separate test checkouts; the preview does not silently change delivery charges.'});
   if(recurring.delivery)add('Example recurring delivery',recurring.delivery,1,recurring.cadence);
  }else if(q.delivery)add('Example delivery',q.delivery,1,null);
  const response=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':requestId},body:form,signal:AbortSignal.timeout(15000)});
  const body=await response.json();if(!response.ok)return res.status(502).json({error:'The Stripe test session could not be created. Check the server configuration; no order was fulfilled.'});
  return res.status(200).json({url:body.url,id:body.id,test:true});
 }catch(e){return res.status(400).json({error:e instanceof SyntaxError?'Invalid JSON.':e.name==='TimeoutError'?'Stripe test request timed out. Retry with the same idempotency key.':e.message||'Invalid request.'});}
}
