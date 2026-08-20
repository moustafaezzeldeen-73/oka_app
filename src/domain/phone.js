/**
 * Egyptian phone helpers — a JS port of the OKA fulfillment skills'
 * phone_format.py, kept behaviourally identical so the app and the skills
 * agree on what a valid number is.
 *
 * Egyptian mobiles are 11 digits starting 010 / 011 / 012 / 015. The common
 * Shopify data-entry faults are a dropped leading zero ("1012345678") and a
 * country-code prefix ("+201012345678"), both of which Bosta rejects.
 *
 * Everything here is deliberately conservative: input that doesn't look like
 * a phone number at all returns null/false rather than being guessed at, so
 * the caller can flag it for a human instead of silently mangling it.
 */

export const MOBILE_PREFIXES = ["010", "011", "012", "015"];

// Not every exchange, but every governorate OKA ships to.
export const LANDLINE_PREFIXES = [
  "02", // Cairo / Giza / Qalyubia
  "03", // Alexandria
  "040", "041", // Tanta / Gharbia
  "045", // Damanhur / Beheira
  "048", // Kafr el-Sheikh
  "050", // Mansoura / Dakahlia
  "055", // Zagazig / Sharqia
  "057", // Ismailia
  "062", // Suez
  "064", // Luxor
  "065", // Aswan
  "066", // Qena
  "068", // Red Sea
  "069", // South Sinai
  "082", // Beni Suef
  "084", // Faiyum
  "086", // Minya
  "088", // Asyut
  "093", // Sohag
  "095", // New Valley
  "097", // Matrouh / North Sinai
];

const PHONE_FORMAT_CHARS = /^[\d\s\-()+]+$/;

export function cleanDigits(raw) {
  if (raw === null || raw === undefined) return "";
  const trimmed = String(raw).trim();
  const plus = trimmed.startsWith("+");
  return (plus ? "+" : "") + trimmed.replace(/\D/g, "");
}

/**
 * True only for strings made entirely of digits and normal phone punctuation.
 * Guards the classifiers against a field that turned out to be an email or
 * other garbage, which digit-count alone would happily misclassify.
 */
export function isPhoneLikeString(raw) {
  if (raw === null || raw === undefined) return false;
  const trimmed = String(raw).trim();
  return trimmed.length > 0 && PHONE_FORMAT_CHARS.test(trimmed);
}

/** Strips +20 / 0020 / 20 down to the local 0-prefixed form. */
export function normalizeCountryCode(raw) {
  let d = cleanDigits(raw).replace(/^\+/, "");
  if (d.startsWith("0020")) d = d.slice(4);
  else if (d.startsWith("20") && d.length > 10) d = d.slice(2);
  if (!d.startsWith("0")) d = "0" + d;
  return d;
}

export function isMobile(raw) {
  if (!isPhoneLikeString(raw)) return false;
  const d = normalizeCountryCode(raw);
  return d.length === 11 && MOBILE_PREFIXES.includes(d.slice(0, 3));
}

export function isLandline(raw) {
  if (!isPhoneLikeString(raw)) return false;
  const d = normalizeCountryCode(raw);
  if (MOBILE_PREFIXES.includes(d.slice(0, 3))) return false;
  return LANDLINE_PREFIXES.some((code) => d.startsWith(code)) && d.length >= 8 && d.length <= 10;
}

/** Loose check for scanning misc fields (city/zip/company) for a stray number. */
export function looksLikePhoneAtAll(raw) {
  const d = cleanDigits(raw).replace(/^\+/, "");
  return /^\d+$/.test(d) && d.length >= 8 && d.length <= 13;
}

/** Returns the repaired 11-digit form of a mobile missing its leading zero. */
export function fixMissingLeadingZero(raw) {
  const d = cleanDigits(raw).replace(/^\+/, "");
  if (d.length === 10 && MOBILE_PREFIXES.includes(("0" + d).slice(0, 3))) return "0" + d;
  return null;
}

/**
 * Best-effort normalize to local 11-digit mobile format for Bosta.
 * Returns null when the input isn't phone-like at all — the caller should
 * read that as "leave this field alone", not as "empty phone".
 */
export function normalizeForBosta(raw) {
  if (!isPhoneLikeString(raw)) return null;
  const d = normalizeCountryCode(raw);
  return fixMissingLeadingZero(d) || d;
}

export function classify(raw) {
  if (isMobile(raw)) return "mobile";
  if (isLandline(raw)) return "landline";
  return "unknown";
}
