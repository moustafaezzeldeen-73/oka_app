/*
 * Commerce-logic tests for the OKA test theme.
 *   node qa/tests/commerce/commerce.test.js            (summary + failures)
 *   node qa/tests/commerce/commerce.test.js --verbose  (every case)
 *
 * "Expected" money values come from the LIVE store's delivery profile
 * (read-only Admin API, 2026-10-14), captured in SHOPIFY_RATES below, and from
 * the server's reference logic in server/ (config/zones.js, services/jobs.js).
 * "Actual" values come from the theme's own functions (assets/oka.js, run in a
 * vm sandbox) or from a line-for-line transcription of oka-screens.js /
 * Liquid where the code is not reachable as a function (marked TRANSCRIBED).
 */
'use strict';
const { load } = require('./sandbox');

const VERBOSE = process.argv.includes('--verbose');
const results = [];
function check(group, name, expected, actual, note = '') {
  const pass = JSON.stringify(expected) === JSON.stringify(actual);
  results.push({ group, name, pass, expected, actual, note });
}

/* ── Live Shopify delivery profile "General profile" (deliveryProfiles query, 2026-10-14) ── */
// Every method definition and its TOTAL_PRICE conditions, verbatim.
const SHOPIFY_RATES = {
  'Cairo and Alexandria': { provinces: ['SU', 'ALX', 'C', 'GZ', 'HU'], rates: [{ price: 36, min: 300, max: null }, { price: 60, min: 0, max: 299 }] },
  'Delta and canal': { provinces: ['DK', 'DT', 'FYM', 'IS', 'KFS', 'MNF', 'PTS', 'KB', 'SUZ'], rates: [{ price: 46, min: 300, max: null }, { price: 70, min: 0, max: 299 }] },
  'Delta and canal 2': { provinces: ['SHR', 'BH', 'GH'], rates: [{ price: 46, min: 300, max: null }, { price: 70, min: 0, max: 299 }] },
  'North Coast ,Sinai ,Red sea, upper egypt': { provinces: ['ASN', 'BNS', 'LX', 'MT', 'WAD', 'SIN', 'BA', 'JS'], rates: [{ price: 56, min: 300, max: null }, { price: 80, min: 0, max: 300 }] },
  'upper egypt 2': { provinces: ['AST', 'MN', 'KN', 'SHG'], rates: [{ price: 80, min: 0, max: 299 }, { price: 56, min: 300, max: null }] },
};
const zoneOfCode = (code) => Object.entries(SHOPIFY_RATES).find(([, z]) => z.provinces.includes(code));
/** The rates Shopify checkout offers for `code` at `value` (sorted cheapest first); [] = "no shipping available". */
function shopifyRates(code, value) {
  const z = zoneOfCode(code);
  if (!z) return [];
  return z[1].rates.filter((r) => value >= r.min && (r.max == null || value <= r.max)).map((r) => r.price).sort((a, b) => a - b);
}
const ZONE_CLASS = { 'Cairo and Alexandria': 'metro', 'Delta and canal': 'delta', 'Delta and canal 2': 'delta', 'North Coast ,Sinai ,Red sea, upper egypt': 'far', 'upper egypt 2': 'far' };

