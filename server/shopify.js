/**
 * Shopify Admin API client.
 *
 * This module is the ONLY place the Admin access token is used, and it runs on
 * a server the app talks to over HTTPS. The token is never sent to a device.
 */

import crypto from 'node:crypto';

import { POLICY } from './policy.js';

const API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-07';

/**
 * Both spellings are accepted: the service's original names and the ones the
 * store's app credentials are issued under.
 */
export const shopDomain = () =>
  process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOPIFY_SHOP_DOMAIN || null;
const adminToken = () =>
  process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN || null;
export const hasShopify = () => Boolean(shopDomain() && adminToken());

/**
 * Shopify rejects anything that is not E.164, and the app was sending the
 * prototype's display format ("+20 100 123 4567") straight through — spaces
 * and all — so every order failed phone validation.
 *
 * Egyptian mobiles are 10 digits after the country code, usually written
 * locally with a leading 0 (01001234567). Both forms, and an already-correct
 * +20…, normalise to the same +20XXXXXXXXXX.
 */
export function normalizePhone(raw, countryCode = '20') {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith(countryCode)) digits = digits.slice(countryCode.length);
  digits = digits.replace(/^0+/, '');

  // An Egyptian mobile is 10 digits (1XXXXXXXXX). Anything else is more likely
  // a typo than a number Shopify will accept, so it is dropped rather than
  // sent along to fail validation server-side.
  if (digits.length !== 10) return null;
  return `+${countryCode}${digits}`;
}

/**
 * Customer search syntax. Sessions carry the Shopify customer id, which is
 * the only lookup a signed-in request uses; email and phone remain for
 * sign-in itself.
 */
const customerQuery = (identifier) => {
  const s = String(identifier);
  const gid = s.match(/^gid:\/\/shopify\/Customer\/(\d+)$/);
  if (gid) return `id:${gid[1]}`;
  if (s.includes('@')) return `email:"${s}"`;
  return `phone:"${normalizePhone(s) ?? s}"`;
};

export async function adminGraphql(query, variables = {}) {
  const shop = shopDomain();
  const token = adminToken();
  if (!shop || !token) {
    throw new Error(
      'Missing required environment variables: SHOPIFY_STORE_DOMAIN / SHOPIFY_ADMIN_ACCESS_TOKEN',
    );
  }

  const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(Number(process.env.SHOPIFY_TIMEOUT_MS ?? 15000)),
  });

  if (!res.ok) {
    throw new Error(`Shopify Admin API returned ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`Shopify Admin API: ${json.errors.map((e) => e.message).join('; ')}`);
  }
  return json.data;
}

/* ── Orders ────────────────────────────────────────────────────────────── */

const ORDER_CREATE = `
  mutation OkaOrderCreate($order: OrderCreateOrderInput!) {
    orderCreate(order: $order) {
      order {
        id
        name
        totalPriceSet { shopMoney { amount currencyCode } }
      }
      userErrors { field message }
    }
  }
`;

/** A Shopify MailingAddress input from a saved-address record (`raw`). */
export function toMailingAddress(addr = {}, fallbackName = '') {
  const [first, ...rest] = String(fallbackName || '').trim().split(/\s+/);
  const phone = normalizePhone(addr.phone);
  return {
    firstName: addr.firstName || first || 'OKA',
    lastName: addr.lastName || rest.join(' ') || 'Customer',
    address1: addr.address1 || '',
    ...(addr.address2 ? { address2: addr.address2 } : {}),
    city: addr.city || '',
    ...(addr.provinceCode ? { provinceCode: addr.provinceCode } : {}),
    ...(addr.zip ? { zip: addr.zip } : {}),
    countryCode: 'EG',
    ...(phone ? { phone } : {}),
  };
}

/**
 * Creates an order from a quote the server has already priced (see
 * checkout.js). Nothing in here trusts the app:
 *
 *  • every line is a real variant. Shopify prices it at the variant's live
 *    price unless `unitPrice` is set, and only server code sets that (a
 *    subscription cycle applying its discount)
 *  • shipping and the discount amount come from the server's quote
 *  • the discount is charged with `amountSet`. In orderCreate a discount
 *    code on its own is only a label, so without the amount the courier
 *    would collect more than the shopper was shown
 *
 * Every order is created unpaid (PENDING): cash on delivery until the courier
 * collects, or until a payment gateway confirms a prepaid one.
 */
export async function createOrder({
  lines = [],
  address,
  customer = {},
  customerId = null,
  shipping = 0,
  discount = null, // { code, amount }
  paymentMethod = 'cod',
  lang = 'ar',
  extraTags = [],
  noteExtra,
}) {
  if (!lines.length) throw new Error('an order needs at least one line');
  const lineItems = lines.map((l) => {
    if (!l.variantId) throw new Error('every line must be a product variant');
    return {
      variantId: l.variantId,
      quantity: l.quantity,
      ...(l.unitPrice != null
        ? { priceSet: { shopMoney: { amount: String(l.unitPrice), currencyCode: 'EGP' } } }
        : {}),
    };
  });

  const shippingAddress = toMailingAddress(address, customer.name);
  const phone = shippingAddress.phone ?? normalizePhone(customer.phone);

  const order = {
    lineItems,
    ...(customer.email ? { email: customer.email } : {}),
    ...(phone ? { phone } : {}),
    currency: 'EGP',
    shippingAddress,
    billingAddress: shippingAddress,
    // Links the order to the account by id. Matching by email or phone
    // silently misses when they differ, and the order then never shows up in
    // this customer's history.
    ...(customerId ? { customer: { toAssociate: { id: customerId } } } : {}),
    tags: ['oka-app', `lang:${lang}`, `payment:${paymentMethod}`, ...extraTags],
    note: [
      paymentMethod === 'cod' ? 'Cash on delivery — collected by courier' : null,
      noteExtra,
    ]
      .filter(Boolean)
      .join(' — ') || undefined,
    financialStatus: 'PENDING',
    shippingLines: shipping > 0
      ? [{
          title: 'Delivery',
          priceSet: { shopMoney: { amount: String(shipping), currencyCode: 'EGP' } },
        }]
      : undefined,
    ...(discount?.code && discount.amount > 0
      ? {
          discountCode: {
            itemFixedDiscountCode: {
              code: discount.code,
              amountSet: { shopMoney: { amount: String(discount.amount), currencyCode: 'EGP' } },
            },
          },
        }
      : {}),
  };

  const data = await adminGraphql(ORDER_CREATE, { order });
  const { order: created, userErrors } = data.orderCreate;
  if (userErrors?.length) {
    throw new Error(userErrors.map((e) => e.message).join('; '));
  }
  return created;
}

const VARIANTS = `
  query OkaVariants($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id
        title
        price
        compareAtPrice
        availableForSale
        inventoryQuantity
        inventoryPolicy
        product { title handle status }
      }
    }
  }
