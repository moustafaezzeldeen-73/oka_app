/**
 * OKA Egypt shipping zones, province codes, and the Shopify -> Bosta city map.
 *
 * The fee table is a snapshot confirmed live against the OKA store in June
 * 2026. Shopify's `deliveryProfiles` query is the real source of truth — the
 * app exposes /api/reference/shipping-zones to re-pull it, and this table is
 * the offline fallback used when that call isn't available.
 *
 * The fee tier is chosen on the order's NET amount (line items only,
 * excluding shipping and tax). Comparing against the order total would be
 * self-referential, since the total already contains the fee being decided.
 */

export const FEE_TIER_THRESHOLD_EGP = 300;

/**
 * `aliases` carry the Arabic and loose-English spellings that show up in the
 * storefront's free-text city field, which is what makes city/province
 * mismatch detection possible at all.
 *
 * `bostaCity` is the value Bosta's own city list expects. Bosta only models
 * a handful of metro areas as distinct cities and buckets the rest by
 * governorate, so several provinces map onto the same Bosta city.
 */
export const PROVINCES = [
  // --- Zone: Cairo and Alexandria — 36 / 60 ---------------------------------
  { name: "Cairo", code: "C", zone: "Cairo and Alexandria", feeHigh: 36, feeLow: 60, bostaCity: "Cairo",
    aliases: ["cairo", "القاهرة", "القاهره", "masr", "مصر الجديدة", "new cairo", "القاهرة الجديدة", "nasr city", "مدينة نصر", "maadi", "المعادي", "heliopolis", "مصر الجديده", "shubra", "شبرا"] },
  { name: "Giza", code: "GZ", zone: "Cairo and Alexandria", feeHigh: 36, feeLow: 60, bostaCity: "Giza",
    aliases: ["giza", "الجيزة", "الجيزه", "dokki", "الدقي", "mohandessin", "المهندسين", "haram", "الهرم", "faisal", "فيصل", "sheikh zayed", "الشيخ زايد", "shiekh zayed"] },
  { name: "6th of October", code: "SU", zone: "Cairo and Alexandria", feeHigh: 36, feeLow: 60, bostaCity: "Giza",
    aliases: ["6th of october", "6 october", "october city", "6 أكتوبر", "السادس من أكتوبر", "اكتوبر", "october"] },
  { name: "Helwan", code: "HU", zone: "Cairo and Alexandria", feeHigh: 36, feeLow: 60, bostaCity: "Cairo",
    aliases: ["helwan", "حلوان"] },
  { name: "Alexandria", code: "ALX", zone: "Cairo and Alexandria", feeHigh: 36, feeLow: 60, bostaCity: "Alexandria",
    aliases: ["alexandria", "alex", "الاسكندرية", "الإسكندرية", "الاسكندريه", "اسكندرية", "اسكندريه"] },

  // --- Zone: Delta and canal — 46 / 70 --------------------------------------
  { name: "Dakahlia", code: "DK", zone: "Delta and canal", feeHigh: 46, feeLow: 70, bostaCity: "Dakahlia",
    aliases: ["dakahlia", "الدقهلية", "الدقهليه", "mansoura", "المنصورة", "المنصوره"] },
  { name: "Damietta", code: "DT", zone: "Delta and canal", feeHigh: 46, feeLow: 70, bostaCity: "Damietta",
    aliases: ["damietta", "دمياط"] },
  { name: "Faiyum", code: "FYM", zone: "Delta and canal", feeHigh: 46, feeLow: 70, bostaCity: "Fayoum",
    aliases: ["faiyum", "fayoum", "fayyum", "الفيوم"] },
  { name: "Ismailia", code: "IS", zone: "Delta and canal", feeHigh: 46, feeLow: 70, bostaCity: "Ismailia",
    aliases: ["ismailia", "الإسماعيلية", "الاسماعيلية", "الاسماعيليه"] },
  { name: "Kafr el-Sheikh", code: "KFS", zone: "Delta and canal", feeHigh: 46, feeLow: 70, bostaCity: "Kafr Alsheikh",
    aliases: ["kafr el-sheikh", "kafr el sheikh", "kafr alsheikh", "كفر الشيخ"] },
  { name: "Monufia", code: "MNF", zone: "Delta and canal", feeHigh: 46, feeLow: 70, bostaCity: "Menofia",
    aliases: ["monufia", "menofia", "menoufia", "المنوفية", "المنوفيه", "shebin", "شبين الكوم"] },
  { name: "Port Said", code: "PTS", zone: "Delta and canal", feeHigh: 46, feeLow: 70, bostaCity: "Port Said",
    aliases: ["port said", "portsaid", "بورسعيد", "بور سعيد"] },
  { name: "Qalyubia", code: "KB", zone: "Delta and canal", feeHigh: 46, feeLow: 70, bostaCity: "Qalyubia",
    aliases: ["qalyubia", "qaliobia", "kalyoubia", "القليوبية", "القليوبيه", "banha", "بنها", "shubra el kheima", "شبرا الخيمة"] },
  { name: "Suez", code: "SUZ", zone: "Delta and canal", feeHigh: 46, feeLow: 70, bostaCity: "Suez",
    aliases: ["suez", "السويس"] },

  // --- Zone: Delta and canal 2 — 46 / 70 ------------------------------------
  { name: "Al Sharqia", code: "SHR", zone: "Delta and canal 2", feeHigh: 46, feeLow: 70, bostaCity: "Sharqia",
    aliases: ["al sharqia", "sharqia", "sharkia", "الشرقية", "الشرقيه", "zagazig", "الزقازيق"] },
  { name: "Beheira", code: "BH", zone: "Delta and canal 2", feeHigh: 46, feeLow: 70, bostaCity: "Beheira",
    aliases: ["beheira", "behera", "البحيرة", "البحيره", "damanhur", "دمنهور"] },
  { name: "Gharbia", code: "GH", zone: "Delta and canal 2", feeHigh: 46, feeLow: 70, bostaCity: "Gharbia",
    aliases: ["gharbia", "الغربية", "الغربيه", "tanta", "طنطا"] },

  // --- Zone: North Coast / Sinai / Red Sea / Upper Egypt — 56 / 80 ----------
  { name: "Aswan", code: "ASN", zone: "North Coast/Sinai/Red Sea/Upper Egypt", feeHigh: 56, feeLow: 80, bostaCity: "Aswan",
    aliases: ["aswan", "أسوان", "اسوان"] },
  { name: "Beni Suef", code: "BNS", zone: "North Coast/Sinai/Red Sea/Upper Egypt", feeHigh: 56, feeLow: 80, bostaCity: "Beni Suef",
    aliases: ["beni suef", "bani sweif", "بني سويف"] },
  { name: "Luxor", code: "LX", zone: "North Coast/Sinai/Red Sea/Upper Egypt", feeHigh: 56, feeLow: 80, bostaCity: "Luxor",
    aliases: ["luxor", "الأقصر", "الاقصر"] },
  { name: "Matrouh", code: "MT", zone: "North Coast/Sinai/Red Sea/Upper Egypt", feeHigh: 56, feeLow: 80, bostaCity: "Marsa Matrouh",
    aliases: ["matrouh", "marsa matrouh", "مطروح", "مرسى مطروح", "north coast", "الساحل الشمالي", "marassi", "sidi abdel rahman"] },
  { name: "New Valley", code: "WAD", zone: "North Coast/Sinai/Red Sea/Upper Egypt", feeHigh: 56, feeLow: 80, bostaCity: "New Valley",
    aliases: ["new valley", "الوادي الجديد", "kharga", "الخارجة"] },
  { name: "North Sinai", code: "SIN", zone: "North Coast/Sinai/Red Sea/Upper Egypt", feeHigh: 56, feeLow: 80, bostaCity: "North Sinai",
    aliases: ["north sinai", "شمال سيناء", "arish", "العريش"] },
  { name: "Red Sea", code: "BA", zone: "North Coast/Sinai/Red Sea/Upper Egypt", feeHigh: 56, feeLow: 80, bostaCity: "Red Sea",
    aliases: ["red sea", "البحر الأحمر", "البحر الاحمر", "hurghada", "الغردقة", "el gouna", "الجونة", "safaga", "سفاجا"] },
  { name: "South Sinai", code: "JS", zone: "North Coast/Sinai/Red Sea/Upper Egypt", feeHigh: 56, feeLow: 80, bostaCity: "South Sinai",
    aliases: ["south sinai", "جنوب سيناء", "sharm", "شرم الشيخ", "dahab", "دهب"] },

  // --- Zone: Upper Egypt 2 — 56 / 80 ----------------------------------------
  { name: "Asyut", code: "AST", zone: "Upper Egypt 2", feeHigh: 56, feeLow: 80, bostaCity: "Assiut",
    aliases: ["asyut", "assiut", "أسيوط", "اسيوط"] },
  { name: "Minya", code: "MN", zone: "Upper Egypt 2", feeHigh: 56, feeLow: 80, bostaCity: "Menya",
    aliases: ["minya", "menya", "el minya", "المنيا"] },
  { name: "Qena", code: "KN", zone: "Upper Egypt 2", feeHigh: 56, feeLow: 80, bostaCity: "Qena",
    aliases: ["qena", "قنا"] },
  { name: "Sohag", code: "SHG", zone: "Upper Egypt 2", feeHigh: 56, feeLow: 80, bostaCity: "Sohag",
    aliases: ["sohag", "سوهاج"] },
];

