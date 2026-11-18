import test from 'node:test';
import assert from 'node:assert/strict';
import {draftDocument,draftResult,workerKinds} from '../server/worker-drafts.mjs';
import {studioData} from '../server/studio-store.mjs';
import {changeStudio} from '../server/studio-actions.mjs';
import {publicationPanel,publishStudio,publishedContent,releaseEnvironment,markdownArticle} from '../server/studio-publishing.mjs';
import {editorForm} from '../server/studio-editor.mjs';
const namespace='worker:content-manager:',input={id:'nina-article',title:'An article',body:'Original text\n\n## A section\n\nResearch stays unchanged.',kind:'article',revision:0,assetUrls:['https://unsplash.com/photos/example']};
test('worker records use the website store and keep text, source and proposed image links intact',async()=>{
 const document=draftDocument(input,null,namespace),row={id:document.id,payload:document,revision:1,updated_at:'2026-11-18'};
 const data=await studioData(async path=>path.includes('nufi_studio_items')?[row]:[],{role:'admin',id:'admin'},async()=>({records:[]}));
 assert.equal(data.items[0].fields.body,input.body);assert.equal(data.items[0].status,'Draft');
 assert.equal(draftResult(row,'https://website.test').body,input.body);assert.match(draftResult(row,'https://website.test').reviewUrl,/studio=item/);
 assert.deepEqual(data.items[0].fields.assetUrls,input.assetUrls);
});
test('website edits and release metadata survive; stale workers and forged approval cannot overwrite them',()=>{
 const previous={payload:{...draftDocument(input,null,namespace),fields:{body:'Human edit',imageAlt:'Chosen caption',custom:'Keep'},approval:{by:'human'},publication:{status:'published'}},revision:2};
 assert.throws(()=>draftDocument({...input,revision:1},previous,namespace),e=>e.status===409);
 const next=draftDocument({...input,revision:2,status:'Approved',approval:{by:'worker'},publication:{status:'published'}},previous,namespace);
 assert.equal(next.status,'Draft');assert.equal(next.approval,undefined);assert.equal(next.fields.custom,'Keep');assert.equal(next.fields.imageAlt,'Chosen caption');assert.deepEqual(next.publication,previous.payload.publication);
 assert.throws(()=>draftDocument({...input,id:'../another'},null,namespace));
 assert.throws(()=>draftDocument({...input,assetUrls:['javascript:alert(1)']},null,namespace));
});
test('newsletters, recipes, courses, programmes and video assets share the draft workflow',()=>{
 for(const kind of workerKinds){const record=draftDocument({...input,kind,fields:{introduction:'Context'}},null,namespace);assert.equal(record.status,'Draft');assert.equal(record.fields.introduction,'Context');}
 const recipe=draftDocument({...input,kind:'recipe',ingredients:['Oats'],method:['Cook'],servings:2},null,namespace);assert.deepEqual(recipe.fields.instructions,['Cook']);assert.equal(recipe.fields.sourceText,input.body);
 const newsletter={...draftDocument({...input,kind:'newsletter'},null,namespace),revision:1};const data={actor:{role:'admin'},projects:[]};
 assert.match(editorForm(newsletter,data),/Submit for Approval/);assert.doesNotMatch(editorForm(newsletter,data),/value="approve"/);
 assert.match(editorForm({...newsletter,status:'In review'},data),/Approve content/);
});
function fixture(){const record={...draftDocument(input,null,namespace),revision:1};const actor={role:'admin',id:'human'};return {record,data:{actor,byId:new Map([[record.id,record]]),items:[record],assigned:new Set([record.id]),projects:[],releases:[]},params:new URLSearchParams({id:record.id})};}
test('submit for approval and approval are separate and preserve the saved article',async()=>{
 const {record,data,params}=fixture();let saved;const api=async(_,o)=>{saved=o.payload.document;return [{revision:o.payload.expected+1}];};
 const form=editorForm(record,data);assert.match(form,/Submit for Approval/);assert.doesNotMatch(form,/value="approve"/);
 await changeStudio(params,{action:'content-save',intent:'review',revision:1,title:record.title,fields:JSON.stringify(record.fields)},data,api);
 assert.equal(saved.status,'In review');assert.equal(saved.fields.body,input.body);
 const review={...saved,revision:2};data.byId.set(record.id,review);data.items=[review];assert.match(editorForm(review,data),/Approve content/);
 await changeStudio(params,{action:'content-save',intent:'approve',revision:2,title:record.title,fields:JSON.stringify(record.fields)},data,api);
 assert.equal(saved.status,'Approved');assert.equal(saved.approval.revision,3);
});
test('release requires admin, current approval and explicit final approval',async()=>{
 const {record,data,params}=fixture();let writes=0;const api=async()=>{writes++;return [];};
 await assert.rejects(()=>publishStudio(params,{action:'publish-test',revision:1},data,api));
 record.status='Approved';record.approval={revision:1};
 await assert.rejects(()=>publishStudio(params,{action:'publish-live',revision:1},data,api),/final approval/);
 await assert.rejects(()=>publishStudio(params,{action:'publish-test',revision:0},data,api),/changed/);
 await assert.rejects(()=>publishStudio(params,{action:'publish-test',revision:1},{...data,actor:{role:'staff'}},api));assert.equal(writes,0);
 await publishStudio(params,{action:'publish-test',revision:1},data,api);assert.equal(writes,1);
 assert.doesNotMatch(publicationPanel(record,data),/finalApproval/);
 data.releases=[{item_id:record.id,environment:'test',source_revision:1}];assert.doesNotMatch(publicationPanel(record,data),/finalApproval/);data.livePublishingReady=true;assert.match(publicationPanel(record,data),/finalApproval/);
});
test('test and live pages read separate snapshots and never expose unsaved drafts',async()=>{
 assert.equal(releaseEnvironment({headers:{host:'nutrition-fitness-website-2.vercel.app'}}),'test');assert.equal(releaseEnvironment({headers:{host:'nutrition.fitness'}}),'live');assert.throws(()=>releaseEnvironment({headers:{host:'unrelated.test'}}));
 const {record}=fixture(),paths=[],res={setHeader(){},end(v){this.body=v;}};
 await publishedContent({headers:{host:'nutrition.fitness'}},res,new URLSearchParams({view:'studio-release',id:record.id}),async p=>{paths.push(p);return [{payload:{...record,fields:{body:'Reviewed snapshot'}}}];});
 assert.match(paths[0],/environment=eq.live/);assert.match(res.body,/Reviewed snapshot/);assert.doesNotMatch(res.body,/Original text/);
 assert.doesNotMatch(markdownArticle('<img src=x onerror=alert(1)>\n\n[bad](javascript:alert(1))'),/<img|href="javascript:/);
});
