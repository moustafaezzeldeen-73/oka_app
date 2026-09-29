/**
 * Egypt's governorates as Shopify codes them, and every way a shopper is
 * likely to write one.
 *
 * Shopify prices shipping by zone, and a zone is a list of governorate codes —
 * but addresses arrive as free text: "القاهره", "Cairo", or just a district
 * ("مدينة نصر", "Sheikh Zayed"). This turns that text into the code Shopify
 * needs. Codes and English names are Shopify's own (see the delivery profile).
 */

export const PROVINCES = [
  { code: 'C', en: 'Cairo', ar: 'القاهرة',
    aliases: ['مدينة نصر', 'Nasr City', 'المعادي', 'Maadi', 'مصر الجديدة', 'Heliopolis',
      'التجمع', 'New Cairo', 'Tagamoa', 'Fifth Settlement', 'شبرا', 'Shubra', 'المقطم', 'Mokattam',
      'الزمالك', 'Zamalek', 'وسط البلد', 'عين شمس', 'Ain Shams', 'المرج', 'الشروق',
      'El Shorouk', 'مدينتي', 'Madinaty', 'العاصمة الإدارية', 'دار السلام', 'الرحاب', 'Rehab'] },
  { code: 'GZ', en: 'Giza', ar: 'الجيزة',
    aliases: ['الهرم', 'Haram', 'فيصل', 'Faisal', 'الدقي', 'Dokki', 'المهندسين', 'Mohandessin',
      'العجوزة', 'Agouza', 'إمبابة', 'Imbaba', 'بولاق الدكرور', 'حدائق الأهرام', 'Hadayek El Ahram'] },
  { code: 'SU', en: '6th of October', ar: 'السادس من أكتوبر',
    aliases: ['6 أكتوبر', '٦ أكتوبر', 'أكتوبر', 'October', 'الشيخ زايد', 'Sheikh Zayed', 'Zayed'] },
  { code: 'HU', en: 'Helwan', ar: 'حلوان', aliases: ['التبين', '15 مايو', 'May 15'] },
  { code: 'ALX', en: 'Alexandria', ar: 'الإسكندرية',
    aliases: ['اسكندرية', 'إسكندرية', 'Alex', 'سيدي بشر', 'Sidi Beshr', 'المنتزه', 'Montaza',
      'سموحة', 'Smouha', 'العجمي', 'Agami', 'ميامي', 'Miami', 'محرم بك', 'برج العرب', 'Borg El Arab'] },
  { code: 'DK', en: 'Dakahlia', ar: 'الدقهلية', aliases: ['المنصورة', 'Mansoura', 'Dakahlya'] },
  { code: 'DT', en: 'Damietta', ar: 'دمياط', aliases: ['رأس البر', 'Ras El Bar'] },
  { code: 'FYM', en: 'Faiyum', ar: 'الفيوم', aliases: ['Fayoum', 'Fayum'] },
  { code: 'IS', en: 'Ismailia', ar: 'الإسماعيلية', aliases: ['Ismailiya'] },
  { code: 'KFS', en: 'Kafr el-Sheikh', ar: 'كفر الشيخ', aliases: ['Kafr El Sheikh', 'Kafrelsheikh'] },
  { code: 'MNF', en: 'Monufia', ar: 'المنوفية', aliases: ['Menoufia', 'Menofia', 'شبين الكوم', 'Shebin'] },
  { code: 'PTS', en: 'Port Said', ar: 'بورسعيد', aliases: ['بور سعيد', 'Portsaid'] },
  { code: 'KB', en: 'Qalyubia', ar: 'القليوبية',
    aliases: ['Qaliubiya', 'Kalyubia', 'بنها', 'Banha', 'Benha', 'شبرا الخيمة', 'Shubra El Kheima', 'العبور', 'Obour'] },
  { code: 'SUZ', en: 'Suez', ar: 'السويس', aliases: [] },
  { code: 'SHR', en: 'Al Sharqia', ar: 'الشرقية', aliases: ['Sharqia', 'Sharkia', 'الزقازيق', 'Zagazig', 'العاشر من رمضان', '10th of Ramadan'] },
  { code: 'BH', en: 'Beheira', ar: 'البحيرة', aliases: ['Behera', 'دمنهور', 'Damanhour'] },
  { code: 'GH', en: 'Gharbia', ar: 'الغربية', aliases: ['Gharbiya', 'طنطا', 'Tanta', 'المحلة', 'Mahalla'] },
  { code: 'ASN', en: 'Aswan', ar: 'أسوان', aliases: [] },
  { code: 'BNS', en: 'Beni Suef', ar: 'بني سويف', aliases: ['Bani Sweif', 'Beni Sweif'] },
  { code: 'LX', en: 'Luxor', ar: 'الأقصر', aliases: [] },
  { code: 'MT', en: 'Matrouh', ar: 'مطروح', aliases: ['Marsa Matrouh', 'الساحل الشمالي', 'North Coast', 'العلمين', 'Alamein'] },
  { code: 'WAD', en: 'New Valley', ar: 'الوادي الجديد', aliases: ['الخارجة', 'Kharga'] },
  { code: 'SIN', en: 'North Sinai', ar: 'شمال سيناء', aliases: ['العريش', 'Arish'] },
  { code: 'BA', en: 'Red Sea', ar: 'البحر الأحمر', aliases: ['الغردقة', 'Hurghada', 'سفاجا', 'Safaga'] },
  { code: 'JS', en: 'South Sinai', ar: 'جنوب سيناء', aliases: ['شرم الشيخ', 'Sharm', 'دهب', 'Dahab'] },
  { code: 'AST', en: 'Asyut', ar: 'أسيوط', aliases: ['Assiut', 'Assiout', 'صدفا'] },
  { code: 'MN', en: 'Minya', ar: 'المنيا', aliases: ['Menia', 'Minia'] },
  { code: 'KN', en: 'Qena', ar: 'قنا', aliases: ['Qina', 'Kena'] },
  { code: 'SHG', en: 'Sohag', ar: 'سوهاج', aliases: ['Suhag'] },
];

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
 * The governorate code for whatever the shopper wrote, or null.
 *
 * Tried in order of trust: an exact code, an exact name, then a name or
 * district appearing as whole words inside a longer line ("Nasr City, Cairo").
 */
export function resolveProvince(...texts) {
  for (const text of texts) {
    if (!text) continue;
    const raw = String(text).trim();
    const byCode = PROVINCES.find((p) => p.code === raw.toUpperCase());
    if (byCode) return byCode.code;

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