async function main() {
  const ar = load({ lang: 'ar' }).Oka;
  const en = load({ lang: 'en' }).Oka;

  /* 1 ── Governorate code → zone, all 29 Shopify EG province codes (27 governorates + SU/HU legacy) ── */
  const allCodes = Object.values(SHOPIFY_RATES).flatMap((z) => z.provinces);
  check('zones', 'Shopify EG zone list has 29 province codes', 29, allCodes.length);
  check('zones', 'theme PROVINCES has 29 entries', 29, ar.PROVINCES.length);
  for (const code of allCodes) {
    const [zname] = zoneOfCode(code);
    check('zones', `code ${code} → zone`, ZONE_CLASS[zname], ar.provinceOf({ provinceCode: code })?.zone ?? null);
    check('zones', `code ${code.toLowerCase()} (lower-case) → zone`, ZONE_CLASS[zname], ar.provinceOf({ provinceCode: code.toLowerCase() })?.zone ?? null);
  }

  /* 2 ── Free-text governorate / city (addresses without provinceCode, e.g. old addresses or GPS fill) ── */
  // [province, city, expected Shopify code]
  const TEXT = [
    ['Cairo', '', 'C'], ['القاهرة', '', 'C'], ['القاهره', '', 'C'], ['قاهرة', '', 'C'], ['Al Qahirah', '', 'C'], ['  CAIRO  ', '', 'C'],
    ['القَاهِرَة', '', 'C'], ['القاهـرة', '', 'C'], ['', 'Nasr City', 'C'], ['', 'مدينة نصر', 'C'], ['', 'New Cairo', 'C'], ['', 'Maadi', 'C'],
    ['6th of October', '', 'SU'], ['٦ أكتوبر', '', 'SU'], ['6 أكتوبر', '', 'SU'], ['6th October', '', 'SU'], ['October', '', 'SU'], ['', 'Sheikh Zayed', 'SU'],
    ['Giza', '', 'GZ'], ['الجيزة', '', 'GZ'], ['El Giza', '', 'GZ'], ['جيزة', '', 'GZ'], ['', 'Haram', 'GZ'],
    ['Helwan', '', 'HU'], ['حلوان', '', 'HU'],
    ['Alexandria', '', 'ALX'], ['الإسكندرية', '', 'ALX'], ['الاسكندريه', '', 'ALX'], ['اسكندرية', '', 'ALX'], ['Alex', '', 'ALX'], ['Al Iskandariyah', '', 'ALX'],
    ['Qalyubia', '', 'KB'], ['Qaliubiya', '', 'KB'], ['القليوبية', '', 'KB'], ['', 'القناطر الخيرية', 'KB'], ['', 'Banha', 'KB'],
    ['Dakahlia', '', 'DK'], ['الدقهلية', '', 'DK'], ['', 'Mansoura', 'DK'],
    ['Damietta', '', 'DT'], ['دمياط', '', 'DT'],
    ['Faiyum', '', 'FYM'], ['Fayoum', '', 'FYM'], ['الفيوم', '', 'FYM'],
    ['Ismailia', '', 'IS'], ['الإسماعيلية', '', 'IS'],
    ['Kafr el-Sheikh', '', 'KFS'], ['Kafr El Sheikh', '', 'KFS'], ['كفر الشيخ', '', 'KFS'],
    ['Monufia', '', 'MNF'], ['Menoufia', '', 'MNF'], ['المنوفية', '', 'MNF'],
    ['Port Said', '', 'PTS'], ['Portsaid', '', 'PTS'], ['بورسعيد', '', 'PTS'], ['بور سعيد', '', 'PTS'],
    ['Suez', '', 'SUZ'], ['السويس', '', 'SUZ'],
    ['Al Sharqia', '', 'SHR'], ['Sharqia', '', 'SHR'], ['Sharkia', '', 'SHR'], ['الشرقية', '', 'SHR'], ['Sharqia', 'Minya al Qamh', 'SHR'], ['', 'Zagazig', 'SHR'],
    ['Beheira', '', 'BH'], ['البحيرة', '', 'BH'], ['Beheira', 'Alexandria Desert Road', 'BH'],
    ['Gharbia', '', 'GH'], ['الغربية', '', 'GH'], ['', 'Tanta', 'GH'],
    ['Aswan', '', 'ASN'], ['أسوان', '', 'ASN'], ['اسوان', '', 'ASN'],
    ['Asyut', '', 'AST'], ['Assiut', '', 'AST'], ['أسيوط', '', 'AST'],
    ['Beni Suef', '', 'BNS'], ['Bani Sweif', '', 'BNS'], ['بني سويف', '', 'BNS'],
    ['Luxor', '', 'LX'], ['الأقصر', '', 'LX'], ['الاقصر', '', 'LX'],
    ['Minya', '', 'MN'], ['Minia', '', 'MN'], ['المنيا', '', 'MN'],
    ['Qena', '', 'KN'], ['قنا', '', 'KN'],
    ['Sohag', '', 'SHG'], ['سوهاج', '', 'SHG'],
    ['Matrouh', '', 'MT'], ['Marsa Matruh', '', 'MT'], ['مطروح', '', 'MT'], ['', 'North Coast', 'MT'], ['', 'Alamein', 'MT'],
    ['New Valley', '', 'WAD'], ['الوادي الجديد', '', 'WAD'],
    ['North Sinai', '', 'SIN'], ['شمال سيناء', '', 'SIN'], ['شمال سينا', '', 'SIN'], ['', 'Arish', 'SIN'],
    ['South Sinai', '', 'JS'], ['جنوب سيناء', '', 'JS'], ['', 'Sharm El Sheikh', 'JS'],
    ['Red Sea', '', 'BA'], ['البحر الأحمر', '', 'BA'], ['البحر الاحمر', '', 'BA'], ['', 'Hurghada', 'BA'], ['', 'الغردقة', 'BA'],
  ];
  for (const [province, city, code] of TEXT) {
    const want = ZONE_CLASS[zoneOfCode(code)[0]];
    const got = ar.provinceOf({ province, city });
    const fee = ar.shippingFor(200, { province, city });
    check('text-zones', `"${province}" / "${city}" → ${code} (${want})`, want, got?.zone ?? 'UNKNOWN→metro',
      got && got.code !== code ? `matched ${got.code}` : '');
    check('text-fees', `fee @200 for "${province}" / "${city}" (Shopify ${shopifyRates(code, 200)[0]})`, shopifyRates(code, 200)[0], fee);
  }
  // Unknown / empty / guest
  for (const addr of [null, {}, { province: '', city: '' }, { province: 'Atlantis' }, { provinceCode: 'XX' }]) {
    check('unknown', `unknown address ${JSON.stringify(addr)} → fee shown @200`, 'estimate flagged (zone unknown)', `EGP ${ar.shippingFor(200, addr)} as if metro (no flag)`,
      'Shopify charges 60/70/80 depending on the real governorate');
  }

  /* 3 ── Threshold matrix: theme fee vs Shopify's offered rates, every province, both sides of 300 ── */
  const VALUES = [0, 1, 150, 298, 299, 299.01, 299.5, 299.99, 300, 300.01, 301, 1000, 100000];
  for (const code of allCodes) {
    for (const v of VALUES) {
      const theme = ar.shippingFor(v, { provinceCode: code });
      const offered = shopifyRates(code, v);
      const want = offered.length ? offered[0] : 'NO RATE (checkout blocked)';
      check('threshold', `${code} merch=${v}: Shopify offers [${offered.join(',')}]`, want, theme,
        offered.length > 1 ? `Shopify offers ${offered.length} rates — buyer can pick ${offered[offered.length - 1]}` : '');
    }
  }

  /* 4 ── Cart totals from cart.js (cents) ── */
  const cartOf = (orig, total, extra = {}) => ({ original_total_price: orig, total_price: total, item_count: 1, items: [], ...extra });
  const T = (c) => ar.cartTotals(c);
  check('totals', 'cents→EGP 30000 → 300', { subtotal: 300, discount: 0, merch: 300 }, T(cartOf(30000, 30000)));
  check('totals', 'cents→EGP 29999 → 299.99', 299.99, T(cartOf(29999, 29999)).merch);
  check('totals', 'tong-free BXGY: 31800 orig / 28700 after → discount 31', { subtotal: 318, discount: 31, merch: 287 }, T(cartOf(31800, 28700)));
  check('totals', 'null cart → zeros', { subtotal: 0, discount: 0, merch: 0 }, T(null));
  check('totals', 'float: (10+20)/100 style sums exact in cents', 0.3, T(cartOf(30, 30)).merch);
  {
    const m = T(cartOf(29999, 29999)).merch;
    const fee = ar.shippingFor(m, { provinceCode: 'C' });
    check('totals', 'merch 299.99 Cairo: cart shows subtotal (rounded)', 'EGP 300', en.fmtPrice(m), 'shows 300 next to the under-300 fee');
    check('totals', 'merch 299.99 Cairo: fee shown vs Shopify', 'NO RATE (checkout blocked)', fee);
    check('totals', 'merch 299.99 Cairo: bar text', 'Add 1 EGP more and shipping drops to EGP 36', en.shipBar(m, { provinceCode: 'C' }).text);
  }
  // row rounding: do the rounded rows add up to the rounded total?
  let rowMismatch = null;
  for (let sub = 10000; sub <= 40000 && !rowMismatch; sub += 7) {
    for (const disc of [5, 50, 149, 1495, 2551]) {
      const t = T(cartOf(sub, sub - disc));
      const fee = ar.shippingFor(t.merch, { provinceCode: 'C' });
      const r = (n) => Math.round(n);
      if (r(t.subtotal) - r(t.discount) + fee !== r(t.merch + fee)) { rowMismatch = { ...t, fee, rows: [r(t.subtotal), -r(t.discount), fee], total: r(t.merch + fee) }; break; }
    }
  }
  check('totals', 'rounded rows (subtotal − discount + shipping) add up to rounded total', null, rowMismatch,
    'only possible with non-integer prices/discounts');

  // PDP fee basis (TRANSCRIBED oka-screens.js:495-499 — sub = cartTotals().subtotal + price*qty)
  {
    const c = cartOf(31800, 28700); // hookah 189 + 2 bowls 98 + tongs 31 free
    const pdpSub = T(c).subtotal + 10 * 1; // viewing a 10 EGP item, qty 1
    const cartMerch = T(c).merch + 10;
    check('pdp', 'PDP fee for 10 EGP add-on, tong-free cart (Cairo)', ar.shippingFor(cartMerch, { provinceCode: 'C' }), ar.shippingFor(pdpSub, { provinceCode: 'C' }),
      `PDP uses pre-discount subtotal ${pdpSub}; cart/checkout use merch ${cartMerch}`);
  }

  /* 5 ── Guest cart uses no address (metro) — what each governorate is shown vs charged ── */
  for (const code of allCodes) {
    for (const merch of [200, 299, 300]) {
      const shown = ar.shippingFor(merch); // guest: selectedAddress() === null
      const charged = shopifyRates(code, merch)[0] ?? 'NO RATE';
      check('guest', `guest in ${code}, merch ${merch}: cart shows vs checkout charges`, charged, shown);
    }
  }

  /* 6 ── Card −/+ steppers against a fake Cart AJAX API ── */
  {
    const server = { items: new Map(), fail: new Set() };
    const cartJson = () => {
      const items = [...server.items].filter(([, q]) => q > 0).map(([vid, q]) => ({ key: `${vid}:k`, variant_id: Number(vid), quantity: q, handle: `h${vid}` }));
      return { token: 't', item_count: items.reduce((a, i) => a + i.quantity, 0), items, original_total_price: 0, total_price: 0, discount_codes: [] };
    };
    const cartApi = async (url, body) => {
      if (url === '/cart.js') return { status: 200, json: cartJson() };
      if (url === '/cart/add.js') {
        if (body.items.some((i) => server.fail.has(String(i.id)))) return { status: 422, json: { description: 'sold out' } };
        body.items.forEach((i) => server.items.set(String(i.id), (server.items.get(String(i.id)) || 0) + i.quantity));
        return { status: 200, json: {} };
      }
      if (url === '/cart/change.js') { server.items.set(String(body.id).split(':')[0], body.quantity); return { status: 200, json: cartJson() }; }
      return { status: 404, json: {} };
    };
    const tabA = load({ lang: 'ar', cartApi });
    const tabB = load({ lang: 'ar', cartApi });
    await tabA.Oka.getCart(true); await tabB.Oka.getCart(true);
    const click = (tab, vid, d) => {
      const cq = { dataset: { cq: String(d) }, closest: () => ({ dataset: { cqVariant: vid } }) };
      const ev = { target: { closest: (s) => (s === '[data-cq]' ? cq : null) }, preventDefault() {}, stopPropagation() {} };
      tab.sandbox.document.dispatchEvent(Object.assign(ev, { type: 'click' }));
    };
    await tabA.Oka.addToCart('111', 1, { silent: true });
    for (let i = 0; i < 3; i++) click(tabA, '111', +1); // three fast taps
    await new Promise((r) => setTimeout(r, 50));
    check('steppers', '1 + three fast "+" taps → cart qty', 4, server.items.get('111'));
    check('steppers', 'tab A cartQtyOf after taps', 4, tabA.Oka.cartQtyOf('111'));
    check('steppers', 'tab B (other tab, no reload) cartQtyOf', 4, tabB.Oka.cartQtyOf('111'), 'no storage/focus/visibility listener refreshes cartState');
    for (let i = 0; i < 6; i++) click(tabA, '111', -1);
    await new Promise((r) => setTimeout(r, 50));
    check('steppers', 'six "−" taps from 4 never go below 0', 0, server.items.get('111') || 0);
    // bundle: one sold-out variant
    server.fail.add('333');
    let err = null;
    try { await tabA.Oka.addManyToCart([{ variantId: '222', quantity: 1 }, { variantId: '333', quantity: 1 }]); } catch (e) { err = e.message; }
    check('bundle', 'bundle with a sold-out variant: nothing added (all-or-nothing, as the fake API models Shopify)', [undefined, 'sold out'], [server.items.get('222'), err]);
  }

  /* 7 ── Loyalty ── */
  const earn = (merch) => Math.floor(Math.max(0, merch) * 1); // TRANSCRIBED oka-screens.js:772
  check('loyalty', 'earn on merch 299.99', 299, earn(299.99));
  check('loyalty', 'earn on merch 0 (100% discount)', 0, earn(0));
  check('loyalty', 'earn on negative merch', 0, earn(-5));
  const liquidPoints = (balanceCents) => Math.floor(Math.trunc(balanceCents * 10) / 100); // oka-loyalty.liquid:9 (integer divided_by)
  check('loyalty', 'store credit 12.34 EGP → points (Liquid)', 123, liquidPoints(1234));
  check('loyalty', 'store credit 0.09 EGP → points', 0, liquidPoints(9));
  check('loyalty', 'points 1234 worth (floor /10)', 123, Math.floor(1234 / 10));
  // Reward "20 off over 300" against the 300 tier: net effect at exactly 300 (Cairo), if the tier is evaluated after discounts
  {
    const before = 300 + ar.shippingFor(300, { provinceCode: 'C' });
    const after = 280 + ar.shippingFor(280, { provinceCode: 'C' });
    check('loyalty', '200-point voucher "20 off over 300" on a 300 Cairo basket saves money', true, after < before, `total ${before} → ${after}`);
  }

  /* 8 ── Subscriptions: theme builder (oka-screens.js:2897-2900) vs server job (services/jobs.js:25-55) ── */
  const themeSub = (lines, code) => {
    const subtotal = lines.reduce((a, l) => a + l.price * l.qty, 0);
    const discount = Math.round(subtotal * 0.05);
    const shipping = ar.shippingFor(subtotal - discount, { provinceCode: code });
    return { merch: subtotal - discount, shipping, total: subtotal - discount + shipping };
  };
  const serverSub = (lines, code) => {
    const merch = lines.reduce((a, l) => a + Math.round(l.price * 0.95) * l.qty, 0);
    const full = lines.reduce((a, l) => a + l.price * l.qty, 0); // Shopify sees full prices
    const shipping = shopifyRates(code, full)[0];
    return { merch, shipping, total: merch + shipping, belowServerMin: merch < 150 };
  };
  for (const [label, lines, code] of [
    ['3 × bowls 49 (147)', [{ price: 49, qty: 3 }], 'C'],
    ['3 × 149? use 189+49+49+39 (326)', [{ price: 189, qty: 1 }, { price: 49, qty: 2 }, { price: 39, qty: 1 }], 'C'],
    ['hookah 189 + 3 bowls 49 (336)', [{ price: 189, qty: 1 }, { price: 49, qty: 3 }], 'GZ'],
    ['7 × bowls 49 (343)', [{ price: 49, qty: 7 }], 'ASN'],
    ['tongs 31 × 3 (93)', [{ price: 31, qty: 3 }], 'C'],
  ]) {
    const t = themeSub(lines, code);
    const s = serverSub(lines, code);
    check('subscriptions', `${label} → ${code}: each-delivery total`, s.total, t.total, `theme merch ${t.merch}/fee ${t.shipping}; server merch ${s.merch}/fee ${s.shipping}${s.belowServerMin ? '; server REJECTS (<150 min)' : ''}`);
  }

  /* 9 ── Arabic digits ── */
  // snippets/ar-digits.liquid, transcribed: replace 0-9 one by one.
  const liquidAr = (s) => String(s).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]);
  check('digits', 'arDigits(1234567890)', '١٢٣٤٥٦٧٨٩٠', ar.arDigits(1234567890));
  check('digits', 'JS arDigits == Liquid ar-digits for 0..10000', true, [...Array(10001).keys()].every((n) => ar.arDigits(n) === liquidAr(n)));
  check('digits', 'fmtPrice(189) ar', '١٨٩ ج.م', ar.fmtPrice(189));
  check('digits', 'fmtPrice(189) en', 'EGP 189', en.fmtPrice(189));
  check('digits', 'fmtPrice(299.5) rounds half up', '٣٠٠ ج.م', ar.fmtPrice(299.5));
  check('digits', 'fmtPrice(-0.4) (tiny negative diff)', '٠ ج.م', ar.fmtPrice(-0.4));
  check('digits', 'fmtPrice(1014) thousands separator', '١٬٠١٤ ج.م', ar.fmtPrice(1014), 'cosmetic: no grouping (also none in EN: "EGP 1014")');
  check('digits', 'arDigits decimal separator', '٢٩٩٫٩٩', ar.arDigits(299.99), 'Latin "." kept; only visible where unrounded numbers are printed');
  check('digits', 'fold() reads Arabic digits back ("٦ أكتوبر")', 'SU', ar.provinceOf({ province: '٦ أكتوبر' })?.code);
  check('digits', 't() with points', 'هتاخد ٢٩٩ نقطة لما يوصلك', ar.t('earnOnDelivery', { n: 299 }));
  check('digits', 'discount row "-" + fmtPrice in RTL', '-٣١ ج.م', `-${ar.fmtPrice(31)}`, 'renders as "ج.م ٣١-" visually in RTL without bidi isolation — manual check');
  check('digits', 'NaN price', 'guarded', ar.fmtPrice(NaN), 'no guard; would print "NaN ج.م"');

  /* 10 ── Order edit sheet: difference line (TRANSCRIBED oka-screens.js:2066-2071) ── */
  const diffLine = (newTotal, oldTotal) => {
    const diff = Math.round((newTotal - oldTotal) * 100) / 100;
    if (diff === 0) return '';
    return diff > 0 ? `${en.fmtPrice(diff)} more than before` : `${en.fmtPrice(-diff)} less than before`;
  };
  check('order-edit', 'diff 0.4 EGP', '', diffLine(259.4, 259), 'prints "EGP 0 more than before"');
  check('order-edit', 'diff 24', 'EGP 24 more than before', diffLine(283, 259));
  check('order-edit', 'removing items to cross back under 300: 336→287 Cairo', 'EGP 25 less than before', diffLine(287 + 60, 336 + 36), 'only if the quote re-rates shipping (server-side, not verifiable here)');

  /* 11 ── Minimum order ── */
  const belowMin = (merch, min) => min > 0 && merch < min; // oka-screens.js:771
  check('min-order', 'min_order 0 → never below minimum (merch 1)', false, belowMin(1, 0));
  check('min-order', 'min_order 150 → 149.99 blocked', true, belowMin(149.99, 150));
  check('min-order', 'min_order 150 → 150 allowed', false, belowMin(150, 150));

  /* ── report ── */
  const fails = results.filter((r) => !r.pass);
  const groups = [...new Set(results.map((r) => r.group))];
  for (const g of groups) {
    const rs = results.filter((r) => r.group === g);
    console.log(`\n## ${g}: ${rs.filter((r) => r.pass).length}/${rs.length} pass`);
    for (const r of rs) {
      if (!r.pass || VERBOSE) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}\n      expected ${JSON.stringify(r.expected)}  actual ${JSON.stringify(r.actual)}${r.note ? `  — ${r.note}` : ''}`);
    }
  }
  console.log(`\nTOTAL ${results.length - fails.length}/${results.length} pass, ${fails.length} fail`);
}

main().catch((e) => { console.error(e); process.exit(2); });
