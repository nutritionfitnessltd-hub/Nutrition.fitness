import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {messageFixture} from './team-messages-fixture.mjs';
import {announcementsId,createConversation,changeConversation,readThread,visibleMessages,listConversations,unreadCount,human} from '../server/team-message-store.mjs';
import {messagesPage,handleTeamMessages} from '../server/team-messages.mjs';
import {attachTeamFile,sendTeamFile,teamFilePrefix,uploadSmallTeamFile,uploadTeamFile} from '../server/team-message-files.mjs';
import {notifyTeamMessage} from '../server/team-message-notifications.mjs';
import {handleStudio} from '../server/studio.mjs';
import {studioNavigation} from '../server/studio-navigation.mjs';

const group=async(f,extra={})=>createConversation(f.api,f.admin,f.people,{conversationId:randomUUID(),kind:'group',title:'Operations',members:JSON.stringify([f.staff.id]),...extra});
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}});

test('only human sessions can use Messages; direct pairs reuse the same private conversation',async()=>{
 const f=messageFixture();for(const role of ['worker','system','guest','member'])assert.throws(()=>human({role,id:f.staff.id}),e=>e.status===403);
 const a=await group(f,{kind:'direct'}),b=await createConversation(f.api,f.staff,f.people,{kind:'direct',members:JSON.stringify([f.admin.id])});assert.equal(a,b);assert.equal(f.rows.size,1);
 await assert.rejects(createConversation(f.api,f.admin,f.people,{kind:'group',title:'AI',conversationId:randomUUID(),members:JSON.stringify(['imogen'])}));
 assert.ok(studioNavigation('messages',f.staff).html.includes('>Messages<'));assert.equal(studioNavigation('messages',f.staff).label,'Messages');
});
test('non-members, including administrators, cannot read, search, post, change preferences or download',async()=>{
 const f=messageFixture(),id=await group(f);await changeConversation(f.api,id,f.staff,f.people,f.send('A private decision'));
 assert.deepEqual((await listConversations(f.api,f.outsider)).map(r=>r.id),[announcementsId]);
 assert.throws(()=>visibleMessages(f.rows.get(id),f.outsider,f.people),e=>e.status===403);
 for(const action of ['message-send','message-read','message-preferences','message-members'])await assert.rejects(changeConversation(f.api,id,f.outsider,f.people,{...f.send(),action}),e=>e.status===403);
 const search=await messagesPage(new URLSearchParams({q:'private decision'}),f.outsider,f.api,{});assert.doesNotMatch(search,/A private decision/);
 await assert.rejects(sendTeamFile({method:'GET'},response(),id,f.outsider,f.people,f.api,{},randomUUID()),e=>e.status===403);
});
test('group joins and re-joins exclude old messages, replies and files; removal revokes access',async()=>{
 const f=messageFixture(),id=await group(f),old=await changeConversation(f.api,id,f.staff,f.people,f.send('Before Robin joined'));
 await changeConversation(f.api,id,f.admin,f.people,{action:'message-members',operation:'add',person:f.other.id});
 const next=await changeConversation(f.api,id,f.admin,f.people,f.send('After Robin joined'));
 assert.deepEqual(visibleMessages(next.thread,f.other,f.people).map(m=>m.body),['After Robin joined']);
 await assert.rejects(changeConversation(f.api,id,f.other,f.people,f.send('Reply to old root',{parentId:old.message.id})),e=>e.status===403);
 await changeConversation(f.api,id,f.admin,f.people,{action:'message-members',operation:'remove',person:f.other.id});
 await assert.rejects(changeConversation(f.api,id,f.other,f.people,f.send()),e=>e.status===403);
 await changeConversation(f.api,id,f.admin,f.people,{action:'message-members',operation:'add',person:f.other.id});
 assert.equal(visibleMessages(await readThread(f.api,id),f.other,f.people).length,0);
});
test('announcement roots require administrator; human members can reply only in visible threads',async()=>{
 const f=messageFixture();await assert.rejects(changeConversation(f.api,announcementsId,f.staff,f.people,f.send('Not an admin announcement')),e=>e.status===403);
 const root=await changeConversation(f.api,announcementsId,f.admin,f.people,f.send('Welcome everyone'));
 const reply=await changeConversation(f.api,announcementsId,f.staff,f.people,f.send('Thanks',{parentId:root.message.id}));
 assert.equal(reply.message.parentId,root.message.id);
 await assert.rejects(changeConversation(f.api,announcementsId,f.staff,f.people,f.send('Nested',{parentId:reply.message.id})),e=>e.status===403);
 const page=await messagesPage(new URLSearchParams({conversation:announcementsId}),f.staff,f.api,{});assert.match(page,/Everyone can reply/);assert.doesNotMatch(page,/>Post announcement</);
});
test('unread counts track displayed messages without marking unopened replies read; mute is per person',async()=>{
 const f=messageFixture(),id=await group(f),root=await changeConversation(f.api,id,f.admin,f.people,f.send('Root')),reply=await changeConversation(f.api,id,f.admin,f.people,f.send('@Sam Taylor please check',{parentId:root.message.id}));
 assert.equal(unreadCount(reply.thread,f.staff,f.people),2);
 const read=await changeConversation(f.api,id,f.staff,f.people,{action:'message-read',messageIds:JSON.stringify([root.message.id])});assert.equal(unreadCount(read.thread,f.staff,f.people),1);
 const mute=await changeConversation(f.api,id,f.staff,f.people,{action:'message-preferences',muted:'1',email:'1'});assert.equal(unreadCount(mute.thread,f.staff,f.people),0);assert.equal(mute.thread.payload.prefs[f.admin.id],undefined);
});
test('edits are author-only and revision checked; deletion is recoverable and hides content from others',async()=>{
 const f=messageFixture(),id=await group(f),sent=await changeConversation(f.api,id,f.staff,f.people,f.send('Original'));
 const change={action:'message-edit',messageId:sent.message.id,messageRevision:1,body:'Edited <script>alert(1)</script>'};
 await assert.rejects(changeConversation(f.api,id,f.admin,f.people,change),e=>e.status===403);
 const edited=await changeConversation(f.api,id,f.staff,f.people,change);assert.equal(edited.thread.payload.messages[0].history[0].body,'Original');
 await assert.rejects(changeConversation(f.api,id,f.staff,f.people,change),e=>e.status===409);
 let page=await messagesPage(new URLSearchParams({conversation:id}),f.admin,f.api,{});assert.match(page,/&lt;script&gt;/);assert.doesNotMatch(page,/<script>alert/);
 await changeConversation(f.api,id,f.staff,f.people,{action:'message-delete',messageId:sent.message.id,messageRevision:2});
 page=await messagesPage(new URLSearchParams({conversation:id}),f.admin,f.api,{});assert.doesNotMatch(page,/Edited &lt;script/);assert.match(page,/Message deleted/);
 const restored=await changeConversation(f.api,id,f.staff,f.people,{action:'message-restore',messageId:sent.message.id,messageRevision:3});assert.equal(restored.thread.payload.messages[0].deletedAt,undefined);
});
test('concurrent sends retry without lost messages; idempotent retries do not duplicate; removal races fail closed',async()=>{
 const f=messageFixture(),id=await group(f),first=f.send('First');await changeConversation(f.api,id,f.staff,f.people,first);
 const duplicate=await changeConversation(f.api,id,f.staff,f.people,first);assert.equal(duplicate.duplicate,true);assert.equal(f.rows.get(id).payload.messages.length,1);
 f.conflict(row=>{row.revision++;row.payload.messages.push({id:randomUUID(),seq:++row.payload.lastSeq,authorId:f.admin.id,body:'Concurrent',at:new Date().toISOString(),parentId:null,files:[]});});
 await changeConversation(f.api,id,f.staff,f.people,f.send('Second'));assert.equal(f.rows.get(id).payload.messages.length,3);
 f.conflict(row=>{row.revision++;row.payload.members=row.payload.members.filter(m=>m.id!==f.staff.id);row.member_ids=row.member_ids.filter(x=>x!==f.staff.id);});
 await assert.rejects(changeConversation(f.api,id,f.staff,f.people,f.send('Removed during send')),e=>e.status===403);
 assert.ok(!f.rows.get(id).payload.messages.some(m=>m.body==='Removed during send'));
});
test('private file verification binds uploader and membership; only visible posted files can be downloaded',async()=>{
 const f=messageFixture(),id=await group(f),fileId=randomUUID(),pathname=teamFilePrefix(id,f.staff)+fileId+'.pdf',env={BLOB_READ_WRITE_TOKEN:'fixture-only'},inspect=async()=>({pathname,contentType:'application/pdf',size:120,url:'https://fixture.private.blob.vercel-storage.com/file'});
 const attached=await attachTeamFile(id,f.staff,f.people,f.api,env,{pathname,name:'Decision.pdf'},inspect);assert.equal(attached.file.id,fileId);
 await assert.rejects(attachTeamFile(id,f.admin,f.people,f.api,env,{pathname,name:'Steal.pdf'},inspect),e=>e.status===400);
 await assert.rejects(sendTeamFile({method:'GET'},response(),id,f.staff,f.people,f.api,env,fileId),e=>e.status===404);
 await assert.rejects(changeConversation(f.api,id,f.admin,f.people,f.send('Steal',{files:JSON.stringify([fileId])})),e=>e.status===403);
 const sent=await changeConversation(f.api,id,f.staff,f.people,f.send('Document',{files:JSON.stringify([fileId])}));assert.equal(sent.thread.payload.files[0].messageId,sent.message.id);
 await changeConversation(f.api,id,f.admin,f.people,{action:'message-members',operation:'add',person:f.other.id});
 await assert.rejects(sendTeamFile({method:'GET'},response(),id,f.other,f.people,f.api,env,fileId),e=>e.status===404);
 const search=await messagesPage(new URLSearchParams({q:'Decision.pdf'}),f.admin,f.api,env);assert.match(search,/Document/);
 await assert.rejects(uploadSmallTeamFile(id,f.outsider,f.people,f.api,env,{pathname,data:'YQ==',bytes:1}),e=>e.status===403);
 let token;await uploadTeamFile({body:{type:'blob.generate-client-token'}},id,f.staff,f.people,f.api,env,async opts=>{token=await opts.onBeforeGenerateToken(pathname);});assert.equal(token.allowOverwrite,false);assert.equal(token.maximumSizeInBytes,250*1024*1024);
});
test('message email is opt-in, muted and recently-opened conversations suppress it; no private text is included',async()=>{
 const f=messageFixture(),id=await group(f),sent=await changeConversation(f.api,id,f.admin,f.people,f.send('Private medical detail'));
 let requests=[];const env={EXCHANGE_TENANT_ID:'fixture',EXCHANGE_CLIENT_ID:'fixture',EXCHANGE_CLIENT_SECRET:'fixture-only'},fetcher=async(url,options)=>{requests.push(options);return url.includes('/token')?new Response(JSON.stringify({access_token:'fixture'})):new Response(null,{status:202});};
 await notifyTeamMessage({api:f.api,actor:f.admin,people:f.people,thread:sent.thread,message:sent.message,env,fetcher});assert.equal(requests.length,0);
 const thread=structuredClone(sent.thread);thread.payload.prefs[f.staff.id]={email:true};
 await notifyTeamMessage({api:f.api,actor:f.admin,people:f.people,thread,message:sent.message,env,fetcher});assert.equal(requests.length,2);assert.doesNotMatch(JSON.stringify(requests),/Private medical detail|Operations/);
 requests=[];thread.payload.prefs[f.staff.id].muted=true;await notifyTeamMessage({api:f.api,actor:f.admin,people:f.people,thread,message:sent.message,env,fetcher});assert.equal(requests.length,0);
});
test('Messages bypasses AI/content loading; plain staff without content-edit permissions can use it',async()=>{
 const f=messageFixture(),res=response();await handleStudio({method:'GET',headers:{}},res,{params:new URLSearchParams({studio:'messages'}),actor:f.staff,api:f.api,load:()=>{throw Error('Must not load the AI catalogue');},env:{}});assert.equal(res.statusCode,200);assert.match(res.body,/A place for your team/);
 const id=await group(f),out=response();await handleTeamMessages({method:'POST',headers:{accept:'application/json'},body:f.send('Posted')},out,{params:new URLSearchParams({conversation:id}),actor:f.staff,api:f.api,env:{}});assert.equal(out.statusCode,200);assert.equal(JSON.parse(out.body).saved,true);
});
