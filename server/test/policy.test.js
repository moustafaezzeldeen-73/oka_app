import assert from 'node:assert/strict';
import { test } from 'node:test';

import { POLICY, REWARDS, pointsEarned, pointsToEgp, shippingFor } from '../policy.js';
import { etaFor, provinceFor } from '../zones.js';

test('shipping is the courier cost, free only from the threshold', () => {
  assert.equal(POLICY.shippingFee, 80);
  assert.equal(shippingFor(150), 80);
  assert.equal(shippingFor(999), 80);
  assert.equal(shippingFor(1000), 0);
});

test('prepaid orders get the fixed shipping perk, COD does not', () => {
  assert.equal(shippingFor(400, 'cod'), 80);
  assert.equal(shippingFor(400, 'card'), 70);
  assert.equal(shippingFor(400, 'wallet'), 70);
  assert.equal(shippingFor(1200, 'card'), 0);
});

test('free shipping and minimum order both cover the failed-delivery load', () => {
  const margin = 0.1;
  const failRate = 0.15;
  const fee = POLICY.shippingFee;
  // Expected profit per placed COD order at the minimum must not be negative.
  assert.ok((1 - failRate) * margin * POLICY.minOrder - failRate * fee >= 0);
  // Waiving the fee at the threshold must be covered by the margin.
  const failLoad = (failRate / (1 - failRate)) * fee;
  assert.ok(margin * POLICY.freeShippingMin >= fee + failLoad);
});

test('points: 1 per 10 EGP, 10 points per EGP of credit', () => {
  assert.equal(pointsEarned(0), 0);
  assert.equal(pointsEarned(99), 9);
  assert.equal(pointsEarned(1000), 100);
  assert.equal(pointsToEgp(500), 50);
});

test('no reward is worth more than ~10% of its minimum basket', () => {
  for (const r of REWARDS) assert.ok(r.egp / r.minOrder <= 0.1, r.id);
});

test('subscription discount stays inside the margin', () => {
  assert.ok(POLICY.subscriptionDiscountPct < 10);
});

test('governorates resolve by code, English or Arabic, and set the ETA', () => {
  assert.equal(provinceFor({ provinceCode: 'ALX' }).en, 'Alexandria');
  assert.equal(provinceFor({ city: 'Nasr City', province: 'Cairo' }).code, 'C');
  assert.equal(provinceFor({ province: 'الاسكندريه' }).code, 'ALX');
  assert.deepEqual(etaFor({ provinceCode: 'C' }), { minDays: 1, maxDays: 2 });
  assert.deepEqual(etaFor({ provinceCode: 'ASN' }), { minDays: 3, maxDays: 5 });
  assert.deepEqual(etaFor({}), { minDays: 3, maxDays: 5 });
});
