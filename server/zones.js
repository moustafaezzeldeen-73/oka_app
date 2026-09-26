/**
 * Egypt's governorates as Shopify stores them (country EG, `provinceCode`),
 * with the delivery estimate for each courier zone.
 *
 * Addresses used to carry a free-text city and no governorate, so the app
 * quoted Cairo's price and "1–2 days" for every order in the country. Picking
 * a governorate from this list gives each address a zone the courier can
 * route and the app can quote honestly.
 *
 * Zones follow the courier's own grouping (the same table the warehouse app
 * uses in src/domain/zones.js).
 */

const ZONE_ETA = {
  metro: { minDays: 1, maxDays: 2 },
  delta: { minDays: 2, maxDays: 3 },
  far: { minDays: 3, maxDays: 5 },
};

/**
 * The store's shipping fees per zone, as Shopify charges them on the website:
 * `under` below FEE_TIER_THRESHOLD of products (after discounts), `over` at
 * or above it.
 *
 * Orders and quotes with an address get their fee from Shopify itself
 * (draftOrderCalculate's available shipping rates), so the app always charges
 * what the website does. This snapshot is only the estimate shown before an
 * address is known, and the fallback if Shopify returns no rate — update it
 * if the store's delivery profiles change.
 */
export const FEE_TIER_THRESHOLD = 300;
export const ZONE_FEES = {
  metro: { under: 60, over: 36 },
  delta: { under: 70, over: 46 },
  far: { under: 80, over: 56 },
};

export const PROVINCES = [
  { code: 'C', en: 'Cairo', ar: 'القاهرة', zone: 'metro' },
  { code: 'GZ', en: 'Giza', ar: 'الجيزة', zone: 'metro' },
  { code: 'SU', en: '6th of October', ar: '٦ أكتوبر', zone: 'metro' },
  { code: 'HU', en: 'Helwan', ar: 'حلوان', zone: 'metro' },
  { code: 'ALX', en: 'Alexandria', ar: 'الإسكندرية', zone: 'metro' },
  { code: 'KB', en: 'Qalyubia', ar: 'القليوبية', zone: 'delta' },
  { code: 'DK', en: 'Dakahlia', ar: 'الدقهلية', zone: 'delta' },
  { code: 'DT', en: 'Damietta', ar: 'دمياط', zone: 'delta' },
  { code: 'FYM', en: 'Faiyum', ar: 'الفيوم', zone: 'delta' },
  { code: 'IS', en: 'Ismailia', ar: 'الإسماعيلية', zone: 'delta' },
  { code: 'KFS', en: 'Kafr el-Sheikh', ar: 'كفر الشيخ', zone: 'delta' },
  { code: 'MNF', en: 'Monufia', ar: 'المنوفية', zone: 'delta' },
  { code: 'PTS', en: 'Port Said', ar: 'بورسعيد', zone: 'delta' },
  { code: 'SUZ', en: 'Suez', ar: 'السويس', zone: 'delta' },
  { code: 'SHR', en: 'Al Sharqia', ar: 'الشرقية', zone: 'delta' },
  { code: 'BH', en: 'Beheira', ar: 'البحيرة', zone: 'delta' },
  { code: 'GH', en: 'Gharbia', ar: 'الغربية', zone: 'delta' },
  { code: 'ASN', en: 'Aswan', ar: 'أسوان', zone: 'far' },
  { code: 'AST', en: 'Asyut', ar: 'أسيوط', zone: 'far' },
  { code: 'BNS', en: 'Beni Suef', ar: 'بني سويف', zone: 'far' },
  { code: 'LX', en: 'Luxor', ar: 'الأقصر', zone: 'far' },
  { code: 'MN', en: 'Minya', ar: 'المنيا', zone: 'far' },
  { code: 'KN', en: 'Qena', ar: 'قنا', zone: 'far' },
  { code: 'SHG', en: 'Sohag', ar: 'سوهاج', zone: 'far' },
  { code: 'MT', en: 'Matrouh', ar: 'مطروح', zone: 'far' },
  { code: 'WAD', en: 'New Valley', ar: 'الوادي الجديد', zone: 'far' },
  { code: 'SIN', en: 'North Sinai', ar: 'شمال سيناء', zone: 'far' },
  { code: 'JS', en: 'South Sinai', ar: 'جنوب سيناء', zone: 'far' },
  { code: 'BA', en: 'Red Sea', ar: 'البحر الأحمر', zone: 'far' },
].map((p) => ({ ...p, ...ZONE_ETA[p.zone], fees: ZONE_FEES[p.zone] }));

const BY_CODE = new Map(PROVINCES.map((p) => [p.code, p]));

/** Loose matching for addresses saved before governorates were picked. */
const fold = (s) =>
  String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي');

export function provinceFor({ provinceCode, province, city } = {}) {
  if (provinceCode && BY_CODE.has(provinceCode)) return BY_CODE.get(provinceCode);
  const hay = `${fold(province)} ${fold(city)}`;
  return (
    PROVINCES.find((p) => hay.includes(fold(p.en)) || hay.includes(fold(p.ar))) ?? null
  );
}

/** Delivery estimate for an address; unknown governorates get the widest window. */
export function etaFor(address) {
  const p = provinceFor(address);
  return p ? { minDays: p.minDays, maxDays: p.maxDays } : { ...ZONE_ETA.far };
}

/**
 * The store's fee for a basket going to an address, from the snapshot above.
 * An unknown governorate is quoted at the metro fee — the cheapest zone, so
 * an estimate never overstates.
 */
export function tableFee(merchandise, address) {
  const fees = provinceFor(address ?? {})?.fees ?? ZONE_FEES.metro;
  return merchandise >= FEE_TIER_THRESHOLD ? fees.over : fees.under;
}
