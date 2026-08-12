/**
 * Order -> Bosta shipment orchestration.
 *
 * This is where the guard rails live. `createDelivery` itself is a thin API
 * binding; every decision about whether a real, billable shipment is allowed
 * to happen is made here:
 *
 *   1. BOSTA_LIVE_SHIPMENTS=false forces dry run, whatever the request says.
 *   2. An order that already has a non-dry-run AWB in the ledger is skipped,
 *      unless the caller explicitly passes `force`.
 *   3. An order failing the audit's error-level checks is not sent at all.
 */

import * as bosta from "../lib/bosta.js";
import * as shopify from "../lib/shopify.js";
import { append, hasShipment, shipmentsByOrderId } from "../lib/ledger.js";
import { auditOrder } from "../domain/audit.js";
import { batchName, classifyRisk } from "../domain/risk.js";
import { bostaCityFor, resolveProvince, shippingFeeFor } from "../domain/zones.js";
import { normalizeForBosta } from "../domain/phone.js";
import { config } from "../config.js";

/**
 * The line-item summary that shows up on the AWB and in Bosta's dashboard.
 * Format is fixed by the warehouse's own convention — no generic placeholder,
 * because this is what the person packing the box reads back against it.
 *
 *   "Title x2 @250 EGP; Other x1 @99 EGP | Subtotal: 599 EGP | Shipping: 60 EGP"
 */
export function buildPackageDescription(order) {
  const items = order.lineItems
    .filter((item) => item.quantity > 0)
    .map((item) => `${item.title} x${item.quantity} @${item.unitPrice ?? "?"} EGP`)
    .join("; ");

  return `${items} | Subtotal: ${order.subtotal ?? "?"} EGP | Shipping: ${order.shippingFee ?? 0} EGP`;
}

