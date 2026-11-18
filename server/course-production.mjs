import {createHash} from 'node:crypto';
import {HttpError,requireSecret} from './platform.mjs';
import {blankFields,cleanText} from './studio-model.mjs';
import {saveRecord,itemTable} from './studio-store.mjs';
export const productionDraftId=id=>'studio:imogen:'+createHash('sha256').update(id).digest('hex').slice(0,24);
const actor={id:'imogen-course-production',role:'staff',name:'Imogen',access:{library:true,edit:true}};
function link(raw,host,prefix){let u;try{u=new URL(raw);}catch{throw new HttpError(400,'Invalid production link.');}if(u.protocol!=='https:'||u.hostname!==host||u.username||u.password||!decodeURIComponent(u.pathname).startsWith(prefix))throw new HttpError(400,'Link is outside the production destination.');return u.href;}
export async function productionAction(req,input,{env,api,index}){
 requireSecret(req,env.NUFI_COURSE_PRODUCTION_TOKEN);
 if(!input||typeof input!=='object'||Array.isArray(input))throw new HttpError(400,'Supply a production action.');
 if(input.action==='status')return {connected:true,store:'Nutrition.Fitness Studio',publishing:false};
 if(!['source','save-draft','read-draft'].includes(input.action))throw new HttpError(400,'Unsupported production action.');
 const source=index.records.find(r=>r.id===input.sourceId&&r.group==='Courses');if(!source)throw new HttpError(404,'Choose an existing course source.');
 const id=productionDraftId(source.id),read=async()=>{const rows=await api(itemTable+'?id=eq.'+encodeURIComponent(id)+'&select=id,payload,revision&limit=1',{service:true});return rows[0]||null;};
 const current=await read();
 if(input.action==='source')return {source,draft:current,draftId:id};
 if(input.action==='read-draft')return {draft:current};
 const allowed=['action','sourceId','expectedRevision','title','body','introduction','script','takeaway','activity','canvaUrl','files'];
 if(Object.keys(input).some(k=>!allowed.includes(k)))throw new HttpError(400,'Only lesson draft fields may be changed.');
 if(!Number.isInteger(input.expectedRevision)||input.expectedRevision<0)throw new HttpError(400,'Supply the revision read before editing.');
 if((current?.revision||0)!==input.expectedRevision)throw new HttpError(409,'Draft changed. Read it again before saving.');
 if(current&&current.payload.status!=='Draft')throw new HttpError(409,'Draft has entered review. Return it to Draft in Studio before editing.');
 const title=cleanText(input.title||source.title,200),body=cleanText(input.body||'',100000);if(!title||!body)throw new HttpError(400,'Add a title and sourced lesson body.');
 const canvaUrl=link(input.canvaUrl,'www.canva.com','/design/');
 if(!Array.isArray(input.files)||!input.files.length||input.files.length>20)throw new HttpError(400,'Attach checked exports.');
 const files=input.files.map(f=>{if(!f||!Number.isSafeInteger(f.bytes)||f.bytes<=0||!/^[a-f0-9]{64}$/.test(f.sha256||''))throw new HttpError(400,'Files need checked size and SHA-256.');return {name:cleanText(f.name,240),url:link(f.url,'nutritionfitness.sharepoint.com','/sites/Nutrition.fitness/Shared Documents/Content Library/Courses/'),bytes:f.bytes,sha256:f.sha256};});
 const record={id,kind:'lesson',title,status:'Draft',parent:null,sourceId:source.id,comments:current?.payload.comments||[],source:{id:source.id,needsChecking:true},fields:{...blankFields('lesson'),body,...Object.fromEntries(['introduction','script','takeaway','activity'].map(k=>[k,cleanText(input[k]||'',100000)])),production:{worker:'Imogen',sourceId:source.id,canvaUrl,files,checkedAt:new Date().toISOString(),reviewRequired:true}}};
 await saveRecord(api,actor,record,input.expectedRevision);
 const saved=await read();if(!saved||saved.revision!==input.expectedRevision+1||saved.payload.status!=='Draft'||saved.payload.sourceId!==source.id)throw new HttpError(503,'Draft save could not be verified. Read before retrying.');
 return {id,revision:saved.revision,status:'Draft',reviewUrl:'/content-library/?work=1&studio=item&id='+encodeURIComponent(id),record:saved.payload};
}
