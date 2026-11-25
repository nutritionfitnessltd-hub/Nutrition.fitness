import {readFile} from 'node:fs/promises';
import {HttpError} from './platform.mjs';
import {editable,readable,saveRecord} from './studio-store.mjs';
import {canEditContent} from './library-permissions.mjs';
import {recipeImage} from './studio-recipes.mjs';
import {issues} from './studio-model.mjs';
import {randomUUID} from 'node:crypto';
import {esc,url,heading,button,form,hidden,select,textarea,input} from './studio-ui.mjs';
export const isStagedRecipe=r=>r.kind==='recipe'&&Boolean(r.fields?.recipeStaging?.batchId);
const stagingUrl=values=>url('library',values)+(values.match===''?'&amp;match=':'');
export const isPendingStagedRecipe=r=>isStagedRecipe(r)&&r.fields.recipeStaging.reviewStatus!=='accepted';
function bulkReviewNotice(params){
 const saved=Number(params.get('bulkSaved')),failed=Number(params.get('bulkFailed'));
 if(!Number.isSafeInteger(saved)||!Number.isSafeInteger(failed)||saved+failed===0)return '';
 const action={approve:'approved and moved to the library',replace:'flagged for a new picture',archive:'moved to Deleted recipes',restore:'restored to staging'}[params.get('bulkOperation')]||'updated';
 return '<p class="recipe-bulk-result" role="status">'+saved+' recipes '+action+'.'+(failed?' '+failed+' could not be changed. They may have changed since you opened the page, need a picture, or be outside your editing access. Check them and try again.':'')+'</p>';
}
function bulkReviewBar(params,bin,admin){
 const target=stagingUrl({kind:'recipe',bucket:'staging',...Object.fromEntries([...params].filter(([k])=>['q','book','photo','match','page','view'].includes(k)))});
 return '<form method="post" action="'+target+'" id="recipe-bulk-review" class="recipe-bulk-bar">'+hidden('action','recipe-bulk-review')+'<div class="recipe-bulk-selection"><label><input type="checkbox" data-recipe-select-page>Select this page</label><span data-recipe-selected role="status" aria-live="polite">0 selected</span><button type="button" data-recipe-clear>Clear</button></div>'+
 (!bin&&admin?'<label class="recipe-bulk-confirm"><input type="checkbox" name="contentChecked" value="yes">I have checked the selected recipes, including ingredients, method, servings, nutrition, allergens, pictures and any duplicate matches.</label>':'')+
 '<div class="studio-actions">'+(bin?'<button name="operation" value="restore">Restore selected</button>':(admin?'<button name="operation" value="approve" class="primary">Approve recipes</button>':'')+'<button name="operation" value="replace">Needs new picture</button><button name="operation" value="archive" class="recipe-delete">Delete selected</button>')+'</div><p class="meta">'+(bin?'Restore returns recipes to staging as unchecked drafts.':'Actions apply to selected recipes on this page. Approve moves checked recipes to the library without publishing. Delete moves them to Deleted recipes, where you can restore them.')+'</p></form>';
}