`;

/**
 * Live price and stock for each variant, keyed by id. This — never the
 * price the app sends — is what an order is charged.
 */
export async function fetchVariants(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const data = await adminGraphql(VARIANTS, { ids: unique });
  const out = new Map();
  for (const v of data.nodes ?? []) {
    if (!v?.id) continue;
    const tracked = v.inventoryQuantity != null && v.inventoryPolicy !== 'CONTINUE';
    out.set(v.id, {
      id: v.id,
      title: v.product?.title ?? v.title,
      handle: v.product?.handle ?? null,
      price: Number(v.price),
      compareAtPrice: v.compareAtPrice != null ? Number(v.compareAtPrice) : null,
      active: v.product?.status === 'ACTIVE',
      available: Boolean(v.availableForSale),
      stock: tracked ? v.inventoryQuantity : null,
    });
  }
  return out;
}

const ORDER_STATUS = `
  query OkaOrderStatus($q: String!) {
    orders(first: 1, query: $q) {
      edges {
        node {
          id
          name
          displayFulfillmentStatus
          displayFinancialStatus
          createdAt
          cancelledAt
          customer { id }
          fulfillments(first: 5) {
            createdAt
            trackingInfo { number url company }
          }
        }
      }
    }
  }
`;

/**
 * Whether an order belongs to the signed-in customer. Every route that reads
 * or changes a single order checks this: order numbers are sequential, so
 * without it anyone could walk through them.
 */
export const ownsOrder = (order, customerId) =>
  Boolean(order && customerId && order.customer?.id === customerId);

export async function findOrder(orderName) {
  // Shopify's search parser wants the value quoted when it contains
  // punctuation — an unquoted "#100121" was silently matching nothing.
  const data = await adminGraphql(ORDER_STATUS, { q: `name:"${orderName}"` });
  return data.orders.edges[0]?.node ?? null;
}

/* ── Loyalty ───────────────────────────────────────────────────────────────
 * Shopify store credit is the points ledger: 1 EGP of credit = 10 points
 * (policy.js). Points are credited when an order is delivered (loyalty.js)
 * and spent by turning them into a single-use voucher code, so the balance
 * shown is always what Shopify itself holds.
 */


const POINTS_PER_EGP = POLICY.loyalty.pointsPerEgp;

const CUSTOMER_STORE_CREDIT = `
  query OkaStoreCredit($id: ID!) {
    customer(id: $id) {
      id
      storeCreditAccounts(first: 10) {
        edges { node { id balance { amount currencyCode } } }
      }
    }
  }
`;

/** The customer's live points balance, derived from their EGP store credit. */
export async function findCustomerLoyalty(customerId) {
  const data = await adminGraphql(CUSTOMER_STORE_CREDIT, { id: customerId });
  const node = data.customer;
  if (!node) return null;
  const accounts = node.storeCreditAccounts.edges.map((e) => e.node);
  const egp = accounts.find((a) => a.balance?.currencyCode === 'EGP') ?? null;
  const credit = Number(egp?.balance?.amount ?? 0);
  return { customerId: node.id, balance: Math.floor(credit * POINTS_PER_EGP) };
}

const STORE_CREDIT_DEBIT = `
  mutation OkaStoreCreditDebit($id: ID!, $debitInput: StoreCreditAccountDebitInput!) {
    storeCreditAccountDebit(id: $id, debitInput: $debitInput) {
      storeCreditAccountTransaction { balanceAfterTransaction { amount } }
      userErrors { field message code }
    }
  }
