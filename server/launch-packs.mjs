import {canReadContent} from './library-permissions.mjs';

export const launchPackParts=[
 ['overview','Course overview, outcomes & audience','marketing'],
 ['landingPage','Landing-page copy','marketing'],['introScript','Introduction video script','marketing'],
 ['welcomeEmail','Welcome email','email'],['socialCopy','Social launch copy','marketing'],
 ['hero','Course hero image','asset'],['videoThumbnail','Video thumbnail','asset'],['socialImage','Social image','asset']
];
export function launchPackParent(record,data){
 const id=record?.fields?.launchPackId||record?.parent,parent=id&&data.byId.get(id);
 return parent&&parent.id!==record.id&&parent.fields?.coursePack===true&&parent.status!=='Archived'&&canReadContent(data,parent)&&(!record.fields?.courseId||!parent.fields.courseId||record.fields.courseId===parent.fields.courseId)?parent:null;
}
export function launchPackChildren(pack,data){
 return data.items.filter(r=>r.status!=='Archived'&&canReadContent(data,r)&&launchPackParent(r,data)?.id===pack.id);
}
export function launchPackFields(pack,data){
 const fields={...pack.fields},mappings={landingPage:'marketingCopy',introScript:'introductionScript',welcomeEmail:'welcomeEmail',socialCopy:'socialCopy'};
 for(const child of launchPackChildren(pack,data)){
  const part=child.fields.launchPackPart,key=mappings[part];
  if(part==='overview')for(const field of ['introduction','outcome','audience'])if(child.fields[field]?.trim())fields[field]=child.fields[field];
  if(key)fields[key]=child.fields[key]||child.fields.script||child.fields.body||fields[key];
 }
 return fields;
}
