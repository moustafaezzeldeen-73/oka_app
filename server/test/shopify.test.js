import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

process.env.SHOPIFY_STORE_DOMAIN = 'test.myshopify.com';
process.env.SHOPIFY_ADMIN_ACCESS_TOKEN = 'shpat_test';

const { adminGraphql, boundsOf, fetchAdminCatalogue, invoiceLine, invoiceTotals, paymentMethodOf, toMailingAddress } =
  await import('../integrations/shopify.js');
const { resolveProvince } = await import('../config/zones.js');

/**
 * The fake Admin API: `answer(query)` if set, else the next of `replies`
 * (each { data } or { errors }).
 */
let replies;
let answer;
let queries;

beforeEach(() => {
  replies = [];
  answer = null;
  queries = [];
  globalThis.fetch = async (_url, init) => {
    const { query } = JSON.parse(init.body);
    queries.push(query);
    return new Response(JSON.stringify(answer ? answer(query) : replies.shift()), { status: 200 });
  };
});

test('a THROTTLED reply is retried instead of failing the request', async () => {
  replies = [{ errors: [{ message: 'Throttled', extensions: { code: 'THROTTLED' } }] }, { data: { ok: 1 } }];
  assert.deepEqual(await adminGraphql('{ ok }'), { ok: 1 });
  assert.equal(queries.length, 2);
});

test('a catalogue query over Shopify\'s cost cap is split until it fits', async () => {
  const collection = (handle) => ({
    id: `gid://shopify/Collection/${handle}`,
    handle,
    title: handle,
    image: null,
    titleAr: null,
    products: { edges: [] },
  });
  // Shopify refuses any request asking for more than two collections.
  answer = (query) => {
    const asked = [...query.matchAll(/handle: "([^"]+)"/g)].map((m) => m[1]);
    if (asked.length > 2) {
      return { errors: [{ message: 'Query cost is 1200, which exceeds the single query max cost limit (1000).' }] };
    }
    return { data: Object.fromEntries(asked.map((h, i) => [`c${i}`, collection(h)])) };
  };

  const { cats } = await fetchAdminCatalogue(['hookahs', 'coal', 'hoses', 'bowls', 'accessories']);
  assert.deepEqual(cats.map((c) => c.id), ['hookahs', 'coal', 'hoses', 'bowls', 'accessories']);
  assert.ok(queries.length > 1);
});

test('invoice lines use the price actually paid and the edited quantity', () => {
  const line = invoiceLine({
    id: 'li1',
    title: 'Bowl',
    quantity: 3,
    currentQuantity: 2,
    variant: { id: 'v1' },
    originalUnitPriceSet: { shopMoney: { amount: '100.00' } },
    discountedUnitPriceAfterAllDiscountsSet: { shopMoney: { amount: '90.00' } },
    image: null,
  });
  assert.equal(line.quantity, 2);
  assert.equal(line.price, 90);
  assert.equal(line.originalPrice, 100);
});

test('an invoice adds up: subtotal − discount + shipping = total', () => {
  // Two bowls at 100 with a 10% code, 36 EGP shipping. Shopify's own
  // subtotal is already net of the discount.
  const items = [{ quantity: 2, price: 90, originalPrice: 100 }];
  const t = invoiceTotals(
    {
      currentSubtotalPriceSet: { shopMoney: { amount: '180.00' } },
      currentShippingPriceSet: { shopMoney: { amount: '36.00' } },
      currentTotalPriceSet: { shopMoney: { amount: '216.00' } },
    },
    items,
  );
  assert.deepEqual(t, { subtotal: 200, discount: 20, shipping: 36, total: 216 });
  assert.equal(t.subtotal - t.discount + t.shipping, t.total);
});

test('payment method: the app\'s tag, else paid or cash on delivery', () => {
  assert.equal(paymentMethodOf({ tags: ['oka-app', 'payment:card'] }), 'card');
  assert.equal(paymentMethodOf({ tags: [], displayFinancialStatus: 'PAID' }), 'paid');
  assert.equal(paymentMethodOf({ tags: [], displayFinancialStatus: 'PENDING' }), 'cod');
});

test('rate conditions become order-value bounds', () => {
  assert.deepEqual(
    boundsOf([
      { field: 'TOTAL_PRICE', operator: 'GREATER_THAN_OR_EQUAL_TO', conditionCriteria: { __typename: 'MoneyV2', amount: '300' } },
      { field: 'TOTAL_WEIGHT', operator: 'LESS_THAN_OR_EQUAL_TO', conditionCriteria: { __typename: 'Weight', value: 5 } },
    ]),
    { min: 300, max: null },
  );
});

test('governorates are recognised from the ways people write them', () => {
  assert.equal(resolveProvince('القاهره'), 'C');
  assert.equal(resolveProvince('Nasr City, Cairo'), 'C');
  assert.equal(resolveProvince('مدينة نصر'), 'C');
  assert.equal(resolveProvince('Sheikh Zayed'), 'SU');
  assert.equal(resolveProvince('٦ أكتوبر'), 'SU');
  assert.equal(resolveProvince('شمال سيناء'), 'SIN');
  assert.equal(resolveProvince('alx'), 'ALX');
  assert.equal(resolveProvince('nowhere', null, 'الغردقة'), 'BA');
  assert.equal(resolveProvince('nowhere'), null);
});

test('an address saved without a governorate gets one on its way to Shopify', () => {
  assert.equal(toMailingAddress({ city: 'Maadi', province: 'Cairo' }).provinceCode, 'C');
  assert.equal(toMailingAddress({ city: 'x', provinceCode: 'DK' }).provinceCode, 'DK');
  assert.equal(toMailingAddress({ city: 'nowhere' }).provinceCode, undefined);
});
