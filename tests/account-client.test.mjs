import test from 'node:test';
import assert from 'node:assert/strict';
import {safeReturnPath} from '../public/account.mjs';

test('login returns to an internal recipe or planner destination with its parameters',()=>{
  assert.equal(safeReturnPath('/meal-planner/?date=2026-11-01#dinner'),'/meal-planner/?date=2026-11-01#dinner');
  assert.equal(safeReturnPath('/recipes/tropical-overnight-oats/'),'/recipes/tropical-overnight-oats/');
});

for(const destination of [
  'https://evil.invalid/',
  '//evil.invalid/',
  '/\\evil.invalid/',
  '/folder/..//evil.invalid',
  '/.//evil.invalid',
  '/%2e//evil.invalid',
  '/\n/evil.invalid',
])test(`login rejects an external destination after URL normalisation: ${JSON.stringify(destination)}`,()=>{
  assert.equal(safeReturnPath(destination),'/account/');
});
