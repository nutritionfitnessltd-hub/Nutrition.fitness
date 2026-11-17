import assert from 'node:assert/strict';
import { createCipheriv, createHmac, randomBytes } from 'node:crypto';
import test from 'node:test';
import { releaseProof, verifyReleaseProof, unpackCatalogue } from '../server/library-release.mjs';

test('release handover accepts a fresh signed timestamp and rejects expired or incorrect proofs', () => {
  const secret = randomBytes(32).toString('hex');
  const now = 1800000000;
  const proof = `${now}.${releaseProof(secret, now)}`;
  assert.equal(verifyReleaseProof(secret, proof, now), true);
  assert.equal(verifyReleaseProof(secret, proof, now + 91), false);
  assert.equal(verifyReleaseProof(randomBytes(32).toString('hex'), proof, now), false);
  assert.equal(verifyReleaseProof(secret, '', now), false);
});

test('release handover detects a damaged encrypted catalogue', () => {
  const secret = randomBytes(32);
  const key = createHmac('sha256', secret).update('guest-catalogue-at-rest:v1').digest();
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const bytes = Buffer.concat([cipher.update('test record'), cipher.final()]);
  const packed = Buffer.concat([nonce, cipher.getAuthTag(), bytes]);
  assert.equal(unpackCatalogue(secret.toString('hex'), packed).toString(), 'test record');
  packed[packed.length - 1] ^= 1;
  assert.throws(() => unpackCatalogue(secret.toString('hex'), packed));
});
