/**
 * Shopify Admin API client.
 *
 * This module is the ONLY place the Admin access token is used, and it runs on
 * a server the app talks to over HTTPS. The token is never sent to a device.
 */

import { resolveProvince } from './provinces.js';

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

/** Customer search syntax for an email or a phone number. */
const customerQuery = (identifier) =>
  String(identifier).includes('@') ? `email:${identifier}` : `phone:${identifier}`;

/** Shopify's per-request complexity cap — a query over it is refused outright. */
export const isTooCostly = (err) => /exceeds the single query max cost/i.test(String(err?.message));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function adminGraphql(query, variables = {}, attempt = 0) {
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
    // THROTTLED means the shop's cost bucket is momentarily empty — it refills
    // within a second or two, so waiting beats failing the request.
    if (json.errors.some((e) => e.extensions?.code === 'THROTTLED') && attempt < 2) {
      await sleep(1000 * (attempt + 1));
      return adminGraphql(query, variables, attempt + 1);
    }
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

/**
 * Creates the order the app's native checkout collected.
 *
 * Cash on delivery is the dominant payment method in Egypt, so the order is
 * created unpaid with a COD note; card/wallet orders come through already
 * authorised by the payment step and are marked accordingly by the caller.
 */
export async function createOrder(payload) {
  const {
    items = [],
    customer = {},
    customerId = null,
    shipping = 0,
    shippingTitle,
    discountCode,
    paymentMethod = 'cod',
    lang = 'ar',
    // Additive hooks for callers other than checkout — the subscription
    // scheduler is the only one that currently sets either. Checkout never
    // does, so its orders keep pricing straight from the live variant.
    extraTags = [],
    noteExtra,
  } = payload;

  const lineItems = items.map((it) => {
    // A real variant id is always preferred; falling back to a title-only line
    // keeps a checkout from failing when the app is running on bundled data.
    if (it.variantId) {
      return {
        variantId: it.variantId,
        quantity: it.quantity,
        // Only set when a caller explicitly wants to override Shopify's live
        // variant price — a subscription cycle applying its discount, for
        // instance. Omitted here, Shopify prices the line at the variant's
        // current price, which is what every normal checkout order does.
        ...(it.priceOverride != null
          ? { priceSet: { shopMoney: { amount: String(it.priceOverride), currencyCode: 'EGP' } } }
          : {}),
      };
    }
    return {
      title: it.title || it.id,
      quantity: it.quantity,
      priceSet: {
        shopMoney: { amount: String(it.priceOverride ?? it.price), currencyCode: 'EGP' },
      },
    };
  });

  const [firstName, ...rest] = String(customer.name || '').trim().split(/\s+/);
  const phone = normalizePhone(customer.phone);
  const provinceCode = resolveProvince(customer.province, customer.city);
  const address = {
    firstName: firstName || 'OKA',
    lastName: rest.join(' ') || 'Customer',
    address1: customer.street || '',
    city: customer.city || '',
    countryCode: 'EG',
    // The governorate is what the courier routes on and what Shopify's own
    // shipping zones key on; it used to be left off every app order.
    ...(provinceCode ? { provinceCode } : {}),
    // Omitted entirely when it cannot be normalised — an invalid phone fails
    // the whole order, an absent one does not.
    ...(phone ? { phone } : {}),
  };

  const order = {
    lineItems,
    email: customer.email || undefined,
    ...(phone ? { phone } : {}),
    currency: 'EGP',
    shippingAddress: address,
    billingAddress: address,
    // Without this, Shopify falls back to matching the order to a customer by
    // email — which silently misses whenever the shipping form's email/phone
    // isn't exactly what's on the account, and the order then never shows up
    // under this customer's order history for the app to find again.
    ...(customerId ? { customer: { toAssociate: { id: customerId } } } : {}),
    tags: ['oka-app', `lang:${lang}`, `payment:${paymentMethod}`, ...extraTags],
    note: [
      paymentMethod === 'cod' ? 'Cash on delivery — collected by courier' : null,
      noteExtra,
    ]
      .filter(Boolean)
      .join(' — ') || undefined,
    // Every order the app creates is unpaid until the courier collects (COD) or
    // a real payment gateway is wired up (card/wallet) — never silently marked
    // paid just because Shopify defaults an order with no transactions to it.
    financialStatus: 'PENDING',
    shippingLines: shipping > 0
      ? [{
          title: shippingTitle || 'Delivery',
          priceSet: { shopMoney: { amount: String(shipping), currencyCode: 'EGP' } },
        }]
      : undefined,
    ...(discountCode
      ? { discountCode: { itemFixedDiscountCode: { code: discountCode } } }
      : {}),
  };

  const data = await adminGraphql(ORDER_CREATE, { order });
  const { order: created, userErrors } = data.orderCreate;
  if (userErrors?.length) {
    throw new Error(userErrors.map((e) => e.message).join('; '));
  }
  return created;
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

export async function findOrder(orderName) {
  // Shopify's search parser wants the value quoted when it contains
  // punctuation — an unquoted "#100121" was silently matching nothing.
  const data = await adminGraphql(ORDER_STATUS, { q: `name:"${orderName}"` });
  return data.orders.edges[0]?.node ?? null;
}

/* ── Loyalty ───────────────────────────────────────────────────────────────
 * Live Shopify store credit is the loyalty balance — 1 EGP of store credit is
 * worth 10 points, which is the app's own conversion rate. There is no
 * separate points ledger: earning happens however credit gets onto the
 * account (refunds, manual grants, a future automation), and redeeming a
 * reward debits the equivalent EGP straight off it, so the balance shown is
 * always what Shopify itself would honour at the register.
 */

const POINTS_PER_EGP = 10;

const CUSTOMER_STORE_CREDIT = `
  query OkaStoreCredit($q: String!) {
    customers(first: 1, query: $q) {
      edges {
        node {
          id
          storeCreditAccounts(first: 10) {
            edges { node { id balance { amount currencyCode } } }
          }
        }
      }
    }
  }
`;

/** The customer's live points balance, derived from their EGP store credit. */
export async function findCustomerLoyalty(identifier) {
  const data = await adminGraphql(CUSTOMER_STORE_CREDIT, { q: customerQuery(identifier) });
  const node = data.customers.edges[0]?.node;
  if (!node) return null;

  const accounts = node.storeCreditAccounts.edges.map((e) => e.node);
  const egpAccount = accounts.find((a) => a.balance?.currencyCode === 'EGP') ?? null;
  const creditAmount = Number(egpAccount?.balance?.amount ?? 0);

  return {
    customerId: node.id,
    balance: Math.round(creditAmount * POINTS_PER_EGP),
  };
}

const STORE_CREDIT_DEBIT = `
  mutation OkaStoreCreditDebit($id: ID!, $debitInput: StoreCreditAccountDebitInput!) {
    storeCreditAccountDebit(id: $id, debitInput: $debitInput) {
      storeCreditAccountTransaction {
        id
        balanceAfterTransaction { amount currencyCode }
      }
      userErrors { field message code }
    }
  }
`;

/**
 * Redeems `points` by debiting the equivalent EGP off the customer's store
 * credit. `customerId` is accepted directly — Shopify resolves it to the
 * right store credit account without a separate lookup.
 */
export async function debitLoyaltyPoints(customerId, points) {
  const amount = (points / POINTS_PER_EGP).toFixed(2);
  const data = await adminGraphql(STORE_CREDIT_DEBIT, {
    id: customerId,
    debitInput: { debitAmount: { amount, currencyCode: 'EGP' } },
  });
  const { storeCreditAccountTransaction, userErrors } = data.storeCreditAccountDebit;
  if (userErrors?.length) throw new Error(userErrors.map((e) => e.message).join('; '));
  const remaining = Number(storeCreditAccountTransaction?.balanceAfterTransaction?.amount ?? 0);
  return { balance: Math.round(remaining * POINTS_PER_EGP) };
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
                tags
                currentSubtotalPriceSet { shopMoney { amount } }
                currentShippingPriceSet { shopMoney { amount } }
                currentTotalDiscountsSet { shopMoney { amount } }
                currentTotalPriceSet { shopMoney { amount currencyCode } }
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
                      currentQuantity
                      variant { id }
                      originalUnitPriceSet { shopMoney { amount } }
                      discountedUnitPriceAfterAllDiscountsSet { shopMoney { amount } }
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

const money = (set) => Number(set?.shopMoney?.amount ?? 0);

/**
 * 'cod' | 'card' | 'wallet' | 'paid'. App orders carry a payment: tag; web
 * orders don't, and on this store an unpaid one is cash on delivery.
 */
function paymentMethodOf(o) {
  const tag = (o.tags ?? []).find((t) => t.startsWith('payment:'));
  if (tag) return tag.slice('payment:'.length);
  return o.displayFinancialStatus === 'PAID' ? 'paid' : 'cod';
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
      // `current*` rather than the as-placed figures: they follow edits and
      // removed lines, so the invoice matches what the courier will collect.
      total: money(o.currentTotalPriceSet ?? o.totalPriceSet),
      currency: o.totalPriceSet?.shopMoney?.currencyCode ?? 'EGP',
      breakdown: {
        subtotal: money(o.currentSubtotalPriceSet),
        shipping: money(o.currentShippingPriceSet),
        discount: money(o.currentTotalDiscountsSet),
        total: money(o.currentTotalPriceSet ?? o.totalPriceSet),
      },
      paymentMethod: paymentMethodOf(o),
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
      items: o.lineItems.edges
        .map(({ node: li }) => ({
          id: li.id,
          title: li.title,
          quantity: li.currentQuantity ?? li.quantity,
          variantId: li.variant?.id ?? null,
          // What the customer actually pays per unit. The per-line discounted
          // price misses order-level codes; this one nets out every discount.
          price: money(li.discountedUnitPriceAfterAllDiscountsSet ?? li.originalUnitPriceSet),
          originalPrice: money(li.originalUnitPriceSet),
          image: li.image?.url ?? null,
        }))
        // A line edited down to zero is no longer part of the order.
        .filter((li) => li.quantity > 0),
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
        lineItems(first: 50) { edges { node { id quantity } } }
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
 * `lines` is the desired end state: [{ variantId, quantity }]. Existing lines
 * are matched by the calculated order's own line ids; anything the order does
 * not already have is added as a new variant.
 */
export async function editOrder(orderId, lines) {
  const begun = bail(await adminGraphql(EDIT_BEGIN, { id: orderId }), 'orderEditBegin');
  const calcId = begun.calculatedOrder.id;
  const existing = begun.calculatedOrder.lineItems.edges.map((e) => e.node);

  // Quantity changes first, then additions — Shopify recalculates as it goes.
  for (let i = 0; i < existing.length; i += 1) {
    const want = lines[i];
    const quantity = want ? want.quantity : 0;
    if (quantity !== existing[i].quantity) {
      bail(
        await adminGraphql(EDIT_QTY, { id: calcId, lineItemId: existing[i].id, quantity }),
        'orderEditSetQuantity',
      );
    }
  }

  for (const line of lines.slice(existing.length)) {
    if (!line.variantId || line.quantity <= 0) continue;
    bail(
      await adminGraphql(EDIT_ADD, {
        id: calcId,
        variantId: line.variantId,
        quantity: line.quantity,
      }),
      'orderEditAddVariant',
    );
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
              node { id firstName lastName address1 address2 city province zip phone }
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
export async function updateOrderAddress(orderName, addr) {
  const order = await findOrder(orderName);
  if (!order) throw new Error(`order ${orderName} not found`);
  if (isShipped(order)) {
    throw new Error('this order has already been fulfilled, so its address can no longer be changed');
  }

  const phone = normalizePhone(addr.phone);
  const data = await adminGraphql(ORDER_UPDATE_ADDRESS, {
    input: {
      id: order.id,
      shippingAddress: {
        firstName: addr.firstName || 'OKA',
        lastName: addr.lastName || 'Customer',
        address1: addr.address1 || '',
        address2: addr.address2 || '',
        city: addr.city || '',
        ...(addr.zip ? { zip: addr.zip } : {}),
        countryCode: 'EG',
        ...(resolveProvince(addr.province, addr.city)
          ? { provinceCode: resolveProvince(addr.province, addr.city) }
          : {}),
        ...(phone ? { phone } : {}),
      },
    },
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
  variants(first: 1) {
    edges { node { id availableForSale inventoryQuantity price } }
  }
  model3d: media(first: 1, query: "media_type:MODEL_3D") {
    edges { node { __typename ... on Model3d { sources { url format } } } }
  }
`;

function toCatalogueProduct(node, catId) {
  const variant = node.variants?.edges?.[0]?.node;
  const model = node.model3d?.edges?.map((e) => e.node)?.find((m) => m.__typename === 'Model3d');
  const sourceUrl = (fmt) => model?.sources?.find((s) => s.format === fmt)?.url ?? null;

  return {
    id: node.handle,
    shopifyId: node.id,
    variantId: variant?.id ?? null,
    cat: catId,
    price: Math.round(Number(variant?.price ?? 0)),
    stock: variant?.inventoryQuantity ?? (variant?.availableForSale ? 99 : 0),
    titleEn: node.title,
    titleAr: node.titleAr?.value || node.title,
    descEn: node.description ?? '',
    descAr: node.descriptionAr?.value || node.description || '',
    img: node.featuredMedia?.preview?.image?.url ?? null,
    usdzUrl: sourceUrl('usdz'),
    glbUrl: sourceUrl('glb'),
    available: variant?.availableForSale ?? true,
  };
}

/** One aliased request for a set of collections → { localId: collection|null }. */
async function fetchCollections(localIds) {
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

  try {
    const data = await adminGraphql(query);
    return Object.fromEntries(localIds.map((id, i) => [id, data[`c${i}`] ?? null]));
  } catch (err) {
    // Shopify caps each request's cost, and the cost grows with every
    // collection asked for. Rather than hardcode a batch size that breaks the
    // next time a collection or field is added, an over-budget request is
    // split in half and each half tried again — one after the other, so the
    // halves don't drain the shop's rate-limit bucket together.
    if (!isTooCostly(err) || localIds.length < 2) throw err;
    const mid = Math.ceil(localIds.length / 2);
    const first = await fetchCollections(localIds.slice(0, mid));
    const second = await fetchCollections(localIds.slice(mid));
    return { ...first, ...second };
  }
}

/**
 * Loads every collection the app navigates by, each with its products.
 * Collections with no Shopify counterpart are skipped rather than guessed at —
 * see COLLECTION_HANDLE_OVERRIDES for the one known rename.
 */
export async function fetchAdminCatalogue(localIds) {
  const byId = await fetchCollections(localIds);
  const cats = [];
  const products = [];

  for (const localId of localIds) {
    const c = byId[localId];
    if (!c) continue; // no matching Shopify collection for this local id
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
  }

  return { cats, products };
}

/* ── Checkout totals, addresses, wishlist ───────────────────────────────── */

const DRAFT_CALCULATE = `
  mutation OkaCalculate($input: DraftOrderInput!) {
    draftOrderCalculate(input: $input) {
      calculatedDraftOrder {
        subtotalPriceSet { shopMoney { amount } }
        totalDiscountsSet { shopMoney { amount } }
        totalTaxSet { shopMoney { amount } }
        totalPriceSet { shopMoney { amount } }
        appliedDiscount { title value valueType }
        availableShippingRates { handle title price { amount } }
      }
      userErrors { field message }
    }
  }
`;

/**
 * Asks Shopify what this basket actually costs, shipping included.
 *
 * Shipping is Shopify's own answer, not the app's: the draft is priced with
 * the delivery address and no shipping line, and Shopify replies with the
 * rates its checkout would offer there — the same zones, prices and order-
 * value tiers set under Settings → Shipping. Change a rate in Shopify and the
 * app follows on the next quote; there is no table here to keep in step.
 *
 * `customer.province` / `customer.city` can be any spelling of a governorate
 * or district; see provinces.js. If none resolves, Shopify can't place the
 * address in a zone and `shipping` comes back null — the caller decides what
 * to show rather than this guessing a price.
 */
export async function calculateTotals({ items = [], customer = {}, discountCode }) {
  const lineItems = items
    .map((it) =>
      it.variantId
        ? { variantId: it.variantId, quantity: it.quantity }
        : {
            title: it.title || it.id,
            quantity: it.quantity,
            originalUnitPrice: String(it.price ?? 0),
          },
    )
    .filter((l) => l.quantity > 0);

  if (!lineItems.length) throw new Error('no line items to calculate');

  const provinceCode = resolveProvince(customer.province, customer.city);
  const phone = normalizePhone(customer.phone);
  const input = {
    lineItems,
    ...(customer.email ? { email: customer.email } : {}),
    shippingAddress: {
      address1: customer.street || '',
      city: customer.city || '',
      countryCode: 'EG',
      ...(provinceCode ? { provinceCode } : {}),
      ...(phone ? { phone } : {}),
    },
    ...(discountCode ? { appliedDiscount: { code: discountCode } } : {}),
  };

  const data = await adminGraphql(DRAFT_CALCULATE, { input });
  const { calculatedDraftOrder: c, userErrors } = data.draftOrderCalculate;
  if (userErrors?.length) throw new Error(userErrors.map((e) => e.message).join('; '));

  // Several rates can apply at once; a shopper would pick the cheapest, and
  // on this store only one ever matches a given zone and order value anyway.
  const rate = [...(c.availableShippingRates ?? [])].sort(
    (a, b) => Number(a.price.amount) - Number(b.price.amount),
  )[0] ?? null;

  const amount = (node) => Number(node?.shopMoney?.amount ?? 0);
  const shipping = rate ? Number(rate.price.amount) : null;
  return {
    subtotal: Math.round(amount(c.subtotalPriceSet)),
    discount: Math.round(amount(c.totalDiscountsSet)),
    tax: Math.round(amount(c.totalTaxSet)),
    shipping,
    shippingTitle: rate?.title ?? null,
    provinceCode,
    // No shipping line was on the draft, so its total is goods only.
    total: Math.round(amount(c.totalPriceSet) + (shipping ?? 0)),
    discountTitle: c.appliedDiscount?.title ?? null,
    discountApplied: Boolean(c.appliedDiscount),
  };
}

/* ── Shipping scheme ──────────────────────────────────────────────────────
 * The zones and rates themselves, for the places the app shows shipping
 * before there is a basket to quote — the cart's "add X for cheaper
 * shipping" bar, the product page. Read from the default delivery profile,
 * cached briefly: a change in Shopify shows up within a few minutes.
 */

const DELIVERY_PROFILES = `
  query OkaShippingScheme {
    deliveryProfiles(first: 5) {
      edges {
        node {
          default
          profileLocationGroups {
            locationGroupZones(first: 30) {
              edges {
                node {
                  zone { name countries { code { countryCode } provinces { code } } }
                  methodDefinitions(first: 20) {
                    edges {
                      node {
                        name
                        active
                        rateProvider { ... on DeliveryRateDefinition { price { amount } } }
                        methodConditions {
                          field
                          operator
                          conditionCriteria { __typename ... on MoneyV2 { amount } }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

const SCHEME_TTL_MS = Number(process.env.SHIPPING_SCHEME_TTL_MS ?? 5 * 60 * 1000);
let schemeCache = null; // { at, value }

/** Order-value bounds from a method's TOTAL_PRICE conditions. */
function boundsOf(conditions = []) {
  let min = null;
  let max = null;
  for (const c of conditions) {
    if (c.field !== 'TOTAL_PRICE' || c.conditionCriteria?.__typename !== 'MoneyV2') continue;
    const v = Number(c.conditionCriteria.amount);
    if (c.operator === 'GREATER_THAN_OR_EQUAL_TO') min = Math.max(min ?? v, v);
    if (c.operator === 'LESS_THAN_OR_EQUAL_TO') max = Math.min(max ?? v, v);
  }
  return { min, max };
}

/**
 * { zones: [{ name, provinces: [code], rates: [{ title, price, min, max }] }] }
 *
 * Only the default profile: it is the one every product ships under unless
 * moved to another, and the store's other profiles have no zones.
 */
export async function getShippingScheme() {
  if (schemeCache && Date.now() - schemeCache.at < SCHEME_TTL_MS) return schemeCache.value;
  try {
    const data = await adminGraphql(DELIVERY_PROFILES);
    const profile =
      data.deliveryProfiles.edges.map((e) => e.node).find((p) => p.default) ?? null;
    const zones = (profile?.profileLocationGroups ?? []).flatMap((g) =>
      g.locationGroupZones.edges.map(({ node }) => ({
        name: node.zone.name,
        provinces: node.zone.countries
          .filter((c) => c.code?.countryCode === 'EG')
          .flatMap((c) => c.provinces.map((p) => p.code)),
        rates: node.methodDefinitions.edges
          .map((e) => e.node)
          .filter((m) => m.active && m.rateProvider?.price)
          .map((m) => ({
            title: m.name,
            price: Number(m.rateProvider.price.amount),
            ...boundsOf(m.methodConditions),
          })),
      })),
    );
    const value = { zones, fetchedAt: new Date().toISOString() };
    schemeCache = { at: Date.now(), value };
    return value;
  } catch (err) {
    // A stale scheme beats none: shipping estimates keep working through a
    // Shopify hiccup, and the next request tries again.
    if (schemeCache) return schemeCache.value;
    throw err;
  }
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
 * Saves a new address onto the customer's Shopify record, and makes it the
 * default — the app has no separate "make default" step, so every address a
 * shopper adds here is the one they mean to use next.
 */
export async function createCustomerAddress(identifier, addr) {
  const customer = await findCustomerProfile(identifier);
  if (!customer) throw new Error('customer not found');

  const [firstName, ...rest] = String(addr.name || customer.name || '').trim().split(/\s+/);
  const phone = normalizePhone(addr.phone);
  const data = await adminGraphql(ADDRESS_CREATE, {
    customerId: customer.id,
    setAsDefault: true,
    address: {
      firstName: firstName || 'OKA',
      lastName: rest.join(' ') || 'Customer',
      address1: addr.street || '',
      address2: addr.building || '',
      city: addr.city || '',
      countryCode: 'EG',
      ...(resolveProvince(addr.province, addr.city)
        ? { provinceCode: resolveProvince(addr.province, addr.city) }
        : {}),
      ...(phone ? { phone } : {}),
    },
  });
  const { address: created, userErrors } = data.customerAddressCreate;
  if (userErrors?.length) throw new Error(userErrors.map((e) => e.message).join('; '));
  return { id: created?.id ?? null };
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
export async function setDefaultAddress(identifier, addressId) {
  const customer = await findCustomerProfile(identifier);
  if (!customer) throw new Error('customer not found');

  const data = await adminGraphql(ADDRESS_SET_DEFAULT, { customerId: customer.id, addressId });
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