`;

const STORE_CREDIT_CREDIT = `
  mutation OkaStoreCreditCredit($id: ID!, $creditInput: StoreCreditAccountCreditInput!) {
    storeCreditAccountCredit(id: $id, creditInput: $creditInput) {
      storeCreditAccountTransaction { account { balance { amount } } }
      userErrors { field message code }
    }
  }
`;

const money = (egp) => ({ amount: (Math.round(egp * 100) / 100).toFixed(2), currencyCode: 'EGP' });

/**
 * Debits `points` worth of credit. `customerId` is accepted directly —
 * Shopify resolves it to the customer's EGP store credit account.
 */
export async function debitLoyaltyPoints(customerId, points) {
  const data = await adminGraphql(STORE_CREDIT_DEBIT, {
    id: customerId,
    debitInput: { debitAmount: money(points / POINTS_PER_EGP) },
  });
  const r = data.storeCreditAccountDebit;
  if (r.userErrors?.length) throw new Error(r.userErrors.map((e) => e.message).join('; '));
  const left = Number(r.storeCreditAccountTransaction?.balanceAfterTransaction?.amount ?? 0);
  return { balance: Math.floor(left * POINTS_PER_EGP) };
}

/** Credits `points` worth of credit (earning, or refunding a failed redeem). */
export async function creditLoyaltyPoints(customerId, points, { expiresAt } = {}) {
  const data = await adminGraphql(STORE_CREDIT_CREDIT, {
    id: customerId,
    creditInput: { creditAmount: money(points / POINTS_PER_EGP), ...(expiresAt ? { expiresAt } : {}) },
  });
  const r = data.storeCreditAccountCredit;
  if (r.userErrors?.length) throw new Error(r.userErrors.map((e) => e.message).join('; '));
  const bal = Number(r.storeCreditAccountTransaction?.account?.balance?.amount ?? 0);
  return { balance: Math.floor(bal * POINTS_PER_EGP) };
}

const VOUCHER_CREATE = `
  mutation OkaVoucher($basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode { id }
      userErrors { field message }
    }
  }
`;

/**
 * A single-use voucher for one customer: `egp` off an order of at least
 * `minOrder`, valid for `days`. Needs the write_discounts scope.
 */
export async function createVoucher({ customerId, egp, minOrder, days, title }) {
  const code = `OKA-${crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + days * 24 * 60 * 60 * 1000);
  const data = await adminGraphql(VOUCHER_CREATE, {
    basicCodeDiscount: {
      title: title ?? `Loyalty reward ${code}`,
      code,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      context: { customers: { add: [customerId] } },
      customerGets: {
        value: { discountAmount: { amount: String(egp), appliesOnEachItem: false } },
        items: { all: true },
      },
      minimumRequirement: { subtotal: { greaterThanOrEqualToSubtotal: String(minOrder) } },
      usageLimit: 1,
      appliesOncePerCustomer: true,
    },
  });
  const r = data.discountCodeBasicCreate;
  if (r.userErrors?.length) throw new Error(r.userErrors.map((e) => e.message).join('; '));
  return { code, discountId: r.codeDiscountNode?.id ?? null, endsAt: endsAt.toISOString() };
}

const CODE_LOOKUP = `
  query OkaCodeLookup($code: String!) {
    codeDiscountNodeByCode(code: $code) { id }
  }
`;

const CODE_DEACTIVATE = `
  mutation OkaCodeDeactivate($id: ID!) {
    discountCodeDeactivate(id: $id) { userErrors { field message } }
  }
`;

/**
 * Retires a loyalty voucher once an order has used it. Orders created through
 * orderCreate record a discount code without counting it against the code's
 * usage limit, so the limit alone wouldn't stop a second use.
 */
export async function retireVoucher(code) {
  if (!/^OKA-[A-Z0-9]{8}$/.test(String(code ?? ''))) return;
  const data = await adminGraphql(CODE_LOOKUP, { code });
  const id = data.codeDiscountNodeByCode?.id;
  if (id) await adminGraphql(CODE_DEACTIVATE, { id });
}

/* ── Customer lookup, order edit and cancel ────────────────────────────── */

const CUSTOMER_ORDERS = `
  query OkaCustomerOrders($q: String!) {
    customers(first: 1, query: $q) {
      edges {
        node {
          id
          firstName
          lastName
          defaultEmailAddress { emailAddress }
          defaultPhoneNumber { phoneNumber }
          defaultAddress { address1 address2 city province zip phone }
          orders(first: 20, sortKey: CREATED_AT, reverse: true) {
            edges {
              node {
                id
                name
                createdAt
                cancelledAt
                displayFulfillmentStatus
                displayFinancialStatus
                totalPriceSet { shopMoney { amount currencyCode } }
                shippingAddress {
                  firstName lastName name
                  address1 address2 city province zip phone
                }
                lineItems(first: 25) {
                  edges {
                    node {
                      id
                      title
                      quantity
                      variant { id }
                      originalUnitPriceSet { shopMoney { amount } }
                      image { url }
                    }
                  }
                }
                fulfillments(first: 5) { createdAt trackingInfo { number url company } }
              }
            }
          }
        }
      }
    }
  }
`;

