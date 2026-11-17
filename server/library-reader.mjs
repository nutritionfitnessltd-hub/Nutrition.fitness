import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { gunzipSync } from 'node:zlib';
import { get } from '@vercel/blob';
import { renderLibrary } from './library-view.mjs';
import { unpackCatalogue, verifyReleaseProof } from './library-release.mjs';
import { displayEntry } from './library-display.mjs';
import { handleLibraryWork } from './library-work.mjs';

const path = '/content-library/';
const cookieName = '__Host-nufi-library';
const sessionSeconds = 8 * 60 * 60;
const indexPath = 'nutrition-library/v1/index.json.gz';
const digest = input => createHash('sha256').update(input).digest();
const equal = (a, b) => a.length === b.length && timingSafeEqual(a, b);
let cached;

async function bundledCatalogue() {
  const file = await readFile(new URL('./guest-catalogue.enc', import.meta.url));
  const compressed = unpackCatalogue(process.env.NUFI_LIBRARY_CATALOGUE_KEY, file);
  const index = JSON.parse(gunzipSync(compressed, { maxOutputLength: 64 * 1024 * 1024 }));
  index.downloadsPaused = true;
  return index;
}

async function readIndex() {
  if (cached && cached.expires > Date.now()) return cached.index;
  let index;
  try {
    const result = await get(indexPath, { access: 'private', useCache: false });
    if (!result?.stream) throw new Error('Missing library');
    const buffer = Buffer.from(await new Response(result.stream).arrayBuffer());
    index = JSON.parse(gunzipSync(buffer, { maxOutputLength: 64 * 1024 * 1024 }));
  } catch {
    index = await bundledCatalogue();
  }
  if (index.version !== 1 || !Array.isArray(index.records)) throw new Error('Invalid library');
  cached = { index, expires: Date.now() + 60_000 };
  return index;
}

function cookie(value, lifetime) {
  return cookieName + '=' + value + '; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=' + lifetime;
}
function signature(key, value) {
  return createHmac('sha256', key).update('library-reader:v1:' + value).digest('base64url');
}
function validSession(req, key) {
  const token = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  if (!token || token.length > 160) return false;
  const match = /^(\d{10})\.([\w-]{22})\.([\w-]{43})$/.exec(token);
  const now = Math.floor(Date.now() / 1000);
  return !!match && Number(match[1]) > now && Number(match[1]) <= now + sessionSeconds &&
    equal(Buffer.from(signature(key, match[1] + '.' + match[2])), Buffer.from(match[3]));
}
function redirect(res) {
  res.statusCode = 303;
  res.setHeader('Location', path);
  res.end();
}
function html(res, status, page) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(page);
}

export function createLibraryReader({ env = process.env, load = readIndex,
  fetchFile = name => get(name, { access: 'private' }) } = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
    res.setHeader('Vary', 'Cookie');
    // Same-site forms need their origin on POST. Keep referrers private across sites.
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'self'; img-src 'self'; font-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
    const params = new URL(req.url, 'https://localhost').searchParams;
    if (params.get('work')==='1') return handleLibraryWork(req,res,{env,load,params});
    const config = env.NUFI_LIBRARY_PASSWORD_SHA256;
    if (!/^[a-f0-9]{64}$/.test(config || '')) return html(res, 503, renderLibrary({ error: 'The shared library is being set up. Please try again later.' }));
    const catalogueKey = env.NUFI_LIBRARY_CATALOGUE_KEY;
    if (!/^[a-f0-9]{64}$/.test(catalogueKey || '')) return html(res, 503, renderLibrary({ error: 'The shared library is being set up. Please try again later.' }));
    const passwordHash = Buffer.from(config, 'hex');
    const key = createHmac('sha256', Buffer.from(catalogueKey, 'hex')).update('guest-session:v1:').update(passwordHash).digest();
    if (params.get('release') === 'snapshot') {
      if (req.method !== 'GET' || !verifyReleaseProof(catalogueKey,req.headers['x-nufi-release-proof'])) {
        return html(res,401,renderLibrary({login:true}));
      }
      try {
        const bytes = await readFile(new URL('./guest-catalogue.enc', import.meta.url));
        res.setHeader('Content-Type','application/octet-stream');
        res.statusCode=200;
        return res.end(bytes);
      } catch { return html(res,503,renderLibrary({error:'Release catalogue unavailable.'})); }
    }
    if (req.method === 'POST') {
      const origin = req.headers.origin;
      if (!origin || origin !== 'https://' + req.headers.host) return html(res, 403, renderLibrary({ error: 'Open the library link and try again.' }));
      const fields = typeof req.body === 'string' ? Object.fromEntries(new URLSearchParams(req.body)) : req.body;
      if (fields?.action === 'logout') {
        res.setHeader('Set-Cookie', cookie('', 0));
        return redirect(res);
      }
      const password = fields?.password;
      if (typeof password !== 'string' || password.length > 256 || !equal(digest(password), passwordHash)) {
        return html(res, 401, renderLibrary({ login: true, error: 'That password didn’t match. Please try again.' }));
      }
      const payload = (Math.floor(Date.now() / 1000) + sessionSeconds) + '.' + randomBytes(16).toString('base64url');
      res.setHeader('Set-Cookie', cookie(payload + '.' + signature(key, payload), sessionSeconds));
      return redirect(res);
    }
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET, POST');
      return html(res, 405, renderLibrary({ error: 'This request is unavailable.' }));
    }
    if (!validSession(req, key)) return html(res, 401, renderLibrary({ login: true }));
    try {
      if (params.has('preview')) {
        const id=params.get('preview');
        const asset=/^(?:[a-f0-9]{32}|brand-font)$/.test(id) && await displayEntry(env,id);
        if (!asset || !['image/webp','font/woff2'].includes(asset.type)) return html(res,404,renderLibrary({error:'Preview unavailable.'}));
        res.setHeader('Content-Type',asset.type);
        res.statusCode=200;
        return res.end(Buffer.from(asset.data,'base64'));
      }
      const index = await load();
      const fileId = params.get('file');
      if (fileId !== null) {
        if (index.downloadsPaused) return html(res, 503, renderLibrary({ error: 'File downloads are temporarily unavailable. You can still browse the library.' }));
        const file = /^[a-f0-9]{64}$/.test(fileId) && index.files[fileId];
        if (!file) return html(res, 404, renderLibrary({ error: 'File not found.' }));
        const result = await fetchFile('nutrition-library/v1/files/' + fileId);
        if (!result?.stream) return html(res, 404, renderLibrary({ error: 'File unavailable.' }));
        const inline = params.get('image') === '1' && ['image/jpeg','image/png','image/webp'].includes(file.type);
        res.setHeader('Content-Disposition', (inline ? 'inline' : 'attachment') + "; filename*=UTF-8''" + encodeURIComponent(file.name).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16)));
        res.setHeader('Content-Type', inline ? file.type : 'application/octet-stream');
        res.statusCode = 200;
        await pipeline(Readable.fromWeb(result.stream), res);
        return;
      }
      const itemId = params.get('item');
      if (itemId && !index.records.some(record => record.id === itemId)) return html(res, 404, renderLibrary({ error: 'Item not found.' }));
      const meta=await displayEntry(env,'shelves').catch(()=>null);
      return html(res, 200, renderLibrary({ index, params, meta:meta||{} }));
    } catch {
      if (res.headersSent) return res.destroy();
      return html(res, 503, renderLibrary({ error: 'The library could not be loaded. Please try again shortly.' }));
    }
  };
}
