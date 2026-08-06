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
  const data = await adminGraphql(ORDER_STATUS, { q: `name:${orderName}` });
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
