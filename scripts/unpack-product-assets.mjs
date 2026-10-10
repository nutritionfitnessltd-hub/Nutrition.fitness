/** Restore the user-created NUFI packaging and lifestyle campaign assets from archival ZIPs.
 * These are design mock-ups, not photographs of final manufactured products.
 * Both archives are committed in assets/ so deployments stay reproducible.
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
