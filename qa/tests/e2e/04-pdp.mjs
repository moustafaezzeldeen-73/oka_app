// Product page journeys + AR screen. Run: node qa/tests/e2e/04-pdp.mjs
import { session, recorder, step, problems, hasProblems, ALL_DEVICES, sleep, cartJs, clearCart, addVia, BASE, V, dismissRecSheet } from './lib.mjs';
const rec = recorder('04-pdp');
const PRODUCTS = [
  ['oka-cloud-white-hookah', '3D model + video + story (oka family)'], ['oka-cobra', 'model + cobra story'], ['oka-black-tobacco', 'video + black story'],
  ['oka-cobra-oka-base', 'compare-at price'], ['trio-party', 'compare-at, no description_ar'], ['1-pcs-of-foil', 'sold out (deny)'],
  ['tongs', 'no description_ar, tong-free automatic discount'], ['tobacco-bowls-blueberry-12g', 'bowl'], ['oka-cobra-led-rechargeable-base', 'base story'], ['oka-carbon-black-hookah', 'hookah'],
];
const camCount = () => { // counts live camera tracks
  window.__tracks = [];
  const orig = navigator.mediaDevices && navigator.mediaDevices.getUserMedia && navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  if (orig) navigator.mediaDevices.getUserMedia = async (c) => { const st = await orig(c); st.getTracks().forEach((t) => window.__tracks.push(t)); return st; };
};