/** The account fields every customer query shares. */
const profileOf = (node) => ({
  id: node.id,
  email: node.defaultEmailAddress?.emailAddress ?? null,
  name: [node.firstName, node.lastName].filter(Boolean).join(' '),
  phone: node.defaultPhoneNumber?.phoneNumber ?? node.defaultAddress?.phone ?? null,
  address: node.defaultAddress ?? null,
});

const CUSTOMER_PROFILE = `
  query OkaCustomerProfile($q: String!) {
    customers(first: 1, query: $q) {
      edges {
        node {
          id
          firstName
          lastName
          defaultEmailAddress { emailAddress }
          defaultPhoneNumber { phoneNumber }
          defaultAddress { address1 address2 city province zip phone }
        }
      }
    }
  }
`;

/**
 * Just the account — no orders. Sign-in, saving an address and starting a
 * subscription only need the id and name, and were each pulling twenty
 * orders with every line item to get them.
 */
export async function findCustomerProfile(identifier) {
  const data = await adminGraphql(CUSTOMER_PROFILE, { q: customerQuery(identifier) });
  const node = data.customers.edges[0]?.node;
  return node ? profileOf(node) : null;
}

/** Finds a customer by email or phone and returns their recent orders. */
export async function findCustomerOrders(identifier) {
  const data = await adminGraphql(CUSTOMER_ORDERS, { q: customerQuery(identifier) });
  const node = data.customers.edges[0]?.node;
  if (!node) return null;

  return {
    ...profileOf(node),
    orders: node.orders.edges.map(({ node: o }) => ({
      id: o.id,
      name: o.name,
      createdAt: o.createdAt,
      cancelled: Boolean(o.cancelledAt),
      fulfillmentStatus: o.displayFulfillmentStatus,
      financialStatus: o.displayFinancialStatus,
      total: Number(o.totalPriceSet?.shopMoney?.amount ?? 0),
      currency: o.totalPriceSet?.shopMoney?.currencyCode ?? 'EGP',
      city: o.shippingAddress?.city ?? null,
      // The order's own delivery address, not the account's current default —
      // an order shipped to a previous address must keep showing that one.
      shipTo: o.shippingAddress
        ? {
            name:
              o.shippingAddress.name ||
              [o.shippingAddress.firstName, o.shippingAddress.lastName].filter(Boolean).join(' '),
            street: [o.shippingAddress.address1, o.shippingAddress.address2]
              .filter(Boolean)
              .join(', '),
            city: [o.shippingAddress.city, o.shippingAddress.province]
              .filter(Boolean)
              .join(', '),
            zip: o.shippingAddress.zip ?? null,
            phone: o.shippingAddress.phone ?? null,
          }
        : null,
      trackingNumber: o.fulfillments?.flatMap((f) => f.trackingInfo ?? [])?.[0]?.number ?? null,
      trackingCompany: o.fulfillments?.flatMap((f) => f.trackingInfo ?? [])?.[0]?.company ?? null,
      fulfilledAt: o.fulfillments?.[0]?.createdAt ?? null,
      cancelledAt: o.cancelledAt ?? null,
      items: o.lineItems.edges.map(({ node: li }) => ({
        id: li.id,
        title: li.title,
        quantity: li.quantity,
        variantId: li.variant?.id ?? null,
        price: Number(li.originalUnitPriceSet?.shopMoney?.amount ?? 0),
        image: li.image?.url ?? null,
      })),
    })),
  };
}

/** Resolves an order name (#100121) to its Shopify id. */
export async function orderIdByName(orderName) {
  const order = await findOrder(orderName);
  return order?.id ?? null;
}

const ORDER_CANCEL = `
  mutation OkaOrderCancel($orderId: ID!, $reason: OrderCancelReason!) {
    orderCancel(orderId: $orderId, reason: $reason, refund: false, restock: true, notifyCustomer: true) {
      job { id }
      orderCancelUserErrors { field message }
    }
  }
`;

export async function cancelOrder(orderId, reason = 'CUSTOMER') {
  const data = await adminGraphql(ORDER_CANCEL, { orderId, reason });
  const errs = data.orderCancel.orderCancelUserErrors;
  if (errs?.length) throw new Error(errs.map((e) => e.message).join('; '));
  return { ok: true, jobId: data.orderCancel.job?.id ?? null };
}

const EDIT_BEGIN = `
  mutation OkaEditBegin($id: ID!) {
    orderEditBegin(id: $id) {
      calculatedOrder {
        id
        lineItems(first: 50) { edges { node { id quantity variant { id } } } }
      }
      userErrors { field message }
    }
  }
`;

const EDIT_QTY = `
  mutation OkaEditQty($id: ID!, $lineItemId: ID!, $quantity: Int!) {
    orderEditSetQuantity(id: $id, lineItemId: $lineItemId, quantity: $quantity, restock: true) {
      calculatedOrder { id }
      userErrors { field message }
    }
  }
`;

const EDIT_ADD = `
  mutation OkaEditAdd($id: ID!, $variantId: ID!, $quantity: Int!) {
    orderEditAddVariant(id: $id, variantId: $variantId, quantity: $quantity) {
      calculatedOrder { id }
      userErrors { field message }
    }
  }
`;

