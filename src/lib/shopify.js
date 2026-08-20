/**
 * Shopify Admin GraphQL client for the OKA warehouse app.
 *
 * All operations here were modelled on the queries confirmed live against the
 * OKA store (June 2026). Two store-specific findings are baked in:
 *
 *  1. `variant.image.url` is null on every line item in this store — the real
 *     product photo lives on `variant.product.featuredImage.url`. A null
 *     variant image is never "no photo", always "check the product level".
 *  2. `orderCancel` is blocked on this store's connector. Duplicate handling
 *     empties the smaller order instead of cancelling it.
 */

import { config } from "../config.js";
import { requestJson, UpstreamError } from "./httpClient.js";

const ORDER_FIELDS = `
  id
  name
  createdAt
  note
  displayFulfillmentStatus
  email
  phone
  customer { id tags firstName lastName email phone }
  shippingAddress { address1 address2 city province provinceCode zip phone company countryCodeV2 }
  currentSubtotalPriceSet { shopMoney { amount currencyCode } }
  currentTotalPriceSet { shopMoney { amount currencyCode } }
  shippingLine { title originalPriceSet { shopMoney { amount } } }
  lineItems(first: 50) {
    edges {
      node {
        id
        title
        quantity
        sku
        originalUnitPriceSet { shopMoney { amount } }
        variant {
          id
          title
          image { url }
          product { id title featuredImage { url } }
        }
      }
    }
  }
`;

function endpoint() {
  const { shop, apiVersion } = config.shopify;
  return `https://${shop}.myshopify.com/admin/api/${apiVersion}/graphql.json`;
}

export function isConfigured() {
  return Boolean(config.shopify.shop && config.shopify.accessToken);
}

export async function graphql(query, variables = {}) {
  if (!isConfigured()) {
    throw new UpstreamError("Shopify is not configured — set SHOPIFY_SHOP and SHOPIFY_ACCESS_TOKEN", {
      service: "shopify",
      status: 503,
    });
  }

  const payload = await requestJson(endpoint(), {
    service: "shopify",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": config.shopify.accessToken,
    },
    body: { query, variables },
  });

  // Shopify returns HTTP 200 with a `errors` array for GraphQL-level failures,
  // so a bad query looks like success to the HTTP layer. Surface it here.
  if (payload?.errors?.length) {
    throw new UpstreamError(`Shopify GraphQL error: ${payload.errors.map((e) => e.message).join("; ")}`, {
      service: "shopify",
      status: 200,
      body: payload.errors,
    });
  }

  return payload.data;
}

/** Throws if a mutation came back with userErrors, which are not HTTP errors. */
function assertNoUserErrors(result, label) {
  const errors = result?.userErrors || [];
  if (errors.length) {
    throw new UpstreamError(
      `${label} failed: ${errors.map((e) => `${(e.field || []).join(".")} ${e.message}`.trim()).join("; ")}`,
      { service: "shopify", body: errors },
    );
  }
  return result;
}

const money = (set) => (set?.shopMoney?.amount === undefined ? null : Number(set.shopMoney.amount));

function normalizeOrder(node) {
  const lineItems = (node.lineItems?.edges || []).map(({ node: item }) => ({
    id: item.id,
    title: item.title,
    quantity: item.quantity,
    sku: item.sku || null,
    unitPrice: money(item.originalUnitPriceSet),
    variantId: item.variant?.id || null,
    variantTitle: item.variant?.title || null,
    productId: item.variant?.product?.id || null,
    // Finding (1) in the module note: fall through to the product's image.
    imageUrl: item.variant?.image?.url || item.variant?.product?.featuredImage?.url || null,
  }));

  const shippingFee = money(node.shippingLine?.originalPriceSet);
  const total = money(node.currentTotalPriceSet);
  const subtotal = money(node.currentSubtotalPriceSet);

  return {
    id: node.id,
    name: node.name,
    createdAt: node.createdAt,
    note: node.note || "",
    fulfillmentStatus: node.displayFulfillmentStatus,
    email: node.email || node.customer?.email || null,
    phone: node.phone || node.customer?.phone || null,
    customer: node.customer
      ? {
          id: node.customer.id,
          firstName: node.customer.firstName || "",
          lastName: node.customer.lastName || "",
          tags: node.customer.tags || [],
          email: node.customer.email || null,
          phone: node.customer.phone || null,
        }
      : null,
    shippingAddress: node.shippingAddress || null,
    currency: node.currentTotalPriceSet?.shopMoney?.currencyCode || "EGP",
    subtotal,
    total,
    shippingFee,
    // The fee-tier decision needs the net amount. `currentSubtotalPriceSet`
    // already excludes shipping; the subtraction is the documented fallback
    // for a store where that field isn't present.
    netAmount: subtotal ?? (total !== null && shippingFee !== null ? total - shippingFee : total),
    lineItems,
  };
}

