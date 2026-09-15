import test from 'node:test';import assert from 'node:assert/strict';import {lineTotal,cartSummary,hasConflictingNufi} from '../src/lib/commerce.mjs';
test('integer pence totals',()=>assert.equal(lineTotal(3499,2),6998));
test('free shipping threshold',()=>assert.equal(cartSummary([{id:'whey',price:3499,qty:2,cadence:'one_off'}]).delivery,0));
test('4-week cadence remains explicit',()=>assert.ok(cartSummary([{id:'whey',price:3499,qty:1,cadence:'4_weeks'}]).recurring['4_weeks']));
test('monthly and annual NUFI conflict',()=>assert.equal(hasConflictingNufi([{id:'nufi-monthly',cadence:'monthly'},{id:'nufi-annual',cadence:'annual'}]),true));
