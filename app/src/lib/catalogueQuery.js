/**
 * Searching, sorting and filtering the catalogue on the device.
 *
 * The whole catalogue (tens of products) is already in memory, so this is
 * instant and works offline. Arabic is folded the way people type it — alef
 * forms, taa marbuta, alef maqsura, diacritics — so "شيشه" finds "شيشة".
 */

export function fold(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Products matching every word of `query`, title matches first. */
export function searchProducts(products, query) {
  const words = fold(query).split(' ').filter(Boolean);
  if (!words.length) return [];
  const scored = [];
  for (const p of products) {
    const title = fold(`${p.titleEn} ${p.titleAr}`);
    const body = fold(`${p.descEn} ${p.descAr} ${p.cat}`);
    if (!words.every((w) => title.includes(w) || body.includes(w))) continue;
    const score = words.reduce((a, w) => a + (title.includes(w) ? 2 : 1), 0);
    scored.push([score, p]);
  }
  return scored.sort((a, b) => b[0] - a[0]).map(([, p]) => p);
}

export const SORTS = [
  { id: 'featured', en: 'Featured', ar: 'المميز' },
  { id: 'priceAsc', en: 'Price: low to high', ar: 'السعر: من الأقل' },
  { id: 'priceDesc', en: 'Price: high to low', ar: 'السعر: من الأعلى' },
];

export function sortProducts(list, sortBy) {
  if (sortBy === 'priceAsc') return [...list].sort((a, b) => a.price - b.price);
  if (sortBy === 'priceDesc') return [...list].sort((a, b) => b.price - a.price);
  return list;
}

/** `filters` is { inStock, onSale, maxPrice }. */
export function filterProducts(list, filters = {}) {
  return list.filter(
    (p) =>
      (!filters.inStock || (p.stock !== 0 && p.available !== false)) &&
      (!filters.onSale || Boolean(p.compareAtPrice)) &&
      (!filters.maxPrice || p.price <= filters.maxPrice),
  );
}