/**
 * Every unfulfilled order, newest first, trimmed to a Cairo-time day window.
 *
 * Shopify has no server-side "last N days" filter for this, so the pull
 * paginates the whole unfulfilled set and trims client-side, exactly as the
 * OKA skills do.
 */
export async function fetchUnfulfilledOrders({ windowDays = 2, pageSize = 50, maxPages = 20 } = {}) {
  const query = `
    query RecentUnfulfilled($first: Int!, $after: String) {
      orders(first: $first, after: $after, query: "fulfillment_status:unfulfilled", sortKey: CREATED_AT, reverse: true) {
        edges { node { ${ORDER_FIELDS} } }
        pageInfo { hasNextPage endCursor }
      }
    }
  `;

  const cutoff = windowStartUtc(windowDays);
  const orders = [];
  let after = null;

  for (let page = 0; page < maxPages; page++) {
    const data = await graphql(query, { first: pageSize, after });
    const edges = data.orders?.edges || [];

    for (const edge of edges) {
      const order = normalizeOrder(edge.node);
      // Sorted newest-first, so the first order older than the cutoff means
      // everything after it is older too.
      if (cutoff && new Date(order.createdAt) < cutoff) return orders;
      orders.push(order);
    }

    if (!data.orders?.pageInfo?.hasNextPage) break;
    after = data.orders.pageInfo.endCursor;
  }

  return orders;
}

/**
 * Start of the window in UTC. `windowDays: 2` means "today and yesterday,
 * Cairo time" — i.e. midnight at the start of yesterday.
 */
export function windowStartUtc(windowDays) {
  if (!windowDays || windowDays <= 0) return null;
  const offsetMs = config.orderWindowTzOffsetHours * 3600 * 1000;
  const cairoNow = new Date(Date.now() + offsetMs);
  const cairoMidnight = Date.UTC(
    cairoNow.getUTCFullYear(),
    cairoNow.getUTCMonth(),
    cairoNow.getUTCDate() - (windowDays - 1),
  );
  return new Date(cairoMidnight - offsetMs);
}

export async function fetchOrder(orderId) {
  const data = await graphql(
    `query GetOrder($id: ID!) { order(id: $id) { ${ORDER_FIELDS} } }`,
    { id: orderId },
  );
  return data.order ? normalizeOrder(data.order) : null;
}

/**
 * `shippingAddress` is a full-object overwrite (MailingAddressInput) — every
 * field you want kept has to be re-sent, or Shopify wipes it. Callers pass a
 * complete address, not a patch.
 */
export async function updateShippingAddress(orderId, address) {
  const data = await graphql(
    `mutation FixAddress($input: OrderInput!) {
       orderUpdate(input: $input) {
         order { id shippingAddress { address1 address2 city province provinceCode zip phone company } }
         userErrors { field message }
       }
     }`,
    { input: { id: orderId, shippingAddress: address } },
  );
  return assertNoUserErrors(data.orderUpdate, "orderUpdate(shippingAddress)").order;
}

/**
 * `note` is a full overwrite, so the audit trail is appended to whatever is
 * already there rather than clobbering it.
 */
export async function appendOrderNote(orderId, line, existingNote = "") {
  const note = existingNote ? `${existingNote}\n${line}` : line;
  const data = await graphql(
    `mutation SetNote($input: OrderInput!) {
       orderUpdate(input: $input) { order { id note } userErrors { field message } }
     }`,
    { input: { id: orderId, note } },
  );
  return assertNoUserErrors(data.orderUpdate, "orderUpdate(note)").order;
}

/**
 * Tag helpers. `id` is always the CUSTOMER gid in the OKA workflows — the
 * order's own tags are deliberately left alone.
 */
export async function addTags(customerId, tags) {
  const data = await graphql(
    `mutation AddTag($id: ID!, $tags: [String!]!) {
       tagsAdd(id: $id, tags: $tags) { node { id } userErrors { field message } }
     }`,
    { id: customerId, tags },
  );
  return assertNoUserErrors(data.tagsAdd, "tagsAdd");
}

export async function removeTags(customerId, tags) {
  const data = await graphql(
    `mutation RemoveTag($id: ID!, $tags: [String!]!) {
       tagsRemove(id: $id, tags: $tags) { node { id } userErrors { field message } }
     }`,
    { id: customerId, tags },
  );
  return assertNoUserErrors(data.tagsRemove, "tagsRemove");
}

