
const NF={
 money:p=>'£'+(Number(p||0)/100).toFixed(2),
 getCart(){try{return JSON.parse(localStorage.getItem('nf_cart')||'[]')}catch{return[]}},
 setCart(c){localStorage.setItem('nf_cart',JSON.stringify(c));this.updateBag()},
 add(item){const c=this.getCart();const key=item.id+'|'+(item.cadence||'one_off')+'|'+(item.flavour||'');const old=c.find(x=>x.key===key);if(old)old.qty+=item.qty||1;else c.push({...item,key,qty:item.qty||1});this.setCart(c);return c},
 updateBag(){const n=this.getCart().reduce((s,x)=>s+(x.qty||0),0);document.querySelectorAll('[data-bag-count]').forEach(e=>e.textContent=n)},
 getPlan(){try{return JSON.parse(localStorage.getItem('nf_meal_plan')||'{}')}catch{return{}}},
 setPlan(p){localStorage.setItem('nf_meal_plan',JSON.stringify(p))}
};
window.NF=NF;
document.addEventListener('DOMContentLoaded',()=>{
 NF.updateBag();
 const t=document.querySelector('[data-menu-toggle]'),n=document.querySelector('[data-nav]');if(t&&n){t.addEventListener('click',()=>{let o=t.getAttribute('aria-expanded')==='true';t.setAttribute('aria-expanded',String(!o));n.classList.toggle('open',!o)})}
 document.querySelectorAll('[data-add-product]').forEach(btn=>btn.addEventListener('click',()=>{const f=btn.closest('[data-product-form]');let q=1,c='one_off',fl='';if(f){q=Math.max(1,Math.min(12,Number(f.querySelector('[name=qty]')?.value||1)));c=f.querySelector('[name=cadence]:checked')?.value||'one_off';fl=f.querySelector('[name=flavour]')?.value||''}NF.add({id:btn.dataset.id,name:btn.dataset.name,price:Number(btn.dataset.price),image:btn.dataset.image,cadence:c,flavour:fl,qty:q});btn.textContent='Added ✓';setTimeout(()=>btn.textContent='Add to basket →',1200)}));
 document.querySelectorAll('[data-preview-form]').forEach(f=>f.addEventListener('submit',e=>{e.preventDefault();let s=f.querySelector('[data-form-status]');if(s)s.textContent='Preview only — connect this form to your production service before launch.'}));
});
