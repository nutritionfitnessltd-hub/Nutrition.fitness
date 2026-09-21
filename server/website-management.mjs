/** Website CMS: source records remain immutable; this module handles reviewed overlays. */
import {readFileSync} from 'node:fs';
import {HttpError, email, uuid} from './platform.mjs';
import {RECIPES} from '../public/recipes-data.mjs';
import {products} from '../src/data.mjs';

const freeSource=JSON.parse(readFileSync(new URL('../data/cookbooks/high-protein-kitchen.json',import.meta.url),'utf8'));
export const FREE_RECIPE_IDS=new Set(freeSource.recipes.map(r=>r.id));
const freeById=new Map(freeSource.recipes.map(r=>[r.id,r]));
const recipeIndex=new Map(RECIPES.map(r=>[r.id,r]));
if(FREE_RECIPE_IDS.size!==100)throw new Error('The original 100 free recipes must be preserved.');
export const PAGE_SIZE=25;
export const PAGE_DEFINITIONS=Object.freeze([
  {id:'home',path:'/',label:'Home',title:'Getting fit is complicated. So we made it less complicated.',intro:'NUFI sorts your workouts, meals, shopping lists and progress. You do them. Seems fair.',metaTitle:'Nutrition.Fitness',headingSelector:'#hero-heading',introSelector:'.hero-description'},
  {id:'nufi',path:'/nufi/',label:'NUFI+',title:'You have a life. We have a plan.',intro:'Your workouts, food, shopping and progress, in one place. Instead of seventeen tabs and a vague sense of guilt.',metaTitle:'NUFI+',headingSelector:'.nufi-mast h1',introSelector:'.nufi-mast .lead'},
  {id:'programmes',path:'/programmes/',label:'Programmes',title:'Start with a base. Make it yours.',intro:'core. build. lean. fit. run. swim. bike. A clear starting point, with focus add-ons that belong to your programme—not seven plans fighting over your week.',metaTitle:'One system. Your kind of progress.',headingSelector:'.food-intro h1',introSelector:'.food-intro .lead'},
  {id:'courses',path:'/courses/',label:'Courses',title:'A little less guessing. A little more “got it”.',intro:'Practical orientation for your chosen base. Understand your plan, make it fit your week and connect your training to the food you actually eat.',metaTitle:'Learn your programme, not another fitness language',headingSelector:'.food-intro h1',introSelector:'.food-intro .lead'},
  {id:'recipes',path:'/recipes/',label:'Recipes',title:'Dinner, sorted. Lunch invited too.',intro:'599 recipes for breakfast, lunch, dinner and everything in between. The original 100 are free to cook and plan. Browse previews of 499 more, with account access coming soon.',metaTitle:'Recipes for your actual week',headingSelector:'.food-intro h1',introSelector:'.food-intro .lead'},
  {id:'shop',path:'/shop/',label:'Shop',title:'Plain protein. Very good company.',intro:'Choose your powder. Add a flavour shot. Change your mind about the flavour tomorrow.',metaTitle:'The not-overcomplicated shop',headingSelector:'.shop-mast h1',introSelector:'.shop-mast .lead'},
  {id:'about',path:'/about/',label:'About',title:'Serious about you. Less serious about ourselves.',intro:'We are here to make getting fitter feel less like homework. Because you have quite enough of that sort of thing.',metaTitle:'Hello from Nutrition.Fitness',headingSelector:'.mast-split h1',introSelector:'.mast-split .lead'},
  {id:'help',path:'/help/',label:'Help',title:'Good questions. Straight answers.',intro:'No need to spend your afternoon arguing with a search box.',metaTitle:'A little help',headingSelector:'.page-intro h1',introSelector:'.page-intro .lead'},
  {id:'contact',path:'/contact/',label:'Contact',title:'Let’s sort it. Preferably without a saga.',intro:'Tell us what you need a hand with. In this preview, you can prepare and copy a support request. It is not sent anywhere.',metaTitle:'Get in touch',headingSelector:'.page-intro h1',introSelector:'.page-intro .lead'},
].map(p=>Object.freeze({...p,metaDescription:'Fitness and nutrition for real life. Programmes, meals, shopping and support, brought together by Nutrition.Fitness.'})));
const pageById=new Map(PAGE_DEFINITIONS.map(p=>[p.id,p]));
const productById=new Map(products.filter(p=>p.id!=='nufi-membership').map(p=>[p.id,{id:p.id,path:`/shop/${p.id}/`,name:p.name,description:p.id==='high-protein-kitchen'?'100 recipes for the days you feel like cooking. And the days you would quite like dinner to arrive without a meeting about it.':p.description,priceLabel:'',category:p.category}]));
const settingsDefault=Object.freeze({id:'site',siteTitle:'Nutrition.Fitness',announcement:'',supportEmail:''});
const forbidden=new Set(['__proto__','constructor','prototype']);
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);

