import { products, site } from './data.mjs';
export const productById = id => products.find(p => p.id === id);
export const money = pennies => pennies===null?'Price to be announced':new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(pennies/100);
export function validateLine(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid basket item.');
  const p=productById(raw.id);
  if (!p) throw new Error('That product is not in the catalogue.');
  if(!Number.isSafeInteger(p.price)||p.price<0) throw new Error('This product is not yet priced or available to order.');
  if (!Number.isSafeInteger(raw.qty)||raw.qty<1||raw.qty>20) throw new Error('Choose a quantity between 1 and 20.');
  const mode=raw.mode, cadence=raw.cadence || null;
  if (p.id==='nufi-membership') {
    if(mode!=='subscription'||!['month','year'].includes(cadence)) throw new Error('Choose monthly or annual NUFI+ membership.');
    if(raw.qty!==1) throw new Error('Only one membership can be purchased at a time.');
  } else if(mode==='subscription') {
    if(!p.recurring||!['4w','8w'].includes(cadence)) throw new Error('Choose a valid delivery interval.');
  } else if(mode!=='once'||cadence) throw new Error('Invalid purchase option.');
  return {id:p.id,qty:raw.qty,mode,cadence};
}
export const keyFor = line => `${line.id}:${line.mode}:${line.cadence||'once'}`;
export function unitPrice(raw) {
  const l=validateLine(raw),p=productById(l.id);
  if (p.id==='nufi-membership') return l.cadence==='year'?p.annualPrice:p.price;
  return l.mode==='subscription'?Math.round(p.price*(100-site.subscriptionDiscount)/100):p.price;
}
export const cadenceName = c => ({'4w':'every 4 weeks','8w':'every 8 weeks',month:'monthly',year:'annually'}[c]||'one-off');
export function addLine(lines,raw) {
  const line=validateLine(raw),result=lines.map(validateLine);
  if(line.id==='nufi-membership'&&result.some(l=>l.id==='nufi-membership'))throw new Error('A NUFI+ membership is already in your basket. Remove it before choosing another billing option.');
  const i=result.findIndex(l=>keyFor(l)===keyFor(line));
  if(i<0){if(result.length>=30)throw new Error('Your basket can hold up to 30 different items.');result.push(line);}
  else result[i]=validateLine({...result[i],qty:result[i].qty+line.qty});
  return result;
}
export function quoteCart(rawLines) {
  if(!Array.isArray(rawLines)||rawLines.length>30) throw new Error('Invalid basket.');
  if(rawLines.filter(l=>l?.id==='nufi-membership').length>1)throw new Error('Only one NUFI+ membership can be purchased at a time.');
  const seen=new Set();for(const raw of rawLines){const key=keyFor(validateLine(raw));if(seen.has(key))throw new Error('Duplicate basket line. Merge quantities before quoting.');seen.add(key);}
  const lines=rawLines.map(validateLine).map(l=>({...l,product:productById(l.id),unit:unitPrice(l),total:unitPrice(l)*l.qty}));
  const subtotal=lines.reduce((s,l)=>s+l.total,0);
  const physical=lines.filter(l=>l.product.type==='physical').reduce((s,l)=>s+l.total,0);
  const delivery=physical>0&&physical<site.shipping.freeOver?site.shipping.fee:0;
  const groups={};
  for(const l of lines.filter(l=>l.mode==='subscription')) {
    groups[l.cadence] ||= {cadence:l.cadence,subtotal:0,physical:0};
    groups[l.cadence].subtotal+=l.total;
    if(l.product.type==='physical')groups[l.cadence].physical+=l.total;
  }
  const recurring=Object.values(groups).map(g=>({...g,delivery:g.physical>0&&g.physical<site.shipping.freeOver?site.shipping.fee:0})).map(g=>({...g,total:g.subtotal+g.delivery}));
  return {lines,subtotal,delivery,total:subtotal+delivery,recurring,itemCount:lines.reduce((s,l)=>s+l.qty,0)};
}
export function safeStoredCart(raw) {
  if(!Array.isArray(raw)) return [];
  let result=[];
  for(const r of raw.slice(0,30)){try{result=addLine(result,validateLine(r));}catch{ /* Reject invalid or stale persisted state. */ }}
  return result;
}
