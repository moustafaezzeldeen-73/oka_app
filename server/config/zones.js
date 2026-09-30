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
 * uses in its src/domain/zones.js).
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
  { code: 'C', en: 'Cairo', ar: 'القاهرة', zone: 'metro',
    aliases: ['مدينة نصر', 'Nasr City', 'المعادي', 'Maadi', 'مصر الجديدة', 'Heliopolis', 'التجمع', 'New Cairo', 'Tagamoa', 'Fifth Settlement', 'شبرا', 'Shubra', 'المقطم', 'Mokattam', 'الزمالك', 'Zamalek', 'وسط البلد', 'عين شمس', 'Ain Shams', 'المرج', 'الشروق', 'El Shorouk', 'مدينتي', 'Madinaty', 'العاصمة الإدارية', 'دار السلام', 'الرحاب', 'Rehab'] },
  { code: 'GZ', en: 'Giza', ar: 'الجيزة', zone: 'metro',
    aliases: ['الهرم', 'Haram', 'فيصل', 'Faisal', 'الدقي', 'Dokki', 'المهندسين', 'Mohandessin', 'العجوزة', 'Agouza', 'إمبابة', 'Imbaba', 'بولاق الدكرور', 'حدائق الأهرام', 'Hadayek El Ahram'] },
  { code: 'SU', en: '6th of October', ar: '٦ أكتوبر', zone: 'metro',
    aliases: ['6 أكتوبر', 'السادس من أكتوبر', 'أكتوبر', 'October', 'الشيخ زايد', 'Sheikh Zayed', 'Zayed'] },
  { code: 'HU', en: 'Helwan', ar: 'حلوان', zone: 'metro',
    aliases: ['التبين', '15 مايو', 'May 15'] },
  { code: 'ALX', en: 'Alexandria', ar: 'الإسكندرية', zone: 'metro',
    aliases: ['اسكندرية', 'إسكندرية', 'Alex', 'سيدي بشر', 'Sidi Beshr', 'المنتزه', 'Montaza', 'سموحة', 'Smouha', 'العجمي', 'Agami', 'ميامي', 'Miami', 'محرم بك', 'برج العرب', 'Borg El Arab'] },
  { code: 'KB', en: 'Qalyubia', ar: 'القليوبية', zone: 'delta',
    aliases: ['Qaliubiya', 'Kalyubia', 'بنها', 'Banha', 'Benha', 'شبرا الخيمة', 'Shubra El Kheima', 'العبور', 'Obour'] },
  { code: 'DK', en: 'Dakahlia', ar: 'الدقهلية', zone: 'delta',
    aliases: ['المنصورة', 'Mansoura', 'Dakahlya'] },
  { code: 'DT', en: 'Damietta', ar: 'دمياط', zone: 'delta',
    aliases: ['رأس البر', 'Ras El Bar'] },
  { code: 'FYM', en: 'Faiyum', ar: 'الفيوم', zone: 'delta',
    aliases: ['Fayoum', 'Fayum'] },
  { code: 'IS', en: 'Ismailia', ar: 'الإسماعيلية', zone: 'delta',
    aliases: ['Ismailiya'] },
  { code: 'KFS', en: 'Kafr el-Sheikh', ar: 'كفر الشيخ', zone: 'delta',
    aliases: ['Kafr El Sheikh', 'Kafrelsheikh'] },
  { code: 'MNF', en: 'Monufia', ar: 'المنوفية', zone: 'delta',
    aliases: ['Menoufia', 'Menofia', 'شبين الكوم', 'Shebin'] },
  { code: 'PTS', en: 'Port Said', ar: 'بورسعيد', zone: 'delta',
    aliases: ['بور سعيد', 'Portsaid'] },
  { code: 'SUZ', en: 'Suez', ar: 'السويس', zone: 'delta',
    aliases: [] },
  { code: 'SHR', en: 'Al Sharqia', ar: 'الشرقية', zone: 'delta',
    aliases: ['Sharqia', 'Sharkia', 'الزقازيق', 'Zagazig', 'العاشر من رمضان', '10th of Ramadan'] },
  { code: 'BH', en: 'Beheira', ar: 'البحيرة', zone: 'delta',
    aliases: ['Behera', 'دمنهور', 'Damanhour'] },
  { code: 'GH', en: 'Gharbia', ar: 'الغربية', zone: 'delta',
    aliases: ['Gharbiya', 'طنطا', 'Tanta', 'المحلة', 'Mahalla'] },
  { code: 'ASN', en: 'Aswan', ar: 'أسوان', zone: 'far',
    aliases: [] },
  { code: 'AST', en: 'Asyut', ar: 'أسيوط', zone: 'far',
    aliases: ['Assiut', 'Assiout', 'صدفا'] },
  { code: 'BNS', en: 'Beni Suef', ar: 'بني سويف', zone: 'far',
    aliases: ['Bani Sweif', 'Beni Sweif'] },
  { code: 'LX', en: 'Luxor', ar: 'الأقصر', zone: 'far',
    aliases: [] },
  { code: 'MN', en: 'Minya', ar: 'المنيا', zone: 'far',
    aliases: ['Menia', 'Minia'] },
  { code: 'KN', en: 'Qena', ar: 'قنا', zone: 'far',
    aliases: ['Qina', 'Kena'] },
  { code: 'SHG', en: 'Sohag', ar: 'سوهاج', zone: 'far',
    aliases: ['Suhag'] },
  { code: 'MT', en: 'Matrouh', ar: 'مطروح', zone: 'far',
    aliases: ['Marsa Matrouh', 'الساحل الشمالي', 'North Coast', 'العلمين', 'Alamein'] },
  { code: 'WAD', en: 'New Valley', ar: 'الوادي الجديد', zone: 'far',
    aliases: ['الخارجة', 'Kharga'] },
  { code: 'SIN', en: 'North Sinai', ar: 'شمال سيناء', zone: 'far',
    aliases: ['العريش', 'Arish'] },
  { code: 'JS', en: 'South Sinai', ar: 'جنوب سيناء', zone: 'far',
    aliases: ['شرم الشيخ', 'Sharm', 'دهب', 'Dahab'] },
  { code: 'BA', en: 'Red Sea', ar: 'البحر الأحمر', zone: 'far',
    aliases: ['الغردقة', 'Hurghada', 'سفاجا', 'Safaga'] },
].map((p) => ({ ...p, ...ZONE_ETA[p.zone], fees: ZONE_FEES[p.zone] }));

