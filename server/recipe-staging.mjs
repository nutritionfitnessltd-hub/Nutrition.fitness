import {readFile} from 'node:fs/promises';
import {HttpError} from './platform.mjs';
import {editable,readable,saveRecord} from './studio-store.mjs';
import {canEditContent} from './library-permissions.mjs';
import {recipeImage} from './studio-recipes.mjs';
import {esc,url,heading,button,form,hidden,select,textarea,input} from './studio-ui.mjs';
export const isStagedRecipe=r=>r.kind==='recipe'&&Boolean(r.fields?.recipeStaging?.batchId);
export function recipePhotoForm(r,data,params=new URLSearchParams()){
 if(!canEditContent(data,r.id))return '';
 return form('recipe-photo-review',hidden('revision',r.revision)+select('photoReview','Picture review',{pending:'Needs checking',usable:'Picture looks good',replace:'Needs replacement'},r.fields.recipeStaging.photoReview||'pending')+textarea('photoNote','Picture notes',r.fields.recipeStaging.photoNote||'',2),{section:'library',kind:'recipe',bucket:'staging',id:r.id,...Object.fromEntries([...params].filter(([k])=>['q','book','photo','match','page'].includes(k)))},'Save picture review');
}
export function recipeStagingPage(params,data){
 const all=data.items.filter(r=>isStagedRecipe(r)&&r.status!=='Archived'),q=(params.get('q')||'').toLowerCase(),book=params.get('book')||'',photo=params.get('photo')||'',match=params.has('match')?params.get('match'):'missing';
 const books=[...new Set(all.flatMap(r=>r.fields.recipeStaging.books||[r.fields.recipeStaging.book]))].filter(Boolean).sort();
 const rows=all.filter(r=>(!match||r.fields.recipeStaging.matchStatus===match)&&(!q||r.title.toLowerCase().includes(q))&&(!book||(r.fields.recipeStaging.books||[r.fields.recipeStaging.book]).includes(book))&&(!photo||(photo==='missing'?!recipeImage(r):(r.fields.recipeStaging.photoReview||'pending')===photo)));
 const pages=Math.max(1,Math.ceil(rows.length/24)),page=Math.min(pages,Math.max(1,Number.parseInt(params.get('page'),10)||1)),shown=rows.slice((page-1)*24,page*24);
 return heading('Recipe staging','Recipes prepared from your books. Check the picture and extracted content before approving. Everything here remains unpublished.',button('Recipe library',url('library',{kind:'recipe'})))+
 '<p>'+all.length+' staged recipes · '+all.filter(r=>!recipeImage(r)).length+' without a picture · '+all.filter(r=>r.fields.recipeStaging.photoReview==='usable').length+' pictures checked</p>'+
 '<form class="studio-filters" action="/content-library/">'+hidden('work','1')+hidden('studio','library')+hidden('kind','recipe')+hidden('bucket','staging')+input('q','Search recipes',params.get('q')||'','search')+select('book','Source book',{'':'All books',...Object.fromEntries(books.map(b=>[b,b]))},book)+select('photo','Pictures',{'':'All pictures',pending:'Needs checking',usable:'Picture looks good',replace:'Needs replacement',missing:'No picture'},photo)+select('match','Comparison',{'':'All staged recipes',missing:'No matching recipe found','possible-duplicate':'Possible duplicate',held:'Already held back'},match)+'<button>Search</button></form>'+
 '<p>'+rows.length+' results · Page '+page+' of '+pages+'</p><div class="recipe-staging-grid">'+shown.map(r=>{const s=r.fields.recipeStaging,image=recipeImage(r);return '<article class="panel recipe-staging-card"><a href="'+url('item',{id:r.id})+'">'+(image?'<img src="'+esc(image)+'" alt="'+esc(r.title)+'" loading="lazy">':'<div class="recipe-no-photo">Picture needed</div>')+'<h2>'+esc(r.title)+'</h2></a><p>'+esc(s.book)+' · page '+esc(s.page)+'</p>'+(s.matchStatus==='possible-duplicate'?'<p class="recipe-staging-notice">Possible duplicate: '+(s.matches||[]).map(m=>'<a href="'+url('item',{id:data.byId.has('website-recipe:'+m.id)?'website-recipe:'+m.id:'recipe-stage:held:'+m.id})+'">'+esc(m.title)+'</a>').join(', ')+'</p>':'')+'<p class="meta">'+esc(s.photoReview==='usable'?'Picture checked':s.photoReview==='replace'?'Picture needs replacement':'Picture needs checking')+'</p>'+(s.notes?.length?'<details><summary>Checks needed</summary><ul>'+s.notes.map(n=>'<li>'+esc(n)+'</li>').join('')+'</ul></details>':'')+button('Open recipe',url('item',{id:r.id}))+recipePhotoForm(r,data,params)+'</article>';}).join('')+'</div><nav class="studio-actions" aria-label="Staging pages">'+(page>1?button('Previous',url('library',{kind:'recipe',bucket:'staging',q,book,photo,match,page:page-1})):'' )+(page<pages?button('Next',url('library',{kind:'recipe',bucket:'staging',q,book,photo,match,page:page+1})):'' )+'</nav>';
}
export async function saveRecipePhotoReview(params,f,data,api){
 const r=editable(data,params.get('id'));if(!isStagedRecipe(r))throw new HttpError(400,'Choose a staged recipe.');
 if(Number(f.revision)!==r.revision)throw new HttpError(409,'This recipe changed. Reopen it before saving.');
 if(!['pending','usable','replace'].includes(f.photoReview))throw new HttpError(400,'Choose a picture review.');
 if(f.photoReview==='usable'&&!recipeImage(r))throw new HttpError(400,'Add a picture before marking it as checked.');
 if(typeof f.photoNote!=='string'||f.photoNote.length>2000)throw new HttpError(400,'Use up to 2,000 characters for picture notes.');
 const next={...r,fields:{...r.fields,recipeStaging:{...r.fields.recipeStaging,photoReview:f.photoReview,photoNote:f.photoNote.trim(),photoReviewedBy:data.actor.id,photoReviewedAt:new Date().toISOString()}}};delete next.revision;delete next.updatedAt;
 await saveRecord(api,data.actor,next,r.revision);
}

export async function sendRecipeStagingImage(req,res,params,data){
 if(req.method!=='GET')throw new HttpError(405,'Use GET to view a recipe picture.');
 const r=readable(data,params.get('id')),key=r.fields?.recipeStaging?.imageKey;
 if(!isStagedRecipe(r)||!/^[a-f0-9]{16}$/.test(key||''))throw new HttpError(404,'This staged picture is unavailable.');
 let bytes;try{bytes=await readFile(new URL('./recipe-staging-images/'+key+'.webp',import.meta.url));}catch{throw new HttpError(404,'This staged picture is unavailable.');}
 res.statusCode=200;res.setHeader('Content-Type','image/webp');res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(bytes);
}
