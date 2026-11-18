import test from 'node:test';
import assert from 'node:assert/strict';
import {knowledgeDocument,knowledgeArticle,cleanArticleBody,imageCaption} from '../server/knowledge-article.mjs';
import {itemPage,library} from '../server/studio-pages.mjs';
import {handleStudio} from '../server/studio.mjs';
import {draftDocument,draftResult} from '../server/worker-drafts.mjs';
const article={id:'sample',kind:'article',title:'Vitamin D questions',status:'Draft',revision:1,fields:{body:':::writing{title="Vitamin D questions"}\n# Vitamin D questions\n\n## A useful question\n\nRead **the evidence**.\n\n:::',marginNote:'Look a little closer.',imageUrl:'/assets/photos/knowledge-1.jpg',imageCredit:'Fixture photographer'}};
const fixture=()=>({actor:{role:'admin',id:'owner'},items:[article],byId:new Map([[article.id,article]]),assigned:new Set(),projects:[],tasks:[],people:[]});
test('private preview uses Knowledge Centre styles and captions without chat wrappers or duplicated title',()=>{
 const html=knowledgeDocument(article,{preview:true,image:'/private-photo'});
 assert.match(html,/Private preview/);assert.match(html,/knowledge-centre.css/);assert.doesNotMatch(html,/fonts.googleapis/);
 assert.match(html,/class="kc-photo-note">Look a little closer/);assert.match(html,/<h3>A useful question/);assert.match(html,/<strong>the evidence/);
 assert.doesNotMatch(html,/:::writing|title=&quot;Vitamin/);assert.equal((html.match(/<h1>/g)||[]).length,1);
 const unsafe=knowledgeArticle({...article,fields:{body:'<script>alert(1)</script>\n\n[bad](javascript:alert(1))',marginNote:'<img onerror=bad>'}},'/photo');
 assert.doesNotMatch(unsafe,/<script|<img onerror|href="javascript:/);
 assert.equal(imageCaption({...article,fields:{marginNote:''}}),'');assert.equal(cleanArticleBody('Original plain text','Other'),'Original plain text');
});
test('editor and library link the saved draft to its private preview and show a Kalam caption',()=>{
 const data=fixture(),html=itemPage(new URLSearchParams({id:'sample',tab:'preview'}),data);
 assert.match(html,/<iframe[^>]+Knowledge Centre article preview/);assert.match(html,/knowledge-document/);
 assert.match(itemPage(new URLSearchParams({id:'sample',tab:'edit'}),data),/Preview in Knowledge Centre/);
 assert.match(library(new URLSearchParams({kind:'article'}),data),/studio-photo-caption/);
});
test('preview requests read the saved draft without writes and remain scoped to assigned staff',async()=>{
 const data=fixture();let writes=0;const api=async(path,o)=>{if(o?.method==='POST')writes++;return path.includes('nufi_studio_items')?[{id:article.id,payload:article,revision:1}]:[];};
 const res=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}});
 const options={params:new URLSearchParams({studio:'item',id:'sample',tab:'knowledge-document'}),actor:data.actor,api,load:async()=>({records:[]}),env:{}};
 let redirected=res();await handleStudio({method:'GET'},redirected,{...options,params:new URLSearchParams({studio:'item',id:'sample',tab:'preview'})});assert.equal(redirected.statusCode,303);assert.match(redirected.headers.Location,/tab=knowledge-document/);
 let output=res();await handleStudio({method:'GET'},output,options);assert.equal(output.statusCode,200);assert.match(output.body,/Private preview/);assert.equal(output.headers['Cache-Control'],'private, no-store');assert.equal(writes,0);
 output=res();await handleStudio({method:'GET'},output,{...options,actor:{role:'staff',id:'unassigned'}});assert.equal(output.statusCode,403);assert.doesNotMatch(output.body,/Fixture photographer/);
});
test('future returned drafts always route to a worker, preserve assignment and cannot approve themselves',()=>{
 for(const [kind,workerId] of [['article','nina'],['email','nina'],['course','imogen'],['lesson','imogen'],['programme','marcus'],['video','rory'],['asset','rory']]){
  const input={id:'delivery-'+kind,kind,title:'Delivery',body:'Saved body',revision:0},record=draftDocument(input,null,'worker:test:');
  assert.equal(record.workerId,workerId);assert.equal(record.status,'Draft');assert.equal(draftResult({payload:record,revision:1},'https://team.nutrition.fitness').workerId,workerId);
  const next=draftDocument({...input,revision:1}, {payload:{...record,workerId:'rory'},revision:1},'worker:test:');assert.equal(next.workerId,'rory');
 }
 const input={id:'explicit',kind:'article',title:'Delivery',body:'Saved body',revision:0,fields:{workerId:'imogen'}};
 assert.equal(draftDocument(input,null,'worker:test:').workerId,'imogen');
 assert.throws(()=>draftDocument({...input,fields:{workerId:'unknown'}},null,'worker:test:'),/fields.workerId/);
});

test('editorial preface and embedded chat citations do not leak into the public article body',()=>{const raw='EDITORIAL WORKFLOW STATUS: private\n\n**Proposed title:** Example\n\n:::writing{title="Example"}\n# Example\n\nArticle prose.\n:::\n\n### Sources checked today\n\n- [Source](https://example.test) \uE200genui\uE202{"citation":{}}\uE201\n\n### Proposed real hero photograph\nImage metadata';const text=cleanArticleBody(raw,'Example');assert.match(text,/Article prose/);assert.match(text,/Sources checked/);assert.doesNotMatch(text,/EDITORIAL|Proposed|Image metadata|genui|writing/);});