/** Replaces any existing `bosta_ranking:*` tag with the current one. */
export async function setBostaRankingTag(customerId, ranking, existingTags = []) {
  const stale = existingTags.filter((tag) => tag.startsWith("bosta_ranking:"));
  if (stale.length) await removeTags(customerId, stale);
  // A null ranking is "no history yet", kept visually distinct from a real 0%.
  const value = ranking === null || ranking === undefined ? "none" : `${ranking}%`;
  await addTags(customerId, [`bosta_ranking:${value}`]);
  return `bosta_ranking:${value}`;
}

/** Live shipping zones — the source of truth the offline fee table mirrors. */
export async function fetchShippingZones() {
  const data = await graphql(`
    query ShippingZones {
      deliveryProfiles(first: 5) {
        edges { node { name profileLocationGroups { locationGroupZones(first: 20) {
          edges { node {
            zone { name countries { provinces { name code } } }
            methodDefinitions(first: 10) { edges { node {
              name
              rateProvider { ... on DeliveryRateDefinition { price { amount } } }
              methodConditions { field operator conditionCriteria { ... on MoneyV2 { amount } } }
            } } }
          } }
        } } } }
      }
    }
  `);
  return data.deliveryProfiles;
}

/**
 * Marks an order fulfilled with the Bosta tracking number attached, so the
 * customer's Shopify notification carries a real trackable AWB.
 */
export async function fulfillOrder(orderId, { trackingNumber, trackingUrl, notifyCustomer = true }) {
  const data = await graphql(
    `query Fulfillable($id: ID!) {
       order(id: $id) { fulfillmentOrders(first: 10) { edges { node { id status } } } }
     }`,
    { id: orderId },
  );

  const open = (data.order?.fulfillmentOrders?.edges || [])
    .map((edge) => edge.node)
    .filter((node) => node.status === "OPEN" || node.status === "IN_PROGRESS");

  if (!open.length) {
    throw new UpstreamError(`No open fulfillment order on ${orderId} — nothing to fulfill`, {
      service: "shopify",
    });
  }

  const result = await graphql(
    `mutation Fulfill($fulfillment: FulfillmentV2Input!) {
       fulfillmentCreateV2(fulfillment: $fulfillment) {
         fulfillment { id status trackingInfo { number url company } }
         userErrors { field message }
       }
     }`,
    {
      fulfillment: {
        lineItemsByFulfillmentOrder: open.map((node) => ({ fulfillmentOrderId: node.id })),
        trackingInfo: { number: trackingNumber, url: trackingUrl, company: "Bosta" },
        notifyCustomer,
      },
    },
  );

  return assertNoUserErrors(result.fulfillmentCreateV2, "fulfillmentCreateV2").fulfillment;
}

/**
 * Order metafields.
 *
 * Used for call transcripts: the Admin API has no mutation that writes an
 * order **timeline comment** — the `comment*` mutations in the schema are for
 * blog article comments, and nothing else creates a timeline entry. Confirmed
 * against the live schema (454 mutations, none applicable). So the durable
 * record lives in a metafield, and a one-line summary is appended to the
 * order note, which the admin shows on the order page itself.
 */
export async function setOrderMetafield(orderId, { namespace, key, value, type = "json" }) {
  const data = await graphql(
    `mutation SetMetafield($metafields: [MetafieldsSetInput!]!) {
       metafieldsSet(metafields: $metafields) {
         metafields { id namespace key }
         userErrors { field message }
       }
     }`,
    {
      metafields: [
        {
          ownerId: orderId,
          namespace,
          key,
          type,
          value: typeof value === "string" ? value : JSON.stringify(value),
        },
      ],
    },
  );

  return assertNoUserErrors(data.metafieldsSet, "metafieldsSet").metafields[0];
}

/** Reads one order metafield, or null when it has never been set. */
export async function getOrderMetafield(orderId, namespace, key) {
  const data = await graphql(
    `query GetMetafield($id: ID!, $namespace: String!, $key: String!) {
       order(id: $id) { metafield(namespace: $namespace, key: $key) { id value } }
     }`,
    { id: orderId, namespace, key },
  );
  return data.order?.metafield || null;
}

/** The order's current note, needed before appending so nothing is clobbered. */
export async function getOrderNote(orderId) {
  const data = await graphql(`query GetNote($id: ID!) { order(id: $id) { id note } }`, { id: orderId });
  return data.order?.note || "";
}
