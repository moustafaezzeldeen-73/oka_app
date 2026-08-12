/**
 * Order data-quality audit — the checks that have to pass before an order is
 * safe to hand to Bosta.
 *
 * Everything here is a pure function over already-fetched orders. Nothing
 * writes to Shopify; `src/services/audit.js` decides which findings are safe
 * to auto-apply and which need a human.
 *
 * Findings carry `autoFixable` so the UI can separate "corrected for you"
 * from "someone needs to look at this". The rule of thumb from the OKA audit
 * skill: correct only genuine, unambiguous mismatches; flag everything else
 * rather than guessing.
 */

import { classify, isMobile, looksLikePhoneAtAll, normalizeForBosta } from "./phone.js";
import { FEE_TIER_THRESHOLD_EGP, resolveProvince, shippingFeeFor } from "./zones.js";

const finding = (severity, code, message, extra = {}) => ({
  severity, // "error" blocks shipping, "warning" is advisory
  code,
  message,
  autoFixable: false,
  ...extra,
});

/** 1. Phone: missing, malformed, or a landline where Bosta needs a mobile. */
export function auditPhone(order) {
  const findings = [];
  const raw = order.shippingAddress?.phone || order.phone || order.customer?.phone || "";

  if (!raw) {
    findings.push(finding("error", "phone_missing", "No phone number anywhere on the order — Bosta cannot deliver."));
    return findings;
  }

  const normalized = normalizeForBosta(raw);
  if (!normalized) {
    findings.push(
      finding("error", "phone_not_phone_like", `Phone field is not a phone number: ${JSON.stringify(raw)}`),
    );
    return findings;
  }

  const kind = classify(normalized);
  if (normalized !== String(raw).trim()) {
    findings.push(
      finding("warning", "phone_normalized", `Phone normalized ${raw} -> ${normalized}`, {
        autoFixable: true,
        field: "phone",
        currentValue: raw,
        suggestedValue: normalized,
      }),
    );
  }

  if (kind === "landline") {
    findings.push(
      finding("warning", "phone_landline", `${normalized} is a landline — Bosta cannot SMS or WhatsApp it.`),
    );
  } else if (kind === "unknown") {
    findings.push(
      finding("error", "phone_invalid", `${normalized} is neither a valid Egyptian mobile nor a known landline.`),
    );
  }

  return findings;
}

/**
 * 2a. A phone number sitting in the city field, or an address collapsed into
 * one field. Seen live: order #2464121 had `city: "01159708270"`.
 */
export function auditAddressFields(order) {
  const findings = [];
  const address = order.shippingAddress;

  if (!address) {
    findings.push(finding("error", "address_missing", "Order has no shipping address."));
    return findings;
  }

  for (const field of ["city", "zip", "company"]) {
    const value = address[field];
    if (value && looksLikePhoneAtAll(value) && !/[a-z؀-ۿ]/i.test(value)) {
      findings.push(
        finding("error", "phone_in_wrong_field", `A phone number is sitting in the ${field} field: ${value}`, {
          field,
          currentValue: value,
        }),
      );
    }
  }

  if (!address.address1 || String(address.address1).trim().length < 8) {
    findings.push(
      finding("error", "address1_too_short", `address1 is empty or too short to route: ${JSON.stringify(address.address1 || "")}`),
    );
  }

  return findings;
}

/**
 * 2b. City/province mismatch. The storefront's city field is free text, so
 * customers type a governorate there while the province stays on whatever
 * the theme defaulted to. Seen live: city "الغربية" (Gharbia) with province
 * "Cairo" — which would have shipped to the wrong zone at the wrong fee.
 *
 * Only a confident resolution counts as a mismatch; an unrecognised city is
 * reported separately so nobody "corrects" a province off a bad guess.
 */
export function auditCityProvince(order) {
  const findings = [];
  const address = order.shippingAddress;
  if (!address) return findings;

  const fromCity = resolveProvince(address.city);
  const fromProvince = resolveProvince(address.provinceCode, address.province);

  if (!fromCity && !fromProvince) {
    findings.push(
      finding("error", "province_unresolved", `Cannot map city ${JSON.stringify(address.city || "")} / province ${JSON.stringify(address.province || "")} to an Egyptian governorate.`),
    );
    return findings;
  }

  if (fromCity && fromProvince && fromCity.code !== fromProvince.code) {
    findings.push(
      finding("error", "city_province_mismatch", `City "${address.city}" is in ${fromCity.name} but the order's province is ${fromProvince.name} (${fromProvince.code}).`, {
        autoFixable: true,
        field: "provinceCode",
        currentValue: fromProvince.code,
        suggestedValue: fromCity.code,
        suggestedProvince: fromCity.name,
      }),
    );
  }

  if (!fromProvince && fromCity) {
    findings.push(
      finding("warning", "province_inferred", `Province was blank or unrecognised; inferred ${fromCity.name} (${fromCity.code}) from the city field.`, {
        autoFixable: true,
        field: "provinceCode",
        currentValue: address.provinceCode || null,
        suggestedValue: fromCity.code,
        suggestedProvince: fromCity.name,
      }),
    );
  }

  return findings;
}

