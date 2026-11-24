import {HttpError} from './platform.mjs';
import {readable} from './studio-store.mjs';
import {productionFileUrl} from './production-file-links.mjs';
export function checkedVideo(record,sha){
 return (record.fields?.production?.files||[]).find(f=>f.bytes>0&&/^[a-f0-9]{64}$/.test(f.sha256||'')&&(!sha||sha===f.sha256)&&/\.mp4(?:$|\?)/i.test(productionFileUrl(f.url))&&new URL(f.url).hostname==='nutritionfitness.sharepoint.com');
}
export async function productionVideoSource(req,res,params,data,env,fetcher=fetch){
 if(req.method!=='GET')throw new HttpError(405,'Use GET to play a video.');
 const r=readable(data,params.get('id')),file=checkedVideo(r,params.get('sha'));
 if(!/^[a-f0-9]{64}$/.test(params.get('sha')||'')||Number(params.get('revision'))!==r.revision||!file)throw new HttpError(409,'This export has changed. Reopen the project before watching.');
 const tenant=env.SHAREPOINT_TENANT_ID||env.EXCHANGE_TENANT_ID,client=env.SHAREPOINT_CLIENT_ID||env.EXCHANGE_CLIENT_ID,secret=env.SHAREPOINT_CLIENT_SECRET||env.EXCHANGE_CLIENT_SECRET;
 if(!tenant||!client||!secret)throw new HttpError(503,'The SharePoint playback connection is not configured.');
 const tokenResponse=await fetcher('https://login.microsoftonline.com/'+encodeURIComponent(tenant)+'/oauth2/v2.0/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:client,client_secret:secret,grant_type:'client_credentials',scope:'https://graph.microsoft.com/.default'}),signal:AbortSignal.timeout(15000)}),token=await tokenResponse.json();
 if(!tokenResponse.ok||!token.access_token)throw new HttpError(503,'SharePoint playback authentication could not be confirmed.');
 const get=async path=>{const response=await fetcher('https://graph.microsoft.com/v1.0'+path,{headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(15000)});if(!response.ok)throw new HttpError(503,'SharePoint could not open this video. Check that the playback connection has access.');return response.json();};
 const u=new URL(file.url),match=/^\/sites\/([^/]+)\/Shared Documents\/(.+)$/i.exec(decodeURIComponent(u.pathname));
 let item;
 if(match){const site=await get('/sites/'+u.hostname+':/sites/'+encodeURIComponent(match[1])+'?$select=id');item=await get('/sites/'+encodeURIComponent(site.id)+'/drive/root:/'+match[2].split('/').map(encodeURIComponent).join('/'));}
 else item=await get('/shares/u!'+Buffer.from(file.url).toString('base64url')+'/driveItem');
 if(item.size!==file.bytes)throw new HttpError(409,'The SharePoint file changed. Ask the producer to refresh this checked export.');
 let download;try{download=new URL(item['@microsoft.graph.downloadUrl']);}catch{throw new HttpError(503,'SharePoint did not supply a playback link.');}
 if(download.protocol!=='https:'||download.username||download.password||!(download.hostname.endsWith('.sharepoint.com')||download.hostname.endsWith('.files.1drv.com')))throw new HttpError(503,'The video playback destination could not be verified.');
 res.statusCode=302;res.setHeader('Cache-Control','private, no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Location',download.href);res.end();
}
