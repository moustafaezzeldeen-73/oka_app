import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecs, ordersFromJsonl } from '../services/recs.js';

const NOW = Date.parse('2026-10-08T00:00:00Z');
const day = (n) => new Date(NOW - n * 86400000).toISOString();

test('pairs rank what is bought together and skip cancelled orders', () => {
  const orders = [];
  for (let i = 0; i < 20; i++) orders.push({ createdAt: day(i), customer: `c${i}`, handles: ['hookah', 'tongs'] });
  for (let i = 0; i < 20; i++) orders.push({ createdAt: day(i), customer: `d${i}`, handles: ['bowl'] });
  orders.push({ createdAt: day(1), customer: 'x', handles: ['hookah', 'bowl'] });
  for (let i = 0; i < 10; i++) orders.push({ createdAt: day(1), cancelled: true, customer: 'y', handles: ['hookah', 'bowl'] });
  const r = buildRecs(orders, NOW);
  assert.equal(r.orders, 41);
  assert.equal(r.pairs.hookah[0][0], 'tongs');
  assert.ok(!(r.pairs.hookah || []).some(([h]) => h === 'bowl'), 'a single co-purchase is below MIN_CO');
  assert.ok(r.pop.hookah > 0 && r.pop.bowl > 0);
});

test('rebuy is the median gap between a customer re-ordering the same product', () => {
  const orders = ['a', 'b', 'c'].flatMap((c) => [
    { createdAt: day(60), customer: c, handles: ['bowl'] },
    { createdAt: day(40), customer: c, handles: ['bowl'] },
  ]);
  assert.equal(buildRecs(orders, NOW).rebuy.bowl, 20);
});

test('ordersFromJsonl joins line items to their order', () => {
  const jsonl = [
    { id: 'o1', createdAt: day(1), cancelledAt: null, customer: { id: 'c1' } },
    { product: { handle: 'tongs' }, __parentId: 'o1' },
    { product: null, __parentId: 'o1' },
  ].map((x) => JSON.stringify(x)).join('\n');
  assert.deepEqual(ordersFromJsonl(jsonl), [{ createdAt: day(1), cancelled: false, customer: 'c1', handles: ['tongs'] }]);
});
