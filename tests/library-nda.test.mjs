import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {Writable} from 'node:stream';
import {createLibraryReader} from '../server/library-reader.mjs';
import {ndaVersion,ndaHash,ndaText,ndaDocument} from './nda-fixture.mjs';

function fixtureImage(){const b=Buffer.alloc(30);b.write('RIFF');b.writeUInt32LE(22,4);b.write('WEBPVP8X',8);b.writeUInt32LE(10,16);b.writeUIntLE(639,24,3);b.writeUIntLE(399,27,3);return 'data:image/webp;base64,'+b.toString('base64');}
function fixture(){
  const staffId=randomUUID(),adminId=randomUUID(),receipts=[],calls=[];
  const password='fixture-password-for-nda-only';
  let outage=false,loads=0,document={...ndaDocument,requires_identity:true};
  const hash=s=>createHash('sha256').update(s).digest('hex');
  const env={NUFI_LIBRARY_PASSWORD_SHA256:hash(password),NUFI_LIBRARY_CATALOGUE_KEY:'a'.repeat(64),SUPABASE_URL:'https://invalid.test',SUPABASE_ANON_KEY:'fixture',SUPABASE_SERVICE_ROLE_KEY:'fixture',SITE_URL:'https://example.test'};
  const api=async(path,options={})=>{
    calls.push([path,options]);const q=new URL(path,'https://invalid.test').searchParams;
    if(path.includes('nufi_library_nda_agreements'))return document?[document]:[];
    if(path.includes('nufi_library_nda_acceptances')){
      if(outage)throw new Error('Fixture outage');
      if(options.method==='POST'){
        const p=options.payload;
        if(!receipts.some(r=>r.actor_id===p.actor_id&&r.actor_role===p.actor_role&&r.document_hash===p.document_hash))receipts.push({...p,id:randomUUID(),accepted_at:'2026-11-18T12:00:00.000Z'});
        return null;
      }
      const rows=receipts.filter(r=>['id','actor_id','actor_role','document_hash'].every(k=>!q.has(k)||q.get(k).slice(3)===r[k]));
      if(options.method==='PATCH')for(const row of rows)Object.assign(row,options.payload);
      return rows;
    }
    if(path.includes('consume_password_attempt'))return {allowed:true,retry_after:0};
    if(path.includes('nufi_library_staff'))return q.get('email')==='eq.admin@example.test'?[]:[{id:staffId,name:'Fixture colleague',email:'staff@example.test',code_hash:hash(password)}];
    if(path.includes('grant_type=password'))return {user:{id:adminId,email:'admin@example.test',email_confirmed_at:'2026-01-01'},access_token:'fixture'};
    if(path.includes('nufi_members'))return [{user_id:adminId,role:'admin',status:'active'}];
    if(path.startsWith('/auth/v1/admin/users/'))return {id:adminId,email:'admin@example.test'};
    return [];
  };
  const reader=createLibraryReader({env,apiFactory:()=>api,load:async()=>{loads++;return {records:[],files:{}};}});
  async function request(query='',body=null,cookie='',origin='https://example.test'){
    const headers={},chunks=[];const res=new Writable({write(c,e,done){chunks.push(c);done();}});
    res.setHeader=(k,v)=>headers[k.toLowerCase()]=v;
    await reader({method:body?'POST':'GET',headers:{host:'example.test',origin,cookie},url:'/content-library/'+query,body},res);
    return {status:res.statusCode,html:Buffer.concat(chunks).toString(),headers,cookie:headers['set-cookie']?.split?.(';')[0]};
  }
  const signIn=async(role='staff')=>(await request('',{action:'sign-in',password,...(role==='guest'?{}:{email:role+'@example.test'})})).cookie;
  const accept=(extra={})=>{const fields={action:'accept-nda',full_name:'Test Signer',email:'guest@example.test',agree:'1',version:ndaVersion,document_hash:ndaHash,address_line:'1 Example Street',address_city:'Test City',address_postcode:'AB1 2CD',address_country:'United Kingdom',signature_method:'typed',identity_image:fixtureImage(),...extra};if(fields.signature_name===undefined)fields.signature_name=fields.full_name;return fields;};
  return {request,signIn,accept,receipts,calls,staffId,adminId,setOutage:v=>outage=v,setDocument:v=>document=v,loads:()=>loads};
}
test('unaccepted staff cannot browse, download, fetch previews or mutate content',async()=>{
  const f=fixture(),cookie=await f.signIn();
  for(const path of ['', '?work=1&studio=library','?work=1&studio=book-file&id=private','?file='+'a'.repeat(64),'?preview='+'a'.repeat(32),'?work=1&studio=media&preview=private']){
    const r=await f.request(path,null,cookie);assert.equal(r.status,200);assert.match(r.html,/Before you enter/);assert.doesNotMatch(r.html,/<aside|Studio navigation/);
  }
  const denied=await f.request('?work=1&studio=team',{action:'create-user',name:'Never',email:'never@example.test'},cookie);
  assert.equal(denied.status,403);assert.equal(f.loads(),0);
  assert.ok(!f.calls.some(([p,o])=>o.method==='POST'&&!p.includes('password')&&!p.includes('grant_type')));
});
test('explicit acceptance records account identity and exact text once and restores destination',async()=>{
  const f=fixture(),cookie=await f.signIn(),path='?work=1&studio=library&kind=ebook';
  const r=await f.request(path,f.accept({actor_id:'forged',email:'forged@example.test',accepted_at:'1999',document_text:'forged'}),cookie);
  assert.equal(r.status,303);assert.equal(r.headers.location,'/content-library/'+path);
  const receipt=f.receipts[0];assert.equal(receipt.actor_id,f.staffId);assert.equal(receipt.email,'staff@example.test');assert.equal(receipt.document_text,ndaText);assert.equal(receipt.document_hash,ndaHash);assert.equal(receipt.agreement_version,ndaVersion);assert.equal(receipt.accepted_at,'2026-11-18T12:00:00.000Z');
  await f.request(path,f.accept({full_name:'A different name'}),cookie);assert.equal(f.receipts.length,1);assert.equal(receipt.full_name,'Test Signer');
  const again=await f.signIn();assert.equal((await f.request('',null,again)).status,303);
  const copy=await f.request('?work=1&nda=copy',null,cookie);assert.match(copy.html,/ACCEPTANCE RECORD/);assert.match(copy.headers['content-disposition'],/attachment/);
});
test('unchecked, missing name, changed wording and cross-site acceptance are refused',async()=>{
  const f=fixture(),cookie=await f.signIn();
  for(const [body,code] of [[f.accept({agree:'0'}),400],[f.accept({full_name:''}),400],[f.accept({version:'old'}),409],[f.accept({document_hash:'b'.repeat(64)}),409]])assert.equal((await f.request('?work=1',body,cookie)).status,code);
  assert.equal((await f.request('?work=1',f.accept(),cookie,'https://other.test')).status,403);
  assert.equal((await f.request('',f.accept(),cookie,'https://other.test')).status,403);
  assert.equal(f.receipts.length,0);
});
test('guest sessions need their own acceptance and cannot use a staff receipt',async()=>{
  const f=fixture(),staff=await f.signIn();await f.request('?work=1',f.accept(),staff);
  const guest=await f.signIn('guest');assert.match((await f.request('',null,guest)).html,/Before you enter/);
  assert.equal((await f.request('',f.accept({email:'invalid'}),guest)).status,400);
  assert.equal((await f.request('',f.accept(),guest)).status,303);
  assert.equal(f.receipts[1].actor_role,'guest');assert.equal(f.receipts[1].email,'guest@example.test');assert.match(f.receipts[1].identity_basis,/self-declared/);
  assert.doesNotMatch((await f.request('',null,guest)).html,/Before you enter/);
  const other=await f.signIn('guest');assert.match((await f.request('',null,other)).html,/Before you enter/);
  assert.equal((await f.request('',f.accept(),'__Host-nufi-library=forged')).status,401);
});
test('lookup and save outages fail closed, with no content loads',async()=>{
  const f=fixture(),cookie=await f.signIn();f.setOutage(true);
  for(const path of ['','?work=1&studio=library','?file=private'])assert.equal((await f.request(path,null,cookie)).status,503);
  assert.equal((await f.request('?work=1',f.accept(),cookie)).status,503);assert.equal(f.receipts.length,0);assert.equal(f.loads(),0);
});
test('old-version receipts do not unlock current content; decline signs out',async()=>{
  const f=fixture(),cookie=await f.signIn();await f.request('?work=1',f.accept(),cookie);f.receipts[0].document_hash='c'.repeat(64);
  assert.match((await f.request('?work=1',null,cookie)).html,/Before you enter/);
  const decline=await f.request('?work=1',{action:'work-logout'},cookie);assert.equal(decline.status,303);assert.ok(decline.headers['set-cookie'].every(c=>c.includes('Max-Age=0')));
});
test('only admins can list or download other acceptance records',async()=>{
  const f=fixture(),staff=await f.signIn();await f.request('?work=1',f.accept(),staff);
  const path='?work=1&studio=nda&receipt='+f.receipts[0].id;
  assert.equal((await f.request(path,null,staff)).status,403);
  const admin=await f.signIn('admin');await f.request('?work=1',f.accept({full_name:'Test Admin'}),admin);
  assert.equal(f.receipts[1].email,'admin@example.test');
  assert.match((await f.request('?work=1&studio=nda',null,admin)).html,/Test Signer/);
  assert.match((await f.request(path,null,admin)).html,/staff@example.test/);
  assert.equal((await f.request('?work=1&studio=nda',{action:'delete'},admin)).status,405);
});

