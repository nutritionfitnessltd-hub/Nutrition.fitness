import {DraftError,draftDocument,draftResult,draftId} from './worker-drafts.mjs';
const base=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const website='https://nutrition-fitness-website-2.vercel.app';
const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
async function api(path:string,method='GET',payload?:unknown){
 const res=await fetch(base+path,{method,headers,body:payload===undefined?undefined:JSON.stringify(payload)});
 const data=await res.json().catch(()=>null);if(!res.ok)throw new DraftError(res.status===409?409:503,'Content storage did not confirm this request.');return data;
}
async function sha(value:string|Uint8Array){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?new TextEncoder().encode(value):value))).map(n=>n.toString(16).padStart(2,'0')).join('');}
async function readBody(req:Request){
 const reader=req.body?.getReader();if(!reader)throw new DraftError(400,'Provide a request.');
 const chunks=[];let size=0;
 while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>9000000){await reader.cancel();throw new DraftError(413,'Request too large.');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new DraftError(400,'Invalid JSON.');}
}
function imageBytes(value:string){
 const match=/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value||'');if(!match)throw new DraftError(400,'Use a JPEG, PNG or WebP image data URL.');
 const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));if(bytes.length<24||bytes.length>6000000)throw new DraftError(413,'Use an image up to 6 MB.');
 const ascii=(a:number,b:number)=>String.fromCharCode(...bytes.slice(a,b));
 const valid=match[1]==='jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:match[1]==='png'?bytes.slice(0,8).join(',')==='137,80,78,71,13,10,26,10':ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP';
 if(!valid)throw new DraftError(400,'The image bytes do not match their file type.');return {bytes,type:'image/'+match[1],extension:match[1]==='jpeg'?'jpg':match[1]};
}
Deno.serve(async(req:Request)=>{
 const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store'}});
 try{
  if(req.method!=='POST')throw new DraftError(405,'Use POST.');
  const token=req.headers.get('x-nufi-worker-token')||'';
  if(!/^[a-f0-9]{64}$/.test(token))throw new DraftError(401,'Worker connection required.');
  const connections=await api('/rest/v1/nufi_worker_connections?select=id,namespace&enabled=eq.true&token_hash=eq.'+await sha(token));
  const connection=connections[0];if(!connection)throw new DraftError(401,'Worker connection required.');
  const input=await readBody(req),namespace=connection.namespace;
  const rowFor=async(id:string)=>(await api('/rest/v1/nufi_studio_items?select=*&id=eq.'+encodeURIComponent(draftId(id,namespace))))[0];
  if(input.action==='status')return respond({contentManager:'connected',website:'connected',storage:'Website Content Manager',livePublishing:false,binaryAssetUpload:true,reviewUrl:website+'/content-library/?work=1&studio=library&bucket=drafts',workflow:'Draft → Submit for approval → Approve → Test website → Final approval'});
  if(input.action==='list'){
   const offset=Number(input.offset||0),limit=Math.min(Number(input.limit||50),100);
   if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1)throw new DraftError(400,'Invalid page.');
   const rows=await api('/rest/v1/nufi_studio_items?select=*&id=like.'+encodeURIComponent(namespace+'*')+'&order=id&limit='+limit+'&offset='+offset);
   return respond({items:rows.map((r:unknown)=>draftResult(r,website)),nextOffset:rows.length===limit?offset+limit:null});
  }
  if(input.action==='get'){const r=await rowFor(input.id);if(!r)throw new DraftError(404,'Draft not found.');return respond(draftResult(r,website));}
  if(input.action==='save'){
   const r=await rowFor(input.draft?.id),document=draftDocument(input.draft,r,namespace);
   const rows=await api('/rest/v1/rpc/nufi_studio_save','POST',{item:document.id,expected:input.draft.revision,document,editor_name:'worker:'+connection.id});
   if(!rows.length)throw new DraftError(409,'A newer copy is saved. Read it before editing.');return respond(draftResult(rows[0],website));
  }
  if(input.action==='upload'){
   const r=await rowFor(input.id);if(!r)throw new DraftError(404,'Save the draft before uploading its image.');
   if(r.revision!==input.revision)throw new DraftError(409,'Read the current draft before uploading.');
   for(const name of ['alt','credit'])if(typeof input[name]!=='string'||input[name].length>500)throw new DraftError(400,'Provide an image description and credit.');
   const {bytes,type,extension}=imageBytes(input.dataUrl),path=connection.id+'/'+crypto.randomUUID()+'.'+extension;
   const upload=await fetch(base+'/storage/v1/object/worker-content/'+path,{method:'POST',headers:{...headers,'Content-Type':type},body:bytes});
   if(!upload.ok)throw new DraftError(503,'The image upload was not confirmed.');
   const document={...r.payload,status:'Draft',workerImage:{bucket:'worker-content',path,type,bytes:bytes.length,sha256:await sha(bytes)},fields:{...r.payload.fields,imageAlt:input.alt,imageCredit:input.credit}};
   delete document.approval;delete document.articleImage;
   try{
    const rows=await api('/rest/v1/rpc/nufi_studio_save','POST',{item:r.id,expected:input.revision,document,editor_name:'worker:'+connection.id});
    if(!rows.length)throw new DraftError(409,'This draft changed. Reopen it before adding the image.');return respond(draftResult(rows[0],website));
   }catch(error){await fetch(base+'/storage/v1/object/worker-content',{method:'DELETE',headers,body:JSON.stringify({prefixes:[path]})});throw error;}
  }
  throw new DraftError(400,'Choose status, list, get, save or upload. Workers cannot approve or publish content.');
 }catch(error){return respond({error:error instanceof DraftError?error.message:'The worker connection could not complete the request.'},error instanceof DraftError?error.status:503);}
});
