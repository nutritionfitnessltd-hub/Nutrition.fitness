/** Restore the user-created NUFI packaging and lifestyle campaign assets from archival ZIPs.
 * These are design mock-ups, not photographs of final manufactured products.
 * Standalone tubs come from the user's *original unchanged* 1400px PNG archive.
 * Lifestyle photos are used only for editorial shop sections, never product tiles.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {inflateRawSync} from 'node:zlib';
const root=path.resolve(import.meta.dirname,'..');
const catalogue=['plain-whey','creatine','electrolytes','magnesium','d3','collagen','omega3','fibre','vitaminc','zinc','shot-vanilla','shot-salted-caramel','shot-chocolate','shot-banana','shot-toffee','shot-strawberry','shot-raspberry','shot-cherry','shot-apple','shot-tropical'];
const archives=[
  ['product-packshots-2026.zip',catalogue.map(id=>'public/assets/products/'+id+'.webp')],
  ['shop-campaign-photos-2026.zip',['protein-campaign','creatine-campaign','banana-campaign','strawberry-campaign'].map(id=>'public/assets/shop-story/'+id+'.webp')]
];
async function restore(archiveName,expectedPaths){
 const bytes=await fs.readFile(path.join(root,'assets',archiveName));
 const expected=new Set(expectedPaths), seen=new Set();
 let pos=0;
 while(pos+30<=bytes.length){
  const signature=bytes.readUInt32LE(pos);
  if(signature===0x02014b50||signature===0x06054b50)break;
  if(signature!==0x04034b50)throw new Error('Unexpected ZIP header in '+archiveName+' at '+pos);
  const flags=bytes.readUInt16LE(pos+6),method=bytes.readUInt16LE(pos+8),size=bytes.readUInt32LE(pos+18),original=bytes.readUInt32LE(pos+22);
  const filenameSize=bytes.readUInt16LE(pos+26),extraSize=bytes.readUInt16LE(pos+28);
  if(flags&0x08)throw new Error('ZIP data descriptors are not supported');
  const name=bytes.subarray(pos+30,pos+30+filenameSize).toString('utf8');
  const start=pos+30+filenameSize+extraSize;
  if(start+size>bytes.length)throw new Error('Truncated asset '+name);
  if(!expected.has(name)||seen.has(name))throw new Error('Unexpected or repeated asset '+name);
  const data=method===8?inflateRawSync(bytes.subarray(start,start+size)):method===0?bytes.subarray(start,start+size):null;
  if(!data||data.length!==original||data.toString('ascii',0,4)!=='RIFF'||data.toString('ascii',8,12)!=='WEBP')throw new Error('Invalid WebP asset '+name);
  const dest=path.join(root,name);
  await fs.mkdir(path.dirname(dest),{recursive:true});
  await fs.writeFile(dest,data);
  seen.add(name);pos=start+size;
 }
 const missing=[...expected].filter(name=>!seen.has(name));
 if(missing.length)throw new Error('Missing '+archiveName+' assets: '+missing.join(', '));
 console.log('Restored '+seen.size+' NUFI assets from '+archiveName);
}
for(const [archive,names] of archives)await restore(archive,names);

/**
 * Restore the exact original PNG bytes from the first product-only ZIP created in chat.
 * Because of upstream upload-size limits, its base64 encoding is stored as 12
 * numbered text parts. This is transport segmentation, NOT image editing.
 * Source: Nutrition.Fitness_10_Transparent_Packshots.zip.
 * Some source renderings already have hard edges; don't disguise or repaint them.
 */
import {createHash} from 'node:crypto';
const originalIds=['plain-whey','creatine','electrolytes','magnesium','d3','collagen','omega3','fibre','vitaminc','zinc'];
const pngPrefix=Buffer.from([137,80,78,71,13,10,26,10]);
const parts=await Promise.all(Array.from({length:12},(_,i)=>fs.readFile(path.join(root,'assets','original-standalone-png-chunks','part-'+String(i+1).padStart(2,'0')+'.b64'),'utf8')));
const archive=Buffer.from(parts.join(''),'base64');
const archiveDigest=createHash('sha256').update(archive).digest('hex');
if(archiveDigest!=='90118fec485b5d561716efd30614848d1196f8783f6adbd80d866d370164785c'){
  throw new Error('Exact original product-only archive checksum mismatch');
}
const imagePaths=new Set(originalIds.map(id=>'public/assets/products/original-'+id+'.png'));
const restored=new Set();
let offset=0;
while(offset+30<=archive.length){
 const signature=archive.readUInt32LE(offset);
 if(signature===0x02014b50||signature===0x06054b50)break;
 if(signature!==0x04034b50)throw new Error('Bad original archive ZIP entry at '+offset);
 const flags=archive.readUInt16LE(offset+6);
 const method=archive.readUInt16LE(offset+8);
 const packed=archive.readUInt32LE(offset+18),unpacked=archive.readUInt32LE(offset+22);
 const namelen=archive.readUInt16LE(offset+26),extralen=archive.readUInt16LE(offset+28);
 if(flags&8)throw new Error('Unsupported original archive data descriptor');
 const name=archive.subarray(offset+30,offset+30+namelen).toString('utf8');
 const start=offset+30+namelen+extralen;
 if(start+packed>archive.length)throw new Error('Truncated original '+name);
 const compressed=archive.subarray(start,start+packed);
 const data=method===8?inflateRawSync(compressed):method===0?compressed:null;
 if(!data||data.length!==unpacked)throw new Error('Invalid original PNG: '+name);
 if(imagePaths.has(name)){
  if(restored.has(name)||!data.subarray(0,8).equals(pngPrefix)||data.readUInt32BE(16)!==1400||data.readUInt32BE(20)!==1400)
   throw new Error('Unexpected original product PNG: '+name);
  const output=path.join(root,name);
  await fs.mkdir(path.dirname(output),{recursive:true});
  await fs.writeFile(output,data);
  restored.add(name);
 }else if(name!=='source-manifest.json')throw new Error('Unexpected file in original PNG archive: '+name);
 offset=start+packed;
}
if(restored.size!==10)throw new Error('Missing original product-only PNGs: '+[...imagePaths].filter(n=>!restored.has(n)).join(', '));
console.log('Restored 10 original, unchanged standalone PNG packshots from chat archive.');
