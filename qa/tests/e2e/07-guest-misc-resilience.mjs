// Guest orders (last checkout), misc pages (404/password/policies/gift card), multi-tab cart sync,
// back/forward through the funnel, reload mid-flow, offline. Run: node qa/tests/e2e/07-guest-misc-resilience.mjs
import { session, recorder, step, problems, hasProblems, MOBILES, sleep, cartJs, clearCart, addVia, readJsonl, BASE, V, dismissRecSheet } from './lib.mjs';
const rec = recorder('07-guest-misc-resilience');
const alertText = (s) => s.page.locator('.alert').last().innerText().then((t) => t.replace(/\s+/g, ' ')).catch(() => '');
const closeAlerts = async (s) => { for (let i = 0; i < 3; i++) { const b = s.page.locator('.alert-btn').first(); if (!(await b.count())) break; await b.click().catch(() => {}); await sleep(150); } };
const extN = () => readJsonl('external-calls.jsonl').length;
const extSince = (n) => readJsonl('external-calls.jsonl').slice(n);
const SNAP = { placedAt: '2026-10-18T10:00:00Z', items: [{ title: 'OKA white', quantity: 1, unitPrice: 169 }], address: { name: 'Guest QA', address1: '1 QA St', city: 'Nasr City', provinceCode: 'C' }, phone: '01000000055', itemsTotal: 169, shipping: 60, total: 229 };

