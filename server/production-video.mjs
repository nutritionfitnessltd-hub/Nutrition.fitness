import {HttpError} from './platform.mjs';
import {readable} from './studio-store.mjs';
import {productionFileUrl} from './production-file-links.mjs';
export function checkedVideo(record,sha){
 return (record.fields?.production?.files||[]).find(f=>f.bytes>0&&/^[a-f0-9]{64}$/.test(f.sha256||'')&&(!sha||sha===f.sha256)&&/\.mp4(?:$|\?)/i.test(productionFileUrl(f.url))&&new URL(f.url).hostname==='nutritionfitness.sharepoint.com');
}
export async function productionVideoSource(req,res,params,data){
 if(req.method!=='GET')throw new HttpError(405,'Use GET to play a video.');
 const r=readable(data,params.get('id')),file=checkedVideo(r,params.get('sha'));
 if(!/^[a-f0-9]{64}$/.test(params.get('sha')||'')||Number(params.get('revision'))!==r.revision||!file)throw new HttpError(409,'This export has changed. Reopen the project before watching.');
 // SharePoint's browser download endpoint keeps the existing Microsoft sign-in.
 // Exchange application credentials do not grant SharePoint playback access.
 const source=new URL(file.url),site=/^\/(sites|teams)\/([^/]+)\/.+/i.exec(source.pathname);
 if(!site)throw new HttpError(503,'This video does not have a supported SharePoint file address.');
 let path;try{path=decodeURIComponent(source.pathname);}catch{throw new HttpError(503,'This video has an invalid SharePoint file address.');}
 const download=new URL('/'+site[1]+'/'+site[2]+'/_layouts/15/download.aspx',source.origin);
 download.searchParams.set('SourceUrl',path);
 res.statusCode=302;res.setHeader('Cache-Control','private, no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Location',download.href);res.end();
}
