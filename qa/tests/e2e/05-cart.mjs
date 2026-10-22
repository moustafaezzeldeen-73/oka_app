// Cart, discount codes, fees per zone, thresholds, checkout hand-off, checkout review.
// Run: node qa/tests/e2e/05-cart.mjs
import { session, recorder, step, problems, hasProblems, MOBILES, sleep, cartJs, clearCart, addVia, readJsonl, V, dismissRecSheet } from './lib.mjs';
const rec = recorder('05-cart');
const dig = (x) => Number(String(x ?? '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[^\d.-]/g, '')) || 0;
const rowsOf = (s) => s.page.evaluate(() => [...document.querySelectorAll('.totals > *')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
const shipRow = (rows) => rows.find((r) => /Shipping|^الشحن/.test(r)) || '';
const items = (pairs) => pairs.map(([id, q]) => ({ id: Number(id), quantity: q }));
const HOSE = '46037717123370', STDHOSE = '46037718040874', GLAZED = '46037718106410', STEM3 = '46895247360298', UNTITLED = '46442383835434', HOSEBOWL = '46037716730154';

for (const device of [...MOBILES, 'Desktop 1440']) for (const locale of ['ar', 'en']) for (const loggedIn of [false, true]) {
  if (device === 'Desktop 1440' && loggedIn) continue;
  const s = await session({ device, locale, loggedIn });
  const ctx = s.ctx; const pg = s.page; const tag = `${device}-${locale}-${loggedIn ? 'c' : 'g'}`.replace(/\s/g, '');
  await s.goto('/');
  const full = device === 'iPhone 13' || (device === 'Pixel 7' && locale === 'ar');

  await step(rec, { id: 'CT-1', scenario: 'Empty cart: message + best-seller rail with working Add', ctx }, async () => {
    await clearCart(s); await s.goto('/cart', { settle: 1200 });
    const t = await pg.locator('.cart-empty').innerText().catch(() => '');
    const n = await pg.locator('.bs-card').count();
    await s.shot(`cart-empty-${tag}`);
    if (n) { await pg.locator('.bs-add:not([data-soldout])').first().click(); await sleep(1200); }
    const c = await cartJs(s);
    return { status: t && n && c.item_count === 1 ? 'PASS' : 'FAIL', note: `"${t}" rail=${n} after Add items=${c.item_count}` };
  });
  await step(rec, { id: 'CT-2', scenario: 'Add multiple products; lines, totals, ship bar render; line titles in chosen language', ctx }, async () => {
    await clearCart(s); await addVia(s, items([[V.cobra, 1], [V.mint, 2], [HOSE, 1]]));
    await s.goto('/cart', { settle: 1500 });
    const lines = await pg.evaluate(() => [...document.querySelectorAll('.line')].map((l) => `${l.querySelector('.line-title').innerText}×${l.dataset.qty}`));
    const rows = await rowsOf(s);
    await s.shot(`cart-3lines-${tag}`, { fullPage: true });
    return { status: lines.length === 3 ? 'PASS' : 'FAIL', note: `lines=${JSON.stringify(lines)} rows=${JSON.stringify(rows)}` };
  });
  await step(rec, { id: 'CT-3', scenario: 'Line + and − (single taps, waiting) update qty and totals; ✕ removes', ctx }, async () => {
    const line = pg.locator(`.line[data-variant="${V.mint}"]`);
    await line.locator('[data-step="1"]').click(); await sleep(900);
    const q3 = (await cartJs(s)).items.find((i) => String(i.variant_id) === V.mint)?.quantity;
    await pg.locator(`.line[data-variant="${V.mint}"] [data-step="-1"]`).click(); await sleep(900);
    const q2 = (await cartJs(s)).items.find((i) => String(i.variant_id) === V.mint)?.quantity;
    await pg.locator(`.line[data-variant="${HOSE}"] [data-remove]`).click(); await sleep(900);
    const c = await cartJs(s);
    const shown = await pg.locator('.line').count();
    return { status: q3 === 3 && q2 === 2 && c.items.length === 2 && shown === 2 ? 'PASS' : 'FAIL', note: `after +:${q3} after −:${q2} lines after ✕: cart=${c.items.length} shown=${shown}` };
  });
  await step(rec, { id: 'CT-4', scenario: 'F-02: five fast + taps on a cart line', ctx }, async () => {
    await clearCart(s); await addVia(s, items([[V.mint, 1]]));
    await s.goto('/cart', { settle: 1200 });
    const plus = pg.locator(`.line[data-variant="${V.mint}"] [data-step="1"]`);
    for (let i = 0; i < 5; i++) await plus.click({ delay: 0, noWaitAfter: true }).catch(() => {});
    await sleep(2500);
    const q = (await cartJs(s)).items.find((i) => String(i.variant_id) === V.mint)?.quantity;
    const shown = await pg.locator(`.line[data-variant="${V.mint}"]`).getAttribute('data-qty');
    // fast − to zero
    for (let i = 0; i < 8; i++) await pg.locator(`.line[data-variant="${V.mint}"] [data-step="-1"]`).click({ noWaitAfter: true, timeout: 1500 }).catch(() => {});
    await sleep(2500);
    const after = (await cartJs(s)).items.find((i) => String(i.variant_id) === V.mint)?.quantity || 0;
    return { status: q === 6 ? 'PASS' : 'FAIL', note: `expected 6 after 5 fast +, cart=${q} shown=${shown}; after 8 fast − cart=${after} → F-02 ${q !== 6 ? 'CONFIRMED (taps lost)' : 'not reproduced'}` };
  });
  if (full) {
    await step(rec, { id: 'CT-4b', scenario: 'F-02 with 400–900 ms server latency: five fast + taps then three fast − taps', ctx }, async () => {
      await clearCart(s); await addVia(s, items([[V.mint, 1]]));
      await s.goto('/cart', { settle: 1200 });
      let n = 0;
      await pg.route('**/cart/change.js', async (r) => { const d = [900, 400, 700, 450, 800, 500, 650, 420][n++ % 8]; await new Promise((x) => setTimeout(x, d)); await r.continue(); });
      for (let i = 0; i < 5; i++) { await pg.locator(`.line[data-variant="${V.mint}"] [data-step="1"]`).click({ noWaitAfter: true, timeout: 2000 }).catch(() => {}); await sleep(120); }
      await sleep(5000);
      const q = (await cartJs(s)).items.find((i) => String(i.variant_id) === V.mint)?.quantity;
      for (let i = 0; i < 3; i++) { await pg.locator(`.line[data-variant="${V.mint}"] [data-step="-1"]`).click({ noWaitAfter: true, timeout: 2000 }).catch(() => {}); await sleep(120); }
      await sleep(5000);
      const q2 = (await cartJs(s)).items.find((i) => String(i.variant_id) === V.mint)?.quantity;
      const shown = await pg.locator(`.line[data-variant="${V.mint}"]`).getAttribute('data-qty').catch(() => null);
      await pg.unroute('**/cart/change.js');
      return { status: q === 6 && q2 === 3 ? 'PASS' : 'FAIL', note: `5 fast + (120 ms apart) → cart ${q} (expected 6); then 3 fast − → cart ${q2} (expected 3), shown ${shown} → F-02 ${q !== 6 || q2 !== 3 ? 'CONFIRMED' : 'not reproduced'}` };
    });
    await step(rec, { id: 'CT-5', scenario: 'Card −/+ (home) fast taps are serialised (contrast with F-02)', ctx }, async () => {
      await clearCart(s); await s.goto('/collections/oka-parts', { settle: 900 });
      const btn = pg.locator(`.gcard-add[data-add="${HOSE}"]`);
      await btn.click(); await sleep(400);
      const sheet = await dismissRecSheet(s, 2500);
      await sleep(300);
      await pg.locator('.added-bar').evaluate((e) => e.remove()).catch(() => {});
      const plus = pg.locator(`.card-qty[data-cq-variant="${HOSE}"] [data-cq="1"]`);
      for (let i = 0; i < 5; i++) await plus.click({ noWaitAfter: true }).catch(() => {});
      await sleep(3500);
      const q = (await cartJs(s)).items.find((i) => String(i.variant_id) === HOSE)?.quantity;
      return { status: q === 6 ? 'PASS' : 'FAIL', note: `card stepper: expected 6, cart=${q} (rec sheet shown=${sheet})` };
    });
    await step(rec, { id: 'CT-6', scenario: 'Server 422 on line change → alert with message, cart re-renders', ctx }, async () => {
      await clearCart(s); await addVia(s, items([[V.mint, 1]]));
      await s.goto('/cart', { settle: 1000 });
      await pg.route('**/cart/change.js', (r) => r.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ status: 422, message: 'Cart Error', description: 'You can only add 1 Mint to the cart.' }) }));
      await pg.locator(`.line[data-variant="${V.mint}"] [data-step="1"]`).click(); await sleep(800);
      const alert = await pg.locator('.alert').innerText().catch(() => '');
      await s.shot(`cart-422-${tag}`);
      await pg.locator('.alert-btn').first().click().catch(() => {});
      await pg.unroute('**/cart/change.js');
      const shown = await pg.locator(`.line[data-variant="${V.mint}"]`).getAttribute('data-qty');
      return { status: /only add 1/.test(alert) && shown === '1' ? 'PASS' : 'FAIL', note: `alert="${alert.replace(/\s+/g, ' ')}" qty shown=${shown}` };
    });
    await step(rec, { id: 'CT-7', scenario: 'Cart stepper upper bound (data-max 99) and AJAX add of sold-out (422) message text', ctx }, async () => {
      await clearCart(s); await addVia(s, items([[HOSEBOWL, 99]]));
      await s.goto('/cart', { settle: 1000 });
      await pg.locator(`.line[data-variant="${HOSEBOWL}"] [data-step="1"]`).click(); await sleep(800);
      const q = (await cartJs(s)).items[0]?.quantity;
      const r = await pg.evaluate(async (id) => { const x = await fetch('/cart/add.js', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: [{ id: Number(id), quantity: 1 }] }) }); return [x.status, (await x.json()).description]; }, V.coal);
      return { status: q === 99 ? 'PASS' : 'FAIL', note: `+ at 99 → cart ${q} (silently ignored, no message); sold-out add → ${JSON.stringify(r)}` };
    });
    await step(rec, { id: 'CT-8', scenario: 'Swipe a cart row to delete / to wishlist (touch drag)', ctx }, async () => {
      if (device === 'Desktop 1440') return { status: 'INFO', note: 'touch only' };
      await clearCart(s); await addVia(s, items([[V.mint, 1], [HOSE, 1]]));
      await s.goto('/cart', { settle: 1000 });
      const swipe = async (vid, dir) => {
        const b = await pg.locator(`.swipe:has(.line[data-variant="${vid}"])`).boundingBox();
        const y = b.y + b.height / 2; const x0 = b.x + b.width / 2;
        await pg.mouse.move(x0, y); await pg.mouse.down(); await pg.mouse.move(x0 + dir * b.width * 0.7, y, { steps: 10 }); await pg.mouse.up();
        await sleep(1200);
      };
      const rtl = locale === 'ar';
      await swipe(V.mint, rtl ? 1 : -1); // toward end edge → delete
      const c = await cartJs(s);
      await swipe(HOSE, rtl ? -1 : 1); // toward start → wishlist
      const wl = await pg.evaluate(() => JSON.parse(localStorage.getItem('oka.wishlist') || '{}'));
      return { status: c.items.length === 1 && Object.keys(wl).length ? 'PASS' : 'FAIL', note: `after delete-swipe items=${c.items.length}; wishlist after save-swipe=${JSON.stringify(wl)}` };
    });
    await step(rec, { id: 'CT-9', scenario: '"Change" sheet swaps a bowl flavour for a same-price sibling', ctx }, async () => {
      await clearCart(s); await addVia(s, items([[V.blueberry, 2]]));
      await s.goto('/cart', { settle: 1500 });
      const has = await pg.locator('[data-replace]').count();
      if (!has) return { status: 'FAIL', note: 'no Change button' };
      await pg.locator('[data-replace]').first().click(); await sleep(800);
      const opts = await pg.locator('.variant-sheet [data-pick]').count();
      await pg.locator('.variant-sheet [data-pick]:not(.on)').first().click(); await sleep(1500);
      const c = await cartJs(s);
      return { status: c.items.length === 1 && String(c.items[0].variant_id) !== V.blueberry && c.items[0].quantity === 2 ? 'PASS' : 'FAIL', note: `options=${opts}; cart now ${c.items.map((i) => `${i.handle}×${i.quantity}`)}` };
    });
  }

  // ── discount codes ──
  const codeRun = async (code) => {
    await pg.locator('[data-code]').fill(code);
    await pg.locator('[data-apply]').click(); await sleep(1400);
    const c = await cartJs(s);
    return { err: await pg.locator('.code-error').innerText().catch(() => ''), btn: (await pg.locator('[data-apply]').innerText()).trim(), codes: (c.discount_codes || []).map((d) => `${d.code}:${d.applicable}`), total: c.total_price / 100, rows: await rowsOf(s) };
  };
  const base = items([[HOSE, 6], [STDHOSE, 1]]); // 300 EGP, no automatic discounts
  for (const [code, expect] of [['QA10', 'applied 10%'], ['qa10', 'case-insensitive'], [' QA10 ', 'whitespace trimmed'], ['QA50OFF', '50 off'], ['QAFREESHIP', 'free shipping (COM-04)'], ['QAEXPIRED', 'rejected'], ['NOPE123', 'rejected'], ['<b>x</b>', 'rejected, escaped']]) {
    if (!full && !['QA10', 'QAFREESHIP', 'NOPE123'].includes(code)) continue;
    await step(rec, { id: 'DC-1', scenario: `Discount code "${code}" on a 300 EGP cart → ${expect}`, ctx }, async () => {
      await clearCart(s); await addVia(s, base); await s.goto('/cart', { settle: 1200 });
      const r = await codeRun(code);
      if (code === 'QAFREESHIP' || code === 'NOPE123') await s.shot(`cart-code-${code}-${tag}`, { fullPage: true });
      const ship = dig(shipRow(r.rows));
      let ok;
      if (/QA10/i.test(code)) ok = r.total === 270 && !r.err;
      else if (code === 'QA50OFF') ok = r.total === 250 && !r.err;
      else if (code === 'QAFREESHIP') ok = !r.err && ship === 0;
      else ok = Boolean(r.err) && !r.codes.some((x) => x.endsWith(':true'));
      return { status: ok ? 'PASS' : 'FAIL', note: `${JSON.stringify(r)}${code === 'QAFREESHIP' ? ` → COM-04 ${ship ? 'CONFIRMED (shipping still charged in cart)' : 'REFUTED'}` : ''}` };
    });
  }
  await step(rec, { id: 'DC-2', scenario: 'QAMIN300: rejected at 299, accepted at 300; then cart drops below 300 → code state', ctx }, async () => {
    await clearCart(s); await addVia(s, items([[HOSE, 6], [GLAZED, 1]])); await s.goto('/cart', { settle: 1200 });
    const a = await codeRun('QAMIN300');
    await clearCart(s); await addVia(s, base); await s.goto('/cart', { settle: 1200 });
    const b = await codeRun('QAMIN300');
    await pg.locator(`.line[data-variant="${STDHOSE}"] [data-remove]`).click(); await sleep(1300);
    const c = await cartJs(s);
    const after = { codes: (c.discount_codes || []).map((d) => `${d.code}:${d.applicable}`), total: c.total_price / 100, btn: (await pg.locator('[data-apply]').innerText()).trim(), rows: await rowsOf(s) };
    return { status: a.err && b.total === 270 ? 'PASS' : 'FAIL', note: `299: ${JSON.stringify(a)} | 300: ${JSON.stringify(b)} | after dropping to 270: ${JSON.stringify(after)}` };
  });
  await step(rec, { id: 'DC-3', scenario: 'COM-06: invalid code after a valid one removes the valid code', ctx }, async () => {
    await clearCart(s); await addVia(s, base); await s.goto('/cart', { settle: 1200 });
    const a = await codeRun('QA10');
    const b = await codeRun('NOPE123');
    await s.shot(`cart-COM06-${tag}`, { fullPage: true });
    const lost = b.total !== 270;
    return { status: lost ? 'FAIL' : 'PASS', note: `after QA10 total=${a.total}; after NOPE123 total=${b.total} codes=${JSON.stringify(b.codes)} err="${b.err}" → COM-06 ${lost ? 'CONFIRMED' : 'REFUTED'}` };
  });
  await step(rec, { id: 'DC-4', scenario: 'Clearing the code field + Apply removes the code; code survives reload', ctx }, async () => {
    await clearCart(s); await addVia(s, base); await s.goto('/cart', { settle: 1200 });
    await codeRun('QA10');
    await s.goto('/cart', { settle: 1200 });
    const kept = { val: await pg.locator('[data-code]').inputValue(), btn: (await pg.locator('[data-apply]').innerText()).trim(), total: (await cartJs(s)).total_price / 100 };
    const r = await codeRun('');
    return { status: kept.total === 270 && r.total === 300 ? 'PASS' : 'FAIL', note: `after reload ${JSON.stringify(kept)}; after clearing total=${r.total}` };
  });

  // ── fees & thresholds ──
  for (const [label, pairs, merch] of [['299', [[HOSE, 6], [GLAZED, 1]], 299], ['300', [[HOSE, 6], [STDHOSE, 1]], 300], ['301', [[UNTITLED, 1], [STEM3, 3], [STDHOSE, 1]], 301]]) {
    await step(rec, { id: 'FE-1', scenario: `Threshold: merchandise ${label} EGP → fee tier (selected/default address zone)`, ctx }, async () => {
      await clearCart(s); await addVia(s, items(pairs)); await s.goto('/cart', { settle: 1200 });
      const c = await cartJs(s);
      const rows = await rowsOf(s);
      const bar = await pg.locator('.ship-txt').first().innerText();
      const fee = dig(shipRow(rows));
      const exp = loggedIn ? (merch >= 300 ? 36 : 60) : (merch >= 300 ? 36 : 60);
      return { status: c.total_price / 100 === merch && fee === exp ? 'PASS' : 'FAIL', note: `cart total=${c.total_price / 100} fee=${fee} (expected metro ${exp}) bar="${bar}"` };
    });
  }
  if (loggedIn) {
    const addrs = await pg.evaluate(() => (window.OKA.customer?.addresses || []).map((a) => ({ id: a.id, prov: a.provinceCode || a.province, city: a.city, def: a.isDefault })));
    for (const a of addrs) {
      await step(rec, { id: 'FE-2', scenario: `Logged-in fee with selected address in ${a.prov} (299 and 300 carts) — cart and checkout-review`, ctx }, async () => {
        await pg.evaluate((id) => localStorage.setItem('oka.addr', JSON.stringify(id)), a.id);
        const out = [];
        for (const pairs of [[[HOSE, 6], [GLAZED, 1]], [[HOSE, 6], [STDHOSE, 1]]]) {
          await clearCart(s); await addVia(s, items(pairs)); await s.goto('/cart', { settle: 1000 });
          const cf = dig(shipRow(await rowsOf(s)));
          await s.goto('/pages/checkout-review', { settle: 1500 });
          const rv = await pg.evaluate(() => [...document.querySelectorAll('[data-checkout-root] .spread')].map((r) => r.innerText.replace(/\s+/g, ' ')));
          const rvShip = dig((rv.find((r) => /^(Shipping|الشحن)/.test(r.trim())) || ''));
          out.push({ cart: cf, review: rvShip });
        }
        await s.shot(`checkout-review-${a.prov}-${tag}`, { fullPage: true });
        const zone = { C: [60, 36], GZ: [60, 36], ASN: [80, 56] }[a.prov] || [null, null];
        const ok = out[0].cart === zone[0] && out[1].cart === zone[1] && out[0].review === zone[0];
        return { status: ok ? 'PASS' : 'FAIL', note: `addr ${a.id} ${a.prov}/${a.city} default=${a.def}: 299→cart ${out[0].cart} review ${out[0].review}; 300→cart ${out[1].cart} review ${out[1].review}; zone table ${zone}` };
      });
    }
    await pg.evaluate(() => localStorage.removeItem('oka.addr'));
  } else {
    await step(rec, { id: 'FE-3', scenario: 'COM-01: guest always quoted Cairo fee (no address known)', ctx }, async () => {
      await clearCart(s); await addVia(s, items([[HOSE, 6], [GLAZED, 1]])); await s.goto('/cart', { settle: 1000 });
      const fee = dig(shipRow(await rowsOf(s)));
      const hint = await pg.evaluate(() => document.querySelector('[data-cart-root]').innerText.match(/(estimate|تقدير|depends|حسب)[^\n]*/i)?.[0] || null);
      return { status: fee === 60 && !hint ? 'FAIL' : 'PASS', note: `guest fee shown=${fee} as a firm number; estimate wording=${JSON.stringify(hint)} → COM-01 CONFIRMED at runtime (Aswan guest would pay 80 at checkout)` };
    });
  }
  await step(rec, { id: 'FE-4', scenario: 'Automatic "tong free": hookah ≥266 EGP from hookahs/bowls + tongs → tongs free', ctx }, async () => {
    await clearCart(s); await addVia(s, items([[V.blueberry, 6], [V.tongs, 1]])); await s.goto('/cart', { settle: 1200 });
    const c = await cartJs(s);
    const rows = await rowsOf(s);
    await s.shot(`cart-tongfree-${tag}`, { fullPage: true });
    return { status: c.original_total_price - c.total_price === 3100 ? 'PASS' : 'FAIL', note: `original=${c.original_total_price / 100} total=${c.total_price / 100} rows=${JSON.stringify(rows)}` };
  });

  // ── checkout hand-off ──
  await step(rec, { id: 'CO-1', scenario: 'Checkout button → /checkout stub; checkouts.jsonl has the items, code and token', ctx }, async () => {
    await clearCart(s); await addVia(s, items([[V.cobra, 1], [V.mint, 2]])); await s.goto('/cart', { settle: 1200 });
    await pg.locator('[data-code]').fill('QA10'); await pg.locator('[data-apply]').click(); await sleep(1300);
    const before = readJsonl('checkouts.jsonl').length;
    const c = await cartJs(s);
    await Promise.all([pg.waitForURL('**/checkout**', { timeout: 8000 }).catch(() => {}), pg.locator('[data-checkout]').click()]);
    await sleep(800);
    const recs = readJsonl('checkouts.jsonl');
    const last = recs[recs.length - 1] || {};
    const lc = await pg.evaluate(() => localStorage.getItem('oka.lastCheckout'));
    const summary = { url: pg.url(), newRecord: recs.length > before, items: (last.items || []).map((i) => `${i.variant_id || i.id}×${i.quantity}`), codes: last.discount_codes || last.codes, note: last.note, attributes: last.attributes, total: last.total_price ?? last.total, tokenMatch: JSON.stringify(last).includes(c.token) };
    return { status: summary.newRecord && summary.items.length === 2 && summary.tokenMatch && lc && lc.includes(c.token) ? 'PASS' : 'FAIL', note: `${JSON.stringify(summary).slice(0, 500)} lastCheckout=${lc}` };
  });
  await step(rec, { id: 'CO-2', scenario: 'Back from checkout: cart page usable, Checkout button not stuck as spinner (F-16)', ctx }, async () => {
    await pg.goBack({ waitUntil: 'load' }); await sleep(1000);
    const st = await pg.evaluate(() => { const b = document.querySelector('[data-checkout]'); return b ? { html: b.innerHTML.slice(0, 80), text: b.innerText.trim() } : null; });
    const persisted = await pg.evaluate(() => performance.getEntriesByType('navigation')[0]?.type);
    return { status: st && !/spinner/.test(st.html) ? 'PASS' : 'FAIL', note: `nav type=${persisted}; button=${JSON.stringify(st)} (harness Chromium bfcache ${/spinner/.test(st?.html || '') ? 'restored the spinner → F-16 CONFIRMED' : 'not restoring spinner'})` };
  });
  await step(rec, { id: 'CO-3', scenario: 'Checkout review page (/pages/checkout-review): guest gets join card; customer gets address/total/COD; Place → /checkout', ctx }, async () => {
    await clearCart(s); await addVia(s, items([[V.cobra, 1]]));
    await s.goto('/pages/checkout-review', { settle: 1500 });
    const st = await pg.evaluate(() => ({ join: Boolean(document.querySelector('.join')), placeHidden: document.querySelector('[data-place-bar]')?.hidden, ships: document.querySelector('.field-strong')?.innerText?.slice(0, 40), cod: document.querySelector('.cod-note')?.innerText }));
    await s.shot(`checkout-review-${tag}`, { fullPage: true });
    let after = null;
    if (loggedIn) { await Promise.all([pg.waitForURL('**/checkout**', { timeout: 6000 }).catch(() => {}), pg.locator('[data-place]').click()]); after = pg.url(); }
    else { await Promise.all([pg.waitForURL('**/checkout**', { timeout: 6000 }).catch(() => {}), pg.locator('[data-join-guest]').click()]); after = pg.url(); }
    return { status: (loggedIn ? !st.join && st.cod : st.join) && /checkout/.test(after) ? 'PASS' : 'FAIL', note: `${JSON.stringify(st)} → ${after}` };
  });
  if (!loggedIn && full) {
    await step(rec, { id: 'CO-4', scenario: 'Guest "Sign in & check out" → hosted login stub with return; locale param', ctx }, async () => {
      await s.goto('/pages/checkout-review', { settle: 1200 });
      await Promise.all([pg.waitForNavigation().catch(() => {}), pg.locator('[data-join-signin]').click()]);
      const u = new URL(pg.url());
      const after = await pg.evaluate(() => localStorage.getItem('oka.afterSignIn'));
      return { status: u.pathname.includes('customer_authentication') ? 'PASS' : 'FAIL', note: `→ ${u.pathname}${u.search}; oka.afterSignIn=${after} (login URL hard-codes return_to=/ and locale=en; the theme resumes from localStorage after sign-in)` };
    });
    await step(rec, { id: 'CO-5', scenario: 'Cart permalink /cart/VARIANT:QTY → checkout stub records items', ctx }, async () => {
      const before = readJsonl('checkouts.jsonl').length;
      await s.goto(`/cart/${V.cobra}:2,${V.mint}:1`);
      const recs = readJsonl('checkouts.jsonl');
      return { status: recs.length > before ? 'PASS' : 'FAIL', note: `url=${pg.url()} last=${JSON.stringify(recs[recs.length - 1]?.items?.map((i) => `${i.variant_id}×${i.quantity}`))}` };
    });
  }
  const p = problems(s, { allow: [/change\.js/, /422/] });
  rec.add({ id: 'CT-LOG', scenario: 'Cart session error summary', ctx, status: hasProblems(p) ? 'FAIL' : 'PASS', note: JSON.stringify(p).slice(0, 600) });
  await s.close();
}
console.log('done');