/** Maps a normalized Shopify order onto the Bosta delivery spec. */
export function buildShipmentSpec(order) {
  const address = order.shippingAddress || {};
  const province = resolveProvince(address.provinceCode, address.province, address.city);
  const city = bostaCityFor(province);

  if (!city) {
    throw new Error(`Cannot map ${order.name} to a Bosta city — province unresolved from ${JSON.stringify({ city: address.city, province: address.province })}`);
  }

  const phone = normalizeForBosta(address.phone || order.phone || order.customer?.phone || "");
  if (!phone) throw new Error(`Cannot ship ${order.name} — no usable phone number`);

  const [firstName, ...restOfName] = [
    order.customer?.firstName,
    order.customer?.lastName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim()
    .split(/\s+/);

  return {
    city,
    // Bosta's `district` is free text and only helps routing, so the Shopify
    // second address line is the closest honest equivalent.
    district: address.address2 || "",
    firstLine: address.address1 || "",
    secondLine: address.address2 || "",
    receiverFirstName: firstName || "Customer",
    receiverLastName: restOfName.join(" "),
    receiverPhone: phone,
    receiverEmail: order.email || "",
    codAmount: order.total ?? 0,
    businessReference: order.name,
    packageDescription: buildPackageDescription(order),
    itemsCount: order.lineItems.reduce((sum, item) => sum + (item.quantity || 0), 0) || 1,
    allowToOpenPackage: false,
  };
}

/**
 * Creates one shipment. Returns a result object rather than throwing on a
 * business-rule skip, so a batch run reports every order's outcome instead of
 * stopping at the first problem.
 */
export async function shipOrder(order, { dryRun: requestedDryRun = true, force = false, fulfill = false } = {}) {
  // Guard rail 1: the env switch always wins. A request cannot turn on live
  // shipping that the deployment hasn't enabled.
  const dryRun = requestedDryRun || !config.bosta.liveShipments;

  const base = { orderId: order.id, orderName: order.name, dryRun };

  // Guard rail 2: never re-ship an order that already has a real AWB.
  if (!force && hasShipment(order.id)) {
    const existing = shipmentsByOrderId().get(order.id);
    return {
      ...base,
      status: "skipped",
      reason: `Order already has AWB ${existing.trackingNumber} from ${existing.loggedAt} — pass force to override.`,
      trackingNumber: existing.trackingNumber,
    };
  }

  // Guard rail 3: audit errors mean the data is not good enough to ship on.
  const audit = auditOrder(order);
  if (!audit.shippable) {
    return {
      ...base,
      status: "blocked",
      reason: "Audit found blocking problems — fix them before shipping.",
      findings: audit.findings.filter((f) => f.severity === "error"),
    };
  }

  let spec;
  try {
    spec = buildShipmentSpec(order);
  } catch (error) {
    return { ...base, status: "blocked", reason: error.message };
  }

  let created;
  try {
    created = await bosta.createDelivery(spec, { dryRun });
  } catch (error) {
    return { ...base, status: "failed", reason: error.message, error: error.toJSON?.() ?? String(error) };
  }

  const province = resolveProvince(order.shippingAddress?.provinceCode, order.shippingAddress?.province, order.shippingAddress?.city);
  const expectedFee = shippingFeeFor(province, order.netAmount);

  // A dry run has no tracking number, so there is no ranking to look up and
  // the risk verdict is computed on a null ranking — the same path a
  // first-time customer takes.
  let risk = { ranking: null, isBadAddress: false };
  if (!dryRun && created.trackingNumber) {
    try {
      risk = await bosta.orderRisk(created.trackingNumber);
    } catch {
      // A ranking lookup failure must not undo a shipment that already exists.
      risk = { ranking: null, isBadAddress: false, lookupFailed: true };
    }
  }

  const classification = classifyRisk({
    ranking: risk.ranking,
    codValue: order.total,
    shippingFee: order.shippingFee ?? expectedFee ?? 0,
    city: order.shippingAddress?.city || "",
    district: order.shippingAddress?.address2 || "",
    address1: order.shippingAddress?.address1 || "",
  });

  const record = {
    ...base,
    status: "created",
    trackingNumber: created.trackingNumber || null,
    deliveryId: created.id || null,
    cod: order.total,
    shippingFee: order.shippingFee,
    expectedShippingFee: expectedFee,
    city: spec.city,
    ranking: risk.ranking ?? null,
    isBadAddress: Boolean(risk.isBadAddress),
    rankingLookupFailed: Boolean(risk.lookupFailed),
    risk: classification.result,
    riskReason: classification.reason,
    orderCreatedAt: order.createdAt,
    payload: dryRun ? created.payload : undefined,
  };

  // Logged immediately, not batched at the end — an entry that only exists
  // after the whole run finishes is no protection against a crash mid-run.
  append("shipments", record);

  if (fulfill && !dryRun && created.trackingNumber) {
    try {
      await shopify.fulfillOrder(order.id, {
        trackingNumber: created.trackingNumber,
        trackingUrl: `https://bosta.co/tracking-shipments?tn=${created.trackingNumber}`,
      });
      record.fulfilled = true;
    } catch (error) {
      record.fulfilled = false;
      record.fulfillError = error.message;
    }
  }

  return record;
}

/** Ships a list of orders in sequence and splits the results into risk batches. */
export async function shipBatch(orders, options = {}) {
  const results = [];
  for (const order of orders) {
    // Sequential on purpose: these are real shipments and Bosta rate-limits.
    results.push(await shipOrder(order, options));
  }

  const created = results.filter((r) => r.status === "created");
  const noRisk = created.filter((r) => r.risk === "no_risk");
  const risky = created.filter((r) => r.risk === "risk");

  return {
    results,
    batches: {
      noRisk: {
        name: batchName("no_risk", noRisk.length),
        trackingNumbers: noRisk.map((r) => r.trackingNumber).filter(Boolean),
        orders: noRisk,
      },
      risk: {
        name: batchName("risk", risky.length),
        trackingNumbers: risky.map((r) => r.trackingNumber).filter(Boolean),
        orders: risky,
      },
    },
    summary: {
      total: results.length,
      created: created.length,
      skipped: results.filter((r) => r.status === "skipped").length,
      blocked: results.filter((r) => r.status === "blocked").length,
      failed: results.filter((r) => r.status === "failed").length,
      noRisk: noRisk.length,
      risk: risky.length,
      // Surfaced separately because classifyRisk() deliberately ignores it —
      // a bad address can sit inside the No Risk batch with a 100 ranking.
      badAddresses: created.filter((r) => r.isBadAddress).map((r) => r.orderName),
      dryRun: results.every((r) => r.dryRun),
    },
  };
}
