// Shared by the website tests and the authenticated worker ingress.
export class DraftError extends Error { constructor(status,message){super(message);this.status=status;} }
export const workerKinds=['article','recipe','lesson','email','newsletter','marketing','asset','video','course','programme','challenge','mealplan','ebook','stage','structure','session','exercise','activity','rule','review','learning','communication','campaign'];
const mapped={email:'communication',newsletter:'communication',marketing:'campaign',video:'asset'};
const workerIds=['nina','imogen','marcus','rory'];
export function draftWorker(input,current){
 const named=input.fields?.workerId??input.fields?.worker;
 if(named!==undefined){
  const id=typeof named==='string'?named.toLowerCase():'';
  if(!workerIds.includes(id))throw new DraftError(400,'Set fields.workerId to nina, imogen, marcus or rory.');
  return id;
 }
 if(current?.payload.workerId)return current.payload.workerId;
 if(workerIds.includes(current?.payload.workerSource?.workerId))return current.payload.workerSource.workerId;
 // Route unnamed connector deliveries to the role responsible for the requested output.
 if(['course','lesson','challenge'].includes(input.kind))return 'imogen';
 if(['programme','stage','structure','session','exercise','activity','rule','review'].includes(input.kind))return 'marcus';
 if(['video','asset'].includes(input.kind)||input.fields?.type==='Video'||input.fields?.channel==='Social')return 'rory';
 return 'nina';
}
export function draftId(id,namespace){
  if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,160}$/.test(id))throw new DraftError(400,'Use a stable content ID with letters, numbers, hyphens or underscores.');
  return namespace+id;
}
function text(value,max,required=false){if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)||(required&&!value.trim()))throw new DraftError(400,'Check the draft text and its length.');return value;}
export function safeAssetUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
function validate(value,depth=0){
  if(depth>12)throw new DraftError(400,'Content is nested too deeply.');
  if(typeof value==='string'){text(value,100000);return;}
  if(value===null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return;
  if(Array.isArray(value)){if(value.length>500)throw new DraftError(400,'Too many entries.');value.forEach(v=>validate(v,depth+1));return;}
  if(value&&typeof value==='object'){for(const [k,v] of Object.entries(value)){if(['__proto__','constructor','prototype'].includes(k)||k.length>100)throw new DraftError(400,'Invalid field.');validate(v,depth+1);}return;}
  throw new DraftError(400,'Invalid content field.');
}
export function draftDocument(input,current,namespace){
  const id=draftId(input.id,namespace);
  if(!workerKinds.includes(input.kind)||!Number.isSafeInteger(input.revision)||input.revision<0)throw new DraftError(400,'Check the content type and revision.');
  const kind=mapped[input.kind]||input.kind;
  if(current&&current.payload.kind!==kind)throw new DraftError(409,'A draft cannot change its content type.');
  if((current?.revision||0)!==input.revision)throw new DraftError(409,'A newer copy is saved. Read the latest content before editing.');
  const title=text(input.title,200,true),body=text(input.body,100000);
  if(input.fields!==undefined&&(!input.fields||Array.isArray(input.fields)||typeof input.fields!=='object'))throw new DraftError(400,'Fields must be an object.');
  validate(input.fields||{});
  if(JSON.stringify(input.fields||{}).length>400000)throw new DraftError(413,'Use a smaller draft.');
  const assetUrls=input.assetUrls??current?.payload.fields.assetUrls??[];
  if(!Array.isArray(assetUrls)||assetUrls.length>30||assetUrls.some(v=>!safeAssetUrl(v)))throw new DraftError(400,'Use HTTPS image or video reference links.');
  const previous=current?.payload||{};
  const fields={...(previous.fields||{}),...(input.fields||{}),body,assetUrls};
  if(kind==='recipe'){
    fields.sourceText=body;
    for(const [from,to] of [['ingredients','ingredients'],['method','instructions'],['allergens','allergens']])if(input[from]!==undefined){validate(input[from]);if(!Array.isArray(input[from])||input[from].some(v=>typeof v!=='string'))throw new DraftError(400,'Use a list of text entries.');fields[to]=input[from];}
    if(input.servings!==undefined){if(!Number.isInteger(input.servings)||input.servings<1||input.servings>1000)throw new DraftError(400,'Confirm servings.');fields.servings=input.servings;}
  }
  if(kind==='communication')fields.channel=input.kind==='newsletter'?'Email':fields.channel||'Email';
  if(input.kind==='video'){fields.type='Video';fields.brief=fields.brief||body;}
  const workerId=draftWorker(input,current);
  const document={...previous,id,title,kind,fields,workerId,status:'Draft',parent:previous.parent||null,comments:previous.comments||[],
    workerSource:{...(previous.workerSource||{}),workerId,system:'Content Manager connector',id:input.id,kind:input.kind,programmeId:input.programmeId||'',sourceId:input.sourceId||'',receivedAt:new Date().toISOString()}};
  // Incoming workers cannot grant approval, publish, replace stored images or edit other records.
  delete document.approval;delete document.revision;delete document.updatedAt;
  return document;
}
export function draftResult(row,website){
  const r=row.payload,f=r.fields||{};
  return {id:r.workerSource.id,revision:row.revision,kind:r.workerSource.kind,title:r.title,workerId:r.workerId||r.workerSource.workerId||draftWorker({kind:r.workerSource.kind,fields:f}),
    body:r.kind==='recipe'?f.sourceText||f.body||'':f.body||'',fields:f,assetUrls:f.assetUrls||[],
    ...(r.kind==='recipe'?{ingredients:f.ingredients||[],method:f.instructions||[],allergens:f.allergens||[],servings:f.servings}:{}),
    status:({'Draft':'draft','In review':'review','Changes requested':'changes_requested','Approved':'approved','Archived':'archived'})[r.status]||'draft',
    feedback:r.comments||[],reviewFeedback:r.reviewFeedback||[],
    updatedAt:row.updated_at,programmeId:r.workerSource.programmeId,sourceId:r.workerSource.sourceId,
    ...(r.kind==='article'&&(r.workerId||r.workerSource.workerId)==='nina'?{articleMedia:{required:true,ready:articleMediaIssues(r).length===0,missing:articleMediaIssues(r)}}:{}),
    imageUploaded:Boolean(r.workerImage||r.articleImage),reviewUrl:website+'/content-library/?work=1&studio=item&id='+encodeURIComponent(r.id)};
}
// Only owner-authored review entries become reusable guidance. Ordinary source text is not policy.
export function reviewGuidance(records,workerId){
 return [...(workerId==='nina'?[{id:'nina-article-image-requirement',guidance:ninaImageGuidance,sourceTitle:'Article image and label requirement',at:''}]:[]),...records.filter(r=>r.status!=='Archived').flatMap(r=>(r.reviewFeedback||[])
  .filter(f=>f.workerId===workerId&&f.guidance?.trim())
  .map(f=>({id:f.id,guidance:f.guidance,sourceId:r.id,sourceTitle:r.title,at:f.at})))
  .sort((a,b)=>(b.at||'').localeCompare(a.at||''))];
}

export const ninaImageGuidance='Every Nina article must include a relevant, correctly licensed photograph uploaded to the draft with upload_content_image, descriptive alt text, an accurate image credit, and a short article-specific handwritten label in fields.marginNote. A proposed photo, source-page link or assetUrls entry is not an uploaded image. Save the text draft first, upload the photograph, then reopen the saved review preview to verify both photograph and label display. If the image cannot be uploaded, report the missing image and keep the article incomplete rather than presenting it as ready for review.';
export function articleMediaIssues(r){
 if(r.kind!=='article'||(r.workerId||r.fields?.workerId||r.workerSource?.workerId)!=='nina')return [];
 const f=r.fields||{},out=[];
 const uploaded=r.workerImage?.bucket==='worker-content'&&/^content-manager\/[a-f0-9-]{36}\.(jpg|png|webp)$/.test(r.workerImage.path||'')&&['image/jpeg','image/png','image/webp'].includes(r.workerImage.type);
 const article=r.articleImage?.type==='image/webp'&&/^nutrition-library\/article-images\/v1\/[a-f0-9-]{36}\.webp$/.test(r.articleImage.pathname||'');
 const local=typeof f.imageUrl==='string'&&/^\/assets\/(?:photos\/knowledge-\d+\.jpg|phone-in-hand\.webp)$/.test(f.imageUrl);
 if(!uploaded&&!article&&!local)out.push('Upload a relevant article photograph. A source link alone is not an image.');
 const caption=typeof f.marginNote==='string'?f.marginNote:typeof f.imageCaption==='string'?f.imageCaption:'';
 if(!caption.trim())out.push('Add the handwritten image label (margin note).');
 if(!String(f.imageAlt||'').trim())out.push('Describe the article image for accessibility.');
 if(!String(f.imageCredit||'').trim())out.push('Add an accurate image credit.');
 return out;
}
