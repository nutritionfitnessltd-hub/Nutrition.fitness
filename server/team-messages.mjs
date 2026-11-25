import {randomUUID} from 'node:crypto';
import {HttpError,uuid} from './platform.mjs';
import {canAccess} from './library-permissions.mjs';
import {taskContext} from './task-messages.mjs';
import {human,messagePeople,messageName,readThread,membership,visibleMessages,announcementsId,listConversations,unreadCount,createConversation,changeConversation,canManage} from './team-message-store.mjs';
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
 form('message-send',hidden('messageId',retained.messageId||randomUUID())+hidden('parentId',root?.id||'')+hidden('files',retained.files||'[]')+textarea('body','Message',retained.body||'',4)+'<label>Mention a person<select data-message-mention><option value="">Choose a name</option>'+people.filter(x=>p.kind==='announcements'||p.members.some(m=>m.id===x.id)).map(x=>'<option>'+esc(x.name)+'</option>').join('')+'</select></label>'+
 (uploads?'<div data-message-upload data-prefix="'+teamFilePrefix(row.id,actor)+'"><label>Attach files<input type="file" multiple data-message-files accept=".jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx,.pptx,.zip,.mp4,.webm,.mp3"></label><p class="meta">Up to five files per message; 250 MB each. Files stay private to this conversation.</p><button type="button" data-message-upload-button>Attach selected files</button><progress hidden max="100" value="0" aria-label="Upload progress"></progress><p role="status" data-message-upload-status></p><ul data-message-staged>'+staged.map(file=>'<li><label class="check"><input type="checkbox" data-staged-file value="'+file.id+'"'+(String(retained.files||'').includes(file.id)?' checked':'')+'><span>'+esc(file.name)+'</span></label></li>').join('')+'</ul></div>':'<p class="meta">Private file uploads are not connected in this environment.</p>'),{section:'messages',conversation:row.id},root?'Send reply':p.kind==='announcements'?'Post announcement':'Send message','data-message-compose')+'</section>';
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
 const q=String(params.get('q')||'').trim().slice(0,100),context=await conversationContext(params,actor,people,api);
 const sidebar='<aside class="message-sidebar"><a class="btn primary" href="'+address(null,{new:'1'})+'">New conversation</a><nav aria-label="Conversations">'+rows.map(r=>{const n=unreadCount(r,actor,people),pref=r.payload.prefs[actor.id];return '<a href="'+address(r.id)+'"'+(r.id===selected?' aria-current="page"':'')+'><strong>'+esc(titleFor(r,actor,people))+'</strong>'+(n?'<span class="message-count" aria-label="'+n+' unread">'+n+'</span>':'')+'<small>'+esc(r.payload.kind==='announcements'?'Everyone':r.payload.kind==='direct'?'Direct message':r.payload.members.length+' people')+(pref?.muted?' · Muted':'')+'</small></a>';}).join('')+'</nav></aside>';
 let main='';
 if(params.get('new')||retained.action==='message-create'){
  main='<section class="message-new"><h2>Start a conversation</h2><p>Choose human team members. Your conversation is visible only to its members.</p>'+(context?'<p>Linked to: '+esc(context.title)+'</p>':'')+(error?'<p role="alert">'+esc(error)+'</p>':'')+
  form('message-create',hidden('conversationId',retained.conversationId||randomUUID())+hidden('members',retained.members||'[]')+select('kind','Conversation type',{direct:'Direct message',group:'Group conversation'},context?'group':retained.kind||'direct')+input('title','Group name',retained.title||context?.title||'','text','maxlength="100"')+'<fieldset><legend>People</legend>'+people.filter(p=>p.id!==actor.id).map(p=>'<label class="check"><input type="checkbox" name="member_'+p.id+'" data-message-member value="1"'+(String(retained.members||'').includes(p.id)?' checked':'')+'><span>'+esc(p.name)+'</span></label>').join('')+'</fieldset>',{section:'messages',...(context?.values||{})},'Start conversation','data-message-create')+'</section>';
 }else if(q){
  const results=[];
  for(const summary of rows){const row=await readThread(api,summary.id);for(const m of visibleMessages(row,actor,people))if(!m.deletedAt&&[m.body,titleFor(row,actor,people),...row.payload.files.filter(f=>f.messageId===m.id&&m.files.includes(f.id)).map(f=>f.name)].some(value=>value.toLocaleLowerCase('en-GB').includes(q.toLocaleLowerCase('en-GB'))))results.push({row,m});}
  main='<section><h2>Search results</h2><p>'+results.length+' messages match “'+esc(q)+'”.</p>'+results.slice(-100).reverse().map(({row,m})=>'<article class="message-search-result"><a href="'+address(row.id,m.parentId?{reply:m.parentId}:{})+'#message-'+m.id+'">'+esc(titleFor(row,actor,people))+' · '+esc(m.author)+'</a>'+text(m.body,people)+'</article>').join('')+(results.length>100?'<p>Showing the latest 100 matches. Refine your search to see more.</p>':'')+'</section>';
 }else if(selected){
  const row=await readThread(api,selected);membership(row,actor,people);const all=visibleMessages(row,actor,people),reply=params.get('reply'),page=Math.max(1,Number.parseInt(params.get('messagePage'))||1);
  const roots=all.filter(m=>!m.parentId),selectedRoot=reply&&roots.find(m=>m.id===reply);
  const visible=reply?(selectedRoot?[selectedRoot,...all.filter(m=>m.parentId===reply)]:[]):roots.slice(-page*30,roots.length-(page-1)*30||undefined);
  main='<section class="message-discussion" data-message-thread="'+row.id+'" data-thread-revision="'+row.revision+'" data-seen-seq="'+row.payload.lastSeq+'"><header class="message-discussion-heading"><div><h2>'+esc(titleFor(row,actor,people))+'</h2><p class="meta">'+esc(row.payload.kind==='announcements'?'Administrator announcements · Everyone can reply':row.payload.kind==='direct'?'Private direct conversation':'Private group conversation')+'</p>'+(row.payload.context?'<a href="'+esc(row.payload.context.href)+'">'+esc(row.payload.context.title)+'</a>':'')+'</div>'+button('Refresh',address(row.id,reply?{reply}:{}))+'</header>'+memberSettings(row,actor,people)+
  '<p class="message-arrived" role="status" data-message-arrived hidden>New activity is available. <a href="'+address(row.id,reply?{reply}:{})+'">Load new messages</a>. Your unsent text stays here until you refresh.</p><div class="message-stream">'+(visible.length?visible.map(m=>renderMessage(m,row,actor,people,all.filter(x=>x.parentId===m.id).length)).join(''):'<p class="message-empty">No messages here yet.</p>')+'</div>'+
  (!reply&&roots.length>30?'<nav class="pages">'+(roots.length>page*30?button('Older messages',address(row.id,{messagePage:page+1})): '')+(page>1?button('Newer messages',address(row.id,{messagePage:page-1})): '')+'</nav>':'')+
  form('message-read',hidden('messageIds',JSON.stringify(visible.map(m=>m.id))),{section:'messages',conversation:row.id},'Mark displayed messages read','data-message-read')+
  compose(row,actor,people,params,retained.action==='message-send'?retained:{},error,!!env.BLOB_READ_WRITE_TOKEN)+'</section>';
 }else main='<section class="message-welcome"><h2>A place for your team to talk</h2><p>Start a private conversation, catch up with your groups or read Team announcements.</p>'+button('Read Team announcements',address(announcementsId))+'<p class="meta">Messages are human-only. AI team members cannot receive or read these conversations.</p></section>';
 return heading('Messages','Conversations with your human team.')+'<form class="message-search" action="/content-library/">'+hidden('work','1')+hidden('studio','messages')+input('q','Search your messages',q,'search','maxlength="100" placeholder="Find a message or attachment…"')+'<button>Search</button></form>'+
 '<div class="team-messages">'+sidebar+'<div class="message-main">'+main+'</div></div><script type="module" src="/team-messages.js"></script>';
}
const json=(res,status,payload)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','private, no-store');res.end(JSON.stringify(payload));};
export async function handleTeamMessages(req,res,{params,actor,api,env,fetcher=fetch,fileStore}){
 human(actor);res.setHeader('Cache-Control','private, no-store');
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
    const context=await conversationContext(params,actor,people,api),created=await createConversation(api,actor,people,f,context);
    res.statusCode=303;res.setHeader('Location',address(created).replaceAll('&amp;','&'));return res.end();
   }
   uuid(id);
   if(f.type==='blob.generate-client-token')return json(res,200,await uploadTeamFile({...req,body:f},id,actor,people,api,env,fileStore?.generate));
   if(f.action==='message-file-upload')return json(res,200,await uploadSmallTeamFile(id,actor,people,api,env,f,fileStore?.put));
   if(f.action==='message-file-save'){const result=await attachTeamFile(id,actor,people,api,env,f,fileStore?.head);return json(res,200,{file:result.file});}
   const result=await changeConversation(api,id,actor,people,f);
   let pending=false;if(f.action==='message-send'&&!result.duplicate)pending=await notifyTeamMessage({api,actor,people,thread:result.thread,message:result.message,env,fetcher});
   if(wantsJson)return json(res,200,{saved:true,pending,revision:result.thread.revision});
   res.statusCode=303;res.setHeader('Location',address(id,{...(f.parentId?{reply:f.parentId}:{}),...(pending?{email:'pending'}:{})}).replaceAll('&amp;','&'));return res.end();
  }
  if(req.method!=='GET')throw new HttpError(405,'Use GET or POST for Messages.');
  const body=await messagesPage(params,actor,api,env);
  res.statusCode=200;res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(studioFrame((params.get('email')==='pending'?'<p role="status">Your message is saved. An email alert could not be confirmed.</p>':'')+body,'messages',actor));
 }catch(e){
  const status=e instanceof HttpError?e.status:503,error=e instanceof HttpError?e.message:'Messages could not connect. Please try again; your unsent message is below.';
  if(wantsJson)return json(res,status,{error});
  let body='<p role="alert">'+esc(error)+'</p>';
  if(req.method==='POST')try{body=await messagesPage(params,actor,api,env,f,error);if(f.action==='message-edit'&&f.body)body+='<h2>Your unsaved edit</h2><pre class="source-text">'+esc(f.body)+'</pre>';}catch{if(f.body)body+='<h2>Your unsent message</h2><pre class="source-text">'+esc(f.body)+'</pre>';}
  res.statusCode=status;res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(studioFrame(body,'messages',actor));
 }
}
