import { readFile, writeFile } from 'node:fs/promises';
import { releaseProof, unpackCatalogue } from '../server/library-release.mjs';

const secret = process.env.NUFI_LIBRARY_PASSWORD_SHA256;
if (process.env.VERCEL_ENV === 'production' && secret) {
  const target = new URL('../server/guest-catalogue.enc', import.meta.url);
  let packed;
  try { packed=await readFile(target); }
  catch (error) { if(error.code!=='ENOENT') throw error; }
  if(!packed) {
    const second=String(Math.floor(Date.now()/1000));
    const response=await fetch('https://nutrition-fitness-website-2.vercel.app/content-library/?release=snapshot',{
      redirect:'error', signal:AbortSignal.timeout(30_000),
      headers:{'x-nufi-release-proof':second+'.'+releaseProof(secret,second)}
    });
    if(!response.ok)throw new Error('The current production website could not supply the private guest catalogue. Check the release handover before deploying.');
    packed=Buffer.from(await response.arrayBuffer());
  }
  if(packed.length<30 || packed.length>8*1024*1024)throw new Error('Unexpected encrypted catalogue size.');
  unpackCatalogue(secret, packed); // Verify integrity before allowing this release to replace production.
  await writeFile(target,packed);
  console.log('Verified the private guest catalogue for this production deployment.');
}
