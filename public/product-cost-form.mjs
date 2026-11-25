import {sellingPackBasis} from './product-cost-math.mjs';
export function initBasicCostForm(form,quotes=[]){
 form._basicQuotes=quotes;if(form.dataset.basicReady)return;form.dataset.basicReady='true';
 const fields=form.elements;
 const update=reset=>{const ready=fields.mode.value==='ready',basis=sellingPackBasis(fields.packSize?.value);if(reset){fields.unit.value=ready?'unit':basis?.unit||form.dataset.rawUnit;fields.materialPerUnit.value=ready?'1':basis?.amount||form.dataset.rawAmount;}form.querySelector('[data-bulk-fields]').hidden=ready;form.querySelector('[data-price-basis]').textContent=(ready?'Supplier price is for one finished selling pack.':'Supplier price is for one bulk pack, e.g. £100 for 20kg. Selling pack amount uses the same unit, e.g. 0.5kg for 500g.')+' Enter the VAT rate explicitly; use 0 where applicable.';};
 fields.packSize?.addEventListener('input',()=>{if(fields.mode.value==='self'){const basis=sellingPackBasis(fields.packSize.value);if(basis){fields.unit.value=basis.unit;fields.materialPerUnit.value=basis.amount;}}});
 const yieldText=()=>{let output=form.querySelector('[data-bulk-yield]');if(!output){output=document.createElement('p');output.dataset.bulkYield='';output.className='meta';form.querySelector('[data-price-basis]').after(output);}const bulk=Number(fields.supplierPackAmount.value),amount=Number(fields.materialPerUnit.value);output.textContent=fields.mode.value==='self'&&bulk>0&&amount>0?'One supplier bulk pack makes '+Math.floor((bulk+1e-10)/amount).toLocaleString('en-GB')+' selling packs before waste. Orders round up to whole supplier packs.':'';};
 form.addEventListener('input',yieldText);
 fields.mode.addEventListener('change',()=>{update(true);form.dispatchEvent(new Event('input',{bubbles:true}));});
 fields.selectedQuoteId?.addEventListener('change',()=>{const q=form._basicQuotes.find(q=>q.id===fields.selectedQuoteId.value);if(!q)return;fields.quoteId.value=q.id;for(const key of ['mode','unit','materialPerUnit','supplierName','packaging','delivery'])fields[key].value=q[key]??'';fields.materialPrice.value=q.supplierPackPrice??q.materialPrice??'';fields.supplierPackAmount.value=q.supplierPackAmount??1;update(false);form.dispatchEvent(new Event('input',{bubbles:true}));});
 update(false);
 yieldText();
}