const BY_CODE = new Map(PROVINCES.map((p) => [p.code.toLowerCase(), p]));

// Arabic text normalization: strip diacritics/tatweel and fold the letter
// variants Egyptians type interchangeably (أ/إ/آ -> ا, ة -> ه, ى -> ي), so
// "الإسكندرية" and "الاسكندريه" both land on the same alias.
function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ");
}

const NORMALIZED_ALIASES = PROVINCES.flatMap((p) =>
  [p.name, ...p.aliases].map((alias) => ({ alias: normalizeText(alias), province: p })),
  // Longest alias first, so "6th of october" wins over the "october" substring
  // and "north sinai" wins over "sinai".
).sort((a, b) => b.alias.length - a.alias.length);

export function provinceByCode(code) {
  return BY_CODE.get(String(code ?? "").toLowerCase()) || null;
}

/**
 * Resolve free text (a Shopify city, province, or province code) to a
 * province. Tries exact code, then exact alias, then substring — returning
 * null rather than a bad guess when nothing matches.
 */
export function resolveProvince(...candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const direct = provinceByCode(candidate);
    if (direct) return direct;

    const text = normalizeText(candidate);
    if (!text) continue;

    const exact = NORMALIZED_ALIASES.find((entry) => entry.alias === text);
    if (exact) return exact.province;
  }

  // Second pass: substring, only after every candidate has failed an exact
  // match, so "Cairo" in an address line can't outrank a real province field.
  for (const candidate of candidates) {
    if (!candidate) continue;
    const text = normalizeText(candidate);
    if (!text) continue;
    const partial = NORMALIZED_ALIASES.find((entry) => text.includes(entry.alias));
    if (partial) return partial.province;
  }

  return null;
}

/**
 * The fee OKA should be charging for this destination at this basket size.
 * `netAmount` must exclude shipping — see the module note.
 */
export function shippingFeeFor(province, netAmount) {
  const resolved = typeof province === "string" ? resolveProvince(province) : province;
  if (!resolved) return null;
  return Number(netAmount) >= FEE_TIER_THRESHOLD_EGP ? resolved.feeHigh : resolved.feeLow;
}

/** The Bosta city name to send in `dropOffAddress.city`. */
export function bostaCityFor(province) {
  const resolved = typeof province === "string" ? resolveProvince(province) : province;
  return resolved ? resolved.bostaCity : null;
}
