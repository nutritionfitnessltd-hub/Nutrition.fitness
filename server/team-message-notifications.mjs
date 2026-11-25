import {deliverNotification,exchangeConfigured} from './studio-notifications.mjs';
import {visibleMessages} from './team-message-store.mjs';
import {url} from './studio-ui.mjs';
export async function notifyTeamMessage({api,actor,people,thread,message,env,fetcher=fetch}){
 if(!message||!exchangeConfigured(env))return false;
 let pending=false;
 for(const person of people){
  const pref=thread.payload.prefs[person.id];
  if(person.id===actor.id||!person.email||!pref?.email||pref.muted||Date.now()-Date.parse(pref.lastOpened||0)<5*60*1000)continue;
  // Resolve membership again: an email preference cannot grant conversation access.
  try{if(!visibleMessages(thread,{role:'staff',id:person.id},people).some(m=>m.id===message.id))continue;}catch{continue;}
  try{
   const result=await deliverNotification({api,actor:{role:'system',id:'team-message'},env,fetcher,event:{type:'team-message',key:'team-message:'+thread.id+':'+message.id+':'+person.id,recipient:person.email,title:'You have an unread Team message',message:'A human team member has sent a message. Sign in to Messages to read and reply.',link:'https://team.nutrition.fitness'+url('messages',{conversation:thread.id}).replaceAll('&amp;','&')}});
   if(result!=='accepted')pending=true;
  }catch{pending=true;}
 }
 return pending;
}
