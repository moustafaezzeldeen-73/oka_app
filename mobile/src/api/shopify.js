/**
 * Shopify Admin GraphQL, direct-from-device.
 *
 * Only used in "direct" mode — see config.js for why that ships the admin
 * token inside the bundle. The query mirrors the backend's so both paths
 * produce the same normalized order shape.
 */

import { requestJson, ApiError } from "./client.js";
import { shopify as cfg } from "./config.js";

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
        id title quantity sku
        originalUnitPriceSet { shopMoney { amount } }
        variant { id title image { url } product { id title featuredImage { url } } }
      }
    }
  }
`;

const endpoint = () => `https://${cfg.shop}.myshopify.com/admin/api/${cfg.apiVersion}/graphql.json`;

export async function graphql(query, variables = {}) {
  const payload = await requestJson(endpoint(), {
    service: "shopify",
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": cfg.accessToken },
    body: { query, variables },
  });

  // Shopify reports GraphQL errors inside an HTTP 200.
  if (payload?.errors?.length) {
    throw new ApiError(`Shopify: ${payload.errors.map((e) => e.message).join("; ")}`, {
      service: "shopify",
      body: payload.errors,
    });
  }
  return payload.data;
}

const money = (set) => (set?.shopMoney?.amount === undefined ? null : Number(set.shopMoney.amount));

export function normalizeOrder(node) {
  const lineItems = (node.lineItems?.edges || []).map(({ node: item }) => ({
    id: item.id,
    title: item.title,
    quantity: item.quantity,
    sku: item.sku || null,
    unitPrice: money(item.originalUnitPriceSet),
    variantId: item.variant?.id || null,
    // variant.image is null on every line item in this store — the photo lives
    // on the product.
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
        }
      : null,
    shippingAddress: node.shippingAddress || null,
    subtotal,
    total,
    shippingFee,
    netAmount: subtotal ?? (total !== null && shippingFee !== null ? total - shippingFee : total),
    lineItems,
  };
}

export async function fetchUnfulfilledOrders({ first = 50 } = {}) {
  const data = await graphql(
    `query RecentUnfulfilled($first: Int!) {
       orders(first: $first, query: "fulfillment_status:unfulfilled", sortKey: CREATED_AT, reverse: true) {
         edges { node { ${ORDER_FIELDS} } }
       }
     }`,
    { first },
  );
  return (data.orders?.edges || []).map((edge) => normalizeOrder(edge.node));
}
