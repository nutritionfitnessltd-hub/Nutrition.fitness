import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { accessFor, defaultAccess, accessFromForm, authorizeStudioRequest, canEditContent } from '../server/library-permissions.mjs';
import { handleLibraryWork } from '../server/library-work.mjs';
import { handleStudio } from '../server/studio.mjs';
import { studioNavigation } from '../server/studio-navigation.mjs';
import { workspaceDashboard } from '../server/studio-dashboard.mjs';
import { library, itemPage, projectPage } from '../server/studio-pages.mjs';
import { bookPage } from '../server/studio-books.mjs';
import { ndaDocument } from './nda-fixture.mjs';

const staff=(access)=>({role:'staff',id:randomUUID(),name:'Test creator',access});
const admin={role:'admin',id:randomUUID()};
const env={NUFI_LIBRARY_CATALOGUE_KEY:'p'.repeat(64)};
const sign=value=>createHmac('sha256',env.NUFI_LIBRARY_CATALOGUE_KEY).update('library-work:v1:'+value).digest('base64url');
function cookie(actor,hash){
  const payload=Buffer.from(JSON.stringify({role:actor.role,id:actor.id,expires:Math.floor(Date.now()/1000)+3600,...(hash?{generation:sign(hash)}:{})})).toString('base64url');
  return '__Host-nufi-library-work='+payload+'.'+sign(payload);
}
function fixture(access=null){
  const person={...staff(access),email:'creator@example.test',code_hash:createHash('sha256').update('fixture-password').digest('hex'),access_revision:1};
  const calls=[],copies=new Map();
  const api=async(path,options={})=>{
    calls.push([path,options]);
    if(path.includes('/rpc/nufi_studio_save')){
      const p=options.payload,current=copies.get(p.item);if((current?.revision||0)!==p.expected)return [];
      const row={id:p.item,payload:structuredClone(p.document),revision:p.expected+1};copies.set(p.item,row);return [structuredClone(row)];
    }
    if(path.includes('nufi_members'))return [{user_id:admin.id}];
    if(path.includes('nufi_library_nda_agreements'))return [ndaDocument];
    if(path.includes('nufi_library_nda_acceptances'))return [{id:'fixture-acceptance'}];
    if(path.includes('nufi_library_staff')){
      if(options.method==='PATCH'){
        if(path.includes('access_revision=eq.')&&!path.includes('access_revision=eq.'+person.access_revision))return [];
        Object.assign(person,options.payload);
      }
      return [person];
    }
    if(path.includes('nufi_library_tasks'))return options.method==='PATCH'?[{id:'task'}]:[];
    if(path.includes('nufi_studio_items')){const id=new URL(path,'https://fixture.test').searchParams.get('id');return id?.startsWith('eq.')?[copies.get(id.slice(3))].filter(Boolean):[...copies.values()];}
    if(path.includes('nufi_library_projects'))return [];
    throw new Error('Unexpected API call '+path);
  };
  async function request(params,actor=person,body=null,existingCookie){
    const headers={},res={setHeader:(key,value)=>headers[key]=value,end(body){this.body=body;}};
    await handleLibraryWork({method:body?'POST':'GET',body,headers:{cookie:existingCookie||cookie(actor,actor.role==='staff'?person.code_hash:null),host:'fixture.test',origin:'https://fixture.test'}},res,{params:new URLSearchParams(params),apiFactory:()=>api,env,load:async()=>({records:[],files:{}})});
    return {...res,headers};
  }
  return {person,request,calls};
}
const forbidden=error=>error.status===403;

test('open copies update selected permissions and follow subsequently saved access changes',async()=>{
 const f=fixture({library:false,work:true});
 const fields={staff:f.person.id,accessVersion:'1',access_work:'1'};
 const created=await f.request({studio:'account-preview'},admin,fields);
 const params=new URL(created.headers.Location,'https://fixture.test').searchParams;
 const updated=await f.request({studio:'account-preview'},admin,{...fields,accountPreviewId:params.get('accountPreview'),access_library:'1'});
 assert.equal(updated.headers.Location,created.headers.Location);
 params.set('studio','library');assert.equal((await f.request(params,admin)).statusCode,200);
 assert.equal(f.person.access.library,false);
 f.person.access={work:true,library:false};f.person.access_revision++;
 params.set('copyStatus','1');
 const status=await f.request(params,admin);assert.equal(status.statusCode,200);assert.equal(JSON.parse(status.body).access.library,false);
 params.delete('copyStatus');assert.equal((await f.request(params,admin)).statusCode,403);
});

