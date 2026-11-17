import { platform, platformConfigured } from './platform.mjs';

let cached;
export async function displayEntry(env,id) {
  if (!platformConfigured(env)) return null;
  if (id==='shelves' && cached && cached.expires>Date.now()) return cached.value;
  const api=platform(env);
  const rows=await api('/rest/v1/nufi_library_display?id=eq.'+encodeURIComponent(id)+'&select=payload&limit=1',{service:true});
  const value=rows[0]?.payload;
  if (value && id==='shelves') cached={value,expires:Date.now()+120_000};
  return value;
}
