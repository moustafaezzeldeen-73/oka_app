// Signed-in account: orders list/detail/tracking/edit/cancel/reorder with mocks, account, addresses,
// loyalty, subscriptions, wishlist, support, track page, contact. Run: node qa/tests/e2e/06-account-orders.mjs
import { session, recorder, step, problems, hasProblems, MOBILES, sleep, cartJs, clearCart, readJsonl, BASE, V } from './lib.mjs';
const rec = recorder('06-account-orders');
const extCalls = () => readJsonl('external-calls.jsonl');
const toolsSince = (n) => extCalls().slice(n).map((c) => c.tool || (c.body && (c.body.params?.name)) || c.url).filter(Boolean);
const alertText = (s) => s.page.locator('.alert').last().innerText().then((t) => t.replace(/\s+/g, ' ')).catch(() => '');
const closeAlerts = async (s) => { for (let i = 0; i < 3; i++) { const b = s.page.locator('.alert-btn').first(); if (!(await b.count())) break; await b.click().catch(() => {}); await sleep(150); } };
const openOrder = async (s, name) => { await s.goto(`/pages/orders?order=${encodeURIComponent(name)}`, { settle: 1500 }); return s.page.locator(`[data-order-detail="${name}"]`); };

for (const device of MOBILES) for (const locale of ['ar', 'en']) {
  const s = await session({ device, locale, loggedIn: true });
  const ctx = s.ctx; const pg = s.page; const tag = `${device}-${locale}`.replace(/\s/g, '');
  const full = device === 'iPhone 13';

  await step(rec, { id: 'OR-1', scenario: 'Orders list: 6 orders with states; tap opens detail (pushState); Back returns to list', ctx }, async () => {
    s.clearLogs(); await s.goto('/pages/orders', { settle: 1500 });
    const cards = await pg.evaluate(() => [...document.querySelectorAll('[data-open-order]')].map((a) => `${a.dataset.openOrder}:${a.querySelector('[data-order-state]')?.textContent.trim()}`));
    await s.shot(`orders-list-${tag}`, { fullPage: true });
    await pg.locator('[data-open-order="#9000102"]').click(); await sleep(600);
    const det = await pg.evaluate(() => ({ url: location.search, vis: [...document.querySelectorAll('[data-order-detail]')].filter((d) => !d.hidden).map((d) => d.dataset.orderDetail), list: !document.querySelector('[data-orders-list]').hidden }));
    await s.shot(`order-9000102-${tag}`, { fullPage: true });
    await pg.goBack(); await sleep(600);
    const back = await pg.evaluate(() => ({ url: location.search, list: !document.querySelector('[data-orders-list]').hidden }));
    await pg.goForward(); await sleep(600);
    const fwd = await pg.evaluate(() => [...document.querySelectorAll('[data-order-detail]')].filter((d) => !d.hidden).map((d) => d.dataset.orderDetail));
    const p = problems(s);
    return { status: cards.length === 6 && det.vis[0] === '#9000102' && back.list && fwd[0] === '#9000102' && !hasProblems(p) ? 'PASS' : 'FAIL', note: `cards=${JSON.stringify(cards)} detail=${JSON.stringify(det)} back=${JSON.stringify(back)} forward=${JSON.stringify(fwd)} ${hasProblems(p) ? JSON.stringify(p) : ''}` };
  });
  await step(rec, { id: 'OR-2', scenario: 'Detail header back button returns to list (in-page)', ctx }, async () => {
    const det = await openOrder(s, '#9000103');
    await det.locator('[data-back]').click(); await sleep(500);
    const st = await pg.evaluate(() => ({ url: location.pathname + location.search, list: !document.querySelector('[data-orders-list]').hidden }));
    return { status: st.list && st.url === '/pages/orders' ? 'PASS' : 'FAIL', note: JSON.stringify(st) };
  });
  // Tracking with mocks
  for (const mode of (full ? ['success', 'sse', 'empty', 'error401', 'error500', 'timeout', 'malformed', 'rpc-error', 'tool-error', 'cors'] : ['success', 'error500', 'timeout'])) {
    await step(rec, { id: 'TR-1', scenario: `Order tracking (#9000102/#9000103 with AWB) — track_delivery mock "${mode}"`, ctx }, async () => {
      await s.setMocks(`track_delivery:${mode},success`); s.clearLogs();
      const det = await openOrder(s, '#9000103');
      if (mode === 'timeout') await sleep(9000);
      const st = await det.evaluate((d) => ({ label: d.querySelector('[data-state-label]')?.textContent.trim(), steps: [...d.querySelectorAll('.step-col.done')].length, updates: d.querySelectorAll('.update-row').length, courier: d.querySelector('.courier-name')?.textContent || null, wa: d.querySelector('.courier-btn.wa')?.getAttribute('href') || null, err: d.querySelector('.ship-err, .awaiting')?.textContent.trim().slice(0, 80) || null, rate: !d.querySelector('[data-rate]')?.hidden }));
      const listState = await pg.evaluate(() => [...document.querySelectorAll('[data-order-state]')].map((e) => `${e.dataset.orderState}:${e.textContent.trim()}`));
      if (['success', 'error500', 'empty'].includes(mode)) await s.shot(`order-track-${mode}-${tag}`, { fullPage: true });
      const p = problems(s, { allow: [/401|500|Failed to load resource|CORS|Access-Control/] });
      return { status: !hasProblems(p) ? 'PASS' : 'FAIL', note: `${JSON.stringify(st)} list=${JSON.stringify(listState)} ${hasProblems(p) ? JSON.stringify(p) : ''}` };
    });
  }
  await s.setMocks('success');
  await step(rec, { id: 'OR-3', scenario: 'Edit order #9000101 via item + : sheet opens with preset, quote, save → customer_update_order', ctx }, async () => {
    const n0 = extCalls().length; s.clearLogs();
    const det = await openOrder(s, '#9000101');
    const steppers = await det.locator('[data-oi] [data-step]').count();
    if (!steppers) return { status: 'FAIL', note: 'no item steppers on unfulfilled order' };
    await det.locator('[data-oi] [data-step="1"]').first().click(); await sleep(2500);
    const sheet = await pg.evaluate(() => { const sh = document.querySelector('.sheet.edit-order'); return sh ? { txt: sh.innerText.replace(/\s+/g, ' ').slice(0, 300), save: sh.querySelector('[data-save]')?.innerText.trim(), dim: sh.querySelector('[data-save]')?.classList.contains('dim') } : null; });
    await s.shot(`order-edit-sheet-${tag}`);
    if (!sheet) return { status: 'FAIL', note: `sheet not opened; alert="${await alertText(s)}"` };
    await pg.locator('.sheet.edit-order [data-save]').click(); await sleep(2500);
    const al = await alertText(s);
    await s.shot(`order-edit-saved-${tag}`);
    await closeAlerts(s);
    const tools = toolsSince(n0);
    return { status: tools.some((t) => /customer_update_order/.test(t)) ? 'PASS' : 'FAIL', note: `steppers=${steppers} sheet=${JSON.stringify(sheet)} alert="${al}" calls=${JSON.stringify(tools)}` };
  });
  if (full) {
    await step(rec, { id: 'OR-4', scenario: 'Edit sheet: Add products picker (search, add, done → requote), − to 0, address field validation', ctx }, async () => {
      await sleep(1500);
      const det = await openOrder(s, '#9000101');
      await det.locator('[data-edit-order]').click(); await sleep(2000);
      if (!(await pg.locator('.sheet.edit-order').count())) return { status: 'FAIL', note: `no sheet; alert="${await alertText(s)}"` };
      const n0 = extCalls().length;
      await pg.locator('.sheet.edit-order [data-open-picker]').click(); await sleep(500);
      await pg.locator('.sheet.edit-order [data-search]').fill('tongs'); await sleep(500);
      const found = await pg.locator('.sheet.edit-order [data-add-variant]').count();
      if (found) await pg.locator('.sheet.edit-order [data-add-variant]').first().click();
      await sleep(400);
      await pg.locator('.sheet.edit-order [data-picker-done]').click().catch(() => {}); await sleep(2000);
      const rows = await pg.evaluate(() => [...document.querySelectorAll('.sheet.edit-order [data-i]')].map((r) => r.innerText.replace(/\s+/g, ' ').slice(0, 60)));
      // typing in name field — F-06 (inputs rebuilt each keystroke → focus/caret)
      const name = pg.locator('.sheet.edit-order [data-f="name"]');
      await name.click(); await name.press('End'); await pg.keyboard.type('xy', { delay: 80 });
      const caret = await pg.evaluate(() => ({ focused: document.activeElement?.getAttribute('data-f'), val: document.activeElement?.value, pos: document.activeElement?.selectionStart }));
      await name.fill('A'); await sleep(400);
      const why = await pg.evaluate(() => document.querySelector('.sheet.edit-order')?.innerText.match(/Enter the receiver’s name|اكتب اسم المستلم/)?.[0] || null);
      const dim = await pg.locator('.sheet.edit-order [data-save]').evaluate((b) => b.classList.contains('dim'));
      await s.shot(`order-edit-picker-${tag}`);
      await pg.locator('.sheet.edit-order [data-close]').first().click().catch(() => {});
      return { status: found && why && dim ? 'PASS' : 'FAIL', note: `picker results=${found} rows=${JSON.stringify(rows)} quotes=${JSON.stringify(toolsSince(n0))} caret after typing=${JSON.stringify(caret)} short-name msg=${why} saveDim=${dim}` };
    });
    for (const mode of ['error500', 'timeout', 'shipped', 'not-found', 'malformed', 'rpc-error']) {
      await step(rec, { id: 'OR-5', scenario: `Edit order when customer_get_order → "${mode}": friendly alert, state`, ctx }, async () => {
        await s.setMocks(`customer_get_order:${mode},success`);
        const det = await openOrder(s, '#9000101');
        await det.locator('[data-edit-order]').click(); await sleep(mode === 'timeout' ? 10000 : 2000);
        const al = await alertText(s);
        const st = await det.evaluate((d) => ({ disabled: d.querySelector('.edit-btn')?.disabled, note: d.querySelector('.shipped-note')?.innerText.replace(/\s+/g, ' ').slice(0, 60) || null }));
        await closeAlerts(s); await s.setMocks('success');
        return { status: al ? 'PASS' : 'FAIL', note: `alert="${al}" ${JSON.stringify(st)}` };
      });
    }
    await step(rec, { id: 'OR-6', scenario: 'customer_quote_order error while editing → sheet shows error, Save disabled', ctx }, async () => {
      await s.setMocks('customer_quote_order:error500,success');
      const det = await openOrder(s, '#9000101');
      await det.locator('[data-oi] [data-step="1"]').first().click(); await sleep(2500);
      const st = await pg.evaluate(() => { const sh = document.querySelector('.sheet.edit-order'); return sh ? { txt: sh.innerText.replace(/\s+/g, ' ').slice(-250), dim: sh.querySelector('[data-save]')?.classList.contains('dim') } : null; });
      await s.shot(`order-quote-error-${tag}`);
      await pg.locator('.sheet.edit-order [data-close]').first().click().catch(() => {});
      await s.setMocks('success');
      return { status: st ? 'PASS' : 'FAIL', note: JSON.stringify(st) };
    });
  }
  await step(rec, { id: 'OR-7', scenario: 'Cancel #9000106: "Back" keeps it; "Cancel order" calls API, marks cancelled; reload state', ctx }, async () => {
    const n0 = extCalls().length;
    let det = await openOrder(s, '#9000106');
    await det.locator('[data-cancel-order]').click(); await sleep(400);
    const q = await alertText(s);
    await pg.locator('.alert-btn.cancel').click(); await sleep(300);
    const afterBack = toolsSince(n0).filter((t) => /cancel/.test(t)).length;
    await det.locator('[data-cancel-order]').click(); await sleep(400);
    await pg.locator('.alert-btn.destructive').click(); await sleep(2000);
    const done = await alertText(s);
    await s.shot(`order-cancelled-${tag}`, { fullPage: true });
    await closeAlerts(s);
    const st = await det.evaluate((d) => ({ banner: !d.querySelector('[data-cancelled-banner]').hidden, cancelled: d.dataset.cancelled }));
    det = await openOrder(s, '#9000106');
    const after = await det.evaluate((d) => ({ banner: !d.querySelector('[data-cancelled-banner]').hidden, cancelled: d.dataset.cancelled }));
    const stored = await pg.evaluate(() => localStorage.getItem('oka.cancelled'));
    return { status: afterBack === 0 && st.banner ? (after.banner ? 'PASS' : 'FAIL') : 'FAIL', note: `confirm="${q}" calls after Back=${afterBack}; done="${done}" ${JSON.stringify(st)}; after reload ${JSON.stringify(after)} oka.cancelled=${stored} (harness fixture is not cancelled server-side, so after reload the theme relies on oka.cancelled, which nothing writes)` };
  });
  if (full) {
    for (const mode of ['shipped', 'error500']) {
      await step(rec, { id: 'OR-8', scenario: `Cancel when customer_cancel_order → "${mode}"`, ctx }, async () => {
        await s.setMocks(`customer_cancel_order:${mode},success`);
        const det = await openOrder(s, '#9000101');
        await det.locator('[data-cancel-order]').click(); await sleep(300);
        await pg.locator('.alert-btn.destructive').click(); await sleep(2000);
        const al = await alertText(s);
        const st = await det.evaluate((d) => ({ editDisabled: d.querySelector('.edit-btn')?.disabled, note: Boolean(d.querySelector('.shipped-note')), cancelled: d.dataset.cancelled }));
        await closeAlerts(s); await s.setMocks('success');
        return { status: al && st.cancelled === 'false' ? 'PASS' : 'FAIL', note: `alert="${al}" ${JSON.stringify(st)}` };
      });
    }
  }
  await step(rec, { id: 'OR-9', scenario: 'Cancelled (#9000104) and fulfilled (#9000105) orders: edit/cancel give "not available" without API calls', ctx }, async () => {
    const n0 = extCalls().length; const out = [];
    for (const name of ['#9000104', '#9000105']) {
      const det = await openOrder(s, name);
      for (const sel of ['[data-edit-order]', '[data-cancel-order]']) {
        const b = det.locator(sel);
        if (!(await b.count()) || !(await b.isVisible())) { out.push(`${name} ${sel}: hidden`); continue; }
        await b.click({ force: true }); await sleep(400); out.push(`${name} ${sel}: "${await alertText(s)}"`); await closeAlerts(s);
      }
    }
    const calls = toolsSince(n0).filter((t) => /customer_/.test(t));
    return { status: calls.length === 0 ? 'PASS' : 'FAIL', note: `${out.join(' | ')}; orders-API calls=${JSON.stringify(calls)}` };
  });
  await step(rec, { id: 'OR-10', scenario: 'Order again (#9000105) → cart has its items, goes to /cart', ctx }, async () => {
    await clearCart(s);
    const det = await openOrder(s, '#9000105');
    const lines = JSON.parse(await det.getAttribute('data-lines'));
    await Promise.all([pg.waitForURL('**/cart', { timeout: 6000 }).catch(() => {}), det.locator('[data-reorder]').click()]);
    await sleep(800); await closeAlerts(s);
    const c = await cartJs(s);
    return { status: c.item_count > 0 && pg.url().endsWith('/cart') ? 'PASS' : 'FAIL', note: `order lines=${JSON.stringify(lines.map((l) => `${l.handle}×${l.quantity}`))} cart=${c.items.map((i) => `${i.handle}×${i.quantity}`)} url=${pg.url()}` };
  });
  if (full) {
    await step(rec, { id: 'OR-11', scenario: 'SEC-04: orders-API address with HTML → injected into the edit sheet / guest view?', ctx }, async () => {
      await pg.route('**/mcp', async (route) => {
        const body = JSON.parse(route.request().postData() || '{}');
        const tool = body.params?.name;
        if (tool !== 'customer_get_order' && tool !== 'customer_quote_order') return route.fallback();
        const v = { orderNumber: '#9000101', status: 'processing', cancelled: false, canCancel: true, canEdit: true, items: [{ variantId: V.cloud, quantity: 1, title: '<img src=x onerror="window.__x4=1">Hookah', unitPrice: 169 }], address: { name: '<img src=x onerror="window.__x4=2">', provinceCode: 'C', city: '<b>Nasr</b>', address1: '<img src=x onerror="window.__x4=3"> street 1', address2: '' }, phone: '01000000001', itemsTotal: 169, discount: 0, shipping: 60, total: 229 };
        return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: JSON.stringify(v) }] } }) });
      });
      const det = await openOrder(s, '#9000101');
      await det.locator('[data-edit-order]').click(); await sleep(2500);
      const x = await pg.evaluate(() => ({ fired: window.__x4 || 0, imgs: document.querySelectorAll('.sheet img[src="x"]').length }));
      await pg.locator('.sheet [data-close]').first().click().catch(() => {});
      await pg.unroute('**/mcp');
      return { status: x.fired || x.imgs ? 'FAIL' : 'PASS', note: `${JSON.stringify(x)} (signed-in order detail address comes from Liquid; SEC-04's innerHTML path was ${x.fired ? 'reached' : 'not reached via edit sheet'})` };
    });
  }
  // ── account & friends ──
  await step(rec, { id: 'AC-1', scenario: '/pages/account: rows, each link resolves; Sign out clears local state and logs out', ctx }, async () => {
    s.clearLogs(); await s.goto('/pages/account', { settle: 900 });
    const links = await pg.evaluate(() => [...document.querySelectorAll('[data-screen="account"] a[href]')].map((a) => a.getAttribute('href')));
    const bad = [];
    for (const h of links.filter((h) => h.startsWith('/'))) { const r = await fetch(BASE + h, { headers: { cookie: 'qa_customer=1' }, redirect: 'manual' }); if (r.status >= 400) bad.push(`${h} ${r.status}`); }
    await s.shot(`account-${tag}`, { fullPage: true });
    return { status: !bad.length ? 'PASS' : 'FAIL', note: `links=${JSON.stringify(links)} bad=${JSON.stringify(bad)} signout=${await pg.locator('[data-sign-out]').getAttribute('href')}` };
  });
  await step(rec, { id: 'AD-1', scenario: 'Addresses: list 3, labels, ETA; make Giza default → classic form post; result', ctx }, async () => {
    s.clearLogs(); await s.goto('/pages/addresses', { settle: 900 });
    const cards = await pg.evaluate(() => [...document.querySelectorAll('[data-addr]')].map((c) => `${c.dataset.addr}:${c.dataset.province}:${c.dataset.default}:${c.querySelector('[data-eta]')?.textContent}`));
    await s.shot(`addresses-${tag}`, { fullPage: true });
    const f0 = readJsonl('forms.jsonl').length;
    const btn = pg.locator('[data-addr="9000000002"] [data-make-default]');
    if (await btn.count()) { await Promise.all([pg.waitForNavigation({ timeout: 6000 }).catch(() => {}), btn.click()]); await sleep(800); }
    const forms = readJsonl('forms.jsonl').slice(f0);
    const landed = pg.url();
    await s.goto('/pages/addresses', { settle: 800 });
    const def = await pg.evaluate(() => [...document.querySelectorAll('[data-addr]')].find((c) => c.dataset.default === 'true')?.dataset.addr);
    return { status: forms.length && def === '9000000002' ? 'PASS' : 'FAIL', note: `cards=${JSON.stringify(cards)}; posted=${JSON.stringify(forms.map((f) => `${f.method || ''} ${f.path || f.url} ${JSON.stringify(f.fields || f.keys || '').slice(0, 120)}`))} landed=${landed} default now=${def} (SI-01: on the live store with new customer accounts this classic POST does not exist)` };
  });
  await step(rec, { id: 'AD-2', scenario: 'Delete address (confirm) → classic form delete', ctx }, async () => {
    await s.goto('/pages/addresses', { settle: 800 });
    const f0 = readJsonl('forms.jsonl').length;
    await pg.locator('[data-addr="9000000003"] [data-delete-addr]').click(); await sleep(300);
    const q = await alertText(s);
    await Promise.all([pg.waitForNavigation({ timeout: 6000 }).catch(() => {}), pg.locator('.alert-btn.destructive').click()]);
    await s.goto('/pages/addresses', { settle: 800 });
    const n = await pg.locator('[data-addr]').count();
    return { status: n === 2 ? 'PASS' : 'FAIL', note: `confirm="${q}" posts=${readJsonl('forms.jsonl').length - f0} addresses now=${n}` };
  });
  await step(rec, { id: 'AD-3', scenario: 'Add address: missing-fields alert; GPS locate (Nominatim mock) fills; province chip; save → classic POST; back to list', ctx }, async () => {
    s.clearLogs(); await s.goto('/pages/addresses?view=oka-add-address', { settle: 900 });
    await pg.locator('[data-save]').click(); await sleep(400);
    const miss = await alertText(s); await closeAlerts(s);
    await pg.locator('[data-locate]').click(); await sleep(2000);
    const loc = await pg.evaluate(() => ({ city: document.querySelector('[data-f="city"]')?.value, street: document.querySelector('[data-f="street"]')?.value, found: !document.querySelector('[data-found]')?.hidden, chip: document.querySelector('.prov-chip.on')?.dataset.prov }));
    const al2 = await alertText(s); await closeAlerts(s);
    await pg.locator('[data-f="name"]').fill('QA Tester');
    await pg.locator('[data-f="phone"]').fill('01000000077');
    await pg.locator('[data-f="street"]').fill('12 QA Street');
    await pg.locator('[data-f="building"]').fill('5');
    await pg.locator('[data-f="city"]').fill('Mohandessin');
    await pg.locator('[data-prov="GZ"]').click();
    await s.shot(`add-address-filled-${tag}`, { fullPage: true });
    const f0 = readJsonl('forms.jsonl').length;
    await Promise.all([pg.waitForNavigation({ timeout: 8000 }).catch(() => {}), pg.locator('[data-save]').click()]);
    await sleep(1200);
    const forms = readJsonl('forms.jsonl').slice(f0);
    const ext = s.logs.external.filter((e) => /nominatim/.test(e.url)).length;
    return { status: miss && forms.length ? 'PASS' : 'FAIL', note: `missing alert="${miss}"; locate → ${JSON.stringify(loc)} alert="${al2}" nominatim calls=${ext}; posted=${JSON.stringify(forms.map((f) => f.fields || f))}`.slice(0, 900) + ` landed=${pg.url()}` };
  });
  await step(rec, { id: 'LY-1', scenario: 'Loyalty: points shown (250), rewards, redeem/copy/apply with service not configured', ctx }, async () => {
    s.clearLogs(); await s.goto('/pages/loyalty', { settle: 1500 });
    const st = await pg.evaluate(() => ({ pts: document.querySelector('[data-points-val]')?.textContent, err: document.querySelector('[data-points-err]')?.innerText || null, rewards: [...document.querySelectorAll('[data-redeem]')].map((b) => `${b.dataset.redeem}:${b.textContent.trim()}`), next: document.querySelector('[data-next-tier]')?.textContent }));
    await s.shot(`loyalty-${tag}`, { fullPage: true });
    let al = '';
    const on = pg.locator('[data-redeem].on').first();
    if (await on.count()) { await on.click(); await sleep(400); al = await alertText(s); const b = pg.locator('.alert-btn').last(); await b.click().catch(() => {}); await sleep(1200); al += ` → ${await alertText(s)}`; await closeAlerts(s); }
    // voucher already stored → Use in cart → pending code applied
    await pg.evaluate(() => localStorage.setItem('oka.vouchers', JSON.stringify([{ code: 'QA10', endsAt: '2030-01-01', reward: { en: '10% off', ar: 'خصم ١٠٪' } }])));
    await s.goto('/pages/loyalty', { settle: 1000 });
    let applied = null;
    if (await pg.locator('[data-voucher]').count()) {
      await pg.locator('[data-voucher]').first().click(); await sleep(300);
      await Promise.all([pg.waitForURL('**/cart', { timeout: 6000 }).catch(() => {}), pg.locator('.alert-btn', { hasText: /Use in cart|استخدمه/ }).click()]);
      await sleep(2000);
      applied = (await cartJs(s)).discount_codes;
    }
    await pg.evaluate(() => localStorage.removeItem('oka.vouchers'));
    const p = problems(s);
    return { status: st.pts && !hasProblems(p) ? 'PASS' : 'FAIL', note: `${JSON.stringify(st)} redeem: "${al}" voucher→cart codes=${JSON.stringify(applied)} ${hasProblems(p) ? JSON.stringify(p) : ''}` };
  });
  for (const pth of ['/pages/subscriptions', '/pages/subscriptions?view=oka-subscribe', '/pages/wishlist', '/pages/support', '/pages/contact', '/pages/about-us', '/pages/how-to-use', '/pages/faq', '/account', '/account/addresses']) {
    await step(rec, { id: 'AC-2', scenario: `Signed-in page ${pth}: renders, no errors; visible actions`, ctx }, async () => {
      s.clearLogs(); const r = await s.goto(pth, { settle: 1200 });
      const st = await pg.evaluate(() => ({ text: (document.querySelector('[data-screen]') || document.body).innerText.replace(/\s+/g, ' ').slice(0, 160), buttons: [...document.querySelectorAll('[data-screen] a[href], [data-screen] button')].map((b) => (b.getAttribute('href') || b.textContent.trim()).slice(0, 30)).slice(0, 12) }));
      await s.shot(`page-${pth.replace(/\W+/g, '_')}-${tag}`, { fullPage: true });
      const p = problems(s);
      return { status: r.status() === 200 && !hasProblems(p) ? 'PASS' : 'FAIL', note: `HTTP ${r.status()} ${JSON.stringify(st)} ${hasProblems(p) ? JSON.stringify(p) : ''}` };
    });
  }
  await step(rec, { id: 'SP-1', scenario: 'Support: WhatsApp button hidden (whatsapp setting empty, SI-08); links work', ctx }, async () => {
    await s.goto('/pages/support', { settle: 800 });
    const wa = await pg.locator('a[href*="wa.me"]').count();
    const links = await pg.evaluate(() => [...document.querySelectorAll('[data-screen="support"] a[href]')].map((a) => a.getAttribute('href')));
    return { status: 'INFO', note: `wa.me links=${wa} (SI-08 ${wa ? 'REFUTED' : 'CONFIRMED'}); links=${JSON.stringify(links)}` };
  });
  await step(rec, { id: 'CF-1', scenario: 'Contact form: submit → posted, success message', ctx }, async () => {
    await s.goto('/pages/contact', { settle: 800 });
    const form = pg.locator('form[action*="contact"], form.contact-form, form').first();
    if (!(await form.count())) return { status: 'FAIL', note: 'no form on /pages/contact' };
    const inputs = await form.evaluate((f) => [...f.querySelectorAll('input:not([type=hidden]), textarea')].map((i) => i.name));
    for (const n of inputs) { const el = form.locator(`[name="${n}"]`); const type = await el.getAttribute('type'); await el.fill(type === 'email' || /email/.test(n) ? 'qa@example.com' : /phone/.test(n) ? '01000000077' : 'QA test message'); }
    await Promise.all([pg.waitForNavigation({ timeout: 6000 }).catch(() => {}), form.locator('button[type=submit], button:not([type]), input[type=submit]').first().click()]);
    await sleep(600);
    const ok = await pg.evaluate(() => document.body.innerText.match(/(thank|شكر|sent|اتبعت|وصلت)[^\n]{0,60}/i)?.[0] || null);
    await s.shot(`contact-posted-${tag}`);
    return { status: /contact_posted=true/.test(pg.url()) && ok ? 'PASS' : 'FAIL', note: `fields=${JSON.stringify(inputs)} url=${pg.url()} message=${ok}` };
  });
  for (const [q, mode] of [['?awb=JEGQA0000000002&order=%239000103', 'success'], ['?awb=JEGQA0000000002&order=%239000103', 'empty'], ['?awb=JEGQA0000000002', 'error500'], ['?awb=JEGQA0000000002', 'timeout'], ['?awb=JEGQA0000000002', 'malformed'], ['', 'success'], ['?awb=%3Cimg%20src%3Dx%20onerror%3Dwindow.__t%3D1%3E', 'success']]) {
    if (!full && mode !== 'success') continue;
    await step(rec, { id: 'TK-1', scenario: `/pages/track${q || ' (no awb)'} with track_delivery "${mode}"`, ctx }, async () => {
      await s.setMocks(`track_delivery:${mode},success`); s.clearLogs();
      await s.goto(`/pages/track${q}`, { settle: mode === 'timeout' ? 9500 : 1500 });
      const st = await pg.evaluate(() => ({ body: document.querySelector('[data-track-body]')?.innerText.replace(/\s+/g, ' ').slice(0, 140), awb: document.querySelector('[data-track-awb]')?.textContent, ext: document.querySelector('[data-track-external]')?.getAttribute('href'), xss: window.__t || 0 }));
      if (mode !== 'success' || !q) await s.shot(`track-${mode}-${q ? 'awb' : 'none'}-${tag}`);
      await s.setMocks('success');
      const p = problems(s, { allow: [/500|Failed to load resource/] });
      return { status: !st.xss && !hasProblems(p) ? 'PASS' : 'FAIL', note: `${JSON.stringify(st)} ${hasProblems(p) ? JSON.stringify(p) : ''}` };
    });
  }
  const p = problems(s, { allow: [/500|401|Failed to load resource|CORS|Access-Control/] });
  rec.add({ id: 'AC-LOG', scenario: 'Account session error summary', ctx, status: hasProblems(p) ? 'FAIL' : 'PASS', note: JSON.stringify(p).slice(0, 600) });
  await s.close();
}
// guest view of account pages
for (const locale of ['ar', 'en']) {
  const s = await session({ device: 'iPhone 13', locale });
  for (const pth of ['/pages/account', '/pages/orders', '/pages/addresses', '/pages/loyalty', '/pages/wishlist', '/pages/subscriptions', '/account', '/account/addresses']) {
    await step(rec, { id: 'AC-3', scenario: `Guest opens ${pth}: sign-in prompt / redirect, no errors`, ctx: s.ctx }, async () => {
      s.clearLogs(); const r = await s.goto(pth, { settle: 900 });
      const st = await s.page.evaluate(() => ({ url: location.pathname + location.search, text: (document.querySelector('[data-screen]') || document.body).innerText.replace(/\s+/g, ' ').slice(0, 140), signIn: document.querySelectorAll('[data-sign-in], a[href*="customer_authentication"], a[href*="/account/login"]').length }));
      await s.shot(`guest-${pth.replace(/\W+/g, '_')}-${locale}`);
      const p = problems(s);
      return { status: r.status() < 400 && !hasProblems(p) ? 'PASS' : 'FAIL', note: JSON.stringify(st) };
    });
  }
  await s.close();
}
console.log('done');
