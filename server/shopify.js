/**
 * Shopify Admin API client.
 *
 * This module is the ONLY place the Admin access token is used, and it runs on
 * a server the app talks to over HTTPS. The token is never sent to a device.
 */

const API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-07';

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
  const address = {
    firstName: firstName || 'OKA',
    lastName: rest.join(' ') || 'Customer',
    address1: customer.street || '',
    city: customer.city || '',
    countryCode: 'EG',
    phone: customer.phone || '',
  };

  const order = {
    lineItems,
    email: customer.email || undefined,
    phone: customer.phone || undefined,
    currency: 'EGP',
    shippingAddress: address,
    billingAddress: address,
    tags: ['oka-app', `lang:${lang}`, `payment:${paymentMethod}`],
    note: paymentMethod === 'cod' ? 'Cash on delivery — collected by courier' : undefined,
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

/* ── Loyalty ───────────────────────────────────────────────────────────── */

const CUSTOMER_LOYALTY = `
  query OkaLoyalty($q: String!) {
    customers(first: 1, query: $q) {
      edges {
        node {
          id
          amountSpent { amount }
          metafield(namespace: "oka", key: "loyalty_redeemed") { value }
        }
      }
    }
  }
`;

export async function findCustomerLoyalty(phone) {
  const data = await adminGraphql(CUSTOMER_LOYALTY, { q: `phone:${phone}` });
  const node = data.customers.edges[0]?.node;
  if (!node) return null;
  return {
    id: node.id,
    earned: Math.round(Number(node.amountSpent?.amount ?? 0)),
    redeemed: Number(node.metafield?.value ?? 0),
  };
}

const SET_REDEEMED = `
  mutation OkaSetRedeemed($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id }
      userErrors { field message }
    }
  }
`;

export async function setRedeemed(customerId, total) {
  const data = await adminGraphql(SET_REDEEMED, {
    metafields: [
      {
        ownerId: customerId,
        namespace: 'oka',
        key: 'loyalty_redeemed',
        type: 'number_integer',
        value: String(total),
      },
    ],
  });
  const errs = data.metafieldsSet.userErrors;
  if (errs?.length) throw new Error(errs.map((e) => e.message).join('; '));
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
                shippingAddress { address1 city phone }
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
                fulfillments(first: 5) { trackingInfo { number url company } }
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
      trackingNumber: o.fulfillments?.flatMap((f) => f.trackingInfo ?? [])?.[0]?.number ?? null,
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