test('missing or tampered private agreement blocks even accepted users',async()=>{
 const f=fixture(),cookie=await f.signIn();await f.request('?work=1',f.accept(),cookie);
 for(const document of [null,{...ndaDocument,document_text:'Changed terms without a matching digest'}]){f.setDocument(document);assert.equal((await f.request('?work=1&studio=library',null,cookie)).status,503);}
 assert.equal(f.loads(),0);
});

test('address, explicit signature and ID are required together and saved with the signed agreement',async()=>{
 const f=fixture(),cookie=await f.signIn();
 for(const patch of [{address_line:''},{address_city:''},{address_country:''},{signature_method:'none'},{signature_name:'Someone else'},{identity_image:''},{identity_image:'data:image/svg+xml;base64,PHN2Zz4='},{signature_method:'drawn',signature_strokes:'[]'}]){
  assert.equal((await f.request('?work=1',f.accept(patch),cookie)).status,400);assert.equal(f.receipts.length,0);
 }
 assert.equal((await f.request('?work=1',f.accept(),cookie)).status,303);
 const record=f.receipts[0];assert.equal(record.signed_details,true);assert.match(record.postal_address,/1 Example Street/);assert.equal(record.signature_method,'typed');assert.equal(record.identity_received,true);assert.equal(record.identity_sha256.length,64);
 const page=await f.request('?work=1&nda=record',null,cookie);assert.match(page.html,/NDA reference/);assert.match(page.html,/1 Example Street/);assert.match(page.html,/Test Signer/);assert.match(page.html,/ID supplied/);assert.doesNotMatch(page.html,/data:image/);
 const image=await f.request('?work=1&nda=identity',null,cookie);assert.equal(image.headers['content-type'],'image/webp');
 assert.ok(f.calls.filter(([url])=>url.includes('document_hash=eq.')).every(([url])=>url.includes('select=id,signed_details')));
});
test('drawn signature is bounded numeric data and shown in the signed record',async()=>{
 const f=fixture(),cookie=await f.signIn();
 const strokes=[[[10,10],[60,40],[90,15],[150,80]]];
 assert.equal((await f.request('?work=1',f.accept({signature_method:'drawn',signature_strokes:JSON.stringify(strokes)}),cookie)).status,303);
 assert.deepEqual(f.receipts[0].signature_strokes,strokes);
 assert.match((await f.request('?work=1&nda=record',null,cookie)).html,/Recorded handwritten signature/);
 assert.match((await f.request('?work=1&nda=copy',null,cookie)).html,/<polyline/);
});
test('only administrators may remove ID; signed wording, signature and proof of receipt remain',async()=>{
 const f=fixture(),cookie=await f.signIn();await f.request('?work=1',f.accept(),cookie);
 const record=f.receipts[0],original=record.document_text,receipt=record.id,fields={action:'remove-nda-id',receipt,confirm_remove:'1'};
 assert.equal((await f.request('?work=1&studio=nda',fields,cookie)).status,403);
 const admin=await f.signIn('admin');await f.request('?work=1',f.accept({full_name:'Admin Fixture'}),admin);
 assert.equal((await f.request('?work=1&studio=nda',{...fields,confirm_remove:'0'},admin)).status,400);
 assert.equal((await f.request('?work=1&studio=nda',fields,admin,'https://other.test')).status,403);
 assert.equal((await f.request('?work=1&studio=nda',fields,admin)).status,303);
 assert.equal(record.identity_image,null);assert.equal(record.identity_received,true);assert.equal(record.document_text,original);assert.equal(record.signature_name,'Test Signer');assert.equal(record.identity_removed_by,f.adminId);
 assert.match((await f.request('?work=1&nda=record',null,cookie)).html,/ID image removed/);
 assert.equal((await f.request('',null,cookie)).status,303);
});