const EDIT_COMMIT = `
  mutation OkaEditCommit($id: ID!) {
    orderEditCommit(id: $id, notifyCustomer: true, staffNote: "Edited from the OKA app") {
      order { id name totalPriceSet { shopMoney { amount } } }
      userErrors { field message }
    }
  }
`;

const bail = (result, key) => {
  const errs = result[key]?.userErrors;
  if (errs?.length) throw new Error(errs.map((e) => e.message).join('; '));
  return result[key];
};

/**
 * Applies an edit to a real Shopify order.
 *
 * `lines` is [{ variantId, quantity }]: each mentioned variant ends at that
 * quantity (0 removes it), variants the order lacks are added, and lines not
 * mentioned are left alone.
 */
export async function editOrder(orderId, lines) {
  // The desired end state, by variant. Lines used to be matched to the
  // order's lines by position, so a basket listed in a different order than
  // Shopify's set each product's quantity on another product.
  const want = new Map();
  for (const l of lines) {
    if (!l?.variantId) continue;
    want.set(l.variantId, (want.get(l.variantId) ?? 0) + Math.max(0, Math.floor(Number(l.quantity) || 0)));
  }

  const begun = bail(await adminGraphql(EDIT_BEGIN, { id: orderId }), 'orderEditBegin');
  const calcId = begun.calculatedOrder.id;
  const existing = begun.calculatedOrder.lineItems.edges.map((e) => e.node);

  // Quantity changes first, then additions — Shopify recalculates as it goes.
  const seen = new Set();
  for (const line of existing) {
    const variantId = line.variant?.id ?? null;
    // A line with no variant (a custom item) isn't in the app's basket; leave it.
    if (!variantId) continue;
    // Lines the app didn't mention stay as they are — only an explicit
    // quantity (0 to remove) changes a line.
    if (!want.has(variantId)) continue;
    const quantity = seen.has(variantId) ? 0 : want.get(variantId);
    seen.add(variantId);
    if (quantity !== line.quantity) {
      bail(
        await adminGraphql(EDIT_QTY, { id: calcId, lineItemId: line.id, quantity }),
        'orderEditSetQuantity',
      );
    }
  }

  for (const [variantId, quantity] of want) {
    if (seen.has(variantId) || quantity <= 0) continue;
    bail(await adminGraphql(EDIT_ADD, { id: calcId, variantId, quantity }), 'orderEditAddVariant');
  }

  const committed = bail(await adminGraphql(EDIT_COMMIT, { id: calcId }), 'orderEditCommit');
  return {
    ok: true,
    orderName: committed.order?.name ?? null,
    total: Number(committed.order?.totalPriceSet?.shopMoney?.amount ?? 0),
  };
}

/* ── Customer addresses ────────────────────────────────────────────────── */

const CUSTOMER_ADDRESSES = `
  query OkaCustomerAddresses($q: String!) {
    customers(first: 1, query: $q) {
      edges {
        node {
          id
          defaultAddress { id }
          addressesV2(first: 10) {
            edges {
              node { id firstName lastName address1 address2 city province provinceCode zip phone }
            }
          }
        }
      }
    }
  }
`;