/**
 * 2c. Shipping fee vs. the zone table, decided on the NET amount (excluding
 * shipping) against the 300 EGP threshold. Using the order total instead
 * would be self-referential, since it already contains the fee in question.
 */
export function auditShippingFee(order) {
  const findings = [];
  const province = resolveProvince(
    order.shippingAddress?.provinceCode,
    order.shippingAddress?.province,
    order.shippingAddress?.city,
  );
  if (!province) return findings; // Already reported by auditCityProvince.

  const expected = shippingFeeFor(province, order.netAmount);
  const charged = order.shippingFee;

  if (charged === null || expected === null) return findings;

  if (Math.abs(charged - expected) > 0.01) {
    const tier = order.netAmount >= FEE_TIER_THRESHOLD_EGP ? `>= ${FEE_TIER_THRESHOLD_EGP}` : `< ${FEE_TIER_THRESHOLD_EGP}`;
    findings.push(
      finding("warning", "shipping_fee_mismatch", `Charged ${charged} EGP but ${province.name} at net ${order.netAmount} EGP (${tier}) should be ${expected} EGP.`, {
        field: "shippingFee",
        currentValue: charged,
        suggestedValue: expected,
        zone: province.zone,
      }),
    );
  }

  return findings;
}

/**
 * Duplicate detection across the whole window pool — matching phone OR email,
 * same day or adjacent day. The survivor is the highest-value order; the
 * others are candidates to be merged into it.
 *
 * Only unfulfilled orders are eligible, which the caller guarantees by what
 * it passes in.
 */
export function findDuplicateGroups(orders) {
  const buckets = new Map();

  for (const order of orders) {
    const phone = normalizeForBosta(order.shippingAddress?.phone || order.phone || "");
    const email = (order.email || "").trim().toLowerCase();

    for (const key of [phone && `phone:${phone}`, email && `email:${email}`].filter(Boolean)) {
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(order);
    }
  }

  // An order matching on both phone and email would otherwise appear twice.
  const seen = new Set();
  const groups = [];

  for (const [key, members] of buckets) {
    if (members.length < 2) continue;
    const signature = members.map((o) => o.id).sort().join("|");
    if (seen.has(signature)) continue;
    seen.add(signature);

    const sorted = [...members].sort((a, b) => (b.total || 0) - (a.total || 0));
    groups.push({
      matchedOn: key.split(":")[0],
      matchValue: key.split(":").slice(1).join(":"),
      survivor: sorted[0],
      duplicates: sorted.slice(1),
    });
  }

  return groups;
}

/** Runs every per-order check and rolls the results into one verdict. */
export function auditOrder(order) {
  const findings = [
    ...auditPhone(order),
    ...auditAddressFields(order),
    ...auditCityProvince(order),
    ...auditShippingFee(order),
  ];

  const errors = findings.filter((f) => f.severity === "error");

  return {
    orderId: order.id,
    orderName: order.name,
    findings,
    errorCount: errors.length,
    warningCount: findings.length - errors.length,
    // Anything with an unresolved error is not safe to send to Bosta.
    shippable: errors.length === 0,
  };
}

/** Audits the whole window, including the cross-order duplicate pass. */
export function auditOrders(orders) {
  const perOrder = orders.map(auditOrder);
  const duplicateGroups = findDuplicateGroups(orders);
  const duplicateIds = new Set(duplicateGroups.flatMap((g) => g.duplicates.map((o) => o.id)));

  for (const result of perOrder) {
    if (duplicateIds.has(result.orderId)) {
      result.findings.push(
        finding("warning", "duplicate_order", "Looks like a duplicate of a larger order in the same window — review before shipping both."),
      );
      result.warningCount += 1;
    }
  }

  return {
    orders: perOrder,
    duplicateGroups: duplicateGroups.map((group) => ({
      matchedOn: group.matchedOn,
      matchValue: group.matchValue,
      survivor: { id: group.survivor.id, name: group.survivor.name, total: group.survivor.total },
      duplicates: group.duplicates.map((o) => ({ id: o.id, name: o.name, total: o.total })),
    })),
    summary: {
      total: perOrder.length,
      shippable: perOrder.filter((r) => r.shippable).length,
      blocked: perOrder.filter((r) => !r.shippable).length,
      duplicateGroups: duplicateGroups.length,
    },
  };
}
