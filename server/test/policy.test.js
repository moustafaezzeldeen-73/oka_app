import assert from 'node:assert/strict';
import { test } from 'node:test';

import { POLICY, REWARDS, applyPaymentPerk, pointsEarned, pointsToEgp } from '../policy.js';
import { FEE_TIER_THRESHOLD, etaFor, provinceFor, tableFee } from '../zones.js';

test('the fee table mirrors the store: zone fee, lower from the 300 EGP tier', () => {
  assert.equal(FEE_TIER_THRESHOLD, 300);
  assert.equal(tableFee(299, { provinceCode: 'C' }), 60);
  assert.equal(tableFee(300, { provinceCode: 'C' }), 36);
  assert.equal(tableFee(200, { provinceCode: 'DK' }), 70);
  assert.equal(tableFee(500, { provinceCode: 'DK' }), 46);
  assert.equal(tableFee(200, { provinceCode: 'ASN' }), 80);
  assert.equal(tableFee(500, { provinceCode: 'ASN' }), 56);
  // Unknown governorate: the cheapest zone, so an estimate never overstates.
  assert.equal(tableFee(200, {}), 60);
});

test('prepaid orders get the fixed perk off the store rate, COD does not', () => {
  assert.equal(applyPaymentPerk(60, 'cod'), 60);
  assert.equal(applyPaymentPerk(60, 'card'), 50);
  assert.equal(applyPaymentPerk(5, 'wallet'), 0);
});

test('the minimum order covers the failed-delivery load', () => {
  const margin = 0.1;
  const failRate = 0.15;
  const attemptCost = 80;
  assert.ok((1 - failRate) * margin * POLICY.minOrder - failRate * attemptCost >= 0);
});

test('points: 1 per EGP (10% back), 10 points per EGP of credit', () => {
  assert.equal(pointsEarned(0), 0);
  assert.equal(pointsEarned(99.5), 99);
  assert.equal(pointsEarned(1000), 1000);
  assert.equal(pointsToEgp(1000), 100);
  // 10% back: the credit earned is a tenth of what was spent.
  assert.equal(pointsToEgp(pointsEarned(500)), 50);
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
