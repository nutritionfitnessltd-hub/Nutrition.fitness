import {randomUUID} from 'node:crypto';
import {HttpError,uuid} from './platform.mjs';
import {cleanText} from './studio-model.mjs';
import {readable,saveRecord} from './studio-store.mjs';
import {productLink} from './studio-products.mjs';
import {documentText} from './document-reader.mjs';
import {esc,url,heading,button,hidden,input,textarea,select,form,pages} from './studio-ui.mjs';

const states={Active:'Active',Prospective:'Prospective',Inactive:'Inactive'};
const records=data=>data.items.filter(r=>r.kind==='supplier');
function chosen(data,id){const r=readable(data,id);if(r.kind!=='supplier')throw new HttpError(404,'Supplier unavailable.');return r;}
const facts=f=>'<dl class="product-facts">'+[['Contact person',f.contact],['Email',f.email?'<a href="mailto:'+esc(f.email)+'">'+esc(f.email)+'</a>':''],['Phone',f.phone?'<a href="tel:'+esc(f.phone.replace(/[^+\d]/g,''))+'">'+esc(f.phone)+'</a>':''],['Website',productLink(f.website)?'<a target="_blank" rel="noopener noreferrer" href="'+esc(productLink(f.website))+'">'+esc(f.website)+' ↗</a>':''],['Address',f.address],['Status',f.stage]].filter(([,v])=>v).map(([k,v])=>'<div><dt>'+k+'</dt><dd style="white-space:pre-wrap;overflow-wrap:anywhere">'+(['Email','Phone','Website'].includes(k)?v:esc(v))+'</dd></div>').join('')+'</dl>';
export function suppliersPage(params,data){
 const q=(params.get('q')||'').trim().toLowerCase(),stage=params.get('stage')||'';
 const rows=records(data).filter(r=>(!stage||r.fields.stage===stage)&&(!q||[r.title,...Object.values(r.fields)].join(' ').toLowerCase().includes(q))).sort((a,b)=>a.title.localeCompare(b.title));
 return heading('Suppliers','Who we work with, what they provide and how to contact them.',data.actor.role==='admin'?button('Add supplier',url('supplier',{id:'new'}),true):'')+
 '<form action="/content-library/" class="product-filters">'+hidden('work','1')+hidden('studio','suppliers')+input('q','Search suppliers',params.get('q')||'','search')+select('stage','Status',{'':'All suppliers',...states},stage)+'<button>Search</button></form>'+
 pages(params,rows,batch=>batch.length?'<div class="document-collection">'+batch.map(r=>'<article class="document-sheet document-reader"><h2><a href="'+url('supplier',{id:r.id})+'">'+esc(r.title)+'</a></h2><p>'+esc(r.fields.services)+'</p>'+facts(r.fields)+'</article>').join('')+'</div>':'<p class="studio-empty">'+(q||stage?'No suppliers match your search.':'No suppliers added yet. Add a supplier to keep their contact details and services together.')+'</p>');
}
export function supplierPage(params,data,values){
 const id=params.get('id'),r=id==='new'?null:chosen(data,id);
 const edit=id==='new'||params.get('tab')==='edit'||Boolean(values);
 if(edit){
  if(data.actor.role!=='admin')throw new HttpError(403,'An administrator can manage suppliers.');
  const f=values||{id:r?.id||randomUUID(),revision:r?.revision||0,title:r?.title||'',...r?.fields};
  return button('← Suppliers',url('suppliers'))+heading(r?'Edit supplier':'Add supplier','Keep contact details and services up to date.')+'<section class="panel">'+form('supplier-save',hidden('id',f.id)+hidden('revision',f.revision)+input('title','Supplier / company name',f.title,'text','required maxlength="200"')+textarea('services','What they do / supply',f.services||'',4)+'<div class="product-form-grid">'+input('contact','Contact person',f.contact||'','text','maxlength="200"')+input('email','Email',f.email||'','email','maxlength="254"')+input('phone','Phone',f.phone||'','tel','maxlength="100"')+input('website','Website',f.website||'','url','placeholder="https://…" maxlength="2000"')+select('stage','Status',states,f.stage||'Active')+'</div>'+textarea('address','Address',f.address||'',3)+textarea('notes','Working notes',f.notes||'',4),{section:'supplier',id:id||'new'},'Save supplier')+'<p>'+button('Cancel',r?url('supplier',{id:r.id}):url('suppliers'))+'</p></section>';
 }
 return button('← Suppliers',url('suppliers'))+'<article class="document-sheet document-reader">'+heading(r.title,'Supplier',data.actor.role==='admin'?button('Edit supplier',url('supplier',{id:r.id,tab:'edit'})):'')+'<h2>What they do</h2>'+documentText(r.fields.services||'Services have not been added yet.')+'<h2>Contact details</h2>'+facts(r.fields)+(r.fields.notes?'<h2>Working notes</h2>'+documentText(r.fields.notes):'')+'</article>';
}
export async function saveSupplier(f,data,api){
 if(data.actor.role!=='admin')throw new HttpError(403,'An administrator can manage suppliers.');
 const id='studio:supplier:'+uuid(String(f.id||'').replace(/^studio:supplier:/,'')),old=data.byId.get(id);
 if(old&&old.kind!=='supplier')throw new HttpError(400,'Choose a supplier.');
 if(!Number.isSafeInteger(Number(f.revision))||Number(f.revision)!==(old?.revision||0))throw new HttpError(409,'This supplier changed. Open the latest saved details before combining your edits.');
 const title=cleanText(f.title||'',200),fields={};
 for(const [key,max] of Object.entries({services:8000,contact:200,email:254,phone:100,website:2000,address:2000,notes:8000,stage:30}))fields[key]=cleanText(f[key]||'',max);
 if(!title)throw new HttpError(400,'Give the supplier a company name.');
 if(!fields.services)throw new HttpError(400,'Describe what this supplier does or supplies.');
 if(!Object.hasOwn(states,fields.stage))throw new HttpError(400,'Choose a supplier status.');
 if(fields.email&&!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(fields.email))throw new HttpError(400,'Enter a valid email address.');
 if(fields.website&&!productLink(fields.website))throw new HttpError(400,'Use a complete HTTPS website link.');
 await saveRecord(api,data.actor,{id,kind:'supplier',title,status:fields.stage==='Inactive'?'Archived':'Draft',fields},old?.revision||0);
 return id;
}
