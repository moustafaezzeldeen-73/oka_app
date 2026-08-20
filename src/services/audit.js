/**
 * Applies the audit's auto-fixable findings back to Shopify.
 *
 * Only findings the audit itself marked `autoFixable` are ever written — a
 * confident city/province correction or a phone normalization. Everything
 * else is reported for a human. Two rules from the OKA audit workflow hold
 * here:
 *
 *  - `shippingAddress` is a full-object overwrite, so every existing field is
 *    re-sent alongside the change or Shopify wipes it.
 *  - `note` is a full overwrite too, so the audit line is appended to the
 *    existing note rather than replacing it.
 */

import * as shopify from "../lib/shopify.js";
import { auditOrders } from "../domain/audit.js";
import { append } from "../lib/ledger.js";
import { config } from "../config.js";

/** Re-sends the whole address with the corrected fields merged in. */
function mergedAddress(order, changes) {
  const current = order.shippingAddress || {};
  return {
    address1: current.address1 || "",
    address2: current.address2 || "",
    city: current.city || "",
    provinceCode: current.provinceCode || "",
    zip: current.zip || "",
    phone: current.phone || "",
    company: current.company || "",
    countryCode: current.countryCodeV2 || "EG",
    ...changes,
  };
}

function todayCairo() {
  const cairo = new Date(Date.now() + config.orderWindowTzOffsetHours * 3600 * 1000);
  return cairo.toISOString().slice(0, 10);
}

/**
 * Applies every auto-fixable finding on one order.
 * `dryRun` computes the changes and the note line without writing anything.
 */
export async function applyFixes(order, findings, { dryRun = true } = {}) {
  const fixable = findings.filter((f) => f.autoFixable);
  if (!fixable.length) return { orderId: order.id, orderName: order.name, applied: [], dryRun };

  const addressChanges = {};
  const applied = [];

  for (const item of fixable) {
    if (item.field === "provinceCode") {
      addressChanges.provinceCode = item.suggestedValue;
      applied.push(`province -> ${item.suggestedProvince} (${item.suggestedValue})`);
    } else if (item.field === "phone") {
      addressChanges.phone = item.suggestedValue;
      applied.push(`phone -> ${item.suggestedValue}`);
    }
  }

  if (!applied.length) return { orderId: order.id, orderName: order.name, applied: [], dryRun };

  const noteLine = `[${todayCairo()}] Warehouse audit: ${applied.join("; ")}.`;

  if (!dryRun) {
    await shopify.updateShippingAddress(order.id, mergedAddress(order, addressChanges));
    await shopify.appendOrderNote(order.id, noteLine, order.note);
    append("audit", { orderId: order.id, orderName: order.name, applied, noteLine });
  }

  return {
    orderId: order.id,
    orderName: order.name,
    applied,
    noteLine,
    addressChanges,
    dryRun,
  };
}

/** Audits a window of orders and optionally writes the safe corrections back. */
export async function runAudit(orders, { apply = false, dryRun = true } = {}) {
  const audit = auditOrders(orders);
  const byId = new Map(orders.map((order) => [order.id, order]));
  const fixes = [];

  if (apply) {
    for (const result of audit.orders) {
      const order = byId.get(result.orderId);
      if (!order) continue;
      try {
        const fix = await applyFixes(order, result.findings, { dryRun });
        if (fix.applied.length) fixes.push(fix);
      } catch (error) {
        fixes.push({ orderId: result.orderId, orderName: result.orderName, error: error.message });
      }
    }
  }

  return { ...audit, fixes };
}
