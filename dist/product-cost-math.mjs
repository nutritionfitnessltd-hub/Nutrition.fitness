export const extraUnitCosts=['packaging','label','scoop','seal','outerPackaging','blending','filling','labour','other'];
const number=v=>v!==null&&v!==''&&v!==undefined&&Number.isFinite(Number(v))?Number(v):null;
export function calculateProductCosts(quote,scenario){
 if(!quote)return {complete:false,reason:'Enter a supplier cost to calculate your figures.'};
 const quantity=number(scenario.quantity),price=number(scenario.sellingPrice),vat=number(scenario.vatRate),materialPrice=number(quote.materialPrice),materialPerUnit=quote.mode==='ready'?1:number(quote.materialPerUnit);
 if(!Number.isSafeInteger(quantity)||quantity<=0)return {complete:false,reason:'Enter a whole-number order quantity.'};
 if(price===null||price<=0||vat===null||vat<0||vat>100)return {complete:false,reason:'Enter a selling price and VAT rate (enter 0 if applicable).'};
 if(materialPrice===null||materialPrice<0||materialPerUnit===null||materialPerUnit<=0)return {complete:false,reason:'Complete the material or finished-product price and pack quantity.'};
 const waste=quote.mode==='self'?number(quote.wastePercent)??0:0,step=number(quote.purchaseStep)??1,minOrder=number(quote.minimumOrder)??0;
 if(waste<0||waste>=100||step<=0||minOrder<0)return {complete:false,reason:'Check the waste, minimum order and purchase increment.'};
 const extras=extraUnitCosts.map(k=>number(quote[k])??0),delivery=number(quote.delivery)??0,setup=number(quote.setup)??0,feePercent=number(scenario.feePercent)??0,feeFixed=number(scenario.feeFixed)??0;
 if([...extras,delivery,setup,feePercent,feeFixed].some(v=>v<0)||feePercent>100)return {complete:false,reason:'Costs and fees cannot be negative.'};
 const materialUsed=quantity*materialPerUnit/(1-waste/100),purchaseQuantity=Math.ceil((Math.max(materialUsed,minOrder)-1e-10)/step)*step;
 const materialOrderCost=purchaseQuantity*materialPrice,extraPerUnit=extras.reduce((a,b)=>a+b,0);
 const repeatUnitCost=materialUsed*materialPrice/quantity+extraPerUnit+delivery/quantity;
 const initialCash=materialOrderCost+quantity*extraPerUnit+delivery+setup;
 const netSellingPrice=price/(1+vat/100),sellingFees=price*feePercent/100+feeFixed;
 const grossProfit=netSellingPrice-repeatUnitCost,contribution=grossProfit-sellingFees;
 return {complete:true,quantity,purchaseQuantity,materialUsed,unusedMaterial:Math.max(0,purchaseQuantity-materialUsed),materialOrderCost,extraPerUnit,repeatUnitCost,setup,initialCash,firstOrderCostPerUnit:initialCash/quantity,netSellingPrice,sellingFees,grossProfit,grossMargin:grossProfit/netSellingPrice*100,contribution,contributionMargin:contribution/netSellingPrice*100,orderContribution:contribution*quantity,contributionAfterSetup:contribution*quantity-setup};
}

export function basicCostEstimate(fields,quotes=[]){const old=quotes.find(q=>q.id===fields.quoteId)||{};return {...old,mode:fields.mode,unit:fields.mode==='ready'?'unit':fields.unit,materialPrice:fields.materialPrice,materialPerUnit:fields.mode==='ready'?1:fields.materialPerUnit,packaging:fields.packaging,delivery:fields.delivery,...(old.mode&&old.mode!==fields.mode?{minimumOrder:0,purchaseStep:1,wastePercent:0}:{})};}