export async function bulkRecipeReview(f,data,api){
 if(!['approve','replace','archive','restore'].includes(f.operation))throw new HttpError(400,'Choose a review action.');
 if(f.operation==='approve'&&data.actor.role!=='admin')throw new HttpError(403,'Administrator access is required to approve recipes.');
 if(f.operation==='approve'&&f.contentChecked!=='yes')throw new HttpError(400,'Confirm that you have checked the selected recipes and pictures before approving.');
 const picked=Object.entries(f).filter(([key])=>key.startsWith('pick:'));
 if(!picked.length||picked.length>24)throw new HttpError(400,'Select between 1 and 24 recipes on this page.');
 // Validate the whole selection before the first write. Each save also checks
 // the revision atomically, so concurrent edits are never overwritten.
 const changes=picked.map(([key,revision])=>{
   const r=editable(data,key.slice(5));if(!isPendingStagedRecipe(r)||!canEditContent(data,r.id))throw new HttpError(403,'Choose staged recipes you can edit.');
   if(!Number.isSafeInteger(Number(revision))||Number(revision)!==r.revision)throw new HttpError(409,'A selected recipe changed. Reload this page before reviewing it.');
   if((f.operation==='restore')!==(r.status==='Archived'))throw new HttpError(400,'Choose recipes from the current review page.');
   if(f.operation==='approve'&&!recipeImage(r))throw new HttpError(400,r.title+': add a picture before approving this recipe.');
   const next=structuredClone(r),s=next.fields.recipeStaging,at=new Date().toISOString();delete next.revision;delete next.updatedAt;
   if(f.operation==='approve'||f.operation==='replace'){s.photoReview=f.operation==='approve'?'usable':'replace';s.photoReviewedBy=data.actor.id;s.photoReviewedAt=at;}
   if(f.operation==='approve'){
     next.source={...next.source,needsChecking:false};
     const missing=issues(next,data.items);if(missing.length)throw new HttpError(400,r.title+': '+missing.join(' '));
     s.reviewStatus='accepted';s.acceptedBy=data.actor.id;s.acceptedAt=at;
     next.status='Approved';next.approval={by:data.actor.id,at,revision:r.revision+1};
     next.reviewFeedback=[...(r.reviewFeedback||[]),{id:randomUUID(),decision:'approve',reviewedRevision:r.revision,reviewedTitle:r.title,author:data.actor.name||'Administrator',authorId:data.actor.id,at,sourceChecked:true,pictureChecked:true,delivery:'not-required'}];
   }
   if(f.operation==='archive'){s.deletedAt=at;s.deletedBy=data.actor.id;s.statusBeforeDelete=r.status;next.status='Archived';delete next.approval;}
   if(f.operation==='restore'){next.status='Draft';next.source={...next.source,needsChecking:true};s.photoReview='pending';s.restoredAt=at;s.restoredBy=data.actor.id;delete s.deletedAt;delete s.deletedBy;delete next.approval;}
   return {r,next};
 });
 let saved=0,failed=0;
 for(let i=0;i<changes.length;i+=4){
   const outcomes=await Promise.allSettled(changes.slice(i,i+4).map(({r,next})=>saveRecord(api,data.actor,next,r.revision)));
   saved+=outcomes.filter(r=>r.status==='fulfilled').length;failed+=outcomes.filter(r=>r.status==='rejected').length;
 }
 return {saved,failed};
}
export function recipePhotoForm(r,data,params=new URLSearchParams()){
 if(!canEditContent(data,r.id))return '';
 const html=form('recipe-photo-review',hidden('revision',r.revision)+select('photoReview','Picture review',{pending:'Needs checking',usable:'Picture looks good',replace:'Needs replacement'},r.fields.recipeStaging.photoReview||'pending')+textarea('photoNote','Picture notes',r.fields.recipeStaging.photoNote||'',2),{section:'library',kind:'recipe',bucket:'staging',id:r.id,...Object.fromEntries([...params].filter(([k])=>['q','book','photo','match','page'].includes(k)))},'Save picture review');
 return params.has('match')&&params.get('match')===''?html.replace(/action="([^"]+)"/,(_,target)=>'action="'+target+'&amp;match="'):html;
}
export function recipeStagingPage(params,data){
 const bin=params.get('view')==='bin';
 const all=data.items.filter(r=>isPendingStagedRecipe(r)&&(bin?r.status==='Archived':r.status!=='Archived'));
 const q=(params.get('q')||'').toLowerCase(),book=params.get('book')||'',photo=params.get('photo')||'',match=params.has('match')?params.get('match'):(bin?'':'missing');
 const books=[...new Set(all.flatMap(r=>r.fields.recipeStaging.books||[r.fields.recipeStaging.book]))].filter(Boolean).sort();
 const rows=all.filter(r=>(!match||r.fields.recipeStaging.matchStatus===match)&&(!q||r.title.toLowerCase().includes(q))&&(!book||(r.fields.recipeStaging.books||[r.fields.recipeStaging.book]).includes(book))&&(!photo||(photo==='missing'?!recipeImage(r):(r.fields.recipeStaging.photoReview||'pending')===photo)));
 const pages=Math.max(1,Math.ceil(rows.length/24)),page=Math.min(pages,Math.max(1,Number.parseInt(params.get('page'),10)||1)),shown=rows.slice((page-1)*24,page*24);
 const pageLink=n=>stagingUrl({kind:'recipe',bucket:'staging',q,book,photo,match,...(bin?{view:'bin'}:{}),page:n});
 const canSelect=shown.some(r=>canEditContent(data,r.id));
 return heading(bin?'Deleted recipes':'Recipe staging',bin?'Restore deleted recipes here. Nothing is permanently deleted.':'Select recipes to approve, flag for a new picture or delete. Open each recipe to check its content before approval.',button(bin?'Back to staging':'Deleted recipes',url('library',{kind:'recipe',bucket:'staging',...(bin?{}:{view:'bin'})}))+button('Recipe library',url('library',{kind:'recipe'})))+
 bulkReviewNotice(params)+'<p>'+all.length+(bin?' deleted recipes':' staged recipes')+' &middot; '+all.filter(r=>!recipeImage(r)).length+' without a picture &middot; '+all.filter(r=>r.fields.recipeStaging.photoReview==='usable').length+' pictures checked</p>'+
 '<form class="studio-filters" action="/content-library/">'+hidden('work','1')+hidden('studio','library')+hidden('kind','recipe')+hidden('bucket','staging')+(bin?hidden('view','bin'):'')+input('q','Search recipes',params.get('q')||'','search')+select('book','Source book',{'':'All books',...Object.fromEntries(books.map(b=>[b,b]))},book)+select('photo','Pictures',{'':'All pictures',pending:'Needs checking',usable:'Picture looks good',replace:'Needs replacement',missing:'No picture'},photo)+select('match','Comparison',{'':'All staged recipes',missing:'No matching recipe found','possible-duplicate':'Possible duplicate',held:'Already held back'},match)+'<button>Search</button></form>'+
 '<p>'+rows.length+' results &middot; Page '+page+' of '+pages+'</p>'+(canSelect?bulkReviewBar(params,bin,data.actor.role==='admin'):'')+
 '<div class="recipe-staging-grid">'+shown.map(r=>stagingCard(r,data,params,bin)).join('')+'</div><nav class="studio-actions" aria-label="Staging pages">'+(page>1?button('Previous',pageLink(page-1)):'')+(page<pages?button('Next',pageLink(page+1)):'')+'</nav>';
}
function stagingCard(r,data,params,bin){
 const s=r.fields.recipeStaging,image=recipeImage(r),canEdit=canEditContent(data,r.id);
 const select=canEdit?'<label class="recipe-select"><input type="checkbox" form="recipe-bulk-review" name="pick:'+esc(r.id)+'" value="'+r.revision+'" aria-label="Select '+esc(r.title)+'"'+(String(data.bulkSelection?.['pick:'+r.id])===String(r.revision)?' checked':'')+' data-recipe-pick><span>Select</span></label>':'';
 const matches=s.matchStatus==='possible-duplicate'?'<p class="recipe-staging-notice">Possible duplicate: '+(s.matches||[]).map(m=>'<a href="'+url('item',{id:data.byId.has('website-recipe:'+m.id)?'website-recipe:'+m.id:'recipe-stage:held:'+m.id})+'">'+esc(m.title)+'</a>').join(', ')+'</p>':'';
 return '<article class="panel recipe-staging-card">'+select+'<a href="'+url('item',{id:r.id})+'">'+(image?'<img src="'+esc(image)+'" alt="'+esc(r.title)+'" loading="lazy">':'<div class="recipe-no-photo">Picture needed</div>')+'<h2>'+esc(r.title)+'</h2></a><p>'+esc(s.book)+' &middot; page '+esc(s.page)+'</p>'+matches+'<p class="meta">'+esc(s.photoReview==='usable'?'Picture checked':s.photoReview==='replace'?'Picture needs replacement':'Picture needs checking')+'</p>'+(s.notes?.length?'<details><summary>Checks needed</summary><ul>'+s.notes.map(n=>'<li>'+esc(n)+'</li>').join('')+'</ul></details>':'')+button('Open recipe',url('item',{id:r.id}))+(bin||!canEdit?'':'<details class="recipe-single-review"><summary>Picture notes &amp; single review</summary>'+recipePhotoForm(r,data,params)+'</details>')+'</article>';
}
export async function saveRecipePhotoReview(params,f,data,api){
 const r=editable(data,params.get('id'));if(!isPendingStagedRecipe(r)||r.status==='Archived')throw new HttpError(400,'Choose a recipe currently in staging.');
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
 res.statusCode=200;res.setHeader('Content-Type','image/webp');res.setHeader('Cache-Control','private, max-age=300');res.setHeader('Vary','Cookie');res.setHeader('X-Content-Type-Options','nosniff');res.end(bytes);
}