export function managementReady(env){return env.NUFI_ACCOUNT_MANAGEMENT_READY==='true';}
export function requireManagement(env){if(!managementReady(env))throw new HttpError(503,'Website management is not connected in this deployment yet.');}
export function plainText(value,label,max,{empty=false,multiline=false}={}){
  if(typeof value!=='string'||value.length>max||(!empty&&!value.trim())||/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)||(!multiline&&/[\r\n\t]/.test(value)))throw new HttpError(400,`Check ${label}. Use plain text, up to ${max} characters.`);
  return value.trim();
}
export function contentId(value){if(typeof value!=='string'||!/^[a-z0-9][a-z0-9-]{0,79}$/.test(value)||forbidden.has(value))throw new HttpError(400,'Choose a valid item.');return value;}
export function expectedVersion(value){if(!Number.isSafeInteger(value)||value<0||value>2147483646)throw new HttpError(400,'Reload the current version before saving.');return value;}
function object(value,label='record'){if(!value||typeof value!=='object'||Array.isArray(value))throw new HttpError(400,`Check the ${label}.`);return value;}
function oneOf(value,choices,label){if(!choices.includes(value))throw new HttpError(400,`Choose a valid ${label}.`);return value;}
export function readManageQuery(req){
  const p=new URL(req.url||'/api/manage','https://nutrition.fitness').searchParams;
  for(const key of p.keys())if(!['section','q','page','id'].includes(key)||p.getAll(key).length!==1)throw new HttpError(400,'Check the management request.');
  const section=oneOf(p.get('section')||'overview',['overview','members','recipes','recipe','pages','page','products','product','settings','audit'],'section');
  const q=plainText(p.get('q')||'','search',100,{empty:true});
  const raw=p.get('page')||'1';if(!/^[1-9][0-9]{0,3}$/.test(raw)&&raw!=='10000')throw new HttpError(400,'Choose a valid page number.');
  const page=Number(raw);const id=p.has('id')?contentId(p.get('id')):null;
  if(['recipe','page','product'].includes(section)!==Boolean(id))throw new HttpError(400,'Choose an item to edit.');
  return {section,q,page,id};
}
function list(items,{q='',page=1}={}){const query=q.toLocaleLowerCase('en-GB'),filtered=query?items.filter(r=>[r.id,r.name,r.title,r.label,r.category,r.source].filter(Boolean).join(' ').toLocaleLowerCase('en-GB').includes(query)):items;return {items:filtered.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE),total:filtered.length,page,pageSize:PAGE_SIZE};}
const overlayEndpoint=(type,id)=>'/rest/v1/nufi_content?select=content_type,id,payload,published_payload,version,updated_at,published_at'+(type?`&content_type=eq.${type}`:'')+(id?`&id=eq.${encodeURIComponent(id)}`:'')+'&limit=1000';
export async function readOverlays(api,{type=null,id=null}={}){const rows=await api(overlayEndpoint(type,id),{service:true});if(!Array.isArray(rows)||rows.length>1000)throw new HttpError(503,'The current website content could not be confirmed.');return rows;}
export async function readPublicOverlays(api){
  const results=await Promise.all([
    api('/rest/v1/nufi_content?content_type=in.(page,product,settings)&select=content_type,id,published_payload,version&limit=100',{service:true}),
    api('/rest/v1/nufi_content?content_type=eq.recipe&select=content_type,id,publicationStatus:payload->>publicationStatus,version&limit=1000',{service:true})
  ]);
  if(!results.every(Array.isArray))throw new HttpError(503,'Published content could not be confirmed.');
  return [...results[0],...results[1].map(r=>({content_type:r.content_type,id:r.id,version:r.version,payload:{publicationStatus:r.publicationStatus}}))];
}
function overlayMap(rows,type){return new Map(rows.filter(r=>r.content_type===type).map(r=>[r.id,r]));}
function metadata(row){return {version:row?.version||0,updatedAt:row?.updated_at||null,publishedAt:row?.published_at||null};}
function baseRecord(type,id){
  const value=type==='page'?pageById.get(id):type==='product'?productById.get(id):type==='settings'&&id==='site'?settingsDefault:null;
  if(!value)throw new HttpError(404,'That item was not found.');
  const {headingSelector,introSelector,...fields}=value;
  return {...fields,publicationStatus:'published',version:0,updatedAt:null,publishedAt:null};
}
export function applyRecipeOverlay(recipe,row){
  if(!row)return {...recipe,access:FREE_RECIPE_IDS.has(recipe.id)?'free':'account'};
  const p=row.payload||{};const allowed=['name','category','quote','servings','ingredients','steps','nutrition','nutritionStatus','nutritionNote','nutritionReviewed','publicationStatus'];
  const changes={};for(const k of allowed)if(own(p,k))changes[k]=p[k];
  return {...recipe,...changes,id:recipe.id,source:recipe.source,sourceSha256:recipe.sourceSha256,access:FREE_RECIPE_IDS.has(recipe.id)?'free':'account',publicationStatus:FREE_RECIPE_IDS.has(recipe.id)?'published':(p.publicationStatus||recipe.publicationStatus),contentVersion:row.version,...(p.nutritionReviewed?{nutritionSource:`Website administrator review: ${p.nutritionNote}`}:{})};
}
/** Caller must authenticate restricted recipes before passing any private payload. */
export async function applyRecipeOverlays(api,recipes){
  if(!recipes.length)return [];
  let rows;
  // A free-catalogue request must never fetch account-only recipe bodies, even
  // though the final projection would omit them. Limit the query itself.
  if(recipes.every(r=>FREE_RECIPE_IDS.has(r.id))){
    const ids=recipes.map(r=>contentId(r.id)).join(',');
    rows=await api(`/rest/v1/nufi_content?content_type=eq.recipe&id=in.(${ids})&select=content_type,id,payload,version&limit=100`,{service:true});
    if(!Array.isArray(rows))throw new HttpError(503,'The free recipe edits could not be confirmed.');
  }else if(recipes.length===1)rows=await readOverlays(api,{type:'recipe',id:recipes[0].id});
  else rows=await readOverlays(api,{type:'recipe'});
  const map=overlayMap(rows,'recipe');return recipes.map(r=>applyRecipeOverlay(r,map.get(r.id)));
}
export async function readRecipeRecord(api,id){
  if(!recipeIndex.has(id))throw new HttpError(404,'That recipe was not found.');
  let source=freeById.get(id);
  if(!source){const rows=await api(`/rest/v1/nufi_private_recipe_content?id=eq.${encodeURIComponent(id)}&select=id,payload,publication_status&limit=1`,{service:true});if(!Array.isArray(rows)||rows.length!==1||rows[0]?.payload?.id!==id)throw new HttpError(503,'The source recipe is not connected yet.');source=rows[0].payload;}
  const row=(await readOverlays(api,{type:'recipe',id}))[0];
  return {...applyRecipeOverlay(source,row),...metadata(row),publicationStatus:FREE_RECIPE_IDS.has(id)?'published':(row?.payload?.publicationStatus||source.publicationStatus||'held')};
}
function recipeSummaries(rows){const map=overlayMap(rows,'recipe');return RECIPES.map(source=>{const row=map.get(source.id),r=applyRecipeOverlay(source,row);return {id:r.id,name:r.name,category:r.category,access:r.access,publicationStatus:r.publicationStatus||'published',nutritionStatus:r.nutritionStatus,source:r.source||'Imported recipe source',...metadata(row)};});}
export async function readManagementSection(api,query,env){
  const {section,id,q,page}=query;
  if(section==='members')return api('/rest/v1/rpc/nufi_manage_members',{method:'POST',service:true,payload:{search_term:q,page_number:page,page_size:PAGE_SIZE}});
  if(section==='audit')return api('/rest/v1/rpc/nufi_manage_audit',{method:'POST',service:true,payload:{search_term:q,page_number:page,page_size:PAGE_SIZE}});
  if(section==='recipe')return {record:await readRecipeRecord(api,id)};
  if(['page','product','settings'].includes(section)){const type=section,record=baseRecord(type,id||'site');const row=(await readOverlays(api,{type,id:record.id}))[0];return {record:{...record,...row?.payload,...metadata(row)}};}
  const rows=await readOverlays(api);
  if(section==='recipes')return list(recipeSummaries(rows),query);
  if(section==='pages'||section==='products'){const type=section==='pages'?'page':'product',base=type==='page'?PAGE_DEFINITIONS:[...productById.values()],map=overlayMap(rows,type);return list(base.map(p=>({...baseRecord(type,p.id),...map.get(p.id)?.payload,...metadata(map.get(p.id))})),query);}
  const stats=await api('/rest/v1/rpc/nufi_manage_overview',{method:'POST',service:true,payload:{}});
  const recipes=recipeSummaries(rows);
  return {counts:{...(stats?.counts||{}),freeRecipes:100,accountRecipes:RECIPES.length-100,heldRecipes:recipes.filter(r=>r.publicationStatus==='held').length,pages:PAGE_DEFINITIONS.length,products:productById.size},recentAudit:stats?.recentAudit||[],configured:{management:true,recipes:env.NUFI_RECIPE_CONTENT_READY==='true'}};
}
function nutrition(value){if(value===null)return null;object(value,'nutrition');const next={};for(const k of ['protein','carbs','fat','calories']){const n=value[k];if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>(k==='calories'?10000:1000))throw new HttpError(400,`Check ${k}, or mark nutrition as needing review.`);next[k]=n;}return next;}
function ingredients(values,current=[]){
  if(!Array.isArray(values)||values.length<1||values.length>80)throw new HttpError(400,'Use 1 to 80 ingredients.');
  return values.map((v,i)=>{object(v,'ingredient');const n=v.quantity;if(n!==null&&(typeof n!=='number'||!Number.isFinite(n)||n<0||n>100000))throw new HttpError(400,`Check ingredient ${i+1} quantity. Keep an unknown quantity empty.`);
    const out={name:plainText(v.name,'ingredient name',200),quantity:n,unit:plainText(v.unit||'','unit',30,{empty:true}),note:plainText(v.note||'','ingredient note',600,{empty:true,multiline:true}),group:plainText(v.group||'Main','ingredient group',80),optional:v.optional===true,aisle:plainText(v.aisle||'Other','aisle',60)};
    for(const k of ['sourceText','sourceUnit','sourceMeasure','alternateMeasure'])if(typeof v[k]==='string')out[k]=plainText(v[k],k,k==='sourceUnit'?30:1000,{empty:true,multiline:true});
    out.scalingMode=oneOf(v.scalingMode|| (n===null?'unquantified':'exact'),['exact','fixed','approximate','unscaled','unquantified','source-range','range','compound','explicit-per-portion-to-batch'], 'ingredient scaling');
    const original=current.find(x=>x.sourceText&&x.sourceText===v.sourceText);
    if(!original||['name','quantity','unit'].some(k=>original[k]!==out[k])){if(original?.sourceText)out.sourceOriginalText=original.sourceText;delete out.sourceText;delete out.alternateMeasure;}
    else {out.sourceText=original.sourceText;out.sourceQuantity=original.sourceQuantity;out.sourceUnit=original.sourceUnit;}
    return out;});
}
export function validateRecipeChanges(input,current){
  object(input);const id=contentId(input.id);if(id!==current.id)throw new HttpError(400,'The recipe changed. Reload it.');
  const version=expectedVersion(input.version);
  if(own(input,'access')&&input.access!==(FREE_RECIPE_IDS.has(id)?'free':'account'))throw new HttpError(400,'The original 100 stay free; imported recipes require an account.');
  const publicationStatus=oneOf(input.publicationStatus,['held','published'],'publication status');
  if(FREE_RECIPE_IDS.has(id)&&publicationStatus!=='published')throw new HttpError(400,'The original 100 recipes must remain available for free.');
  const servings=input.servings;if(typeof servings!=='number'||!Number.isFinite(servings)||servings<0.01||servings>1000)throw new HttpError(400,'Check the recipe servings. Use 0.01 to 1,000.');
  if(!Array.isArray(input.steps)||!input.steps.length||input.steps.length>50)throw new HttpError(400,'Use 1 to 50 method steps.');
  const steps=input.steps.map(s=>plainText(s,'method step',2000,{multiline:true}));
  const nextIngredients=ingredients(input.ingredients,current.ingredients);const nextNutrition=nutrition(input.nutrition);
  const signature=a=>JSON.stringify(a.map(i=>({name:i.name,quantity:i.quantity,unit:i.unit,optional:!!i.optional})));
  const compositionChanged=servings!==current.servings||signature(nextIngredients)!==signature(current.ingredients);
  const nutritionChanged=(nextNutrition===null)!==(current.nutrition===null)||(nextNutrition!==null&&['protein','carbs','fat','calories'].some(k=>nextNutrition[k]!==current.nutrition?.[k]));
  const reviewed=input.nutritionReviewed===true||(!compositionChanged&&!nutritionChanged&&current.nutritionReviewed===true);
  if(nextNutrition!==null&&(compositionChanged||nutritionChanged)&&!reviewed)throw new HttpError(400,'Ingredients, servings or nutrition changed. Confirm a nutrition review and explain its source, or set nutrition to unknown.');
  const nutritionNote=plainText(input.nutritionNote||current.nutritionNote||'','nutrition review note',900,{empty:!reviewed,multiline:true});
  if(reviewed&&nutritionNote.length<12)throw new HttpError(400,'Explain the source of the reviewed nutrition figures.');
  const nutritionStatus=nextNutrition===null?'review-needed':reviewed?'user-entered':current.nutritionStatus||'source-estimate';
  // Only the enumerated editable fields are accepted. Source hashes, printed
  // nutrition and provenance stay in the original table/file, never overwritten.
  return {id,version,payload:{name:plainText(input.name,'recipe name',180),category:oneOf(input.category,['Breakfast','Lunch','Dinner','Snacks','Drinks'],'meal category'),quote:plainText(input.quote||'','recipe introduction',300,{empty:true,multiline:true}),servings,ingredients:nextIngredients,steps,nutrition:nextNutrition,nutritionStatus,nutritionNote,nutritionReviewed:reviewed,publicationStatus,access:FREE_RECIPE_IDS.has(id)?'free':'account'}};
}
export function validateContentChanges(type,input){
  object(input);const id=contentId(input.id),version=expectedVersion(input.version);baseRecord(type,id);
  const publicationStatus=oneOf(input.publicationStatus,['draft','published'],'publication status');let payload;
  if(type==='page')payload={title:plainText(input.title,'page heading',180),intro:plainText(input.intro,'page introduction',1500,{multiline:true}),metaTitle:plainText(input.metaTitle,'browser title',120),metaDescription:plainText(input.metaDescription,'search description',320,{empty:true,multiline:true})};
  else if(type==='product')payload={name:plainText(input.name,'product name',200),description:plainText(input.description,'product description',5000,{multiline:true}),priceLabel:plainText(input.priceLabel||'','price note',160,{empty:true})};
  else payload={siteTitle:plainText(input.siteTitle,'website title',100),announcement:plainText(input.announcement||'','announcement',240,{empty:true}),supportEmail:input.supportEmail?email(input.supportEmail):''};
  return {id,version,payload:{...payload,publicationStatus}};
}
export function validateMemberChanges(input,actor,confirmAdmin){
  object(input);const userId=uuid(input.userId);const firstName=plainText(input.firstName,'first name',80);
  const role=oneOf(input.role,['member','admin'],'role'),status=oneOf(input.status,['active','suspended'],'account status');
  if(userId===actor&&(role!=='admin'||status!=='active'))throw new HttpError(400,'You cannot remove your own administrator access or suspend your own account.');
  if(input.updatedAt!==null&&(typeof input.updatedAt!=='string'||input.updatedAt.length>40||!Number.isFinite(Date.parse(input.updatedAt))))throw new HttpError(400,'Reload this member before saving.');
  return {admin_actor:actor,target:userId,expected_updated_at:input.updatedAt,first_name_value:firstName,role_value:role,status_value:status,confirm_admin:confirmAdmin===true};
}
export async function writeManagement(api,user,input){
  object(input);if(input.action==='update-member'){const payload=validateMemberChanges(input.record,user.id,input.confirmAdmin);const record=await api('/rest/v1/rpc/nufi_manage_update_member',{method:'POST',service:true,payload});return {record};}
  const type={'save-recipe':'recipe','save-page':'page','save-product':'product','save-settings':'settings'}[input.action];if(!type)throw new HttpError(400,'Choose a supported management action.');
  const current=type==='recipe'?await readRecipeRecord(api,contentId(input.record?.id)):null;
  const next=type==='recipe'?validateRecipeChanges(input.record,current):validateContentChanges(type,input.record);
  const row=await api('/rest/v1/rpc/nufi_manage_save_content',{method:'POST',service:true,payload:{admin_actor:user.id,item_type:type,item_id:next.id,expected_version:next.version,next_payload:next.payload}});
  if(!row||row.version!==next.version+1)throw new HttpError(503,'The website service did not confirm the saved version.');
  return {record:type==='recipe'?{...applyRecipeOverlay(current,{payload:next.payload,version:row.version}),...metadata(row)}:{...baseRecord(type,next.id),...next.payload,...metadata(row)}};
}

