/**
 * Shipping-fee correction.
 *
 * The audit already *detects* a shipping line that disagrees with the zone
 * table (decided on the net amount against the 300 EGP threshold). This
 * corrects it on the Shopify order through an order edit:
 *
 *   orderEditBegin -> orderEditRemoveShippingLine -> orderEditAddShippingLine
 *                  -> orderEditCommit
 *
 * Why remove-and-add rather than `orderEditUpdateShippingLine`: Shopify's
 * "Edit existing orders" guide says that mutation updates a *newly added*
 * shipping line, while `orderEditRemoveShippingLine` removes *any* line. The
 * line on a real order is never newly added, so updating it in place would
 * fail on every order this is meant for. The replacement keeps the original
 * title, so the customer-facing shipping method is unchanged.
 *
 * All four mutations were checked field-by-field against the live Admin
 * schema. They take the calculated-order id; `shippingLines` on a
 * CalculatedOrder is a plain list, not a connection.
 *
 * ## When it refuses, and why
 *
 * - **The order already has an AWB.** Bosta's COD was set from the order total
 *   at creation. Changing the Shopify fee afterwards makes Shopify and Bosta
 *   disagree on what the courier collects. That case needs the COD changed on
 *   Bosta instead, so it is reported, not edited.
 * - **The province is unresolved or contradicts the city.** The expected fee
 *   depends on the province. Correcting a fee computed from a province that
 *   is itself wrong just swaps one wrong charge for another, so the address
 *   has to be fixed first.
 * - **There isn't exactly one shipping line.** With none there is nothing to
 *   reprice; with several there is no safe way to know which one to change.
 *
 * ## Safety of a half-finished edit
 *
 * Nothing changes on the order until `orderEditCommit` succeeds. If the remove
 * or add step fails, the session is simply abandoned uncommitted and the order
 * is exactly as it was — it can never end up with its old line removed and no
 * new one added.
 */

import * as shopify from "../lib/shopify.js";
import { auditCityProvince, auditShippingFee } from "../domain/audit.js";
import { append, hasShipment } from "../lib/ledger.js";
import { config } from "../config.js";

const money = (value) => Number(Number(value).toFixed(2));

function cairoStamp() {
  return new Date(Date.now() + config.orderWindowTzOffsetHours * 3600 * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 16);
}

/**
 * What would change, without touching anything. Pure: reads only the order
 * and the shipment ledger. Returns { status, ... } where status is one of
 * "ok" (fee already right), "fix", or "blocked".
 */
export function planFeeCorrection(order) {
  const base = { orderId: order.id, orderName: order.name };

  // Province first: the expected fee is only as good as the province it is
  // looked up from.
  const provinceProblems = auditCityProvince(order).filter((f) =>
    ["city_province_mismatch", "province_unresolved"].includes(f.code),
  );
  if (provinceProblems.length) {
    return {
      ...base,
      status: "blocked",
      reason: "Fix the province first — the correct fee depends on it.",
      detail: provinceProblems.map((f) => f.message),
    };
  }

  const finding = auditShippingFee(order).find((f) => f.code === "shipping_fee_mismatch");
  if (!finding) return { ...base, status: "ok" };

  if (order.trackingNumber || hasShipment(order.id)) {
    return {
      ...base,
      status: "blocked",
      reason:
        "Order already has a Bosta AWB, whose COD was set from the old total. Change the COD on Bosta instead, or Shopify and the courier will disagree on what to collect.",
      currentFee: finding.currentValue,
      expectedFee: finding.suggestedValue,
    };
  }

  const currentFee = money(finding.currentValue);
  const expectedFee = money(finding.suggestedValue);
  const delta = money(expectedFee - currentFee);

  return {
    ...base,
    status: "fix",
    currentFee,
    expectedFee,
    delta,
    // An increase means the customer pays more at the door than checkout
    // showed them; surfaced so it is never a silent change.
    direction: delta > 0 ? "increase" : "decrease",
    zone: finding.zone,
    netAmount: order.netAmount,
    currentTotal: order.total,
    newTotal: order.total === null ? null : money(order.total + delta),
    currency: order.currency || "EGP",
  };
}

function userErrors(payload, label) {
  const errors = payload?.userErrors || [];
  if (errors.length) {
    const message = errors.map((e) => `${(e.field || []).join(".")} ${e.message}`.trim()).join("; ");
    const error = new Error(`${label} failed: ${message}`);
    error.userErrors = errors;
    throw error;
  }
  return payload;
}

/**
 * Corrects one order's shipping fee. `dryRun` (the default) returns the plan
 * without any Shopify call.
 */
