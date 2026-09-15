export const CADENCES={one_off:0,"4_weeks":28,"8_weeks":56,monthly:"calendar_month",annual:"year"};
export function assertQty(q){q=Number(q);if(!Number.isInteger(q)||q<1||q>12)throw new Error('Invalid quantity');return q}
export function lineTotal(pricePence,qty){return Number(pricePence)*assertQty(qty)}
export function hasConflictingNufi(lines){const c=new Set(lines.filter(x=>String(x.id).startsWith('nufi-')).map(x=>x.cadence));return c.has('monthly')&&c.has('annual')}
export function groupRecurring(lines){const g={};for(const x of lines){if(x.cadence&&x.cadence!=='one_off'){(g[x.cadence]??=[]).push(x)}}return g}
export function cartSummary(lines,shippingThreshold=5000,shipping=395){if(hasConflictingNufi(lines))throw new Error('Conflicting NUFI cadences');let subtotal=lines.reduce((s,x)=>s+lineTotal(x.price,x.qty),0);let delivery=subtotal>=shippingThreshold?0:shipping;return{subtotal,delivery,dueToday:subtotal+delivery,recurring:groupRecurring(lines)}}
