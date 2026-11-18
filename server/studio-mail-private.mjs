import {createHmac,createCipheriv,createDecipheriv,randomBytes,timingSafeEqual} from 'node:crypto';
import {HttpError,uuid} from './platform.mjs';

const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
function key(env){
  if(!env.NUFI_LIBRARY_CATALOGUE_KEY)throw new HttpError(503,'The welcome email connection is unavailable.');
  return createHmac('sha256',env.NUFI_LIBRARY_CATALOGUE_KEY).update('welcome-email-encryption:v1').digest();
}
export function welcomeGeneration(env,person){
  return createHmac('sha256',key(env)).update(person.id+':'+person.code_hash).digest('hex');
}
const aad=event=>Buffer.from(JSON.stringify([event.key,event.staffId,event.recipient,event.generation]));
export function sealWelcomeMessage(env,event,message){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(env),iv);cipher.setAAD(aad(event));
  const encrypted=Buffer.concat([cipher.update(message,'utf8'),cipher.final()]);
  return Buffer.concat([iv,encrypted,cipher.getAuthTag()]).toString('base64url');
}
export function openWelcomeMessage(env,event){
  try{
    if(typeof event.encryptedMessage!=='string'||event.encryptedMessage.length>60000)throw Error();
    const bytes=Buffer.from(event.encryptedMessage,'base64url');if(bytes.length<29)throw Error();
    const decipher=createDecipheriv('aes-256-gcm',key(env),bytes.subarray(0,12));
    decipher.setAAD(aad(event));decipher.setAuthTag(bytes.subarray(-16));
    return Buffer.concat([decipher.update(bytes.subarray(12,-16)),decipher.final()]).toString('utf8');
  }catch{throw new HttpError(409,'This welcome message is unavailable. Prepare a new welcome email.');}
}
export async function welcomeRecipient(api,env,event){
  const rows=await api('/rest/v1/nufi_library_staff?id=eq.'+uuid(event.staffId)+'&select=id,name,email,code_hash',{service:true});
  const person=rows[0];
  if(!person?.code_hash||person.email!==event.recipient||!same(welcomeGeneration(env,person),event.generation))throw new HttpError(409,'This account or its password has changed. Prepare fresh welcome details from Team & permissions.');
  return person;
}
