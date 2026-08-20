/**
 * COD-aware risk classification — a JS port of the oka-awb-risk-batches
 * skill's risk_classification.py, thresholds and worked examples intact.
 *
 * No Risk if EITHER:
 *   - the customer has a Bosta ranking (0-100 from order_risk) AND
 *     ranking > rankingThreshold AND
 *     (ranking / 100) * codValue > shippingFee * codFeeMultiplier
 *   - the customer has no ranking yet AND the address is in Cairo/Giza
 *     (OKA's home turf) or matches a known premium area
 *
 * Risk otherwise — including a ranking at or below the threshold, where the
 * expected-value formula is never even reached.
 *
 * The formula is an expected-value test: ranking stands in for delivery
 * success probability, so (ranking/100)*cod estimates the cash actually
 * likely to be collected. Requiring that to clear a multiple of the shipping
 * fee keeps OKA from risking the shipping cost — let alone the product cost —
 * on an order unlikely to cover it.
 *
 * A null ranking means "no Bosta history yet", NOT zero. Confirmed live:
 * several orders in one batch returned null. Treating it as 0 would push
 * every first-time customer into the Risk batch.
 */

import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

const DEFAULTS = { rankingThreshold: 70, codFeeMultiplier: 2.0 };
const PARAMS_FILE = path.join(config.dataDir, "risk_params.json");

/**
 * STARTER LIST — not yet reviewed against real OKA outcomes. A false here
 * means "not on the list", not "not premium"; add compounds freely. The
 * self-tuning loop deliberately does not touch this list, since "should
 * Mivida count as premium" isn't a question a delivery stat can answer.
 */
export const PREMIUM_AREA_KEYWORDS = [
  // New Cairo
  "mivida", "hyde park", "katameya heights", "katameya", "lake view",
  "mountain view", "taj city", "village gate", "stone residence",
  "the address east", "fifth square", "park view",
  // Sheikh Zayed / 6th of October
  "beverly hills", "allegria", "westown", "village gardens",
  "palm hills", "dyar", "bellagio",
  // North Coast — seasonal, but historically high COD value
  "marassi", "hacienda bay", "hacienda white", "el gouna",
];

export const CAIRO_GIZA_KEYWORDS = [
  "cairo", "giza",
  "6th of october", "6 october", "october city",
  "sheikh zayed", "shiekh zayed",
];

/**
 * Thresholds live in data/risk_params.json so the outcome loop can move them
 * between runs. A missing or malformed file must never break classification —
 * it falls back to the original defaults.
 */
export function loadParams() {
  try {
    const parsed = JSON.parse(fs.readFileSync(PARAMS_FILE, "utf8"));
    return {
      ...DEFAULTS,
      ...parsed,
      rankingThreshold: Number(parsed.ranking_threshold ?? parsed.rankingThreshold ?? DEFAULTS.rankingThreshold),
      codFeeMultiplier: Number(parsed.cod_fee_multiplier ?? parsed.codFeeMultiplier ?? DEFAULTS.codFeeMultiplier),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function isPremiumArea({ city = "", district = "", address1 = "" } = {}) {
  const haystack = [city, district, address1].join(" ").toLowerCase();
  return PREMIUM_AREA_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

export function isCairoOrGiza({ city = "", district = "" } = {}) {
  const haystack = [city, district].join(" ").toLowerCase();
  return CAIRO_GIZA_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

/**
 * Returns { result: "no_risk" | "risk", reason } — the reason string is what
 * the warehouse UI shows next to each order, so a Risk verdict is explainable
 * rather than a black box.
 */
export function classifyRisk({
  ranking,
  codValue,
  shippingFee,
  city = "",
  district = "",
  address1 = "",
  rankingThreshold,
  codFeeMultiplier,
} = {}) {
  const params = loadParams();
  const threshold = rankingThreshold ?? params.rankingThreshold;
  const multiplier = codFeeMultiplier ?? params.codFeeMultiplier;

  const cod = Number(codValue) || 0;
  const fee = Number(shippingFee) || 0;

  if (ranking !== null && ranking !== undefined) {
    const expectedCollection = (Number(ranking) / 100) * cod;
    const required = fee * multiplier;

    if (Number(ranking) > threshold && expectedCollection > required) {
      return {
        result: "no_risk",
        reason: `ranking ${ranking} > ${threshold}, expected collection ${expectedCollection.toFixed(0)} EGP > ${required.toFixed(0)} EGP`,
      };
    }
    return {
      result: "risk",
      reason:
        Number(ranking) > threshold
          ? `ranking ${ranking} clears ${threshold} but expected collection ${expectedCollection.toFixed(0)} EGP does not exceed ${required.toFixed(0)} EGP`
          : `ranking ${ranking} at or below threshold ${threshold}`,
    };
  }

  if (isCairoOrGiza({ city, district })) {
    return { result: "no_risk", reason: "no Bosta history yet, but address is Cairo/Giza (home turf)" };
  }
  if (isPremiumArea({ city, district, address1 })) {
    return { result: "no_risk", reason: "no Bosta history yet, but address matches a premium area" };
  }
  return { result: "risk", reason: "no Bosta history yet and address is outside Cairo/Giza and the premium list" };
}

/** Batch name in the format the warehouse prints on the AWB bundles. */
export function batchName(result, count, date = new Date()) {
  const cairo = new Date(date.getTime() + config.orderWindowTzOffsetHours * 3600 * 1000);
  const label = result === "no_risk" ? "No Risk" : "Risk";
  return `${label} - ${count} - ${cairo.toISOString().slice(0, 10)}`;
}
