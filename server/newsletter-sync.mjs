import {randomUUID,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {HttpError} from './platform.mjs';
import {ghlClient,ghlLocation,ghlCampaignUrl} from './ghl-newsletter-client.mjs';
import {newsletterEligible,newsletterSource,newsletterPayload,digest} from './newsletter-sync-html.mjs';
const configId='private:ghl-newsletter-sync',stateTable='/rest/v1/nufi_newsletter_sync';
const privateRead={service:true};
const write=payload=>({service:true,method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},payload});
export async function readNewsletterConnection(api){return (await api('/rest/v1/nufi_library_display?select=payload&id=eq.'+configId,privateRead))[0]?.payload||{};}
function sealKey(env){
 if(!/^[a-f0-9]{64}$/i.test(env.NUFI_GHL_SEAL_KEY||''))throw new HttpError(503,'The private GHL connection is not configured yet.');
 return Buffer.from(env.NUFI_GHL_SEAL_KEY,'hex');
}
export function sealGhlToken(token,env){const iv=randomBytes(12).toString('hex'),cipher=createCipheriv('aes-256-gcm',sealKey(env),Buffer.from(iv,'hex'));cipher.setAAD(Buffer.from(configId+':'+ghlLocation));return [iv,cipher.update(token,'utf8','hex')+cipher.final('hex'),cipher.getAuthTag().toString('hex')].join('.');}
export function openGhlToken(sealed,env){try{const [iv,body,tag]=sealed.split('.'),decipher=createDecipheriv('aes-256-gcm',sealKey(env),Buffer.from(iv,'hex'));decipher.setAAD(Buffer.from(configId+':'+ghlLocation));decipher.setAuthTag(Buffer.from(tag,'hex'));return decipher.update(body,'hex','utf8')+decipher.final('utf8');}catch{throw new HttpError(503,'Reconnect the private GHL newsletter integration.');}}
export async function saveNewsletterConnection(f,data,api,env,fetcher=fetch){
 if(data.actor.role!=='admin')throw new HttpError(403,'Administrator access is required.');
 const old=await readNewsletterConnection(api);
 if(f.action==='ghl-sync-run')return runNewsletterSync({api,env,fetcher,limit:1});
 if(f.action==='ghl-sync-resume'){if(!old.sealedToken)throw new HttpError(400,'Connect GHL first.');await ghlClient(openGhlToken(old.sealedToken,env),fetcher).check();await api('/rest/v1/nufi_library_display?on_conflict=id',write({id:configId,payload:{...old,enabled:true}}));return {resumed:true};}
 if(f.action==='ghl-sync-pause'){await api('/rest/v1/nufi_library_display?on_conflict=id',write({id:configId,payload:{...old,enabled:false}}));return {paused:true};}
 if(f.action!=='ghl-sync-connect')throw new HttpError(400,'Choose a newsletter sync action.');
 const token=f.token?.trim();sealKey(env);
 // The account ID is fixed by the server; a wrong-location token cannot pass this read.
 await ghlClient(token,fetcher).check();
 await api('/rest/v1/nufi_library_display?on_conflict=id',write({id:configId,payload:{enabled:true,locationId:ghlLocation,sealedToken:sealGhlToken(token,env),connectedAt:new Date().toISOString(),connectedBy:data.actor.id}}));
 return {connected:true};
}
const sourcePath=id=>'/rest/v1/nufi_studio_items?select=id,payload,revision&id=eq.'+encodeURIComponent(id);
export function canonicalGhlHtml(html){return html.replace(/<!--\s*outlook-fixes-applied\s*-->/g,'').replace(/<!--\[if mso\]><font\b[^>]*><!\[endif\]-->/g,'').replace(/<!--\[if mso\]><\/font><!\[endif\]-->/g,'').replace(/; mso-style-textfill-fill-color: #[a-fA-F0-9]{6};/g,'').replace(/<!--\[if mso\]><p style="margin:0;line-height:8px;mso-line-height-rule:exactly;font-size:8px;background:transparent;">&nbsp;<\/p><!\[endif\]-->/g,'');}
const initialFingerprint=r=>digest([r.name,r.editorType,typeof r.editorContent==='string'?canonicalGhlHtml(r.editorContent):r.editorContent]);
export function remoteFingerprint(r){
 if(r.editorType!=='html'||typeof r.editorContent!=='string')throw new HttpError(409,'The GHL email is no longer an HTML draft. Automatic updates are paused.');
 return digest([r.name,r.editorType,canonicalGhlHtml(r.editorContent),r.subject||'',r.previewText||'',r.fromName||'',r.fromEmail||'']);
}
export async function syncNewsletter({record,revision,api,client,now=Date.now()}){
 const owner=randomUUID(),claimed=await api('/rest/v1/rpc/nufi_claim_newsletter',{service:true,method:'POST',payload:{item:record.id,owner}});
 if(!claimed?.length)return {status:'busy'};
 const state={...claimed[0].state},media={...state.media};state.media=media;
 const persist=async(release=false)=>{
  const rows=await api(stateTable+'?item_id=eq.'+encodeURIComponent(record.id)+'&lease=eq.'+owner,{service:true,method:'PATCH',headers:{Prefer:'return=representation'},payload:{state,updated_at:new Date(now).toISOString(),...(release?{lease:null,lease_until:null}:{})}});
  if(!rows.length)throw new HttpError(409,'Another sync has taken over this newsletter.');
 };
 try{
  if(state.hold){
   if(state.campaignId){const r=await client.get(state.campaignId);const assets=record.newsletterAssetsId?(await api('/rest/v1/nufi_library_display?select=payload&id=eq.'+encodeURIComponent(record.newsletterAssetsId),privateRead))[0]?.payload:null;const expected=await newsletterPayload(newsletterSource(record,assets),media,async()=>{throw new Error('Inspection never uploads');},async()=>{});expected.editorContent=canonicalGhlHtml(expected.editorContent);const actual=canonicalGhlHtml(r.editorContent||'');let start=0,end=0;while(start<actual.length&&actual[start]===expected.editorContent[start])start++;while(end<actual.length-start&&actual[actual.length-1-end]===expected.editorContent[expected.editorContent.length-1-end])end++;state.diagnostic={status:r.status,name:r.name,editorType:r.editorType,contentLength:actual.length,canonicalMatches:canonicalGhlHtml(actual)===canonicalGhlHtml(expected.editorContent),expectedLength:expected.editorContent.length,differenceAt:start,actualDifference:actual.slice(start,actual.length-end).slice(0,1000),expectedDifference:expected.editorContent.slice(start,expected.editorContent.length-end).slice(0,1000)};}
   return {status:'held',id:state.campaignId};
  }
  let remote;
  if(state.campaignId){
   remote=await client.get(state.campaignId);
   if(remote.deleted||remote.status!=='draft'){state.hold=true;throw new HttpError(409,'The GHL copy is '+(remote.deleted?'deleted':remote.status||'not a draft')+'. Automatic updates are stopped.');}
   if(!state.remoteHash&&state.initialHash&&initialFingerprint(remote)!==state.initialHash){state.hold=true;throw new HttpError(409,'The new GHL copy has changed. Automatic updates are paused.');}
   if(state.remoteHash&&remoteFingerprint(remote)!==state.remoteHash&&remoteFingerprint(remote)!==state.pendingUpdate?.hash){state.hold=true;throw new HttpError(409,'The GHL copy has been edited. Automatic updates are paused to keep your changes.');}
  }
  const assetId=record.newsletterAssetsId;
  const assets=/^newsletter-artwork:[a-f0-9-]{36}$/.test(assetId||'')?(await api('/rest/v1/nufi_library_display?select=payload&id=eq.'+encodeURIComponent(assetId),privateRead))[0]?.payload:null;
  const source=newsletterSource(record,assets);
  if(state.sourceHash===source.fingerprint&&state.campaignId){state.status='synced';state.detail='Waiting in GHL for review and scheduling.';state.sourceRevision=revision;delete state.failureAt;return {status:'unchanged',id:state.campaignId};}
  const payload=await newsletterPayload(source,media,client.upload,()=>persist());
  // Re-read before any external write so an old worker snapshot is never exported.
  const latest=(await api(sourcePath(record.id),privateRead))[0];
  if(!latest||latest.revision!==revision||!newsletterEligible(latest.payload))throw new HttpError(409,'The newsletter changed during syncing. The next check will use the newest copy.');
  if(!state.campaignId){
   if(state.pendingCreate&&now-Date.parse(state.pendingCreate.at)>23*3600000){state.hold=true;throw new HttpError(409,'An earlier create was not confirmed. Check GHL before reconnecting this draft to avoid a duplicate.');}
   if(!state.pendingCreate){state.initialHash=initialFingerprint(payload);state.pendingCreate={at:new Date(now).toISOString(),key:'nufi-newsletter-'+randomUUID(),payload};await persist();}
   let created;try{created=await client.create(state.pendingCreate.payload,state.pendingCreate.key);}catch(error){
    // A confirmed validation rejection created nothing; the corrected source may be retried.
    if([400,413,415,422].includes(error.upstreamStatus))delete state.pendingCreate;
    throw error;
   }
   if(typeof created.id!=='string')throw new HttpError(503,'GHL did not confirm the new draft identifier.');
   state.campaignId=created.id;state.campaignUrl=ghlCampaignUrl(created.id);delete state.pendingCreate;
   // Commit the mapping before updating metadata; a retry always reuses this draft.
   await persist();remote=await client.get(created.id);
   if(remote.status!=='draft'||initialFingerprint(remote)!==state.initialHash){state.hold=true;throw new HttpError(409,'The new GHL copy has changed. Automatic updates are paused.');}
   state.remoteHash=remoteFingerprint(remote);await persist();
  }
  state.pendingUpdate={hash:remoteFingerprint(payload)};await persist();
  await client.update(state.campaignId,payload);
  const confirmed=await client.get(state.campaignId);
  if(confirmed.status!=='draft')throw new HttpError(409,'GHL did not confirm a saved draft.');
  state.remoteHash=remoteFingerprint(confirmed);state.sourceHash=source.fingerprint;state.sourceRevision=revision;state.syncedAt=new Date(now).toISOString();state.status='synced';state.detail='Waiting in GHL for review and scheduling.';state.title=record.title;delete state.failureAt;delete state.pendingUpdate;
  return {status:'synced',id:state.campaignId};
 }catch(error){
  state.status=state.hold?'held':'attention';state.detail=error instanceof HttpError?error.message:'The sync could not be confirmed. It will retry without sending anything.';state.failureAt=new Date(now).toISOString();state.title=record.title;
  return {status:state.status,id:state.campaignId};
 }finally{state.checkedAt=new Date(now).toISOString();await persist(true);}
}
export async function runNewsletterSync({api,env,fetcher=fetch,limit=2,now=Date.now()}){
 const config=await readNewsletterConnection(api);if(!config.enabled)return {status:'paused',processed:0};
 if(config.locationId!==ghlLocation)throw new HttpError(503,'Check the GHL account connection.');
 const client=ghlClient(openGhlToken(config.sealedToken,env),fetcher),rows=[];
 for(let offset=0;;offset+=100){const batch=await api('/rest/v1/nufi_studio_items?select=id,payload,revision&payload->>workerId=eq.nina&payload->>kind=eq.communication&order=updated_at.desc,id&limit=100&offset='+offset,privateRead);rows.push(...batch);if(batch.length<100)break;}
 const states=await api(stateTable+'?select=item_id,state&order=updated_at.asc',privateRead),byId=new Map(states.map(r=>[r.item_id,r.state]));
 const candidates=rows.filter(row=>newsletterEligible(row.payload)).sort((a,b)=>(Date.parse(byId.get(a.id)?.checkedAt||'')||0)-(Date.parse(byId.get(b.id)?.checkedAt||'')||0));
 const results=[];
 for(const row of candidates.slice(0,limit))results.push(await syncNewsletter({record:{...row.payload,id:row.id},revision:row.revision,api,client,now}));
 return {status:'checked',processed:results.length,results};
}