/** A customer's saved addresses, default first. */
export async function findCustomerAddresses(identifier) {
  const data = await adminGraphql(CUSTOMER_ADDRESSES, { q: customerQuery(identifier) });
  const node = data.customers.edges[0]?.node;
  if (!node) return [];

  const defaultId = node.defaultAddress?.id ?? null;
  return (node.addressesV2?.edges ?? [])
    .map(({ node: a }) => ({
      id: a.id,
      name: [a.firstName, a.lastName].filter(Boolean).join(' '),
      street: [a.address1, a.address2].filter(Boolean).join(', '),
      city: a.province ? `${a.city}, ${a.province}` : a.city,
      provinceCode: a.provinceCode ?? null,
      phone: a.phone,
      isDefault: a.id === defaultId,
      // The display strings above are lossy — "14 Al Nasr St, Apt 3" cannot be
      // split back into address1/address2 reliably. Writing one of these onto
      // an order needs the real components, so they travel alongside.
      raw: {
        firstName: a.firstName ?? null,
        lastName: a.lastName ?? null,
        address1: a.address1 ?? null,
        address2: a.address2 ?? null,
        city: a.city ?? null,
        province: a.province ?? null,
        provinceCode: a.provinceCode ?? null,
        zip: a.zip ?? null,
        phone: a.phone ?? null,
      },
    }))
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

/**
 * Fulfilment states that mean "a parcel is already out there".
 *
 * PARTIALLY_FULFILLED counts: some of the order has shipped, and Shopify's
 * order-edit API works on the order as a whole, so an edit would rewrite
 * lines that are already on a courier's van.
 */
const SHIPPED_STATUSES = new Set(['FULFILLED', 'PARTIALLY_FULFILLED']);

export const isShipped = (order) =>
  SHIPPED_STATUSES.has(order?.displayFulfillmentStatus ?? order?.fulfillmentStatus);

const ORDER_UPDATE_ADDRESS = `
  mutation OkaOrderAddress($input: OrderInput!) {
    orderUpdate(input: $input) {
      order {
        id
        name
        shippingAddress { address1 address2 city province zip phone name }
      }
      userErrors { field message }
    }
  }
`;

/**
 * Redirects an order to a different address.
 *
 * Refuses once the parcel has been handed to the courier: Shopify will happily
 * rewrite the address on a fulfilled order, but the AWB is already printed and
 * the parcel is physically moving, so the change would be invisible to the courier
 * and the two systems would disagree about where it is going.
 */
export async function updateOrderAddress(order, addr) {
  if (isShipped(order)) {
    throw new Error('this order has already been fulfilled, so its address can no longer be changed');
  }
  const data = await adminGraphql(ORDER_UPDATE_ADDRESS, {
    input: { id: order.id, shippingAddress: toMailingAddress(addr) },
  });
  const { order: updated, userErrors } = data.orderUpdate;
  if (userErrors?.length) throw new Error(userErrors.map((e) => e.message).join('; '));
  return { ok: true, shippingAddress: updated?.shippingAddress ?? null };
}

/* ── Catalogue (Admin API — server-side only) ────────────────────────────
 * The app has no Storefront token configured, and the Admin token already
 * proves it can reach everything the catalogue needs. Serving products
 * through the same server that already serves orders means the app never
 * has to hold a second Shopify credential at all.
 */

/** Local category ids that don't share a handle with an existing collection. */
const COLLECTION_HANDLE_OVERRIDES = {
  tobacco: 'ready-to-smoke-bowls',
};

const CATALOGUE_PRODUCT_FIELDS = `
  id
  handle
  title
  description
  featuredMedia { preview { image { url } } }
  titleAr: metafield(namespace: "oka", key: "title_ar") { value }
  descriptionAr: metafield(namespace: "oka", key: "description_ar") { value }
  images(first: 6) { edges { node { url } } }
  variants(first: 1) {
    edges { node { id availableForSale inventoryQuantity inventoryPolicy price compareAtPrice } }
  }
  media(first: 8) {
    edges { node { __typename ... on Model3d { sources { url format } } } }
  }
`;

function toCatalogueProduct(node, catId) {
  const variant = node.variants?.edges?.[0]?.node;
  const model = node.media?.edges?.map((e) => e.node)?.find((m) => m.__typename === 'Model3d');
  const sourceUrl = (fmt) => model?.sources?.find((s) => s.format === fmt)?.url ?? null;

  return {
    id: node.handle,
    shopifyId: node.id,
    variantId: variant?.id ?? null,
    cat: catId,
    price: Math.round(Number(variant?.price ?? 0)),
    // A sale shows only when the compare-at price is really higher.
    compareAtPrice:
      Number(variant?.compareAtPrice ?? 0) > Number(variant?.price ?? 0)
        ? Math.round(Number(variant.compareAtPrice))
        : null,
    // Untracked or "keep selling" variants have no meaningful count.
    stock:
      variant?.inventoryPolicy === 'CONTINUE' || variant?.inventoryQuantity == null
        ? (variant?.availableForSale ? 99 : 0)
        : Math.max(0, variant.inventoryQuantity),
    titleEn: node.title,
    titleAr: node.titleAr?.value || node.title,
    descEn: node.description ?? '',
    descAr: node.descriptionAr?.value || node.description || '',
    img: node.featuredMedia?.preview?.image?.url ?? null,
    images: (node.images?.edges ?? []).map((e) => e.node.url).filter(Boolean),
    usdzUrl: sourceUrl('usdz'),
    glbUrl: sourceUrl('glb'),
    available: variant?.availableForSale ?? true,
  };
}

/**
 * Loads every collection the app navigates by, each with its products, in one
 * request. Collections with no Shopify counterpart are skipped rather than
 * guessed at — see COLLECTION_HANDLE_OVERRIDES for the one known rename.
 */
export async function fetchAdminCatalogue(localIds) {
  const handleFor = (id) => COLLECTION_HANDLE_OVERRIDES[id] ?? id;

  const query = `
    query OkaCatalogue {
      ${localIds
        .map(
          (id, i) => `
        c${i}: collectionByIdentifier(identifier: { handle: ${JSON.stringify(handleFor(id))} }) {
          id
          handle
          title
          image { url }
          titleAr: metafield(namespace: "oka", key: "title_ar") { value }
          products(first: 40) { edges { node { ${CATALOGUE_PRODUCT_FIELDS} } } }
        }`,
        )
        .join('\n')}
    }
  `;

  const data = await adminGraphql(query);
  const cats = [];
  const products = [];

  localIds.forEach((localId, i) => {
    const c = data[`c${i}`];
    if (!c) return; // no matching Shopify collection for this local id
    cats.push({
      id: localId,
      en: c.title,
      ar: c.titleAr?.value || c.title,
      img: c.image?.url ?? null,
      shopifyId: c.id,
    });
    c.products.edges.forEach(({ node }) => {
      if (!products.some((p) => p.id === node.handle)) {
        products.push(toCatalogueProduct(node, localId));
      }
    });
  });

  return { cats, products };
}

/* ── Checkout totals, addresses, wishlist ───────────────────────────────── */

const DRAFT_CALCULATE = `
  mutation OkaCalculate($input: DraftOrderInput!) {
    draftOrderCalculate(input: $input) {
      calculatedDraftOrder {
        discountCodes
        totalDiscountsSet { shopMoney { amount } }
        warnings { message }
      }
      userErrors { field message }
    }
  }
`;

/**
 * What a discount code is worth on this basket, according to Shopify's own
 * discount rules (eligibility, minimums, customer restrictions, usage).
 *
 * Returns { code, amount, applied, message }. `amount` is what the order will
 * be charged off; a code Shopify won't apply comes back with applied: false
 * and its reason, so the app can say why instead of showing "Applied".
 */
export async function evaluateDiscount({ lines, discountCode, customerId }) {
  const code = String(discountCode ?? '').trim();
  if (!code) return { code: null, amount: 0, applied: false, message: null };

  const input = {
    lineItems: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
    discountCodes: [code],
    // Automatic discounts are left out: orders are created with orderCreate,
    // which doesn't apply them, so quoting them would promise a price the
    // order won't carry.
    acceptAutomaticDiscounts: false,
    ...(customerId ? { purchasingEntity: { customerId } } : {}),
  };

  const data = await adminGraphql(DRAFT_CALCULATE, { input });
  const { calculatedDraftOrder: c, userErrors } = data.draftOrderCalculate;
  if (userErrors?.length) throw new Error(userErrors.map((e) => e.message).join('; '));

  const amount = Math.round(Number(c?.totalDiscountsSet?.shopMoney?.amount ?? 0) * 100) / 100;
  const applied =
    amount > 0 && (c?.discountCodes ?? []).some((d) => d.toLowerCase() === code.toLowerCase());
  return {
    code,
    amount: applied ? amount : 0,
    applied,
    message: applied ? null : c?.warnings?.[0]?.message ?? 'this code does not apply to your basket',
  };
}

const ADDRESS_CREATE = `
  mutation OkaAddressCreate($customerId: ID!, $address: MailingAddressInput!, $setAsDefault: Boolean) {
    customerAddressCreate(customerId: $customerId, address: $address, setAsDefault: $setAsDefault) {
      address { id }
      userErrors { field message }
    }
  }
`;

/**
 * Saves a new address onto the customer's Shopify record. `addr` is
 * { name, phone, street, building, city, provinceCode }; the governorate is
 * required so the courier zone and delivery estimate are known.
 */
export async function createCustomerAddress(customerId, addr, { setAsDefault = false } = {}) {
  if (!addr.street || !addr.city) throw new Error('street and area are required');
  if (!addr.provinceCode) throw new Error('choose a governorate');
  const address = toMailingAddress(
    {
      address1: addr.street,
      address2: addr.building || '',
      city: addr.city,
      provinceCode: addr.provinceCode,
      phone: addr.phone,
    },
    addr.name,
  );
  if (!address.phone) throw new Error('enter a valid Egyptian mobile number');

  const data = await adminGraphql(ADDRESS_CREATE, { customerId, setAsDefault, address });
  const { address: created, userErrors } = data.customerAddressCreate;
  if (userErrors?.length) throw new Error(userErrors.map((e) => e.message).join('; '));
  return { id: created?.id ?? null };
}

const ADDRESS_DELETE = `
  mutation OkaAddressDelete($customerId: ID!, $addressId: ID!) {
    customerAddressDelete(customerId: $customerId, addressId: $addressId) {
      deletedAddressId
      userErrors { field message }
    }
  }
`;

export async function deleteCustomerAddress(customerId, addressId) {
  const data = await adminGraphql(ADDRESS_DELETE, { customerId, addressId });
  const errs = data.customerAddressDelete.userErrors;
  if (errs?.length) throw new Error(errs.map((e) => e.message).join('; '));
  return { ok: true };
}

const ADDRESS_SET_DEFAULT = `
  mutation OkaAddressSetDefault($customerId: ID!, $addressId: ID!) {
    customerUpdateDefaultAddress(customerId: $customerId, addressId: $addressId) {
      customer { id defaultAddress { id } }
      userErrors { field message }
    }
  }
`;

/** Marks an already-saved address as the customer's default. */
export async function setDefaultAddress(customerId, addressId) {
  const data = await adminGraphql(ADDRESS_SET_DEFAULT, { customerId, addressId });
  const errs = data.customerUpdateDefaultAddress.userErrors;
  if (errs?.length) throw new Error(errs.map((e) => e.message).join('; '));
  return { ok: true };
}

const CUSTOMER_METAFIELD = `
  query OkaCustomerMeta($q: String!) {
    customers(first: 1, query: $q) {
      edges { node { id metafield(namespace: "oka", key: "wishlist") { value } } }
    }
  }
`;

/** The wishlist, kept on the customer so it survives a reinstall. */
export async function getWishlist(identifier) {
  const data = await adminGraphql(CUSTOMER_METAFIELD, { q: customerQuery(identifier) });
  const node = data.customers.edges[0]?.node;
  if (!node) return { ids: [] };
  try {
    return { ids: JSON.parse(node.metafield?.value ?? '[]') };
  } catch {
    return { ids: [] };
  }
}

const METAFIELDS_SET = `
  mutation OkaSetWishlist($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id }
      userErrors { field message }
    }
  }
`;

export async function setWishlist(identifier, ids) {
  const data = await adminGraphql(CUSTOMER_METAFIELD, { q: customerQuery(identifier) });
  const node = data.customers.edges[0]?.node;
  if (!node) throw new Error('customer not found');

  const res = await adminGraphql(METAFIELDS_SET, {
    metafields: [
      {
        ownerId: node.id,
        namespace: 'oka',
        key: 'wishlist',
        type: 'json',
        value: JSON.stringify(ids ?? []),
      },
    ],
  });
  const errs = res.metafieldsSet.userErrors;
  if (errs?.length) throw new Error(errs.map((e) => e.message).join('; '));
  return { ok: true };
}

/* ── Accounts ──────────────────────────────────────────────────────────── */

const CUSTOMER_CREATE = `
  mutation OkaCustomerCreate($input: CustomerInput!) {
    customerCreate(input: $input) {
      customer { id }
      userErrors { field message }
    }
  }
`;

/**
 * The account for a phone that has just proven itself with a one-time code,
 * created on first sign-in.
 */
export async function findOrCreateCustomerByPhone(phone, name) {
  const existing = await findCustomerProfile(phone);
  if (existing) return { customer: existing, created: false };

  const [firstName, ...rest] = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  const data = await adminGraphql(CUSTOMER_CREATE, {
    input: {
      phone,
      ...(firstName ? { firstName } : {}),
      ...(rest.length ? { lastName: rest.join(' ') } : {}),
      tags: ['oka-app'],
    },
  });
  const { customer, userErrors } = data.customerCreate;
  if (userErrors?.length) throw new Error(userErrors.map((e) => e.message).join('; '));
  return { customer: await findCustomerProfile(customer.id), created: true };
}

const TAGS_ADD = `
  mutation OkaTagsAdd($id: ID!, $tags: [String!]!) {
    tagsAdd(id: $id, tags: $tags) { userErrors { field message } }
  }
`;

/** Adds tags to an order or customer. */
export async function addTags(id, tags) {
  const data = await adminGraphql(TAGS_ADD, { id, tags });
  const errs = data.tagsAdd.userErrors;
  if (errs?.length) throw new Error(errs.map((e) => e.message).join('; '));
}

const PUSH_TOKENS = `
  query OkaPushTokens($id: ID!) {
    customer(id: $id) { id metafield(namespace: "oka", key: "push_tokens") { value } }
  }
`;

/** Expo push tokens registered by this customer's devices. */
export async function getPushTokens(customerId) {
  const data = await adminGraphql(PUSH_TOKENS, { id: customerId });
  try {
    return JSON.parse(data.customer?.metafield?.value ?? '[]');
  } catch {
    return [];
  }
}

export async function setPushTokens(customerId, tokens) {
  const res = await adminGraphql(METAFIELDS_SET, {
    metafields: [
      {
        ownerId: customerId,
        namespace: 'oka',
        key: 'push_tokens',
        type: 'json',
        value: JSON.stringify([...new Set(tokens)].slice(-5)),
      },
    ],
  });
  const errs = res.metafieldsSet.userErrors;
  if (errs?.length) throw new Error(errs.map((e) => e.message).join('; '));
}

/* ── Orders scanned by the background jobs ─────────────────────────────── */

const RECENT_SHIPPED = `
  query OkaRecentShipped($q: String!, $after: String) {
    orders(first: 50, query: $q, after: $after, sortKey: CREATED_AT, reverse: true) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          name
          tags
          createdAt
          cancelledAt
          customer { id }
          currentSubtotalPriceSet { shopMoney { amount } }
          totalOutstandingSet { shopMoney { amount } }
          fulfillments(first: 5) { createdAt trackingInfo { number company } }
        }
      }
    }
  }
`;

/**
 * Fulfilled, uncancelled orders matching `extra` (Shopify search syntax),
 * newest first, up to `limit`. The loyalty and notification jobs work from
 * this list.
 */
export async function findShippedOrders(extra, limit = 200) {
  const q = `fulfillment_status:shipped -status:cancelled ${extra}`.trim();
  const out = [];
  let after = null;
  do {
    const data = await adminGraphql(RECENT_SHIPPED, { q, after });
    for (const { node: o } of data.orders.edges) {
      out.push({
        id: o.id,
        name: o.name,
        tags: o.tags ?? [],
        createdAt: o.createdAt,
        cancelledAt: o.cancelledAt,
        customerId: o.customer?.id ?? null,
        subtotal: Number(o.currentSubtotalPriceSet?.shopMoney?.amount ?? 0),
        outstanding: Number(o.totalOutstandingSet?.shopMoney?.amount ?? 0),
        trackingNumber: o.fulfillments?.flatMap((f) => f.trackingInfo ?? [])?.[0]?.number ?? null,
        trackingCompany: o.fulfillments?.flatMap((f) => f.trackingInfo ?? [])?.[0]?.company ?? null,
      });
    }
    after = data.orders.pageInfo.hasNextPage ? data.orders.pageInfo.endCursor : null;
  } while (after && out.length < limit);
  return out.slice(0, limit);
}