const BY_CODE = new Map(PROVINCES.map((p) => [p.code, p]));

/**
 * Folds the spellings people actually type onto one form: case, Arabic
 * hamza/alef variants, taa marbuta vs haa, alef maqsura vs yaa, Arabic-Indic
 * digits, and a leading "ال" (so "قاهرة" matches "القاهرة").
 */
export function fold(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '') // harakat, tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)))
    .replace(/(^|\s)ال/g, '$1')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Every spelling → code, longest first so "شمال سيناء" wins over any shorter match. */
const MATCHERS = PROVINCES.flatMap((p) =>
  [p.en, p.ar, ...p.aliases].map((name) => ({ key: fold(name), code: p.code })),
)
  .filter((m) => m.key)
  .sort((a, b) => b.key.length - a.key.length);

/**
 * The governorate code for whatever the shopper wrote, or null — for
 * addresses saved before governorates were picked from a list.
 *
 * Tried in order of trust: an exact code, an exact name, then a name or
 * district appearing as whole words inside a longer line ("Nasr City, Cairo").
 */
export function resolveProvince(...texts) {
  for (const text of texts) {
    if (!text) continue;
    const raw = String(text).trim();
    if (BY_CODE.has(raw.toUpperCase())) return raw.toUpperCase();

    const f = fold(raw);
    if (!f) continue;
    const exact = MATCHERS.find((m) => m.key === f);
    if (exact) return exact.code;
    const padded = ` ${f} `;
    const inside = MATCHERS.find((m) => m.key.length > 2 && padded.includes(` ${m.key} `));
    if (inside) return inside.code;
  }
  return null;
}

export function provinceFor({ provinceCode, province, city } = {}) {
  if (provinceCode && BY_CODE.has(provinceCode)) return BY_CODE.get(provinceCode);
  const code = resolveProvince(province, city);
  return code ? BY_CODE.get(code) : null;
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
