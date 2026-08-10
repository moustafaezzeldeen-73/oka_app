/**
 * Shopify Admin API client.
 *
 * This module is the ONLY place the Admin access token is used, and it runs on
 * a server the app talks to over HTTPS. The token is never sent to a device.
 */

const API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-07';

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

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

export async function adminGraphql(query, variables = {}) {
  const shop = requireEnv('SHOPIFY_SHOP_DOMAIN');
  const token = requireEnv('SHOPIFY_ADMIN_TOKEN');

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
    shipping = 0,
    discountCode,
    paymentMethod = 'cod',
    lang = 'ar',
  } = payload;

  const lineItems = items.map((it) => {
    // A real variant id is always preferred; falling back to a title-only line
    // keeps a checkout from failing when the app is running on bundled data.
    if (it.variantId) return { variantId: it.variantId, quantity: it.quantity };
    return {
      title: it.title || it.id,
      quantity: it.quantity,
      priceSet: { shopMoney: { amount: String(it.price), currencyCode: 'EGP' } },
    };
  });

  const [firstName, ...rest] = String(customer.name || '').trim().split(/\s+/);
  const phone = normalizePhone(customer.phone);
  const address = {
    firstName: firstName || 'OKA',
    lastName: rest.join(' ') || 'Customer',
    address1: customer.street || '',
    city: customer.city || '',
    countryCode: 'EG',
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
    tags: ['oka-app', `lang:${lang}`, `payment:${paymentMethod}`],
    note: paymentMethod === 'cod' ? 'Cash on delivery — collected by courier' : undefined,
    // Every order the app creates is unpaid until the courier collects (COD) or
    // a real payment gateway is wired up (card/wallet) — never silently marked
    // paid just because Shopify defaults an order with no transactions to it.
    financialStatus: 'PENDING',
    shippingLines: shipping > 0
      ? [{
          title: 'Delivery',
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
          fulfillments(first: 5) {
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
  const isEmail = String(identifier).includes('@');
  const data = await adminGraphql(CUSTOMER_STORE_CREDIT, {
    q: isEmail ? `email:${identifier}` : `phone:${identifier}`,
  });
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
          email
          firstName
          lastName
          phone
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

/** Finds a customer by email or phone and returns their recent orders. */
export async function findCustomerOrders(identifier) {
  const isEmail = String(identifier).includes('@');
  const q = isEmail ? `email:${identifier}` : `phone:${identifier}`;
  const data = await adminGraphql(CUSTOMER_ORDERS, { q });
  const node = data.customers.edges[0]?.node;
  if (!node) return null;

  return {
    id: node.id,
    email: node.email,
    name: [node.firstName, node.lastName].filter(Boolean).join(' '),
    phone: node.phone ?? node.defaultAddress?.phone ?? null,
    address: node.defaultAddress ?? null,
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
          addresses(first: 10) {
            id
            firstName
            lastName
            address1
            address2
            city
            province
            zip
            phone
          }
        }
      }
    }
  }
`;

/** A customer's saved addresses, default first. */
export async function findCustomerAddresses(identifier) {
  const isEmail = String(identifier).includes('@');
  const q = isEmail ? `email:${identifier}` : `phone:${identifier}`;
  const data = await adminGraphql(CUSTOMER_ADDRESSES, { q });
  const node = data.customers.edges[0]?.node;
  if (!node) return [];

  const defaultId = node.defaultAddress?.id ?? null;
  return (node.addresses ?? [])
    .map((a) => ({
      id: a.id,
      name: [a.firstName, a.lastName].filter(Boolean).join(' '),
      street: [a.address1, a.address2].filter(Boolean).join(', '),
      city: a.province ? `${a.city}, ${a.province}` : a.city,
      phone: a.phone,
      isDefault: a.id === defaultId,
    }))
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
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
  featuredImage { url }
  titleAr: metafield(namespace: "oka", key: "title_ar") { value }
  descriptionAr: metafield(namespace: "oka", key: "description_ar") { value }
  variants(first: 1) {
    edges { node { id availableForSale inventoryQuantity price } }
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
    stock: variant?.inventoryQuantity ?? (variant?.availableForSale ? 99 : 0),
    titleEn: node.title,
    titleAr: node.titleAr?.value || node.title,
    descEn: node.description ?? '',
    descAr: node.descriptionAr?.value || node.description || '',
    img: node.featuredImage?.url ?? null,
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
        c${i}: collectionByHandle(handle: ${JSON.stringify(handleFor(id))}) {
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
        subtotalPriceSet { shopMoney { amount } }
        totalShippingPriceSet { shopMoney { amount } }
        totalDiscountsSet { shopMoney { amount } }
        totalTaxSet { shopMoney { amount } }
        totalPriceSet { shopMoney { amount } }
        appliedDiscount { title value valueType }
      }
      userErrors { field message }
    }
  }
`;

/**
 * Asks Shopify what this basket actually costs.
 *
 * Shipping tiers and discount codes were being computed in the app from
 * hardcoded tables, so the total a shopper agreed to could differ from what
 * the store charged. Shopify is the authority on both; this returns its
 * numbers, and the caller falls back to the local estimate only if the call
 * fails outright.
 */
export async function calculateTotals({ items = [], customer = {}, shipping, discountCode }) {
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

  const phone = normalizePhone(customer.phone);
  const input = {
    lineItems,
    ...(customer.email ? { email: customer.email } : {}),
    shippingAddress: {
      address1: customer.street || '',
      city: customer.city || '',
      countryCode: 'EG',
      ...(phone ? { phone } : {}),
    },
    ...(shipping != null
      ? { shippingLine: { title: 'Delivery', priceWithCurrency: { amount: String(shipping), currencyCode: 'EGP' } } }
      : {}),
    ...(discountCode ? { appliedDiscount: { code: discountCode } } : {}),
  };

  const data = await adminGraphql(DRAFT_CALCULATE, { input });
  const { calculatedDraftOrder: c, userErrors } = data.draftOrderCalculate;
  if (userErrors?.length) throw new Error(userErrors.map((e) => e.message).join('; '));

  const money = (node) => Math.round(Number(node?.shopMoney?.amount ?? 0));
  return {
    subtotal: money(c.subtotalPriceSet),
    shipping: money(c.totalShippingPriceSet),
    discount: money(c.totalDiscountsSet),
    tax: money(c.totalTaxSet),
    total: money(c.totalPriceSet),
    discountTitle: c.appliedDiscount?.title ?? null,
    discountApplied: Boolean(c.appliedDiscount),
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
 * Saves a new address onto the customer's Shopify record, and makes it the
 * default — the app has no separate "make default" step, so every address a
 * shopper adds here is the one they mean to use next.
 */
export async function createCustomerAddress(identifier, addr) {
  const customer = await findCustomerOrders(identifier);
  if (!customer) throw new Error('customer not found');

  const [firstName, ...rest] = String(addr.name || customer.name || '').trim().split(/\s+/);
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
      ...(normalizePhone(addr.phone) ? { phone: normalizePhone(addr.phone) } : {}),
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
  const customer = await findCustomerOrders(identifier);
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
  const isEmail = String(identifier).includes('@');
  const data = await adminGraphql(CUSTOMER_METAFIELD, {
    q: isEmail ? `email:${identifier}` : `phone:${identifier}`,
  });
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
  const isEmail = String(identifier).includes('@');
  const data = await adminGraphql(CUSTOMER_METAFIELD, {
    q: isEmail ? `email:${identifier}` : `phone:${identifier}`,
  });
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