for (const device of ALL_DEVICES) for (const locale of ['ar', 'en']) {
  const s = await session({ device, locale, loggedIn: locale === 'en' && device !== 'Desktop 1440' });
  await s.context.addInitScript(camCount);
  const ctx = s.ctx; const pg = s.page; const tag = `${device}-${locale}`.replace(/\s/g, '');
  const list = device === 'iPhone 13' ? PRODUCTS : PRODUCTS.slice(0, 6);
  for (const [h, what] of list) {
    await step(rec, { id: 'PD-1', scenario: `PDP ${h} (${what}): renders title/price/buy-bar, story, media, no errors`, ctx }, async () => {
      s.clearLogs();
      const r = await s.goto(`/products/${h}`, { settle: 1200 });
      const st = await pg.evaluate((lang) => {
        const q = (sel) => document.querySelector(sel);
        const title = q(`.pdp-title .l-${lang}`) || q('.pdp-title');
        return {
          title: title && title.innerText.trim().slice(0, 50), price: q('.pdp-price')?.innerText.trim(), compare: q('.pdp-compare')?.innerText.trim() || null,
          buy: Boolean(q('[data-buy]')), soldOut: q('.sold-out')?.innerText.trim() || null, story: document.querySelectorAll('.story-hero, .story-h').length,
          reel: document.querySelectorAll('[data-reel-item]').length, ar: Boolean(q('[data-ar-view]')), btn3d: Boolean(q('.pdp-3d')),
          desc: (q(`.pdp-desc .l-${lang}`) || q('.pdp-desc, .desc'))?.innerText?.trim().slice(0, 60) || null,
          snap: getComputedStyle(q('.screen[data-screen="product"]')).scrollSnapType, fee: q('[data-fee]')?.textContent, eta: q('[data-eta]')?.textContent,
          related: !q('[data-related]')?.hidden, relatedN: document.querySelectorAll('[data-related-list] .rcard').length,
        };
      }, locale);
      await s.shot(`pdp-${h}-${tag}`);
      const p = problems(s);
      const ok = r.status() === 200 && st.title && (st.buy || st.soldOut) && !hasProblems(p);
      return { status: ok ? 'PASS' : 'FAIL', note: `${JSON.stringify(st)} ${hasProblems(p) ? JSON.stringify(p) : ''}` };
    });
  }
  await step(rec, { id: 'PD-2', scenario: 'Quantity −/+ (min 1), buy price follows; Add to Cart adds chosen qty; added bar has View cart / Check out', ctx }, async () => {
    await clearCart(s); await s.goto('/products/oka-cobra', { settle: 900 });
    await pg.locator('[data-qty="-1"]').click();
    const q1 = await pg.locator('[data-qty-val]').innerText();
    for (let i = 0; i < 3; i++) await pg.locator('[data-qty="1"]').click();
    const q4 = await pg.locator('[data-qty-val]').innerText();
    const price = await pg.locator('[data-buy-price]').innerText();
    await pg.locator('[data-buy]').click(); await sleep(1200);
    const bar = await pg.evaluate(() => [...document.querySelectorAll('.added-bar a')].map((a) => a.getAttribute('href')));
    await s.shot(`pdp-added-${tag}`);
    const sheet = await dismissRecSheet(s, 1200);
    const c = await cartJs(s);
    const q = c.items.filter((i) => String(i.variant_id) === V.cobra).reduce((a, i) => a + i.quantity, 0);
    return { status: q === 4 && bar.includes('/cart') ? 'PASS' : 'FAIL', note: `after − at 1: ${q1}; after +++: ${q4}; buy price "${price}"; cart qty=${q}; added-bar links=${JSON.stringify(bar)}; rec sheet=${sheet}` };
  });
  await step(rec, { id: 'PD-3', scenario: 'F-05: double-tap "Add to Cart" adds the quantity twice', ctx }, async () => {
    await clearCart(s); await s.goto('/products/tongs', { settle: 900 });
    await pg.locator('[data-buy]').dblclick(); await sleep(1500);
    await dismissRecSheet(s, 600);
    const c = await cartJs(s);
    const q = c.items.filter((i) => String(i.variant_id) === V.tongs).reduce((a, i) => a + i.quantity, 0);
    return { status: q === 1 ? 'PASS' : 'FAIL', note: `cart qty after double-tap=${q} → F-05 ${q === 2 ? 'CONFIRMED' : 'REFUTED'}` };
  });
  await step(rec, { id: 'PD-4', scenario: 'Sold-out PDP: no Add button, "Out of stock" bar; AJAX add returns 422', ctx }, async () => {
    await s.goto('/products/1-pcs-of-foil');
    const buy = await pg.locator('[data-buy]').count();
    const so = await pg.locator('.sold-out').innerText().catch(() => '');
    const r = await pg.evaluate(async (id) => { const x = await fetch('/cart/add.js', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: [{ id: Number(id), quantity: 1 }] }) }); return [x.status, (await x.json()).description]; }, V.foil);
    return { status: buy === 0 && so && r[0] === 422 ? 'PASS' : 'FAIL', note: `buy=${buy} soldout="${so}" add.js → ${JSON.stringify(r)}` };
  });
  await step(rec, { id: 'PD-5', scenario: 'Wishlist heart on PDP toggles, persists, appears on /pages/wishlist', ctx }, async () => {
    await pg.evaluate(() => localStorage.removeItem('oka.wishlist'));
    await s.goto('/products/oka-cobra');
    await pg.locator('[data-wish]').click(); await sleep(200);
    const fill = await pg.locator('[data-wish] svg').getAttribute('fill');
    await s.goto('/pages/wishlist', { settle: 1200 });
    const w = await pg.evaluate(() => document.querySelector('[data-wish-root]')?.innerText.replace(/\s+/g, ' ').slice(0, 120));
    const has = await pg.locator('[data-wish-root] a[href*="oka-cobra"]').count();
    await s.shot(`wishlist-${tag}`);
    await s.goto('/products/oka-cobra');
    const fill2 = await pg.locator('[data-wish] svg').getAttribute('fill');
    await pg.locator('[data-wish]').click();
    return { status: fill !== 'none' && has > 0 && fill2 !== 'none' ? 'PASS' : 'FAIL', note: `fill after tap=${fill}; wishlist page has cobra=${has} "${w}"; after reload fill=${fill2}` };
  });
  await step(rec, { id: 'PD-6', scenario: 'Share: navigator.share used on mobile; clipboard + toast fallback; URL is shop.url + product', ctx }, async () => {
    await s.goto('/products/oka-cobra');
    await pg.evaluate(() => { window.__shared = null; if (navigator.share) navigator.share = async (d) => { window.__shared = d; }; });
    await s.context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    await pg.locator('[data-share]').click(); await sleep(500);
    const shared = await pg.evaluate(() => window.__shared);
    const toast = await pg.locator('.toast').innerText().catch(() => '');
    const clip = shared ? null : await pg.evaluate(() => navigator.clipboard.readText()).catch((e) => `ERR ${e.message}`);
    return { status: (shared && shared.url) || /\/products\/oka-cobra/.test(clip || '') ? 'PASS' : 'FAIL', note: `share=${JSON.stringify(shared)} toast="${toast}" clipboard=${JSON.stringify(clip)}` };
  });
  await step(rec, { id: 'PD-7', scenario: 'Snap scrolling on PDP: sections snap; story sections present in chosen language', ctx }, async () => {
    await s.goto('/products/oka-cloud-white-hookah', { settle: 900 });
    const res = await pg.evaluate(async () => {
      const sc = document.querySelector('.screen[data-screen="product"]');
      const pgs = [...sc.querySelectorAll('.snap-pg, .story-hero')].map((e) => e.offsetTop);
      const out = [];
      for (const y of [400, 900, 1500]) { sc.scrollTo({ top: y }); await new Promise((r) => setTimeout(r, 800)); out.push(sc.scrollTop); }
      return { snapTargets: pgs.slice(0, 8), landed: out };
    });
    const storyLang = await pg.evaluate((l) => { const h = document.querySelector('.story-h'); if (!h) return null; const sp = h.querySelector(`.l-${l}`); return sp ? getComputedStyle(sp).display !== 'none' : 'no bi spans'; }, locale);
    await s.shot(`pdp-story-${tag}`);
    return { status: 'INFO', note: `${JSON.stringify(res)} story heading in ${locale} visible=${storyLang}` };
  });
  await step(rec, { id: 'PD-8', scenario: 'Video reel: videos muted/inline, tap toggles play, speaker toggles sound', ctx }, async () => {
    await s.goto('/products/oka-black-tobacco', { settle: 900 });
    const n = await pg.locator('[data-reel-item]').count();
    if (!n) return { status: 'FAIL', note: 'no reel items on oka-black-tobacco' };
    await pg.locator('[data-reel]').scrollIntoViewIfNeeded(); await sleep(800);
    const v0 = await pg.evaluate(() => { const v = document.querySelector('[data-reel-item] video'); return { muted: v.muted, inline: v.playsInline, src: (v.currentSrc || v.querySelector('source')?.src || '').slice(-40) }; });
    await pg.locator('[data-reel-item]').first().click({ position: { x: 40, y: 80 } }).catch(() => {});
    const snd = pg.locator('[data-reel-item] [data-reel-sound]').first();
    const hasSnd = await snd.count();
    if (hasSnd) await snd.click().catch(() => {});
    const v1 = await pg.evaluate(() => { const v = document.querySelector('[data-reel-item] video'); return { muted: v.muted, sound: v.closest('[data-reel-item]').classList.contains('sound') }; });
    await s.shot(`pdp-reel-${tag}`);
    return { status: v0.muted && v0.inline && (!hasSnd || !v1.muted) ? 'PASS' : 'FAIL', note: `items=${n} before=${JSON.stringify(v0)} after sound tap=${JSON.stringify(v1)} (harness videos are empty files: playback itself untestable)` };
  });
  await step(rec, { id: 'PD-9', scenario: '?variant= valid, invalid and foreign variant ids', ctx }, async () => {
    const a = await s.goto(`/products/tongs?variant=${V.tongs}`);
    const va = await pg.locator('[data-screen="product"]').getAttribute('data-variant');
    const b = await s.goto('/products/tongs?variant=123');
    const vb = await pg.locator('[data-screen="product"]').getAttribute('data-variant');
    const c = await s.goto(`/products/tongs?variant=${V.cobra}`);
    const vc = await pg.locator('[data-screen="product"]').getAttribute('data-variant');
    return { status: va === V.tongs && vb === V.tongs && vc === V.tongs ? 'PASS' : 'FAIL', note: `valid→${a.status()} ${va}; bogus→${b.status()} ${vb}; other product's variant→${c.status()} ${vc}` };
  });
  await step(rec, { id: 'PD-10', scenario: 'COM-07: PDP fee vs cart fee with "tong free" discount in cart', ctx }, async () => {
    await clearCart(s);
    await addVia(s, [V.cloud, V.blueberry, V.icedLemon, V.tongs].map((id) => ({ id: Number(id), quantity: 1 })));
    await s.goto('/products/standard-15-g-bowl-glazed', { settle: 1200 });
    const pdpFee = await pg.locator('[data-fee]').innerText();
    const pdpBar = await pg.locator('[data-ship-txt]').innerText();
    await pg.locator('[data-buy]').click(); await sleep(1200); await dismissRecSheet(s, 600);
    await s.goto('/cart', { settle: 1200 });
    const rows = await pg.evaluate(() => [...document.querySelectorAll('.totals > *')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
    const c = await cartJs(s);
    await s.shot(`pdp-COM07-cart-${tag}`);
    const cartShip = rows.find((r) => /Shipping|الشحن/.test(r));
    const dig = (x) => String(x).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '');
    const mismatch = !cartShip || !dig(cartShip).endsWith(dig(pdpFee));
    return { status: mismatch ? 'FAIL' : 'PASS', note: `PDP fee "${pdpFee}" bar "${pdpBar}"; after adding: cart original=${c.original_total_price / 100} merch=${c.total_price / 100}; cart rows=${JSON.stringify(rows)} → COM-07 ${mismatch ? 'CONFIRMED' : 'REFUTED'}` };
  });
  await step(rec, { id: 'PD-11', scenario: 'Related "Goes well with it" rail: + adds; recommendations exclude drafts', ctx }, async () => {
    await clearCart(s); await s.goto('/products/oka-cloud-white-hookah', { settle: 1500 });
    const items = await pg.evaluate(() => [...document.querySelectorAll('[data-related-list] .rcard a.rcard-title')].map((a) => a.getAttribute('href')));
    const bad = [];
    for (const h of items) { const r = await fetch(BASE + h); if (r.status !== 200) bad.push(`${h} ${r.status}`); }
    let added = null;
    if (items.length) { await pg.locator('[data-related-list] .rcard-add').first().scrollIntoViewIfNeeded(); await pg.locator('[data-related-list] .rcard-add').first().click(); await sleep(1200); await dismissRecSheet(s, 500); added = (await cartJs(s)).item_count; }
    return { status: items.length && !bad.length && added === 1 ? 'PASS' : 'FAIL', note: `related=${JSON.stringify(items)} bad=${bad} cart after +=${added}` };
  });
  await step(rec, { id: 'PD-12', scenario: 'PDP back button: from home → PDP → back returns to home; direct deep link → back goes to /', ctx }, async () => {
    await s.goto('/products/oka-cobra');
    await Promise.all([pg.waitForNavigation().catch(() => {}), pg.locator('[data-back]').first().click()]);
    await sleep(300);
    const u1 = new URL(pg.url()).pathname;
    await s.goto('/collections/oka-cobra');
    await Promise.all([pg.waitForNavigation().catch(() => {}), pg.locator('a[href="/products/oka-cobra"], .gcard a[href*="oka-cobra"]').first().click()]);
    await sleep(300);
    await Promise.all([pg.waitForNavigation().catch(() => {}), pg.locator('[data-back]').first().click()]);
    await sleep(300);
    const u2 = new URL(pg.url()).pathname;
    return { status: u2 === '/collections/oka-cobra' ? 'PASS' : 'FAIL', note: `back after same-origin direct goto → ${u1}; back after collection→PDP → ${u2}` };
  });
  // AR
  await step(rec, { id: 'AR-1', scenario: '?view=ar with model: camera starts, model-viewer loads, add-to-cart from AR, feedback visible (F-08)', ctx }, async () => {
    await clearCart(s); s.clearLogs();
    await s.goto('/products/oka-cloud-white-hookah?view=ar', { settle: 2500 });
    const st = await pg.evaluate(() => ({ tracks: (window.__tracks || []).map((t) => t.readyState), mv: Boolean(customElements.get('model-viewer')), status: document.querySelector('[data-ar-status-text]')?.textContent, add: Boolean(document.querySelector('[data-screen="product-ar"] [data-add]')) }));
    let fb = null;
    if (st.add) {
      await pg.locator('[data-screen="product-ar"] [data-add]').first().click(); await sleep(700);
      fb = await pg.evaluate(() => { const el = document.querySelector('.added-bar, .toast'); if (!el) return 'none'; const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { cls: el.className, onTop: el.contains(top), topEl: top && top.className }; });
    }
    await s.shot(`ar-screen-${tag}`);
    const c = await cartJs(s);
    return { status: st.tracks.includes('live') && st.mv && c.item_count === 1 && fb && fb.onTop ? 'PASS' : 'FAIL', note: `${JSON.stringify(st)} cart=${c.item_count} feedback=${JSON.stringify(fb)} → F-08 ${fb && fb !== 'none' && !fb.onTop ? 'CONFIRMED' : fb && fb.onTop ? 'REFUTED' : '?'}` };
  });
  await step(rec, { id: 'AR-2', scenario: 'Leaving AR screen stops camera tracks (back)', ctx }, async () => {
    const before = await pg.evaluate(() => (window.__tracks || []).map((t) => t.readyState));
    await pg.evaluate(() => document.querySelector('[data-back]')?.click());
    await sleep(800);
    return { status: 'INFO', note: `tracks before leaving=${JSON.stringify(before)} (page unload releases the stream; per-page state not observable after navigation)` };
  });
  await step(rec, { id: 'AR-3', scenario: '?view=ar without a model shows "coming soon", no camera request', ctx }, async () => {
    await s.goto('/products/tongs?view=ar', { settle: 1500 });
    const st = await pg.evaluate(() => ({ text: document.querySelector('[data-screen]')?.innerText.replace(/\s+/g, ' ').slice(0, 140), tracks: (window.__tracks || []).length }));
    await s.shot(`ar-nomodel-${tag}`);
    return { status: st.tracks === 0 ? 'PASS' : 'FAIL', note: JSON.stringify(st) };
  });
  if (device === 'iPhone 13') {
    await step(rec, { id: 'AR-4', scenario: 'F-03/F-10: PDP AR section auto-starts camera on scroll and stops when scrolled away', ctx }, async () => {
      await s.goto('/products/oka-cloud-white-hookah', { settle: 1200 });
      const has = await pg.locator('[data-ar-view]').count();
      if (!has) return { status: 'INFO', note: 'no AR section on this PDP' };
      await pg.locator('[data-ar-view]').evaluate((e) => e.scrollIntoView({ block: 'start' })); await sleep(2500);
      const on = await pg.evaluate(() => (window.__tracks || []).map((t) => t.readyState));
      await pg.evaluate(() => document.querySelector('.screen[data-screen="product"]').scrollTo({ top: 0 })); await sleep(1500);
      const off = await pg.evaluate(() => (window.__tracks || []).map((t) => t.readyState));
      // fast in/out: scroll in and away before getUserMedia resolves
      await pg.evaluate(async () => { const sc = document.querySelector('.screen[data-screen="product"]'); const a = document.querySelector('[data-ar-view]'); for (let i = 0; i < 4; i++) { a.scrollIntoView({ block: 'start' }); await new Promise((r) => setTimeout(r, 60)); sc.scrollTo({ top: 0 }); await new Promise((r) => setTimeout(r, 60)); } });
      await sleep(2500);
      const fast = await pg.evaluate(() => (window.__tracks || []).map((t) => t.readyState));
      await s.shot(`pdp-ar-section-${tag}`);
      const orphan = fast.filter((x) => x === 'live').length;
      return { status: on.includes('live') && !off.includes('live') && !orphan ? 'PASS' : 'FAIL', note: `in view: ${JSON.stringify(on)}; scrolled away: ${JSON.stringify(off)}; after fast in/out: ${JSON.stringify(fast)} → camera auto-requested on scroll (F-10 CONFIRMED); orphan live tracks=${orphan} (F-03 ${orphan ? 'CONFIRMED' : 'not reproduced'})` };
    });
  }
  const p = problems(s, { allow: [/404/] });
  rec.add({ id: 'PD-LOG', scenario: 'PDP session error summary', ctx, status: hasProblems(p) ? 'FAIL' : 'PASS', note: JSON.stringify(p).slice(0, 600) });
  await s.close();
}
for (const cam of ['denied', 'none']) {
  const s = await session({ device: 'Pixel 7', locale: 'ar', cameraPermission: cam });
  await step(rec, { id: 'AR-5', scenario: `AR screen with camera ${cam}: message shown, model still viewable`, ctx: s.ctx }, async () => {
    await s.goto('/products/oka-cobra?view=ar', { settle: 2500 });
    const st = await s.page.evaluate(() => ({ status: document.querySelector('[data-ar-status-text]')?.textContent, alert: document.querySelector('.alert')?.innerText?.replace(/\s+/g, ' '), mv: Boolean(document.querySelector('model-viewer')) }));
    await s.shot(`ar-cam-${cam}`);
    return { status: st.mv ? 'PASS' : 'FAIL', note: JSON.stringify(st) };
  });
  await s.close();
}
console.log('done');
