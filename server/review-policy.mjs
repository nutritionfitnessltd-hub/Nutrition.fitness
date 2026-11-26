export const offeringKinds=new Set(['course','programme','programme-family','ebook','leadmagnet','challenge','theme','product','article']);
export function hasReadyVideo(r){
 if(!r||r.sourceOnly||r.status==='Archived'||r.fields?.previewOnly||r.fields?.courseProductionIndex)return false;
 return (r.fields?.production?.files||[]).some(f=>{try{const u=new URL(f.url);return u.protocol==='https:'&&u.hostname==='nutritionfitness.sharepoint.com'&&/\.mp4(?:$|\?)/i.test(u.href)&&Number.isSafeInteger(f.bytes)&&f.bytes>0&&/^[a-f0-9]{64}$/.test(f.sha256||'');}catch{return false;}});
}
