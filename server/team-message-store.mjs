import {createHash,randomUUID} from 'node:crypto';
import {HttpError,uuid} from './platform.mjs';
import {includeAdministrator} from './team-owner.mjs';
import {allRows} from './studio-store.mjs';

export const messageTable='/rest/v1/nufi_team_threads';
export const announcementsId='00000000-0000-4000-8000-000000000001';
const service={service:true};
export function human(actor){
 if(!actor||!['admin','staff'].includes(actor.role))throw new HttpError(403,'Messages are for signed-in human team members.');
 uuid(actor.id);
}
export async function messagePeople(api,actor){
 human(actor);
 let people=await allRows(api,'/rest/v1/nufi_library_staff?select=id,name,email,created_at&order=name,id');
 if(actor.role==='admin')people=await includeAdministrator(api,actor,people);
 if(!people.some(p=>p.id===actor.id))people.push({id:actor.id,name:actor.name||'Administrator',created_at:new Date().toISOString()});
 return people;
}
export const messageName=(people,id)=>people.find(p=>p.id===id)?.name||'Team member';
export function membership(thread,actor,people){
 human(actor);const p=thread.payload;
 if(p.kind==='announcements'){
  if(!people.some(x=>x.id===actor.id))throw new HttpError(403,'This conversation is unavailable.');
  return {id:actor.id,joinedAt:people.find(x=>x.id===actor.id)?.created_at||p.createdAt,joinedSeq:1};
 }
 const member=p.members.find(m=>m.id===actor.id);
 if(!member)throw new HttpError(403,'This conversation is private to its members.');
 return member;
}
export const visibleMessage=(m,member)=>m.seq>=member.joinedSeq&&Date.parse(m.at)>=Date.parse(member.joinedAt);
export function visibleMessages(thread,actor,people){
 const member=membership(thread,actor,people),all=thread.payload.messages;
 const roots=new Set(all.filter(m=>!m.parentId&&visibleMessage(m,member)).map(m=>m.id));
 return all.filter(m=>visibleMessage(m,member)&&(!m.parentId||roots.has(m.parentId)));
}
const emptyAnnouncements=()=>({id:announcementsId,revision:0,payload:{kind:'announcements',title:'Team announcements',owner:null,createdAt:'1970-01-01T00:00:00.000Z',members:[],prefs:{},messages:[],files:[],lastSeq:0}});
export async function readThread(api,id){
 uuid(id);const [row]=await api(messageTable+'?id=eq.'+id+'&select=id,payload,revision,updated_at',service);
 if(!row&&id===announcementsId)return emptyAnnouncements();
 if(!row)throw new HttpError(404,'This conversation is unavailable.');
 return row;
}
async function persist(api,row){
 const p=row.payload;
 const summary={kind:p.kind,title:p.title,owner:p.owner,createdAt:p.createdAt,members:p.members,prefs:p.prefs,lastSeq:p.lastSeq,messages:p.messages.map(({id,seq,at,authorId,parentId,deletedAt,mentions})=>({id,seq,at,authorId,parentId,deletedAt,mentions}))};
 const doc={member_ids:p.members.map(m=>m.id),payload:p,summary,revision:row.revision+1,updated_at:new Date().toISOString()};
 const saved=await api(messageTable+(row.revision?'?id=eq.'+row.id+'&revision=eq.'+row.revision:'?on_conflict=id'),{service:true,method:row.revision?'PATCH':'POST',headers:{Prefer:row.revision?'return=representation':'resolution=ignore-duplicates,return=representation'},payload:row.revision?doc:{id:row.id,...doc}});
 return saved[0];
}
export async function mutateThread(api,id,actor,people,mutate){
 for(let attempt=0;attempt<4;attempt++){
  const row=await readThread(api,id);membership(row,actor,people);
  const result=await mutate(row);
  if(result?.unchanged)return {...result,thread:row};
  const saved=await persist(api,row);
  if(saved)return {...result,thread:saved};
 }
 throw new HttpError(409,'This conversation is busy. Your message is still here; please try again.');
}
function title(s){const t=String(s||'').trim();if(!t||t.length>100)throw new HttpError(400,'Use a conversation name of up to 100 characters.');return t;}
export function messageBody(value){
 if(typeof value!=='string'||value.length>4000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw new HttpError(400,'Write up to 4,000 characters.');
 return value.trim();
}
export async function createConversation(api,actor,people,f,context=null){
 human(actor);
 let ids;try{ids=JSON.parse(f.members||'[]');}catch{throw new HttpError(400,'Choose people for this conversation.');}
 if(!Array.isArray(ids)||ids.length>30)throw new HttpError(400,'Choose up to 30 people.');
 if(!ids.length)ids=Object.keys(f).filter(k=>k.startsWith('member_')&&f[k]==='1').map(k=>k.slice(7));
 ids=[...new Set([actor.id,...ids.map(id=>uuid(id))])].sort();
 if(ids.length<2||ids.some(id=>!people.some(p=>p.id===id)))throw new HttpError(400,'Choose at least one other human team member.');
 const kind=f.kind==='direct'?'direct':'group';
 if(kind==='direct'&&ids.length!==2)throw new HttpError(400,'Choose one person for a direct message.');
 const hash=createHash('sha256').update((kind==='direct'?'human-direct:':'human-context:'+JSON.stringify(context?.values)+':')+ids.join(':')).digest('hex');
 const id=kind==='direct'||context?[hash.slice(0,8),hash.slice(8,12),'4'+hash.slice(13,16),'8'+hash.slice(17,20),hash.slice(20,32)].join('-'):uuid(f.conversationId);
 const at=new Date().toISOString();
 const row={id,revision:0,payload:{kind,title:kind==='direct'?'Direct message':title(f.title),owner:actor.id,createdAt:at,context,members:ids.map(id=>({id,joinedSeq:1,joinedAt:at})),prefs:{},messages:[],files:[],lastSeq:0}};
 const saved=await persist(api,row);
 if(!saved){const existing=await readThread(api,id);membership(existing,actor,people);if(existing.payload.kind!==kind||kind==='group'&&!context&&existing.payload.owner!==actor.id)throw new HttpError(409,'Choose a new conversation.');}
 return id;
}
export function canManage(thread,actor){return thread.payload.kind==='group'&&(thread.payload.owner===actor.id||actor.role==='admin');}
export async function changeConversation(api,id,actor,people,f){
 return mutateThread(api,id,actor,people,row=>{
  const p=row.payload,member=membership(row,actor,people),pref=p.prefs[actor.id]||{};
  if(f.action==='message-read'){
   let ids;try{ids=JSON.parse(f.messageIds||'[]');}catch{throw new HttpError(400,'Reload the conversation before marking messages read.');}
   if(!Array.isArray(ids)||ids.length>2000)throw new HttpError(400,'Reload this conversation.');
   const visible=new Set(visibleMessages(row,actor,people).map(m=>m.id));
   p.prefs[actor.id]={...pref,readIds:[...new Set([...(pref.readIds||[]),...ids.filter(id=>visible.has(id))])],lastOpened:new Date().toISOString()};return {};
  }
  if(f.action==='message-preferences'){
   p.prefs[actor.id]={...pref,muted:f.muted==='1',email:f.email==='1'};return {};
  }
  if(f.action==='message-members'){
   if(!canManage(row,actor))throw new HttpError(403,'Only the group owner or a participating administrator can manage this group.');
   const person=uuid(f.person);
   if(f.operation==='add'){
    if(!people.some(p=>p.id===person))throw new HttpError(400,'Choose a human team member.');
    if(p.members.some(m=>m.id===person))return {unchanged:true};
    if(p.members.length>=30)throw new HttpError(400,'Use up to 30 people in a group.');
    p.members.push({id:person,joinedSeq:p.lastSeq+1,joinedAt:new Date().toISOString()});delete p.prefs[person];
   }else if(f.operation==='remove'){
    if(person===p.owner)throw new HttpError(400,'The group owner must remain in the conversation.');
    p.members=p.members.filter(m=>m.id!==person);delete p.prefs[person];
   }else throw new HttpError(400,'Choose add or remove.');
   return {};
  }
  if(f.action==='message-send'){
   const messageId=uuid(f.messageId),body=messageBody(f.body||'');
   let files;try{files=JSON.parse(f.files||'[]');}catch{throw new HttpError(400,'Reattach the files before sending.');}
   if(!Array.isArray(files)||files.length>5)throw new HttpError(400,'Attach up to five files to a message.');
   files=[...new Set(files.map(x=>uuid(x)))];
   const parentId=f.parentId?uuid(f.parentId):null;
   const prior=p.messages.find(m=>m.id===messageId);
   const fingerprint=createHash('sha256').update(JSON.stringify({body,parentId,files})).digest('hex');
   if(prior){if(prior.authorId!==actor.id||prior.fingerprint!==fingerprint)throw new HttpError(409,'This message changed. Start a new message.');return {unchanged:true,duplicate:true,message:prior};}
   if(p.messages.filter(m=>m.authorId===actor.id&&Date.now()-Date.parse(m.at)<60000).length>=30)throw new HttpError(429,'You have sent several messages quickly. Please wait a minute before sending another.');
   if(!body&&!files.length)throw new HttpError(400,'Write a message or attach a file.');
   if(p.kind==='announcements'&&!parentId&&actor.role!=='admin')throw new HttpError(403,'Only administrators can post announcements. Everyone can reply.');
   if(parentId&&!visibleMessages(row,actor,people).some(m=>m.id===parentId&&!m.parentId&&!m.deletedAt))throw new HttpError(403,'Reply to a visible message in this conversation.');
   if(files.some(id=>!p.files.some(file=>file.id===id&&file.uploadedBy===actor.id&&!file.messageId)))throw new HttpError(403,'These attachments are unavailable.');
   if(p.messages.length>=2000)throw new HttpError(400,'This conversation has reached 2,000 messages. Start a follow-up conversation to continue; the existing history stays available.');
   const at=new Date().toISOString(),message={id:messageId,seq:++p.lastSeq,authorId:actor.id,author:messageName(people,actor.id),at,body,parentId,files,revision:1,fingerprint,history:[],mentions:people.filter(person=>(p.kind==='announcements'||p.members.some(m=>m.id===person.id))&&body.toLocaleLowerCase('en-GB').includes('@'+person.name.toLocaleLowerCase('en-GB'))).map(p=>p.id)};
   p.messages.push(message);for(const file of p.files.filter(x=>files.includes(x.id)))file.messageId=messageId;
   return {message};
  }
  if(['message-edit','message-delete','message-restore'].includes(f.action)){
   const m=p.messages.find(m=>m.id===uuid(f.messageId));
   if(!m||!visibleMessage(m,member)||m.authorId!==actor.id)throw new HttpError(403,'You can change only your own messages.');
   if(Number(f.messageRevision)!==m.revision)throw new HttpError(409,'This message changed. Reload it before editing.');
   if(f.action==='message-edit'){
    const body=messageBody(f.body||'');if(m.deletedAt||!body&&!m.files.length)throw new HttpError(400,'Write a message before saving.');
    if(m.history.length>=50)throw new HttpError(400,'This message has reached its edit limit. Post a follow-up instead.');
    m.history.push({body:m.body,at:new Date().toISOString()});m.body=body;m.editedAt=new Date().toISOString();
    m.mentions=people.filter(person=>(p.kind==='announcements'||p.members.some(member=>member.id===person.id))&&body.toLocaleLowerCase('en-GB').includes('@'+person.name.toLocaleLowerCase('en-GB'))).map(p=>p.id);
   }else if(f.action==='message-delete')m.deletedAt=new Date().toISOString();
   else delete m.deletedAt;
   m.revision++;return {};
  }
  throw new HttpError(400,'Choose a message action.');
 });
}
export async function listConversations(api,actor){
 human(actor);
 const rows=await allRows(api,messageTable+'?or=(member_ids.cs.{'+actor.id+'},id.eq.'+announcementsId+')&select=id,revision,updated_at,payload:summary&order=updated_at.desc,id');
 if(!rows.some(r=>r.id===announcementsId))rows.unshift(emptyAnnouncements());
 return rows;
}
export function unreadCount(row,actor,people){
 if(row.payload.prefs[actor.id]?.muted)return 0;
 const read=row.payload.prefs[actor.id]?.readSeq||0;
 return visibleMessages(row,actor,people).filter(m=>m.seq>read&&!(row.payload.prefs[actor.id]?.readIds||[]).includes(m.id)&&m.authorId!==actor.id&&!m.deletedAt).length;
}
