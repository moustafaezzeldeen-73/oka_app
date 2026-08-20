/**
 * The one place live data becomes screen data.
 *
 * Every field the design shows is sourced deliberately:
 *
 *   Shopify  order number, customer name, phone, address, city, line items and
 *            their photos, subtotal, shipping line, order total (= the COD).
 *   Bosta    AWB / tracking number, delivery state (-> the 5-step timeline),
 *            assigned courier and their phone, customer ranking, address
 *            clarity score, and the bad-address flag.
 *   Calls    contact history comes from the backend's call provider, not from
 *            Shopify or Bosta; attached photos stay local.
 *
 * Live orders are adapted into the mockup's raw order format so data/shape.js
 * and every screen work identically for sample and live data.
 */

import * as config from "./config.js";
import { requestJson } from "./client.js";
import * as shopifyApi from "./shopify.js";
import * as bostaApi from "./bosta.js";
import { ORDERS as SAMPLE_ORDERS } from "../data/sample.js";
import { resolveProvince } from "../domain/zones.js";
import { normalizeForBosta } from "../domain/phone.js";

const num = (value) => (value === null || value === undefined ? "0" : String(Math.round(Number(value))));

/**
 * Bosta's clarity score is the design's "address clarity" tile. When Bosta has
 * no opinion (no shipment yet), fall back to a crude local signal so the tile
 * still means something rather than showing a confident zero.
 */
function localClarity(address) {
  const line = [address?.address1, address?.address2].filter(Boolean).join(" ").trim();
  if (!line) return 0;
  if (line.length < 12) return 34;
  const hasNumber = /\d|[٠-٩]/.test(line);
  return line.length > 40 && hasNumber ? 100 : hasNumber ? 85 : 50;
}

/**
 * The list chip. `badaddr` is what routes an order to the "Bad address" filter,
 * so it keys off Bosta's own flag first and the local signal only as a fallback.
 */
function statusFor({ signals, clarity, fulfillmentStatus }) {
  if (fulfillmentStatus === "FULFILLED") return "picked";
  if (signals?.isBadAddress) return "badaddr";
  if (clarity < 40) return "badaddr";
  if (signals && signals.phase >= 2) return "transit";
  if (signals && signals.phase >= 1) return "picked";
  return "ready";
}

