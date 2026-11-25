// Run before publishing a new checked lesson export. Credentials stay in process env.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {put} from '@vercel/blob/client';
const [file,sourceId]=process.argv.slice(2);if(!file||!sourceId)throw Error('Usage: node scripts/cache-review-video.mjs file.mp4 catalogue:source-id');
const base=process.env.SITE_URL||'https://team.nutrition.fitness',token=process.env.NUFI_COURSE_PRODUCTION_TOKEN;if(!token)throw Error('Course production connection required');
const bytes=await fs.readFile(file),sha256=createHash('sha256').update(bytes).digest('hex');
const call=async action=>{const r=await fetch(base+'/api/course-production',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({action,sourceId,sha256,bytes:bytes.length})});const j=await r.json();if(!r.ok)throw Error(j.error||'Video preparation failed');return j;};
let verified;try{verified=await call('video-upload-confirm');}catch{}
if(!verified?.verified){const upload=await call('video-upload-token');await put(upload.pathname,bytes,{access:'private',token:upload.clientToken,contentType:'video/mp4',multipart:true});verified=await call('video-upload-confirm');}
if(!verified.verified)throw Error('Video copy was not verified');console.log(JSON.stringify({verified:true,sha256,bytes:bytes.length}));