test('admin opens a navigable working copy with selected permissions without changing the account',async()=>{
 const f=fixture({library:true,work:false}),body={action:'save-access',previewAccount:'yes',staff:f.person.id,accessRevision:'1',accessVersion:'1',access_work:'1',access_edit:'1'};
 const team=await f.request({studio:'team'},admin);
 assert.match(team.body,/data-account-preview/);assert.match(team.body,/formtarget="_blank"/);assert.match(team.body,/studio=account-preview/);
 const result=await f.request({studio:'account-preview'},admin,body);
 assert.equal(result.statusCode,303);
 const params=new URL(result.headers.Location,'https://fixture.test').searchParams;
 const page=await f.request(params,admin);
 assert.equal(page.statusCode,200);assert.match(page.body,/Welcome back, Test creator/);assert.match(page.body,/>Projects</);
 assert.doesNotMatch(page.body,/Preview: Test creator|Read-only landing-page preview|account-preview-notice|>Team<|>Settings</);
 assert.match(page.body,/href="[^"]*accountPreview=/);assert.equal(page.headers['Set-Cookie'],undefined);
 params.set('studio','projects');assert.equal((await f.request(params,admin)).statusCode,200);
 params.set('studio','library');assert.equal((await f.request(params,admin)).statusCode,403);
 params.set('studio','team');assert.equal((await f.request(params,admin)).statusCode,403);
 assert.equal((await f.request(params,f.person)).statusCode,403);
 const closed=await f.request(params,admin,{action:'work-logout'});assert.equal(closed.headers['Set-Cookie'],undefined);
 assert.equal(f.person.access.library,true);assert.equal(f.person.access.work,false);
 assert.ok(f.calls.filter(([,o])=>o.method&&o.method!=='GET').every(([p,o])=>p.includes('nufi_studio_save')&&o.payload.item.startsWith('studio:account-preview:')));
});
test('account preview rejects staff access, invalid permission fields and GET requests',async()=>{
 const f=fixture(),body={staff:f.person.id,accessVersion:'1',access_work:'1'};
 assert.equal((await f.request({studio:'account-preview'},f.person,body)).statusCode,403);
 assert.equal((await f.request({studio:'account-preview'},admin,{...body,access_admin:'1'})).statusCode,400);
 assert.equal((await f.request({studio:'account-preview'},admin)).statusCode,405);
});
test('disabled account can be previewed without enabling it and permission dependencies still apply',async()=>{
 const f=fixture();f.person.code_hash=null;
 const result=await f.request({studio:'account-preview'},admin,{staff:f.person.id,accessVersion:'1',access_studio:'1',access_ai:'1'});
 assert.equal(result.statusCode,303);
 const page=await f.request(new URL(result.headers.Location,'https://fixture.test').searchParams,admin);
 assert.equal(page.statusCode,200);assert.match(page.body,/Welcome back, Test creator/);assert.doesNotMatch(page.body,/>Content Studio<|>Content Library</);assert.equal(f.person.code_hash,null);
});

test('access is explicit, dependency-aware, and never grants administrator functions',()=>{
  assert.deepEqual(accessFor(staff()),defaultAccess);
  assert.deepEqual(accessFor(staff(null)),defaultAccess);
  for(const value of [{},[],false,'all',{library:'true',ai:true}])assert.equal(accessFor(staff(value)).library,false);
  const access=accessFromForm({accessVersion:'1',access_studio:'1',access_ai:'1',access_sources:'1'});
  assert.equal(access.studio,false);assert.equal(access.ai,false);assert.equal(access.sources,false);
  assert.throws(()=>accessFromForm({accessVersion:'1',access_admin:'1'}));
  assert.throws(()=>accessFromForm({accessVersion:'1',access_library:['1']}));
  assert.throws(()=>accessFromForm({access_library:'1'}));
  for(const section of ['team','settings','standards','nda','unknown'])assert.throws(()=>authorizeStudioRequest(staff(),section,'GET'),forbidden);
});

