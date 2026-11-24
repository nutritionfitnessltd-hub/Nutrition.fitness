import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { changeStudio } from '../server/studio-actions.mjs';
import { canonical, blankFields } from '../server/studio-model.mjs';
import { handleStudio } from '../server/studio.mjs';
import { itemPage, newItem } from '../server/studio-pages.mjs';
import { videoTools } from '../server/studio-editor.mjs';

const actor={role:'admin',id:randomUUID(),name:'Editor'};
function fixture(){
 const r={...canonical({id:'training:copy',kind:'campaign',title:'Marketing copy',fields:{...blankFields('campaign'),headline:'Headline',body:'Previously saved text'}}),revision:3};
 return {actor,items:[r],byId:new Map([[r.id,r]]),people:[],projects:[],assigned:new Set([r.id])};
}
const params=new URLSearchParams({id:'training:copy'});
const save=(data,extra={})=>({action:'content-save',revision:3,title:'Edited title',fields:JSON.stringify({...data.items[0].fields,body:'The text I just checked'}),intent:'approve',...extra});
test('save and check commits current fields and approval in one revision',async()=>{
 const data=fixture(),calls=[];
 const next=await changeStudio(params,save(data),data,async(path,options)=>{calls.push({path,...options});return [{revision:4}];});
 assert.equal(calls.length,1);
 const {document,expected}=calls[0].payload;
 assert.equal(document.fields.body,'The text I just checked');
 assert.equal(document.title,'Edited title');assert.equal(document.status,'Approved');
 assert.equal(expected,3);assert.equal(document.approval.revision,4);
 assert.equal(next.tab,'preview');
});
test('checking validates the posted text and never writes a blank or stale draft',async()=>{
 const data=fixture(),noWrite=async()=>assert.fail('Invalid request must not write');
 await assert.rejects(changeStudio(params,save(data,{fields:JSON.stringify({...data.items[0].fields,headline:'',body:''})}),data,noWrite),e=>e.status===400);
 await assert.rejects(changeStudio(params,save(data,{revision:2}),data,noWrite),e=>e.status===409);
});
test('staff can save for checking but cannot mark their own content checked',async()=>{
 const data=fixture();data.actor={...actor,role:'staff'};
 await assert.rejects(changeStudio(params,save(data),data,async()=>assert.fail()),e=>e.status===403);
 let document;
 await changeStudio(params,save(data,{intent:'review'}),data,async(_,opts)=>{document=opts.payload.document;return [{}];});
 assert.equal(document.status,'In review');assert.equal(document.fields.body,'The text I just checked');
});
test('a new draft saves its content immediately and keeps unfamiliar fields',async()=>{
 const data=fixture();let document;
 const fields={...blankFields('campaign'),body:'New draft text',editorialNote:'Keep this saved metadata'};
 const next=await changeStudio(new URLSearchParams(),{action:'content-create',id:randomUUID(),kind:'campaign',title:'New campaign',fields:JSON.stringify(fields),intent:'preview'},data,async(_,opts)=>{document=opts.payload.document;return [{}];});
 assert.deepEqual(document.fields,fields);assert.equal(next.tab,'preview');assert.equal(document.status,'Draft');
 assert.match(newItem(new URLSearchParams({kind:'campaign'}),data),/id="studio-editor" data-kind="campaign"/);
});
test('failed checking retains text and review note in the same editor',async()=>{
 const data=fixture(),r=data.items[0],f=save(data,{title:'Unsaved title',fields:JSON.stringify({...r.fields,body:'',headline:''}),feedback:'Keep this note'});
 const api=async path=>path.includes('nufi_studio_items')?[{id:r.id,payload:r,revision:3}]:[];
 const res={setHeader(){},end(body){this.body=body;}};
 await handleStudio({method:'POST',body:f},res,{params:new URLSearchParams({studio:'item',id:r.id}),actor,api,load:async()=>({records:[],files:{}}),env:{}});
 assert.equal(res.statusCode,400);assert.match(res.body,/Unsaved title/);assert.match(res.body,/Keep this note/);
 assert.match(res.body,/data-unsaved="true"/);assert.doesNotMatch(res.body,/All changes saved/);
});
test('one editor has save actions together and no separate check form',()=>{
 const data=fixture(),preview=itemPage(params,data);
 assert.match(preview,/document-reader document-sheet/);assert.doesNotMatch(preview,/id="studio-editor-form"/);
 const html=itemPage(new URLSearchParams({id:'training:copy',tab:'edit'}),data);
 const editor=html.match(/<form[^>]*id="studio-editor-form"[\s\S]*?<\/form>/)[0];
 for(const value of ['draft','preview'])assert.ok(editor.includes('value="'+value+'"'));
 assert.doesNotMatch(editor,/value="(?:approve|review)"/);
 assert.match(editor,/Preview for approval/);
 assert.doesNotMatch(html,/<h2>Review<\/h2>|name="status"[^]*value="Approved"/);
});
test('video controls copy only a real script and report unknown duration honestly',()=>{
 const html=videoTools({fields:{videoUrl:'https://example.test/video',script:'Actual narration',durationSeconds:125}});
 assert.match(html,/Copy script/);assert.match(html,/Video length: 2:05/);
 assert.match(html,/<textarea hidden data-script-text>Actual narration<\/textarea>/);
 const missing=videoTools({fields:{videoUrl:'https://example.test/video',body:'Lesson text is not a script'}});
 assert.match(missing,/Script not added/);assert.match(missing,/Video length not recorded/);assert.doesNotMatch(missing,/data-copy-script/);
});
