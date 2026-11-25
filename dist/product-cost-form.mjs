export function initBasicCostForm(form,quotes=[]){
 form._basicQuotes=quotes;if(form.dataset.basicReady)return;form.dataset.basicReady='true';
 const fields=form.elements;
 const update=reset=>{const ready=fields.mode.value==='ready';if(reset){fields.unit.value=ready?'unit':form.dataset.rawUnit;fields.materialPerUnit.value=ready?'1':form.dataset.rawAmount;}form.querySelector('[data-bulk-fields]').hidden=ready;form.querySelector('[data-price-basis]').textContent=(ready?'Supplier cost is for one finished pack.':'Supplier cost uses the price basis and amount per pack above.')+' Enter the VAT rate explicitly; use 0 where applicable.';};
 fields.mode.addEventListener('change',()=>{update(true);form.dispatchEvent(new Event('input',{bubbles:true}));});
 fields.selectedQuoteId?.addEventListener('change',()=>{const q=form._basicQuotes.find(q=>q.id===fields.selectedQuoteId.value);if(!q)return;fields.quoteId.value=q.id;for(const key of ['mode','unit','materialPerUnit','materialPrice','supplierName','packaging','delivery'])fields[key].value=q[key]??'';update(false);form.dispatchEvent(new Event('input',{bubbles:true}));});
 update(false);
}
