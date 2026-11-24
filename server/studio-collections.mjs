import {createHash} from 'node:crypto';
import {HttpError} from './platform.mjs';
import {canReadContent,canEditContent,canAccess} from './library-permissions.mjs';
import {saveRecord} from './studio-store.mjs';
import {isNewsletterContent} from './studio-newsletters.mjs';
import {esc,url,heading,button,hidden,select,form,badge} from './studio-ui.mjs';
export const collectionKinds=new Set(['theme','course','programme','programme-family','ebook','challenge']);
export const supportKinds=new Set(['campaign','communication','asset','mealplan']);
const labels={theme:'Theme',course:'Course',programme:'Programme','programme-family':'Programme',ebook:'Book or guide',challenge:'Challenge',campaign:'Marketing',communication:'Messages & email',asset:'Images & files',mealplan:'Meal plans',lesson:'Lessons',recipe:'Recipes'};
const visible=(data,r)=>r&&r.status!=='Archived'&&canReadContent(data,r);
const find=(data,id)=>data.byId.get(id)||data.byId.get('training:'+id);
export function collectionParents(record,data,seen=new Set()){
 if(!record||seen.has(record.id))return [];seen.add(record.id);const found=new Set();
 for(const id of [record.collectionId,record.themeId,record.fields?.courseId,record.fields?.programmeId,record.fields?.bookId,record.fields?.challengeId,record.fields?.themeId,record.fields?.production?.courseId]){const r=find(data,id);if(visible(data,r)&&collectionKinds.has(r.kind)&&r.id!==record.id)found.add(r.id);}
 for(const id of [record.parent,record.fields?.launchPackId]){const parent=find(data,id);if(!visible(data,parent))continue;if(collectionKinds.has(parent.kind))found.add(parent.id);else for(const root of collectionParents(parent,data,seen))found.add(root);}
 for(const link of data.collectionLinks||[]){if(link.contentId===record.id){const r=find(data,link.collectionId);if(visible(data,r)&&collectionKinds.has(r.kind))found.add(r.id);}}
 return [...found];
}
export function collectionChoices(data,r={}){return Object.fromEntries(data.items.filter(p=>p.id!==r.id&&collectionKinds.has(p.kind)&&visible(data,p)).map(p=>[p.id,(labels[p.kind]||p.kind)+' · '+p.title]));}
export function collectionPlacementFields(record,data){
 return '<fieldset class="editor-details"><legend>Organise content</legend>'+hidden('organisationVersion','1')+select('collectionId','Collection (optional)',{'':'Shared / not assigned yet',...collectionChoices(data,record)},record.collectionId||'')+select('themeId','Theme (optional)',{'':'No additional theme',...Object.fromEntries(data.items.filter(r=>r.kind==='theme'&&r.id!==record.id&&visible(data,r)).map(r=>[r.id,r.title]))},record.themeId||'')+'</fieldset>';
}
export function applyCollectionPlacement(record,f,data){
 if(f.organisationVersion!=='1')return record;
 for(const key of ['collectionId','themeId']){const id=f[key]||'';if(id){const parent=find(data,id);if(!visible(data,parent)||!collectionKinds.has(parent.kind)||key==='themeId'&&parent.kind!=='theme'||parent.id===record.id)throw new HttpError(400,'Choose an available collection or theme.');const queue=[parent],seen=new Set();while(queue.length){const next=queue.pop();if(next.id===record.id)throw new HttpError(400,'Collections cannot contain themselves.');if(seen.has(next.id))continue;seen.add(next.id);queue.push(...collectionParents(next,data).map(id=>find(data,id)).filter(Boolean));}}record[key]=id;}
 return record;
}
const entryLink=r=>url(collectionKinds.has(r.kind)?'collection':'item',{id:r.id});
function contentCards(rows){return rows.length?'<div class="studio-content-grid">'+rows.map(r=>'<a class="studio-content-card" href="'+entryLink(r)+'"><div><small>'+esc(labels[r.kind]||r.kind)+'</small><h2>'+esc(r.title)+'</h2>'+badge(r.status)+'</div></a>').join('')+'</div>':'<p class="studio-empty">Nothing filed here yet.</p>';}
export function supportingLibrary(params,data,kind){
 const rows=data.items.filter(r=>r.kind===kind&&visible(data,r)&&!(kind==='communication'&&isNewsletterContent(r)));
 const groups=new Map(),loose=[];for(const r of rows){const roots=collectionParents(r,data);if(!roots.length)loose.push(r);for(const id of roots){if(!groups.has(id))groups.set(id,[]);groups.get(id).push(r);}}
 if(params.get('view')==='loose')return button('← Collections',url('library',{kind}))+heading(labels[kind]+' · Needs organising','Choose the course, programme, book, challenge or theme each item belongs to.')+loose.map(r=>'<section class="panel"><h2><a href="'+entryLink(r)+'">'+esc(r.title)+'</a></h2>'+badge(r.status)+(canEditContent(data,r.id)?form('collection-link',hidden('contentId',r.id)+select('collectionId','File under',{'':'Choose a collection',...collectionChoices(data,r)},''),{section:'collection'},'Add to collection'):'')+'</section>').join('');
 return heading(labels[kind]||kind,'Open a collection to see its related content.')+'<div class="studio-cards">'+[...groups].map(([id,items])=>{const parent=find(data,id);return '<a class="studio-card" href="'+url('collection',{id,part:kind})+'"><small>'+esc(labels[parent.kind])+'</small><h2>'+esc(parent.title)+'</h2><p>'+items.length+' '+esc((labels[kind]||'content').toLowerCase())+' items</p></a>';}).join('')+(loose.length?'<a class="studio-card" href="'+url('library',{kind,view:'loose'})+'"><h2>Needs organising</h2><p>'+loose.length+' items without a collection</p></a>':'')+'</div>'+(!rows.length?'<p class="studio-empty">No content here yet.</p>':'');
}
export function collectionPage(params,data){
 const root=find(data,params.get('id'));if(!visible(data,root)||!collectionKinds.has(root.kind))throw new HttpError(404,'This collection is unavailable.');
 const items=data.items.filter(r=>r.id!==root.id&&visible(data,r)&&collectionParents(r,data).includes(root.id));
 const part=params.get('part')||'',groups=[['','All content'],['theme','Themes'],['course','Courses'],['programme','Programmes'],['ebook','Books & guides'],['challenge','Challenges'],['mealplan','Meal plans'],['campaign','Marketing'],['communication','Messages & email'],['asset','Images & files'],['lesson','Lessons'],['recipe','Recipes']];
 const shown=part?items.filter(r=>r.kind===part):items;
 const linkable=data.items.filter(r=>r.id!==root.id&&r.kind!=='settings'&&visible(data,r)&&!collectionParents(r,data).includes(root.id)&&(canEditContent(data,root.id)||canEditContent(data,r.id)));
 const removable=(data.collectionLinks||[]).filter(link=>link.collectionId===root.id&&visible(data,find(data,link.contentId))&&(canEditContent(data,root.id)||canEditContent(data,link.contentId)));
 return button('← Content Library',url('library'))+heading(root.title,labels[root.kind]+' · '+(root.fields?.introduction||'Keep the content and supporting material together.'),button('Open overview',url('item',{id:root.id})))+
 '<nav class="tabs" aria-label="Collection content">'+groups.filter(([kind])=>!kind||items.some(r=>r.kind===kind)||['mealplan','campaign','communication','asset'].includes(kind)).map(([kind,label])=>'<a href="'+url('collection',{id:root.id,part:kind})+'"'+(part===kind?' aria-current="page"':'')+'>'+esc(label)+' ('+(kind?items.filter(r=>r.kind===kind).length:items.length)+')</a>').join('')+'</nav>'+contentCards(shown)+
 (canAccess(data.actor,'edit')&&linkable.length?'<details class="panel"><summary>Add existing content</summary>'+form('collection-link',hidden('collectionId',root.id)+select('contentId','Content to include',{'':'Choose existing content',...Object.fromEntries(linkable.filter(r=>canEditContent(data,root.id)||canEditContent(data,r.id)).map(r=>[r.id,(labels[r.kind]||r.kind)+' · '+r.title]))},''),{section:'collection',id:root.id},'Add to collection')+'</details>':'')+
 (removable.length?'<details class="panel"><summary>Manage collection links</summary>'+removable.map(link=>form('collection-link',hidden('collectionId',root.id)+hidden('contentId',link.contentId)+hidden('remove','yes')+'<p>'+esc(find(data,link.contentId).title)+'</p>',{section:'collection',id:root.id},'Remove from collection')).join('')+'</details>':'')+
 (canAccess(data.actor,'studio')?'<div class="studio-actions">'+[['campaign','Create marketing'],['communication','Create message'],['mealplan','Create meal plan'],['asset','Create asset']].map(([kind,label])=>button(label,url('new',{kind,collectionId:root.id}))).join('')+'</div>':'');
}
export function collectionHeader(record,data){
 const roots=collectionParents(record,data);return (roots.length?'<nav class="studio-actions" aria-label="Filed under">'+roots.map(id=>button(find(data,id).title,url('collection',{id}))).join('')+'</nav>':'')+(collectionKinds.has(record.kind)?'<p>'+button('Related content',url('collection',{id:record.id}))+'</p>':'');
}
export async function linkCollection(f,data,api){
 const root=find(data,f.collectionId),child=find(data,f.contentId);
 if(!visible(data,root)||!collectionKinds.has(root.kind)||!visible(data,child)||root.id===child.id)throw new HttpError(400,'Choose an available collection and content item.');
 if(!canAccess(data.actor,'edit')||!canEditContent(data,root.id)&&!canEditContent(data,child.id))throw new HttpError(403,'You can organise only your assigned work or your own content.');
 const queue=[root],seen=new Set();while(queue.length){const next=queue.pop();if(next.id===child.id)throw new HttpError(400,'Collections cannot contain themselves.');if(seen.has(next.id))continue;seen.add(next.id);queue.push(...collectionParents(next,data).map(id=>find(data,id)).filter(Boolean));}
 const id='studio:collection-link:'+createHash('sha256').update(root.id+'\n'+child.id).digest('hex'),[old]=await api('/rest/v1/nufi_studio_items?id=eq.'+id+'&select=payload,revision',{service:true});
 const active=f.remove!=='yes';if(old?.payload.fields?.active===active)return root.id;
 if(!active&&!old)throw new HttpError(400,'This relationship comes from the original content structure.');
 await saveRecord(api,data.actor,{id,kind:'settings',title:'Content collection link',status:'Draft',fields:{libraryCollectionLink:true,active,collectionId:root.id,contentId:child.id},linkedBy:data.actor.id},old?.revision||0);
 return root.id;
}

