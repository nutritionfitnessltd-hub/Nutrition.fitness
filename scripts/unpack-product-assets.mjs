/**
 * Restore the actual product artwork archived from earlier NUFI conversations.
 * Native Node only: safely extracts the 20 approved-for-web-preview WebP assets
 * into public/assets/products before build.mjs copies public into dist.
 * Source ZIP: assets/product-packshots-2026.zip
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {inflateRawSync} from 'node:zlib';

const root=path.resolve(import.meta.dirname,'..');
const archive=path.join(root,'assets','product-packshots-2026.zip');
const expected=new Set([
 'plain-whey','creatine','electrolytes','magnesium','d3','collagen','omega3','fibre','vitaminc','zinc',
 'shot-vanilla','shot-salted-caramel','shot-chocolate','shot-banana','shot-toffee',
 'shot-strawberry','shot-raspberry','shot-cherry','shot-apple','shot-tropical'
]);
const bytes=await fs.readFile(archive);
const seen=new Set();
let pos=0;
while(pos+30<=bytes.length){
 const magic=bytes.readUInt32LE(pos);
 if(magic===0x02014b50||magic===0x06054b50)break;
 if(magic!==0x04034b50)throw new Error('Unexpected ZIP entry header at '+pos);
 const flag=bytes.readUInt16LE(pos+6),method=bytes.readUInt16LE(pos+8);
 const packed=bytes.readUInt32LE(pos+18),unpacked=bytes.readUInt32LE(pos+22);
 const nameLength=bytes.readUInt16LE(pos+26),extraLength=bytes.readUInt16LE(pos+28);
 if(flag&0x08)throw new Error('Unexpected ZIP data descriptor; release archive must use known sizes');
 const name=bytes.subarray(pos+30,pos+30+nameLength).toString('utf8');
 const start=pos+30+nameLength+extraLength;
 if(start+packed>bytes.length)throw new Error('Truncated product image: '+name);
 const match=name.match(/^public\/assets\/products\/([a-z0-9-]+)\.webp$/);
 if(!match||!expected.has(match[1])||seen.has(match[1]))throw new Error('Unexpected or duplicate product asset: '+name);
 const payload=bytes.subarray(start,start+packed);
 const data=method===8?inflateRawSync(payload):method===0?payload:null;
 if(!data||data.length!==unpacked)throw new Error('Invalid image payload: '+name);
 if(data.toString('ascii',0,4)!=='RIFF'||data.toString('ascii',8,12)!=='WEBP')throw new Error('Not a WebP: '+name);
 const output=path.join(root,name);
 await fs.mkdir(path.dirname(output),{recursive:true});
 await fs.writeFile(output,data);
 seen.add(match[1]);pos=start+packed;
}
const missing=[...expected].filter(id=>!seen.has(id));
if(missing.length||seen.size!==20)throw new Error('Product archive incomplete: '+missing.join(', '));
console.log('Restored 20 original Nutrition.Fitness product images.');