for (const device of MOBILES) for (const locale of ['ar', 'en']) {
  const s = await session({ device, locale });
  const ctx = s.ctx; const pg = s.page; const tag = `${device}-${locale}`.replace(/\s/g, '');
  const full = device === 'iPhone 13';
  await s.goto('/');
  await step(rec, { id: 'GO-1', scenario: 'Guest /pages/orders with no last checkout → "No orders yet", no API call', ctx }, async () => {
    await pg.evaluate(() => localStorage.removeItem('oka.lastCheckout'));
    const n0 = extN(); await s.goto('/pages/orders', { settle: 1200 });
    const t = await pg.locator('[data-guest-empty]').isVisible();
    return { status: t && extSince(n0).filter((c) => /run\.app/.test(c.url)).length === 0 ? 'PASS' : 'FAIL', note: `empty visible=${t}` };
  });
  await step(rec, { id: 'GO-2', scenario: 'Guest checks out → oka.lastCheckout saved → /pages/orders shows the last order (customer_get_order by cart token)', ctx }, async () => {
    await clearCart(s); await addVia(s, [{ id: Number(V.cloud), quantity: 1 }]);
    await s.goto('/cart', { settle: 1000 });
    await Promise.all([pg.waitForURL('**/checkout**').catch(() => {}), pg.locator('[data-checkout]').click()]);
    const lc = await pg.evaluate(() => JSON.parse(localStorage.getItem('oka.lastCheckout') || 'null'));
    const n0 = extN(); await s.goto('/pages/orders', { settle: 2500 });
    const calls = extSince(n0).filter((c) => /run\.app/.test(c.url)).map((c) => ({ tool: c.tool, args: Object.keys((c.body?.params?.arguments) || {}), session: Object.keys(c.body?.params?.arguments?.session || {}) }));
    const box = await pg.evaluate(() => document.querySelector('[data-guest-last]')?.innerText.replace(/\s+/g, ' ').slice(0, 260));
    await s.shot(`guest-last-order-${tag}`, { fullPage: true });
    return { status: lc?.cartToken && box && /9000101/.test(box) ? 'PASS' : 'FAIL', note: `lastCheckout keys=${Object.keys(lc || {})}; calls=${JSON.stringify(calls)}; box="${box}" (harness mock maps any session to the fixture's first order)` };
  });
  if (full) {
    await step(rec, { id: 'GO-3', scenario: 'Guest edits last order via item + → sheet → save', ctx }, async () => {
      const n0 = extN();
      const st = pg.locator('[data-guest-last] [data-g-item] [data-step="1"]').first();
      if (!(await st.count())) return { status: 'FAIL', note: 'no steppers on guest order' };
      await st.click(); await sleep(2500);
      const sheet = await pg.locator('.sheet.edit-order').count();
      if (sheet) { await pg.locator('.sheet.edit-order [data-save]').click(); await sleep(2500); }
      const al = await alertText(s); await closeAlerts(s);
      const tools = extSince(n0).map((c) => c.tool);
      return { status: sheet && tools.includes('customer_update_order') ? 'PASS' : 'FAIL', note: `sheet=${sheet} alert="${al}" tools=${JSON.stringify(tools)}` };
    });
    // The harness keeps cancel state per server: cancel only in the last full context so earlier edits still see an open order.
    if (locale === 'en') await step(rec, { id: 'GO-4', scenario: 'Guest cancels last order (confirm) → cancelled state', ctx }, async () => {
      await s.goto('/pages/orders', { settle: 2500 });
      await pg.locator('[data-g-cancel]').click(); await sleep(300);
      await pg.locator('.alert-btn.destructive').click(); await sleep(2000);
      const al = await alertText(s); await closeAlerts(s);
      const st = await pg.locator('[data-guest-last] .order-state').innerText();
      await s.shot(`guest-cancelled-${tag}`);
      return { status: /Cancel|ملغي/.test(st) ? 'PASS' : 'FAIL', note: `alert="${al}" state="${st}"` };
    });
    await s.goto('/__qa/health'); // reset mock state not needed per session
    await step(rec, { id: 'GO-5', scenario: 'Pixel snapshot + API error500 → snapshot shown with "couldn’t load" hint (SEC-06: PII kept in localStorage)', ctx }, async () => {
      await s.setMocks('customer_get_order:error500,success');
      await pg.evaluate((snap) => localStorage.setItem('oka.lastCheckout', JSON.stringify({ cartToken: 'qa-dead-token', checkoutToken: 'qa-ck', order: snap, at: Date.now() })), SNAP);
      await s.goto('/pages/orders', { settle: 2500 });
      const box = await pg.evaluate(() => document.querySelector('[data-guest-last]')?.innerText.replace(/\s+/g, ' ').slice(0, 300));
      await s.shot(`guest-snapshot-${tag}`, { fullPage: true });
      await s.setMocks('success');
      const pii = /Guest QA/.test(box) && /01000000055/.test(box);
      return { status: pii ? 'FAIL' : 'PASS', note: `box="${box}" → SEC-06 ${pii ? 'CONFIRMED: name/phone/address from localStorage shown to whoever opens the page on this browser (no sign-in, no expiry)' : 'not shown'}` };
    });
    await step(rec, { id: 'GO-6', scenario: 'Guest last order: get_order timeout → spinner then snapshot/empty, no hang', ctx }, async () => {
      await s.setMocks('customer_get_order:timeout,success');
      await pg.evaluate(() => localStorage.setItem('oka.lastCheckout', JSON.stringify({ cartToken: 'qa-x', at: Date.now() })));
      await s.goto('/pages/orders', { settle: 600 });
      const mid = await pg.evaluate(() => Boolean(document.querySelector('[data-guest-last] .spinner, .guest-loading')));
      await sleep(9500);
      const end = await pg.evaluate(() => ({ boxHidden: document.querySelector('[data-guest-last]')?.hidden, empty: !document.querySelector('[data-guest-empty]')?.hidden }));
      await s.setMocks('success');
      return { status: mid && end.empty ? 'PASS' : 'FAIL', note: `spinner while waiting=${mid}; after timeout ${JSON.stringify(end)}` };
    });
    await step(rec, { id: 'GO-7', scenario: 'F-16: guest order with canEdit && !canCancel → item −/+ shown but inert', ctx }, async () => {
      await pg.route('**/mcp', async (route) => {
        const body = JSON.parse(route.request().postData() || '{}');
        if (body.params?.name !== 'customer_get_order') return route.fallback();
        const v = { orderNumber: '#9000101', status: 'preparing', cancelled: false, canCancel: false, canEdit: true, items: [{ variantId: V.cloud, quantity: 1, title: 'OKA white', unitPrice: 169 }], address: { name: 'X', provinceCode: 'C', city: 'Nasr', address1: 'street 1' }, phone: '01000000001', itemsTotal: 169, discount: 0, shipping: 60, total: 229 };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: JSON.stringify(v) }] } }) });
      });
      await pg.evaluate(() => localStorage.setItem('oka.lastCheckout', JSON.stringify({ cartToken: 'qa-x', at: Date.now() })));
      await s.goto('/pages/orders', { settle: 2000 });
      const steppers = await pg.locator('[data-guest-last] [data-g-item] [data-step]').count();
      if (steppers) await pg.locator('[data-guest-last] [data-g-item] [data-step="1"]').first().click();
      await sleep(1200);
      const reacted = (await pg.locator('.sheet.edit-order').count()) + (await pg.locator('.alert').count());
      await pg.unroute('**/mcp');
      return { status: steppers && !reacted ? 'FAIL' : 'PASS', note: `steppers=${steppers}; sheet/alert after tap=${reacted} → F-16 (guest part) ${steppers && !reacted ? 'CONFIRMED' : 'REFUTED'}` };
    });
  }
  await pg.evaluate(() => localStorage.removeItem('oka.lastCheckout'));

  // misc pages
  for (const [pth, want] of [['/nope-404', 404], ['/products/foil', 404], ['/collections/does-not-exist', 404], ['/password', 200], ['/gift_cards/qa12345678', 200], ['/policies/refund-policy', 200], ['/policies/privacy-policy', 200], ['/policies/shipping-policy', 200], ['/policies/terms-of-service', 200], ['/policies/contact-information', 200], ['/ar/policies/privacy-policy', 200], ['/ar/policies/refund-policy', 200]]) {
    if (!full && !['/nope-404', '/password', '/policies/refund-policy'].includes(pth)) continue;
    await step(rec, { id: 'MP-1', scenario: `Page ${pth}: status ${want}, renders in ${locale}, way back home`, ctx }, async () => {
      s.clearLogs(); const r = await s.goto(pth, { settle: 800 });
      const st = await pg.evaluate(() => ({ dir: document.documentElement.dir, lang: document.documentElement.lang, text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 140), home: document.querySelectorAll('a[href="/"], [data-back]').length, theme: Boolean(window.Oka) }));
      await s.shot(`misc-${pth.replace(/\W+/g, '_')}-${tag}`);
      const p = problems(s, { allow: [/404/] });
      return { status: r.status() === want && !hasProblems(p) ? 'PASS' : 'FAIL', note: `HTTP ${r.status()} ${JSON.stringify(st)} ${hasProblems(p) ? JSON.stringify(p) : ''}` };
    });
  }
  // multi-tab
  await step(rec, { id: 'MT-1', scenario: 'COM-09: two tabs — tab B adds/changes cart; tab A (cart page) after focus shows stale qty; + in tab A', ctx }, async () => {
    await clearCart(s); await addVia(s, [{ id: Number(V.mint), quantity: 1 }]);
    await s.goto('/cart', { settle: 1200 });
    const b = await s.context.newPage();
    await b.goto('/cart'); await b.waitForTimeout(1200);
    await b.locator(`.line[data-variant="${V.mint}"] [data-step="1"]`).click(); await b.waitForTimeout(1000);
    await b.evaluate(async (id) => fetch('/cart/add.js', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: [{ id: Number(id), quantity: 1 }] }) }), V.tongs);
    await pg.bringToFront(); await pg.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); }); await sleep(800);
    const shownA = await pg.evaluate(() => ({ lines: [...document.querySelectorAll('.line')].map((l) => `${l.dataset.variant}×${l.dataset.qty}`), badge: document.querySelector('[data-cart-count]')?.textContent }));
    await pg.locator(`.line[data-variant="${V.mint}"] [data-step="1"]`).click(); await sleep(1200);
    const after = await cartJs(s);
    const shownA2 = await pg.evaluate(() => [...document.querySelectorAll('.line')].map((l) => `${l.dataset.variant}×${l.dataset.qty}`));
    await b.close();
    const mint = after.items.find((i) => String(i.variant_id) === V.mint)?.quantity;
    const stale = shownA.lines.length === 1;
    return { status: stale ? 'FAIL' : 'PASS', note: `tab A after B changed cart (mint 2 + tongs): ${JSON.stringify(shownA)}; + in tab A → cart mint=${mint} (A computed from stale qty 1 → set 2, so B's change was ${mint === 2 ? 'silently overwritten' : 'kept'}); A now shows ${JSON.stringify(shownA2)} → COM-09 ${stale ? 'CONFIRMED' : 'REFUTED'}` };
  });
  await step(rec, { id: 'MT-2', scenario: 'Badge / card steppers after Back (bfcache) once cart changed elsewhere', ctx }, async () => {
    await clearCart(s);
    await s.goto('/collections/oka-parts', { settle: 900 });
    await pg.locator(`.gcard-add[data-add="${V.tongs}"]`).click(); await sleep(500); await dismissRecSheet(s, 1500);
    await s.goto('/cart', { settle: 1000 });
    await pg.locator('[data-remove]').first().click(); await sleep(1000);
    await pg.goBack({ waitUntil: 'load' }); await sleep(1000);
    const st = await pg.evaluate((vid) => ({ badge: document.querySelector('[data-cart-count]')?.textContent, stepper: !document.querySelector(`.card-qty[data-cq-variant="${vid}"]`)?.hidden && Boolean(document.querySelector(`.card-qty[data-cq-variant="${vid}"]`)), nav: performance.getEntriesByType('navigation')[0]?.type }), V.tongs);
    const c = await cartJs(s);
    const stale = (st.badge && st.badge !== '' && c.item_count === 0) || st.stepper;
    return { status: stale ? 'FAIL' : 'PASS', note: `cart=${c.item_count}; page after Back ${JSON.stringify(st)}` };
  });
  // back/forward through funnel
  await step(rec, { id: 'BF-1', scenario: 'Back/forward through home → collection → PDP → cart → checkout and back again; every page renders', ctx }, async () => {
    s.clearLogs(); await clearCart(s);
    const seq = ['/', '/collections/oka-cobra', '/products/oka-cobra', '/cart'];
    for (const u of seq) await s.goto(u, { settle: 500 });
    await addVia(s, [{ id: Number(V.cobra), quantity: 1 }]);
    await s.goto('/cart', { settle: 800 });
    await Promise.all([pg.waitForURL('**/checkout**').catch(() => {}), pg.locator('[data-checkout]').click()]);
    const trail = [];
    for (let i = 0; i < 5; i++) { await pg.goBack({ waitUntil: 'load' }).catch(() => {}); await sleep(500); trail.push(`${new URL(pg.url()).pathname}:${await pg.evaluate(() => document.querySelector('[data-cart-count]')?.textContent || '-')}`); }
    for (let i = 0; i < 5; i++) { await pg.goForward({ waitUntil: 'load' }).catch(() => {}); await sleep(500); trail.push(`→${new URL(pg.url()).pathname}`); }
    const p = problems(s);
    return { status: !hasProblems(p) ? 'PASS' : 'FAIL', note: `trail(path:badge)=${trail.join(' ')} ${hasProblems(p) ? JSON.stringify(p) : ''}` };
  });
  // reload mid-flow
  await step(rec, { id: 'RL-1', scenario: 'Reload mid-flow: PDP qty chosen, cart with code, checkout-review — state after reload', ctx }, async () => {
    await clearCart(s); await s.goto('/products/oka-cobra', { settle: 800 });
    await pg.locator('[data-qty="1"]').click(); await pg.locator('[data-qty="1"]').click();
    await pg.reload(); await sleep(800);
    const q = await pg.locator('[data-qty-val]').innerText();
    await addVia(s, [{ id: Number(V.cobra), quantity: 2 }]);
    await s.goto('/cart', { settle: 800 });
    await pg.locator('[data-code]').fill('QA10');
    await pg.reload(); await sleep(1000);
    const typed = await pg.locator('[data-code]').inputValue();
    return { status: 'INFO', note: `PDP qty after reload=${q} (resets to 1); unapplied code typed then reload → field="${typed}" (draft not kept)` };
  });
  // offline
  await step(rec, { id: 'OF-1', scenario: 'Offline: PDP Add to Cart → alert text (F-15)', ctx }, async () => {
    await clearCart(s); await s.goto('/products/oka-cobra', { settle: 800 });
    await s.context.setOffline(true);
    await pg.locator('[data-buy]').click(); await sleep(1000);
    const al = await alertText(s); await s.shot(`offline-add-${tag}`); await closeAlerts(s);
    await s.context.setOffline(false);
    return { status: al && !/Failed to fetch|NetworkError|TypeError/.test(al) ? 'PASS' : 'FAIL', note: `alert="${al}" → F-15 ${/Failed to fetch/.test(al) ? 'CONFIRMED (raw browser error shown)' : ''}` };
  });
  await step(rec, { id: 'OF-2', scenario: 'Offline: card + stepper and cart − → feedback, UI reverts', ctx }, async () => {
    await clearCart(s); await addVia(s, [{ id: Number(V.mint), quantity: 2 }]);
    await s.goto('/cart', { settle: 1000 });
    await s.context.setOffline(true);
    await pg.locator(`.line[data-variant="${V.mint}"] [data-step="-1"]`).click(); await sleep(1000);
    const al = await alertText(s); await closeAlerts(s);
    const shown = await pg.locator(`.line[data-variant="${V.mint}"]`).getAttribute('data-qty');
    await s.context.setOffline(false);
    return { status: al && shown === '2' ? 'PASS' : 'FAIL', note: `alert="${al}" qty shown=${shown}` };
  });
  await step(rec, { id: 'OF-3', scenario: 'Offline: Checkout button → browser error page / spinner stuck?', ctx }, async () => {
    await s.goto('/cart', { settle: 800 });
    await s.context.setOffline(true);
    await pg.locator('[data-checkout]').click(); await sleep(2000);
    const st = await pg.evaluate(() => ({ url: location.href, btn: document.querySelector('[data-checkout]')?.innerHTML.slice(0, 60) || null })).catch((e) => ({ err: e.message.slice(0, 80) }));
    await s.shot(`offline-checkout-${tag}`);
    await s.context.setOffline(false);
    return { status: 'INFO', note: JSON.stringify(st) };
  });
  await step(rec, { id: 'OF-4', scenario: 'Offline: /pages/track loaded, then refresh tracking offline (language toggle re-runs load)', ctx }, async () => {
    await s.goto('/pages/track?awb=JEGQA0000000002', { settle: 1500 });
    await s.context.setOffline(true);
    await pg.locator('[data-toggle-lang]:visible').first().click(); await sleep(1500);
    const body = await pg.locator('[data-track-body]').innerText();
    await pg.locator('[data-toggle-lang]:visible').first().click(); await sleep(300);
    await s.context.setOffline(false);
    return { status: 'INFO', note: `"${body.replace(/\s+/g, ' ').slice(0, 120)}"` };
  });
  await step(rec, { id: 'OF-5', scenario: 'Offline: discount code apply → message', ctx }, async () => {
    await clearCart(s); await addVia(s, [{ id: Number(V.mint), quantity: 2 }]);
    await s.goto('/cart', { settle: 800 });
    await s.context.setOffline(true);
    await pg.locator('[data-code]').fill('QA10'); await pg.locator('[data-apply]').click(); await sleep(1200);
    const err = await pg.locator('.code-error').innerText().catch(() => '');
    await s.context.setOffline(false);
    return { status: err && !/Failed to fetch/.test(err) ? 'PASS' : 'FAIL', note: `code-error="${err}" → F-15 ${/Failed to fetch/.test(err) ? 'CONFIRMED' : ''}` };
  });
  const p = problems(s, { allow: [/404|500|Failed to fetch|ERR_INTERNET_DISCONNECTED|net::/] });
  rec.add({ id: 'GM-LOG', scenario: 'Guest/misc session error summary', ctx, status: hasProblems(p) ? 'FAIL' : 'PASS', note: JSON.stringify(p).slice(0, 600) });
  await s.close();
}
// external calls audit
await step(rec, { id: 'EX-1', scenario: 'External calls audit (whole run): hosts contacted, key header present', ctx: 'all' }, async () => {
  const all = readJsonl('external-calls.jsonl');
  const hosts = {}; all.forEach((c) => { try { const h = new URL(c.url).host; hosts[h] = (hosts[h] || 0) + 1; } catch (e) {} });
  const tools = {}; all.forEach((c) => { if (c.tool) tools[c.tool] = (tools[c.tool] || 0) + 1; });
  const withKey = all.filter((c) => c.headers && Object.keys(c.headers).some((k) => /x-api-key/i.test(k))).length;
  return { status: 'INFO', note: `calls=${all.length} hosts=${JSON.stringify(hosts)} tools=${JSON.stringify(tools)} requests carrying x-api-key=${withKey} (SEC-01: key is sent from every browser)` };
});
console.log('done');
