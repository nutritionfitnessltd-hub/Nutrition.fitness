import {randomUUID} from 'node:crypto';
import {HttpError} from './platform.mjs';
import {accessFromForm} from './library-permissions.mjs';
const table='/rest/v1/nufi_studio_items',prefix='studio:account-preview:',service={service:true};
const clone=value=>structuredClone(value);
function adminOnly(actor){if(actor.role!=='admin')throw new HttpError(403,'Only the administrator can open a working copy.');}
export async function accountPreview(fields,{actor,api}){
 adminOnly(actor);
 const id=String(fields.staff||'');if(!/^[a-f0-9-]{36}$/i.test(id))throw new HttpError(400,'Choose a team member to preview.');
 const access=accessFromForm(fields);
 const [person]=await api('/rest/v1/nufi_library_staff?select=id,name,email&id=eq.'+encodeURIComponent(id),service);
 if(!person)throw new HttpError(404,'This team member is unavailable.');
 const session={id:prefix+randomUUID(),kind:'account-preview',ownerId:actor.id,expiresAt:Date.now()+7200000,
  actor:{role:'staff',id:person.id,name:person.name,email:person.email,access},changes:{}};
 const saved=await api('/rest/v1/rpc/nufi_studio_save',{...service,method:'POST',payload:{item:session.id,expected:0,document:session,editor_name:'admin:'+actor.id}});
 if(!saved.length)throw new HttpError(503,'The working copy could not be created. Please try again.');
 return '/content-library/?work=1&studio=home&accountPreview='+encodeURIComponent(session.id);
}
export async function workingCopy(api,actor,id){
 adminOnly(actor);
 if(!/^studio:account-preview:[a-f0-9-]{36}$/.test(id))throw new HttpError(404,'This working copy is unavailable.');
 let [row]=await api(table+'?select=id,payload,revision&id=eq.'+encodeURIComponent(id),service);
 if(!row||row.payload.kind!=='account-preview'||row.payload.ownerId!==actor.id)throw new HttpError(404,'This working copy is unavailable.');
 if(row.payload.expiresAt<Date.now())throw new HttpError(410,'This working copy has expired. Open a new one from Team.');
 const session=clone(row.payload);
 async function persist(){
  if(Buffer.byteLength(JSON.stringify(session))>4000000)throw new HttpError(413,'Open a new working copy to continue testing.');
  const [saved]=await api('/rest/v1/rpc/nufi_studio_save',{...service,method:'POST',payload:{item:id,expected:row.revision,document:session,editor_name:'admin:'+actor.id}});
  if(!saved)throw new HttpError(409,'This working copy changed in another window. Reload before saving.');
  row=saved;
 }
 function matches(record,query){
  for(const [key,value] of query){
   if(['select','order','limit','offset'].includes(key))continue;
   if(value.startsWith('eq.')&&String(record[key])!==value.slice(3))return false;
   if(value.startsWith('like.')||value.startsWith('not.like.')){
    const negative=value.startsWith('not.'),pattern=value.slice(negative?9:5).replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/[%*]/g,'.*');
    const match=new RegExp('^'+pattern+'$').test(String(record[key]||''));if(negative?match:!match)return false;
   }
  }return true;
 }
 const sandbox=async(path,options={})=>{
  const url=new URL(path,'https://copy.invalid'),method=options.method||'GET',name=url.pathname;
  if(method==='GET'){
   const rows=await api(path,options);if(!Array.isArray(rows))return rows;
   const changes=session.changes[name];
   const result=rows.filter(r=>!String(r.id||r.item_id||'').startsWith(prefix)).filter(r=>!changes?.[r.id]||matches(changes[r.id],url.searchParams)).map(r=>clone(changes?.[r.id]||r));
   if(changes&&Number(url.searchParams.get('offset')||0)===0)for(const record of Object.values(changes)){
    if(!rows.some(r=>r.id===record.id)&&matches(record,url.searchParams))result.push(clone(record));
   }return result;
  }
  if(name==='/rest/v1/rpc/nufi_studio_save'&&method==='POST'){
   const {item,expected,document}=options.payload;
   if(String(item).startsWith(prefix))throw new HttpError(403,'This record cannot be changed.');
   const changes=session.changes[table]||={};
   const [original]=changes[item]?[changes[item]]:await api(table+'?select=*&id=eq.'+encodeURIComponent(item),service);
   if((original?.revision||0)!==expected)return [];
   const saved={id:item,payload:clone(document),revision:expected+1,updated_at:new Date().toISOString()};
   changes[item]=saved;await persist();return [clone(saved)];
  }
  if(method==='PATCH'&&['/rest/v1/nufi_library_projects','/rest/v1/nufi_library_tasks'].includes(name)){
   const changes=session.changes[name]||={},records=await sandbox(path);
   for(const record of records)changes[record.id]={...record,...clone(options.payload)};
   if(records.length)await persist();return records.map(r=>clone(changes[r.id]));
  }
  if(method==='POST'&&['/rest/v1/rpc/nufi_studio_attach_item','/rest/v1/rpc/nufi_studio_import'].includes(name)){
   const p=options.payload,attach=name.endsWith('attach_item'),records=attach?[p.document]:p.records;
   const projectTable='/rest/v1/nufi_library_projects';
   const [project]=await sandbox(projectTable+'?select=*&id=eq.'+encodeURIComponent(p.project_id)+'&creator_id=eq.'+session.actor.id);
   if(!project||project.revision!==p.expected)throw new HttpError(409,'This project changed. Reopen it before saving.');
   for(const record of records){
    if(String(record.id).startsWith(prefix)||(await sandbox(table+'?select=*&id=eq.'+encodeURIComponent(record.id))).length)throw new HttpError(409,'This item already exists. Reopen the project before saving.');
   }
   const entries=attach?[p.entry]:records.map(r=>({id:r.id,week:0,title:r.title,kind:r.kind,record:r.id,assignedAsset:true,status:'In progress',notes:'Compare the imported draft with its source.'}));
   let next=[...project.entries];
   for(const entry of entries){const {replaces,...clean}=entry;next=replaces?next.map(e=>e.id===replaces?clean:e):[...next,clean];}
   (session.changes[projectTable]||={})[project.id]={...project,entries:next,revision:project.revision+1};
   for(const record of records)(session.changes[table]||={})[record.id]={id:record.id,payload:clone(record),revision:1,updated_at:new Date().toISOString()};
   await persist();return true;
  }
  throw new HttpError(403,'This action is unavailable in the working copy.');
 };
 return {actor:session.actor,api:sandbox};
}
export function copyUrl(value,id){
 const raw=value.replaceAll('&amp;','&');if(!raw.startsWith('/content-library/'))return value;
 const url=new URL(raw,'https://copy.invalid');url.searchParams.set('work','1');url.searchParams.set('accountPreview',id);return url.pathname+'?'+url.searchParams;
}
export function copyResponse(res,id){
 let html=false,json=false;
 return {
  get statusCode(){return res.statusCode;},set statusCode(value){res.statusCode=value;},
  setHeader(name,value){
   if(name.toLowerCase()==='set-cookie')return;
   if(name.toLowerCase()==='content-type'){html=String(value).includes('text/html');json=String(value).includes('application/json');}
   if(name.toLowerCase()==='location')value=copyUrl(value,id);res.setHeader(name,value);
  },
  end(body){
   res.setHeader('Cache-Control','private, no-store');
   if(html&&typeof body==='string'){
    body=body.replace(/\b(href|action|formaction|src)="([^"]*)"/g,(_,attr,value)=>attr+'="'+copyUrl(value,id).replaceAll('&','&amp;')+'"');
    body=body.replace('<title>','<title>Working copy · ').replace('</head>','<script src="/account-working-copy.js"></script></head>');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'self'");
   }else if(json&&typeof body==='string'){
    const data=JSON.parse(body);if(data.previewUrl)data.previewUrl=copyUrl(data.previewUrl,id);body=JSON.stringify(data);
   }return res.end(body);
  }
 };
}
