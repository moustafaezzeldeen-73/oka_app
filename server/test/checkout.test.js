import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

process.env.SHOPIFY_STORE_DOMAIN = 'test.myshopify.com';
process.env.SHOPIFY_ADMIN_ACCESS_TOKEN = 'shpat_test';

const { quote, placeOrder, CheckoutError } = await import('../checkout.js');

/**
 * A fake Shopify Admin API: answers the variant lookup, the discount check
 * and order creation, and records what the server sent.
 */
const VARIANTS = {
  'gid://shopify/ProductVariant/1': { price: '120.00', available: true, qty: 10 },
  'gid://shopify/ProductVariant/2': { price: '49.00', available: true, qty: 2 },
};
let sent;
let discountAmount;
let shippingRates;

beforeEach(() => {
  sent = [];
  discountAmount = 0;
  shippingRates = [
    { handle: 'express', title: 'Express', price: { amount: '90.0' } },
    { handle: 'standard', title: 'Standard', price: { amount: '36.0' } },
  ];
  globalThis.fetch = async (url, init) => {
    const { query, variables } = JSON.parse(init.body);
    sent.push({ query, variables });
    let data;
    if (query.includes('OkaVariants')) {
      data = {
        nodes: variables.ids.map((id) =>
          VARIANTS[id]
            ? {
                id,
                title: 'x',
                price: VARIANTS[id].price,
                compareAtPrice: null,
                availableForSale: VARIANTS[id].available,
                inventoryQuantity: VARIANTS[id].qty,
                inventoryPolicy: 'DENY',
                product: { title: 'P', handle: 'p', status: 'ACTIVE' },
              }
            : null,
        ),
      };
    } else if (query.includes('OkaCalculate')) {
      data = {
        draftOrderCalculate: {
          calculatedDraftOrder: {
            discountCodes: discountAmount ? variables.input.discountCodes ?? [] : [],
            totalDiscountsSet: { shopMoney: { amount: String(discountAmount) } },
            availableShippingRates: variables.input.shippingAddress ? shippingRates : [],
            warnings: discountAmount ? [] : [{ message: 'Discount code is not valid' }],
          },
          userErrors: [],
        },
      };
    } else if (query.includes('OkaOrderCreate')) {
      data = {
        orderCreate: {
          order: { id: 'gid://shopify/Order/9', name: '#1009', totalPriceSet: { shopMoney: { amount: '0', currencyCode: 'EGP' } } },
          userErrors: [],
        },
      };
    } else {
      data = {};
    }
    return new Response(JSON.stringify({ data }), { status: 200 });
  };
});

const customer = { id: 'gid://shopify/Customer/5', name: 'Test Buyer', email: null, phone: '+201001234567' };
const address = { firstName: 'Test', lastName: 'Buyer', address1: '1 St', city: 'Nasr City', provinceCode: 'C', phone: '01001234567' };

test('prices come from the variant, not from anything the app sends', async () => {
  const q = await quote({
    lines: [{ variantId: 'gid://shopify/ProductVariant/1', quantity: 2, price: 1, priceOverride: 1 }],
  });
  assert.equal(q.subtotal, 240);
  // No address yet: the store's fee-table estimate (metro, under 300).
  assert.equal(q.shipping, 60);
  assert.equal(q.shippingSource, 'estimate');
  assert.equal(q.total, 300);
});

test('with an address, shipping is the cheapest rate Shopify offers', async () => {
  const q = await quote({ lines: [{ variantId: 'gid://shopify/ProductVariant/1', quantity: 3 }], address });
  assert.equal(q.shipping, 36);
  assert.equal(q.shippingTitle, 'Standard');
  assert.equal(q.shippingSource, 'shopify');
  const calc = sent.find((x) => x.query.includes('OkaCalculate')).variables.input;
  assert.equal(calc.shippingAddress.provinceCode, 'C');
});

test('if Shopify offers no rate, the fee table is used', async () => {
  shippingRates = [];
  const q = await quote({
    lines: [{ variantId: 'gid://shopify/ProductVariant/1', quantity: 2 }],
    address: { ...address, provinceCode: 'ASN' },
  });
  assert.equal(q.shipping, 80);
  assert.equal(q.shippingSource, 'table');
});

test('lines without a variant are dropped; an empty basket is refused', async () => {
  await assert.rejects(quote({ lines: [{ title: 'free thing', price: 0, quantity: 1 }] }), CheckoutError);
});

test('more than is in stock is refused with the details', async () => {
  await assert.rejects(
    quote({ lines: [{ variantId: 'gid://shopify/ProductVariant/2', quantity: 3 }] }),
    (err) => err.code === 'stock' && err.problems[0].available === 2,
  );
});

test('card is refused until a gateway is configured', async () => {
  await assert.rejects(
    quote({ lines: [{ variantId: 'gid://shopify/ProductVariant/1', quantity: 2 }], paymentMethod: 'card' }),
    (err) => err.code === 'payment',
  );
});

test('an order below the minimum is not placed', async () => {
  await assert.rejects(
    placeOrder({
      customer,
      address,
      lines: [{ variantId: 'gid://shopify/ProductVariant/2', quantity: 1 }],
    }),
    (err) => err.code === 'minimum',
  );
  assert.ok(!sent.some((r) => r.query.includes('OkaOrderCreate')));
});

test('the order carries server prices, server shipping, and the discount amount', async () => {
  discountAmount = 30;
  const r = await placeOrder({
    idempotencyKey: 'k1',
    customer,
    address,
    lines: [{ variantId: 'gid://shopify/ProductVariant/1', quantity: 2, priceOverride: 1 }],
    discountCode: 'SAVE30',
    shipping: 0,
  });
  assert.equal(r.orderNumber, '#1009');
  const create = sent.find((x) => x.query.includes('OkaOrderCreate')).variables.order;
  assert.equal(create.lineItems[0].priceSet, undefined, 'no price override on a checkout line');
  assert.equal(create.shippingLines[0].priceSet.shopMoney.amount, '36');
  assert.equal(create.shippingLines[0].title, 'Standard');
  assert.equal(create.discountCode.itemFixedDiscountCode.code, 'SAVE30');
  assert.equal(create.discountCode.itemFixedDiscountCode.amountSet.shopMoney.amount, '30');
  assert.equal(create.customer.toAssociate.id, customer.id);
  assert.equal(create.shippingAddress.provinceCode, 'C');
});

test('a code Shopify rejects stops the order instead of being ignored', async () => {
  discountAmount = 0;
  await assert.rejects(
    placeOrder({
      customer,
      address,
      lines: [{ variantId: 'gid://shopify/ProductVariant/1', quantity: 2 }],
      discountCode: 'NOPE',
    }),
    (err) => err.code === 'discount',
  );
});

test('the same idempotency key returns the first order instead of a second', async () => {
  const args = {
    idempotencyKey: 'same',
    customer,
    address,
    lines: [{ variantId: 'gid://shopify/ProductVariant/1', quantity: 2 }],
  };
  const a = await placeOrder(args);
  const b = await placeOrder(args);
  assert.equal(a, b);
  assert.equal(sent.filter((x) => x.query.includes('OkaOrderCreate')).length, 1);
});
