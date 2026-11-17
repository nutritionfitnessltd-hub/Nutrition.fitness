import { createDecipheriv, createHmac, timingSafeEqual } from 'node:crypto';

export const releaseWindowSeconds = 90;
export function releaseProof(secret, second) {
  return createHmac('sha256', Buffer.from(secret, 'hex')).update('guest-catalogue-release:v1:'+second).digest('hex');
}
export function verifyReleaseProof(secret, value, now=Math.floor(Date.now()/1000)) {
  if (!/^[a-f0-9]{64}$/.test(secret || '')) return false;
  const match=/^(\d{10})\.([a-f0-9]{64})$/.exec(value || '');
  if (!match || Math.abs(now-Number(match[1]))>releaseWindowSeconds) return false;
  return timingSafeEqual(Buffer.from(match[2],'hex'),Buffer.from(releaseProof(secret,match[1]),'hex'));
}
export function unpackCatalogue(secret, packed) {
  const key=createHmac('sha256',Buffer.from(secret,'hex')).update('guest-catalogue-at-rest:v1').digest();
  const decipher=createDecipheriv('aes-256-gcm',key,packed.subarray(0,12));
  decipher.setAuthTag(packed.subarray(12,28));
  return Buffer.concat([decipher.update(packed.subarray(28)),decipher.final()]);
}