/** Shopify order + optional Bosta signals -> the raw shape the screens expect. */
export function adaptOrder(order, signals, index) {
  const address = order.shippingAddress || {};
  const province = resolveProvince(address.provinceCode, address.province, address.city);

  const fullName = [order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(" ").trim();
  const addressLine = [address.address1, address.address2].filter(Boolean).join("، ");
  const clarity = signals?.clarity ?? localClarity(address);

  return {
    // Numeric id keeps the mockup's selection/scan bookkeeping working.
    id: index + 1,
    shopifyId: order.id,
    sh: order.name,
    awb: signals?.trackingNumber || order.trackingNumber || "—",
    carrier: "Bosta",

    // Shopify stores a single name; the design's ar/en pair both point at it
    // rather than inventing a transliteration.
    name: fullName || "—",
    nameEn: fullName || "—",
    phone: normalizeForBosta(address.phone || order.phone || "") || address.phone || "",

    // City is shown raw in Arabic and as the resolved governorate in English,
    // which is exactly the pairing the mockup had.
    city: address.city || province?.name || "",
    cityEn: province?.name || address.city || "",
    address: addressLine,
    addressEn: addressLine,

    cod: num(order.total),
    subtotal: num(order.subtotal),
    ship: num(order.shippingFee),

    rank: signals?.ranking ?? null,
    clarity,
    status: statusFor({ signals, clarity, fulfillmentStatus: order.fulfillmentStatus }),

    track: signals
      ? { phase: signals.phase, courier: signals.courier ? { ...signals.courier, nameEn: signals.courier.name } : null }
      : { phase: 0 },

    items: (order.lineItems || [])
      .filter((item) => item.quantity > 0)
      .map((item) => ({
        name: item.title,
        qty: item.quantity,
        unit: num(item.unitPrice),
        img: item.imageUrl || "",
      })),

    // Per-order image map, so shape.js doesn't need the sample IMG table.
    img: Object.fromEntries((order.lineItems || []).map((item) => [item.title, item.imageUrl || ""])),

    history: [],
  };
}

/** Backend mode: the Node service has already normalized and audited. */
async function loadFromBackend() {
  const payload = await requestJson(`${config.backend.baseUrl}/api/orders?windowDays=2`, {
    service: "backend",
  });

  return (payload.orders || []).map((order, index) => {
    // The backend attaches its shipment ledger entry, which carries the AWB and
    // the ranking it looked up at creation time.
    const shipment = order.shipment || null;
    const signals = shipment?.trackingNumber
      ? {
          trackingNumber: shipment.trackingNumber,
          ranking: shipment.ranking ?? null,
          clarity: null,
          isBadAddress: Boolean(shipment.isBadAddress),
          phase: 0,
          courier: null,
        }
      : null;

    const adapted = adaptOrder(order, signals, index);
    // An order the backend audit blocked is a bad address in the operator's
    // language, whatever Bosta thinks.
    if (order.audit && order.audit.shippable === false) adapted.status = "badaddr";
    return adapted;
  });
}

/** Direct mode: Shopify for the order, Bosta for anything shipment-shaped. */
async function loadDirect() {
  const orders = await shopifyApi.fetchUnfulfilledOrders({ first: 50 });

  return Promise.all(
    orders.map(async (order, index) => {
      let signals = null;
      // Without a tracking number there is nothing to ask Bosta about; the
      // order simply hasn't shipped yet.
      if (order.trackingNumber && config.bosta.apiKey) {
        try {
          signals = await bostaApi.shipmentSignals(order.trackingNumber);
        } catch {
          signals = null; // A Bosta hiccup must not blank out the order.
        }
      }
      return adaptOrder(order, signals, index);
    }),
  );
}

/**
 * Loads the order list for whichever mode is configured.
 * Returns { orders, mode, error } — never throws, because the list screen
 * always has something to render, even if that something is the sample set.
 */
export async function loadOrders() {
  const { mode } = config.describeConfig();

  if (mode === "sample") return { orders: SAMPLE_ORDERS, mode, error: null };

  try {
    const orders = mode === "backend" ? await loadFromBackend() : await loadDirect();
    return { orders, mode, error: null };
  } catch (error) {
    // Fall back to sample data rather than an empty screen, and say so.
    return { orders: SAMPLE_ORDERS, mode: "sample", error: error.message };
  }
}

/** Refreshes one order's Bosta signals — used when opening the detail screen. */
export async function refreshShipment(trackingNumber) {
  if (!trackingNumber || trackingNumber === "—") return null;

  if (config.isBackendReady()) {
    try {
      const payload = await requestJson(
        `${config.backend.baseUrl}/api/tracking/${encodeURIComponent(trackingNumber)}`,
        { service: "backend" },
      );
      const delivery = payload.delivery || {};
      const courier = delivery.star || delivery.courier || null;
      const courierName = courier?.name || "";
      return {
        phase: bostaApi.phaseForState(delivery.state),
        courier: courierName ? { name: courierName, nameEn: courierName, phone: courier?.phone || "" } : null,
      };
    } catch {
      return null;
    }
  }

  if (!config.bosta.apiKey) return null;
  try {
    const signals = await bostaApi.shipmentSignals(trackingNumber);
    return {
      phase: signals.phase,
      courier: signals.courier ? { ...signals.courier, nameEn: signals.courier.name } : null,
    };
  } catch {
    return null;
  }
}

/** Marks an order ready to load. Backend mode persists; otherwise local only. */
export async function markReady(order) {
  if (!config.isBackendReady() || !order.shopifyId) return { persisted: false };
  try {
    await requestJson(`${config.backend.baseUrl}/api/shipments/${encodeURIComponent(order.shopifyId)}`, {
      service: "backend",
      method: "POST",
      body: { dryRun: true },
    });
    return { persisted: true };
  } catch (error) {
    return { persisted: false, error: error.message };
  }
}
