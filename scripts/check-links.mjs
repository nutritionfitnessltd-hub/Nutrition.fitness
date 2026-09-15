import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../dist');
const routes=JSON.parse(await fs.readFile(path.join(root,'routes.json'),'utf8'));
let errors=[],checked=0;
for(const r of routes){const html=await fs.readFile(path.join(root,r.file),'utf8');
 if((html.match(/<h1(?:\s|>)/g)||[]).length!==1&&!['/basket/','/checkout/','/checkout/thanks/','/dashboard/','/account/'].includes(r.url))errors.push(r.url+': expected one H1');
 for(const m of html.matchAll(/(?:href|src)="([^"]+)"/g)){
  const ref=m[1];if(!ref.startsWith('/')&&!ref.startsWith('#'))continue;
  const u=new URL(ref,'https://local.test'+r.url);let dest=path.join(root,u.pathname);
  if(u.pathname.endsWith('/'))dest=path.join(dest,'index.html');
  try{await fs.access(dest);checked++;if(u.hash&&dest.endsWith('.html')){const target=await fs.readFile(dest,'utf8');if(!target.includes(`id="${u.hash.slice(1)}"`)&&!['#preferences','#subscriptions','#orders'].includes(u.hash))errors.push(`${r.url}: missing anchor ${ref}`);}}catch{errors.push(`${r.url}: missing ${ref}`);}
 }
}
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log(`Checked ${routes.length} pages and ${checked} internal links/assets; no broken targets.`);