export async function applyFeeCorrection(order, { dryRun = true } = {}) {
  const plan = planFeeCorrection(order);
  if (plan.status !== "fix" || dryRun) return { ...plan, dryRun, applied: false };

  const begin = userErrors(
    (
      await shopify.graphql(
        `mutation BeginFeeEdit($id: ID!) {
           orderEditBegin(id: $id) {
             calculatedOrder {
               id
               shippingLines { id title stagedStatus price { shopMoney { amount currencyCode } } }
             }
             userErrors { field message }
           }
         }`,
        { id: order.id },
      )
    ).orderEditBegin,
    "orderEditBegin",
  );

  const calculatedId = begin.calculatedOrder?.id;
  const lines = (begin.calculatedOrder?.shippingLines || []).filter((line) => line.stagedStatus !== "REMOVED");

  if (!calculatedId || lines.length !== 1) {
    // Nothing has been committed, so the order is untouched.
    return {
      ...plan,
      dryRun,
      applied: false,
      status: "blocked",
      reason:
        lines.length === 0
          ? "Order has no shipping line to reprice."
          : `Order has ${lines.length} shipping lines; refusing to guess which one to change.`,
    };
  }

  const [line] = lines;
  const currencyCode = line.price?.shopMoney?.currencyCode || plan.currency;

  userErrors(
    (
      await shopify.graphql(
        `mutation RemoveOldFee($id: ID!, $shippingLineId: ID!) {
           orderEditRemoveShippingLine(id: $id, shippingLineId: $shippingLineId) {
             calculatedOrder { id }
             userErrors { field message }
           }
         }`,
        { id: calculatedId, shippingLineId: line.id },
      )
    ).orderEditRemoveShippingLine,
    "orderEditRemoveShippingLine",
  );

  userErrors(
    (
      await shopify.graphql(
        `mutation AddNewFee($id: ID!, $shippingLine: OrderEditAddShippingLineInput!) {
           orderEditAddShippingLine(id: $id, shippingLine: $shippingLine) {
             calculatedOrder { id totalPriceSet { shopMoney { amount } } }
             userErrors { field message }
           }
         }`,
        {
          id: calculatedId,
          // Same title as before, so the shipping method the customer chose is
          // unchanged; only the price moves.
          shippingLine: { title: line.title, price: { amount: String(plan.expectedFee), currencyCode } },
        },
      )
    ).orderEditAddShippingLine,
    "orderEditAddShippingLine",
  );

  const staffNote = `Shipping fee corrected ${plan.currentFee} -> ${plan.expectedFee} ${currencyCode} (${plan.zone}, net ${plan.netAmount}).`;

  const committed = userErrors(
    (
      await shopify.graphql(
        `mutation CommitFeeEdit($id: ID!, $staffNote: String) {
           orderEditCommit(id: $id, notifyCustomer: false, staffNote: $staffNote) {
             order { id currentTotalPriceSet { shopMoney { amount } } }
             userErrors { field message }
           }
         }`,
        { id: calculatedId, staffNote },
      )
    ).orderEditCommit,
    "orderEditCommit",
  );

  const newTotal = Number(committed.order?.currentTotalPriceSet?.shopMoney?.amount ?? plan.newTotal);

  // The fee is changed at this point; the ledger and note are the record of
  // it, and a failure writing them must not be reported as a failed fix.
  const result = { ...plan, dryRun, applied: true, newTotal };
  append("fees", result);

  try {
    await shopify.appendOrderNote(order.id, `[${cairoStamp()}] ${staffNote}`, order.note);
    result.noted = true;
  } catch (error) {
    result.noted = false;
    result.noteError = error.message;
  }

  return result;
}

/** Plans (or applies) corrections across a whole window of orders, sequentially. */
export async function correctFees(orders, { dryRun = true } = {}) {
  const results = [];
  for (const order of orders) {
    try {
      results.push(await applyFeeCorrection(order, { dryRun }));
    } catch (error) {
      results.push({ orderId: order.id, orderName: order.name, status: "failed", reason: error.message, dryRun });
    }
  }

  const fixes = results.filter((r) => r.status === "fix");
  return {
    dryRun,
    results: results.filter((r) => r.status !== "ok"),
    summary: {
      checked: results.length,
      alreadyCorrect: results.filter((r) => r.status === "ok").length,
      toFix: fixes.length,
      applied: results.filter((r) => r.applied).length,
      blocked: results.filter((r) => r.status === "blocked").length,
      failed: results.filter((r) => r.status === "failed").length,
      increases: fixes.filter((r) => r.direction === "increase").length,
      decreases: fixes.filter((r) => r.direction === "decrease").length,
      // Net change to what customers pay at the door across the window.
      netDelta: money(fixes.reduce((sum, r) => sum + r.delta, 0)),
    },
  };
}
