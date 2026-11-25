import {randomUUID} from 'node:crypto';
import {HttpError,uuid} from './platform.mjs';
import {canAccess} from './library-permissions.mjs';
import {taskContext} from './task-messages.mjs';
import {human,messageBody,messagePeople,messageName,readThread,membership,visibleMessages,announcementsId,listConversations,unreadCount,createConversation,changeConversation,canManage} from './team-message-store.mjs';
import {teamFilePrefix,uploadTeamFile,uploadSmallTeamFile,attachTeamFile,sendTeamFile} from './team-message-files.mjs';
import {notifyTeamMessage} from './team-message-notifications.mjs';
import {esc,url,heading,button,hidden,input,textarea,select,form,studioFrame} from './studio-ui.mjs';

const address=(id,values={})=>url('messages',{...(id?{conversation:id}:{}),...values});
const check=(name,label,value)=>'<label class="check"><input type="checkbox" name="'+name+'" value="1"'+(value?' checked':'')+'><span>'+esc(label)+'</span></label>';
const date=at=>new Date(at).toLocaleString('en-GB',{timeZone:'Europe/London',dateStyle:'medium',timeStyle:'short'});
const titleFor=(row,actor,people)=>row.payload.kind==='direct'?row.payload.members.filter(m=>m.id!==actor.id).map(m=>messageName(people,m.id)).join(', '):row.payload.title;
const mention=(body,name)=>body.toLocaleLowerCase('en-GB').includes('@'+name.toLocaleLowerCase('en-GB'));
function text(body,people){
 const names=[...new Set(people.map(p=>p.name).filter(Boolean))].sort((a,b)=>b.length-a.length);
 const pattern=names.length?new RegExp('@(?:'+names.map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')(?=$|[\\s.,!?:;])','giu'):null;
 let html='',last=0;
 for(const match of pattern?body.matchAll(pattern):[]){html+=esc(body.slice(last,match.index))+'<mark>'+esc(match[0])+'</mark>';last=match.index+match[0].length;}
 return '<p class="message-text">'+html+esc(body.slice(last))+'</p>';
}
export async function conversationContext(params,actor,people,api){
 if(!params.get('task')&&!params.get('project'))return null;
 if(!canAccess(actor,'work'))throw new HttpError(403,'Open your assigned work to start this conversation.');
 if(params.get('task')||params.get('entry')){
  const data={actor,projects:[],tasks:[]};
  if(params.get('task'))data.tasks=await api('/rest/v1/nufi_library_tasks?id=eq.'+uuid(params.get('task'))+'&select=*',{service:true});
  else data.projects=await api('/rest/v1/nufi_library_projects?id=eq.'+uuid(params.get('project'))+'&select=*',{service:true});
  const task=taskContext(params,data);return {title:task.title,href:url('task',task.values).replaceAll('&amp;','&'),values:task.values};
 }
 const [project]=await api('/rest/v1/nufi_library_projects?id=eq.'+uuid(params.get('project'))+'&select=*',{service:true});
 if(!project||actor.role!=='admin'&&project.creator_id!==actor.id&&!project.entries?.some(e=>e.assignee===actor.id))throw new HttpError(403,'This project is outside your assigned work.');
 return {title:project.name,href:url('project',{project:project.id}).replaceAll('&amp;','&'),values:{project:project.id}};
}
function compose(row,actor,people,params,retained={},error='',uploads=false){
 const p=row.payload,reply=params.get('reply')||retained.parentId||'',root=reply&&visibleMessages(row,actor,people).find(m=>m.id===reply&&!m.parentId&&!m.deletedAt);
 if(reply&&!root)return '<p role="alert">This reply thread is unavailable.</p>';
 if(p.kind==='announcements'&&actor.role!=='admin'&&!root)return '<p class="message-hint">Administrators post announcements here. Choose Reply beneath an announcement to join its discussion.</p>';
 const staged=p.files.filter(f=>f.uploadedBy===actor.id&&!f.messageId);
 return '<section class="message-compose" id="compose"><h2>'+esc(root?'Reply in thread':p.kind==='announcements'?'Post an announcement':'Write a message')+'</h2>'+(root?'<blockquote>'+esc(root.body.slice(0,240))+'</blockquote>'+button('Cancel reply',address(row.id)):'')+(error?'<p role="alert">'+esc(error)+'</p>':'')+
 form('message-send',hidden('messageId',retained.messageId||randomUUID())+hidden('parentId',root?.id||'')+hidden('files',retained.files||'[]')+'<label class="chat-text-label"><span>Message</span><textarea name="body" rows="2" maxlength="12000" placeholder="Type a message…">'+esc(retained.body||'')+'</textarea></label>'+hidden('mentionNames',JSON.stringify(people.filter(x=>p.kind==='announcements'||p.members.some(m=>m.id===x.id)).map(x=>x.name)))+
 (uploads?'<button type="button" class="chat-attach-icon" data-attachment-open aria-label="Attach files" title="Attach files"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m8 12 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l9-9M6 14l8-8"/></svg><span data-attachment-count hidden></span></button><dialog class="chat-attachment-dialog" aria-label="Attachments" data-attachment-dialog><header><h2>Attachments</h2><button type="button" data-attachment-close aria-label="Close attachments">×</button></header><div data-message-upload data-prefix="'+teamFilePrefix(row.id,actor)+'"><button type="button" data-attachment-pick class="attachment-choose">Choose files</button><input aria-label="Choose attachments" hidden type="file" multiple data-message-files accept=".jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx,.pptx,.zip,.mp4,.webm,.mp3"><p class="meta">Up to 5 files · 250 MB each · Private to this chat</p><button type="button" data-message-upload-button hidden>Retry upload</button><progress hidden max="100" value="0" aria-label="Upload progress"></progress><p role="status" data-message-upload-status></p><ul data-message-staged>'+staged.map(file=>'<li><label class="check"><input type="checkbox" data-staged-file value="'+file.id+'"'+(String(retained.files||'').includes(file.id)?' checked':'')+'><span>'+esc(file.name)+'</span></label></li>').join('')+'</ul></div><button type="button" data-attachment-close class="attachment-done">Done</button></dialog>':''),{section:'messages',conversation:row.id},'Send','data-message-compose')+'</section>';
}
function renderMessage(m,row,actor,people,replies=false){
 const params={section:'messages',conversation:row.id},mine=m.authorId===actor.id;
 const controls=mine?'<details><summary>Message options</summary>'+(m.deletedAt?form('message-restore',hidden('messageId',m.id)+hidden('messageRevision',m.revision),params,'Restore message'):form('message-edit',hidden('messageId',m.id)+hidden('messageRevision',m.revision)+textarea('body','Edit message',m.body,3),params,'Save edit')+form('message-delete',hidden('messageId',m.id)+hidden('messageRevision',m.revision),params,'Delete message'))+'</details>':'';
 return '<article class="team-message'+(mine?' mine':'')+'" id="message-'+m.id+'"><header><strong>'+esc(m.author)+'</strong><time datetime="'+esc(m.at)+'">'+esc(date(m.at))+'</time>'+(m.editedAt&&!m.deletedAt?'<small>edited</small>':'')+'</header>'+
 (m.deletedAt?'<p class="meta">Message deleted.'+(mine?' You can restore it.':'')+'</p>':text(m.body,people)+(m.files.length?'<ul class="message-files">'+m.files.map(id=>{const f=row.payload.files.find(x=>x.id===id);return f?'<li><a href="'+address(row.id,{file:id})+'">'+esc(f.name)+'</a> · '+esc((f.bytes/1024/1024).toFixed(1))+' MB</li>':'';}).join('')+'</ul>':''))+
 (!m.parentId?'<a class="message-reply" href="'+address(row.id,{reply:m.id})+'#compose">'+(replies?replies+' replies':'Reply in thread')+'</a>':'')+controls+'</article>';
}
function memberSettings(row,actor,people){
 const p=row.payload,pref=p.prefs[actor.id]||{};
 return '<details class="message-settings"><summary>Conversation settings</summary>'+form('message-preferences',check('muted','Mute this conversation',pref.muted)+check('email','Email me about messages when I am away',pref.email)+'<p class="meta">Email alerts contain a sign-in link, never message text. Alerts are sent when you have not opened this conversation in the last five minutes. Muting also silences mentions and email.</p>',{section:'messages',conversation:row.id},'Save preferences')+
 '<h3>People</h3><ul>'+(p.kind==='announcements'?people:p.members.map(m=>people.find(x=>x.id===m.id)||{id:m.id,name:'Team member'})).map(person=>'<li>'+esc(person.name)+(person.id===p.owner?' · Group owner':'')+(canManage(row,actor)&&person.id!==p.owner?form('message-members',hidden('person',person.id)+hidden('operation','remove'),{section:'messages',conversation:row.id},'Remove'):'')+'</li>').join('')+'</ul>'+
 (canManage(row,actor)?form('message-members',hidden('operation','add')+select('person','Add a person',{'':'Choose a team member',...Object.fromEntries(people.filter(x=>!p.members.some(m=>m.id===x.id)).map(x=>[x.id,x.name]))})+'<p class="meta">New members see messages from when they join. Removed members lose access immediately. Adding them again does not restore earlier history.</p>',{section:'messages',conversation:row.id},'Add to group'):'')+'</details>';
}
export async function messagesPage(params,actor,api,env,retained={},error=''){
 const people=await messagePeople(api,actor),rows=await listConversations(api,actor),selected=params.get('conversation');
 const personId=params.get('person')||retained.person,person=personId&&people.find(p=>p.id===personId&&p.id!==actor.id);
 if(personId&&!person)throw new HttpError(400,'Choose a human team member.');
 const direct=person&&rows.find(r=>r.payload.kind==='direct'&&r.payload.members.length===2&&r.payload.members.some(m=>m.id===person.id));
 if(direct){const next=new URLSearchParams(params);next.delete('person');next.set('conversation',direct.id);return messagesPage(next,actor,api,env,retained.person?{...retained,action:'message-send',person:undefined}:retained,error);}
 const q=String(params.get('q')||'').trim().slice(0,100),context=await conversationContext(params,actor,people,api);
 const contact=(p)=>{const r=rows.find(r=>r.payload.kind==='direct'&&r.payload.members.length===2&&r.payload.members.some(m=>m.id===p.id)),n=r?unreadCount(r,actor,people):0;return '<a class="message-contact" href="'+address(r?.id,r?{}:{person:p.id})+'"><span class="message-avatar" aria-hidden="true">'+esc(p.name.slice(0,1))+'</span><strong>'+esc(p.name)+'</strong>'+(n?'<span class="message-count">'+n+'</span>':'')+'</a>';};
 const sidebar='<aside class="message-sidebar"><h2>People</h2><nav aria-label="People">'+people.filter(p=>p.id!==actor.id).map(contact).join('')+'</nav><h3>Team chats</h3><nav aria-label="Conversations">'+rows.filter(r=>r.payload.kind!=='direct').map(r=>{const n=unreadCount(r,actor,people);return '<a href="'+address(r.id)+'"><strong>'+esc(titleFor(r,actor,people))+'</strong>'+(n?'<span class="message-count">'+n+'</span>':'')+'</a>';}).join('')+'</nav></aside>';
 let main='';
 if(person){
  main='<section class="message-discussion message-first"><header class="message-discussion-heading">'+button('← People',address())+'<h2>'+esc(person.name)+'</h2></header><div class="message-stream"><p class="message-empty">Say hello to '+esc(person.name)+'.</p></div><section class="message-compose">'+(error?'<p role="alert">'+esc(error)+'</p>':'')+form('message-create',hidden('kind','direct')+hidden('person',person.id)+hidden('members',JSON.stringify([person.id]))+hidden('messageId',retained.messageId||randomUUID())+hidden('mentionNames',JSON.stringify([person.name]))+'<label class="chat-text-label"><span>Message</span><textarea name="body" rows="2" maxlength="12000" required placeholder="Type a message…">'+esc(retained.body||'')+'</textarea></label>',{section:'messages',person:person.id},'Send','data-message-first data-draft-person="'+esc(person.id)+'"')+'</section></section>';
 }else if(params.get('new')||retained.action==='message-create'){
  main='<section class="message-new"><h2>New group chat</h2>'+(context?'<p>Linked to: '+esc(context.title)+'</p>':'')+(error?'<p role="alert">'+esc(error)+'</p>':'')+
  form('message-create',hidden('conversationId',retained.conversationId||randomUUID())+hidden('members',retained.members||'[]')+hidden('kind','group')+input('title','Group name',retained.title||context?.title||'','text','maxlength="100"')+'<fieldset><legend>People</legend>'+people.filter(p=>p.id!==actor.id).map(p=>'<label class="check"><input type="checkbox" name="member_'+p.id+'" data-message-member value="1"'+(String(retained.members||'').includes(p.id)?' checked':'')+'><span>'+esc(p.name)+'</span></label>').join('')+'</fieldset>',{section:'messages',...(context?.values||{})},'Create group','data-message-create')+'</section>';
 }else if(q){
  const results=[];
  for(const summary of rows){const row=await readThread(api,summary.id);for(const m of visibleMessages(row,actor,people))if(!m.deletedAt&&[m.body,titleFor(row,actor,people),...row.payload.files.filter(f=>f.messageId===m.id&&m.files.includes(f.id)).map(f=>f.name)].some(value=>value.toLocaleLowerCase('en-GB').includes(q.toLocaleLowerCase('en-GB'))))results.push({row,m});}
  main='<section><h2>Search results</h2><p>'+results.length+' messages match “'+esc(q)+'”.</p>'+results.slice(-100).reverse().map(({row,m})=>'<article class="message-search-result"><a href="'+address(row.id,m.parentId?{reply:m.parentId}:{})+'#message-'+m.id+'">'+esc(titleFor(row,actor,people))+' · '+esc(m.author)+'</a>'+text(m.body,people)+'</article>').join('')+(results.length>100?'<p>Showing the latest 100 matches. Refine your search to see more.</p>':'')+'</section>';
 }else if(selected){
  const row=await readThread(api,selected);membership(row,actor,people);const all=visibleMessages(row,actor,people),reply=params.get('reply'),page=Math.max(1,Number.parseInt(params.get('messagePage'))||1);
  const roots=all.filter(m=>!m.parentId),selectedRoot=reply&&roots.find(m=>m.id===reply);
  const visible=reply?(selectedRoot?[selectedRoot,...all.filter(m=>m.parentId===reply)]:[]):roots.slice(-page*30,roots.length-(page-1)*30||undefined);
  main='<section class="message-discussion" data-message-thread="'+row.id+'" data-thread-revision="'+row.revision+'" data-seen-seq="'+row.payload.lastSeq+'"><header class="message-discussion-heading"><div>'+button('← People',address())+'<h2>'+esc(titleFor(row,actor,people))+'</h2>'+(row.payload.kind==='announcements'?'<p class="meta">Everyone can reply</p>':'')+(row.payload.context?'<a href="'+esc(row.payload.context.href)+'">'+esc(row.payload.context.title)+'</a>':'')+'</div>'+button('Refresh',address(row.id,reply?{reply}:{}))+'</header>'+memberSettings(row,actor,people)+
  '<p class="message-arrived" role="status" data-message-arrived hidden>New activity is available. <a href="'+address(row.id,reply?{reply}:{})+'">Load new messages</a>. Your unsent text stays here until you refresh.</p><div class="message-stream">'+(visible.length?visible.map(m=>renderMessage(m,row,actor,people,all.filter(x=>x.parentId===m.id).length)).join(''):'<p class="message-empty">No messages here yet.</p>')+'</div>'+
  (!reply&&roots.length>30?'<nav class="pages">'+(roots.length>page*30?button('Older messages',address(row.id,{messagePage:page+1})): '')+(page>1?button('Newer messages',address(row.id,{messagePage:page-1})): '')+'</nav>':'')+
  form('message-read',hidden('messageIds',JSON.stringify(visible.map(m=>m.id))),{section:'messages',conversation:row.id},'Mark displayed messages read','data-message-read')+
  compose(row,actor,people,params,retained.action==='message-send'?retained:{},error,!!env.BLOB_READ_WRITE_TOKEN)+'</section>';
 }else main='<section class="message-welcome"><h2>Choose someone to chat with</h2><p>Click a name in People and type your message.</p>'+button('Read Team announcements',address(announcementsId))+'<p class="meta">Messages are human-only. AI team members cannot receive or read these conversations.</p></section>';
 return heading('Messages','')+'<div class="message-tools">'+button('New group',address(null,{new:'1'}))+'<details><summary>Search</summary><form class="message-search" action="/content-library/">'+hidden('work','1')+hidden('studio','messages')+input('q','Search your messages',q,'search','maxlength="100" placeholder="Find a message or attachment…"')+'<button>Search</button></form></details></div>'+
 '<div class="team-messages'+(selected||person||q||params.get('new')?' chat-active':'')+'">'+sidebar+'<div class="message-main">'+main+'</div></div><script type="module" src="/team-messages.js"></script>';
}
const json=(res,status,payload)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','private, no-store');res.end(JSON.stringify(payload));};
export async function handleTeamMessages(req,res,{params,actor,api,env,fetcher=fetch,fileStore}){
 human(actor);res.setHeader('Cache-Control','private, no-store');
 const embedded=params.get('panel')==='1',frame=(body)=>studioFrame(body,'messages',actor,{messagesEmbedded:embedded});
 const redirect=(value)=>{if(!embedded)return value;const u=new URL(value.replaceAll('&amp;','&'),'https://team.nutrition.fitness');u.searchParams.set('panel','1');return u.pathname+u.search;};
 const f=typeof req.body==='string'?Object.fromEntries(new URLSearchParams(req.body)):req.body||{},id=params.get('conversation');
 const wantsJson=(req.headers?.accept||'').includes('application/json')||f.type==='blob.generate-client-token';
 try{
  if(req.method==='GET'&&params.get('poll')==='1'){
   const people=await messagePeople(api,actor),rows=await listConversations(api,actor);
   return json(res,200,{unread:rows.reduce((n,r)=>n+unreadCount(r,actor,people),0),mentions:rows.reduce((n,r)=>n+(r.payload.prefs[actor.id]?.muted?0:visibleMessages(r,actor,people).filter(m=>!m.deletedAt&&!(r.payload.prefs[actor.id]?.readIds||[]).includes(m.id)&&m.authorId!==actor.id&&m.mentions?.includes(actor.id)).length),0),threads:rows.map(r=>({id:r.id,revision:r.revision,unread:unreadCount(r,actor,people)}))});
  }
  if(req.method==='GET'&&params.get('file'))return await sendTeamFile(req,res,uuid(id),actor,await messagePeople(api,actor),api,env,params.get('file'),fileStore?.get);
  if(req.method==='POST'){
   const people=await messagePeople(api,actor);
   if(f.action==='message-create'){
    if(f.person){if(f.kind!=='direct')throw new HttpError(400,'Choose a person.');if(!messageBody(f.body||''))throw new HttpError(400,'Write a message.');uuid(f.messageId);f.members=JSON.stringify([uuid(f.person)]);}
    const context=await conversationContext(params,actor,people,api),created=await createConversation(api,actor,people,f,context);
    if(f.person){const sent=await changeConversation(api,created,actor,people,{action:'message-send',messageId:f.messageId,body:f.body,files:'[]'});if(!sent.duplicate)await notifyTeamMessage({api,actor,people,thread:sent.thread,message:sent.message,env,fetcher});}
    res.statusCode=303;res.setHeader('Location',redirect(address(created)).replaceAll('&amp;','&'));return res.end();
   }
   uuid(id);
   if(f.type==='blob.generate-client-token')return json(res,200,await uploadTeamFile({...req,body:f},id,actor,people,api,env,fileStore?.generate));
   if(f.action==='message-file-upload')return json(res,200,await uploadSmallTeamFile(id,actor,people,api,env,f,fileStore?.put));
   if(f.action==='message-file-save'){const result=await attachTeamFile(id,actor,people,api,env,f,fileStore?.head);return json(res,200,{file:result.file});}
   const result=await changeConversation(api,id,actor,people,f);
   let pending=false;if(f.action==='message-send'&&!result.duplicate)pending=await notifyTeamMessage({api,actor,people,thread:result.thread,message:result.message,env,fetcher});
   if(wantsJson)return json(res,200,{saved:true,pending,revision:result.thread.revision});
   res.statusCode=303;res.setHeader('Location',redirect(address(id,{...(f.parentId?{reply:f.parentId}:{}),...(pending?{email:'pending'}:{})})).replaceAll('&amp;','&'));return res.end();
  }
  if(req.method!=='GET')throw new HttpError(405,'Use GET or POST for Messages.');
  const body=await messagesPage(params,actor,api,env);
  res.statusCode=200;res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(frame((params.get('email')==='pending'?'<p role="status">Your message is saved. An email alert could not be confirmed.</p>':'')+body));
 }catch(e){
  const status=e instanceof HttpError?e.status:503,error=e instanceof HttpError?e.message:'Messages could not connect. Please try again; your unsent message is below.';
  if(wantsJson)return json(res,status,{error});
  let body='<p role="alert">'+esc(error)+'</p>';
  if(req.method==='POST')try{body=await messagesPage(params,actor,api,env,f,error);if(f.action==='message-edit'&&f.body)body+='<h2>Your unsaved edit</h2><pre class="source-text">'+esc(f.body)+'</pre>';}catch{if(f.body)body+='<h2>Your unsent message</h2><pre class="source-text">'+esc(f.body)+'</pre>';}
  res.statusCode=status;res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(frame(body));
 }
}