/** No member details, private ingredients or draft text can pass this projection. */
export function publicContent(rows){
  const pages=[],productRecords=[],recipes=[];let settings=null;
  for(const row of rows){
    if(row.content_type==='recipe'){
      if(!recipeIndex.has(row.id))continue;
      const p=row.payload||{};recipes.push({id:row.id,access:FREE_RECIPE_IDS.has(row.id)?'free':'account',publicationStatus:FREE_RECIPE_IDS.has(row.id)?'published':(p.publicationStatus==='published'?'published':'held'),version:row.version});continue;
    }
    const p=row.published_payload;if(!p||p.publicationStatus!=='published')continue;
    if(row.content_type==='page'&&pageById.has(row.id)){const base=pageById.get(row.id);pages.push({id:row.id,path:base.path,title:p.title,intro:p.intro,metaTitle:p.metaTitle,metaDescription:p.metaDescription,headingSelector:base.headingSelector,introSelector:base.introSelector});}
    if(row.content_type==='product'&&productById.has(row.id))productRecords.push({id:row.id,path:productById.get(row.id).path,name:p.name,description:p.description,priceLabel:p.priceLabel});
    if(row.content_type==='settings'&&row.id==='site')settings={siteTitle:p.siteTitle,announcement:p.announcement,supportEmail:p.supportEmail};
  }
  return {pages,products:productRecords,recipes,settings};
}