test('denied sections and writes are rejected before any catalogue or AI access',async()=>{
  const actor=staff({library:true});let reads=0;
  for(const [section,action] of [['archive'],['create'],['projects'],['export'],['item','content-save'],['home','ai-draft'],['home','task-save'],['home','import-save'],['home','unknown-action']]){
    const res={setHeader(){},end(body){this.body=body;}};
    await handleStudio({method:action?'POST':'GET',body:action?{action}:undefined},res,{params:new URLSearchParams({studio:section}),actor,env:{},api:async()=>{reads++;return [];},load:async()=>{reads++;return {records:[]};}});
    assert.equal(res.statusCode,403,section+' '+action);
  }
  assert.equal(reads,0);
  const writer=staff({...defaultAccess,ai:false});
  assert.throws(()=>authorizeStudioRequest(writer,'item','POST',{action:'mealplan-image-generate'}),forbidden);
  authorizeStudioRequest(writer,'item','POST',{action:'content-save'});
  const data={actor:writer,assigned:new Set(['own'])};
  assert.equal(canEditContent(data,'own'),true);assert.equal(canEditContent(data,'someone-else'),false);
});

test('administrator saves access with conflict protection and revocation affects an existing cookie',async()=>{
  const f=fixture(),existing=cookie(f.person,f.person.code_hash);
  assert.equal((await f.request({studio:'library'},f.person,null,existing)).statusCode,200);
  const form={action:'save-access',staff:f.person.id,accessVersion:'1',accessRevision:'1',access_work:'1'};
  assert.equal((await f.request({studio:'team'},f.person,form)).statusCode,403);
  const saved=await f.request({studio:'team'},admin,form);
  assert.equal(saved.statusCode,303);assert.equal(f.person.access_revision,2);
  assert.equal(f.person.access_updated_by,admin.id);
  assert.equal((await f.request({studio:'library'},f.person,null,existing)).statusCode,403);
  assert.equal((await f.request({studio:'projects'},f.person,null,existing)).statusCode,200);
  assert.equal((await f.request({assets:'catalogue:one'},f.person,null,existing)).statusCode,403);
  assert.equal((await f.request({assignments:'1'},f.person,{action:'update',id:randomUUID(),revision:'1',status:'In progress'},existing)).statusCode,403);
  assert.equal((await f.request({studio:'team'},admin,form)).statusCode,409);
  assert.equal(f.person.access_revision,2);
  const page=(await f.request({studio:'team'},admin)).body;
  for(const label of ['Set access for Test creator','Content library','AI drafting','Save access'])assert.ok(page.includes(label));
  f.person.code_hash=null;
  assert.equal((await f.request({studio:'home'},f.person,null,existing)).statusCode,401);
});

test('restricted menus and dashboard omit disabled features; reading does not expose editing',()=>{
  const actor=staff({library:true}),record={id:'book:one',kind:'ebook',title:'Test book',status:'Draft',revision:1,fields:{bookType:'Guide'},bookAssets:{digital:{},front:{}}};
  const data={actor,assigned:new Set([record.id]),items:[record],byId:new Map([[record.id,record]]),tasks:[],projects:[],people:[],index:{records:[],files:{}}};
  const nav=studioNavigation('home',actor).html;
  assert.match(nav,/Content Library/);assert.doesNotMatch(nav,/>Originals<|>Studio<|>Work<|>Settings</);
  const dashboard=workspaceDashboard(data);
  assert.doesNotMatch(dashboard,/studio=create|studio=projects|studio=archive/);
  assert.doesNotMatch(library(new URLSearchParams(),data),/Create content/);
  const book=bookPage(record,data);
  assert.match(book,/studio-book-reader/);assert.doesNotMatch(book,/Edit book details/);
  const edit=itemPage(new URLSearchParams({id:record.id,tab:'edit'}),data);
  assert.doesNotMatch(edit,/id="studio-editor"|Draft with AI/);
  data.projects=[{id:'project',name:'Read-only project',brief:'Read this',status:'In progress',weeks:4,entries:[{week:1,title:'Write something',notes:'Test',status:'To do'}]}];
  assert.doesNotMatch(projectPage(new URLSearchParams({project:'project'}),data),/Update task|Add work|project-save/);
});
