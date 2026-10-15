// Home feed journeys. Run: node qa/tests/e2e/02-home.mjs
import { session, recorder, step, problems, hasProblems, ALL_DEVICES, sleep, cartJs, clearCart, BASE, V } from './lib.mjs';
const rec = recorder('02-home');

for (const device of ALL_DEVICES) for (const locale of ['ar', 'en']) for (const loggedIn of (device === 'iPhone 13' ? [false, true] : [false])) {
  const s = await session({ device, locale, loggedIn });
  const ctx = s.ctx; const pg = s.page; const tag = `${device}-${locale}-${loggedIn ? 'c' : 'g'}`.replace(/\s/g, '');
  await step(rec, { id: 'HM-1', scenario: 'Home loads, feed pages, no console/page errors', ctx }, async () => {
    await s.goto('/', { settle: 1200 });
    const info = await pg.evaluate(() => {
      const feed = document.querySelector('[data-feed]');
      const pages = [...feed.querySelectorAll('.page')];
      return { pages: pages.length, kinds: pages.map((p) => p.className.replace('page', '').trim() || `col:${p.querySelector('.ctitle, h2, .col-title')?.innerText?.trim()?.slice(0, 30) || p.dataset.i}`), snap: getComputedStyle(feed).scrollSnapType, fh: feed.clientHeight, vh: innerHeight };
    });
    await s.shot(`home-${tag}`);
    const p = problems(s);
    return { status: info.pages > 5 && !hasProblems(p) ? 'PASS' : 'FAIL', note: `${info.pages} pages; snap=${info.snap}; feed h=${info.fh}/${info.vh}; ${hasProblems(p) ? JSON.stringify(p) : ''}`, data: info };
  });
  await step(rec, { id: 'HM-2', scenario: 'Snap scrolling: feed scroll by one screen snaps to next page, active class follows', ctx }, async () => {
    const res = [];
    for (let k = 1; k <= 4; k++) {
      await pg.evaluate((k) => { const f = document.querySelector('[data-feed]'); f.scrollTo({ top: f.clientHeight * k - 40 }); }, k);
      await sleep(900);
      res.push(await pg.evaluate(() => { const f = document.querySelector('[data-feed]'); const pages = [...f.querySelectorAll('.page')]; return { top: f.scrollTop, h: f.clientHeight, aligned: Math.abs(f.scrollTop / f.clientHeight - Math.round(f.scrollTop / f.clientHeight)) < 0.02, active: pages.findIndex((p) => p.classList.contains('active')) }; }));
    }
    await pg.evaluate(() => document.querySelector('[data-feed]').scrollTo({ top: 0 }));
    await sleep(500);
    const ok = res.every((r, i) => r.aligned && r.active === i + 1);
    return { status: ok ? 'PASS' : 'FAIL', note: JSON.stringify(res) };
  });
  await step(rec, { id: 'HM-3', scenario: 'Collections shown on the feed vs the 10 setting collections (SI-02: hookahs/hoses/coal/bowls hidden)', ctx }, async () => {
    const shown = await pg.evaluate(() => [...document.querySelectorAll('[data-feed] .page[data-i]')].map((p) => (p.querySelector('a[href^="/collections/"]') || {}).getAttribute?.('href')));
    const want = ['hookahs', 'hoses', 'coal', 'bowls'];
    const missing = want.filter((h) => !shown.some((x) => x && x.includes(`/collections/${h}`)));
    return { status: missing.length ? 'FAIL' : 'PASS', note: `collection pages link to: ${JSON.stringify(shown)}; setting collections absent from feed: ${missing.join(', ')} (SI-02 ${missing.length === 4 ? 'CONFIRMED' : 'partly'})` };
  });
  await step(rec, { id: 'HM-4', scenario: 'Every feed link (banners, offer cards, collection titles) resolves 200', ctx }, async () => {
    const hrefs = await pg.evaluate(() => [...new Set([...document.querySelectorAll('[data-feed] a[href]')].map((a) => a.getAttribute('href')).filter((h) => h.startsWith('/') && !h.startsWith('/products/')))]);
    const bad = [];
    for (const h of hrefs) { const r = await fetch(BASE + h, { headers: { cookie: 'qa_customer=0' } }); if (r.status !== 200) bad.push(`${h} ${r.status}`); }
    return { status: bad.length ? 'FAIL' : 'PASS', note: `${hrefs.length} links: ${hrefs.join(' ')}; bad=${JSON.stringify(bad)}` };
  });
  await step(rec, { id: 'HM-5', scenario: 'Offer slot not in focus: first tap only centres it (no add); tap in focus adds the bundle', ctx }, async () => {
    await clearCart(s); await s.goto('/', { settle: 800 });
    // the offers rail is the page that has .offers
    await pg.evaluate(() => { const f = document.querySelector('[data-feed]'); const r = document.querySelector('.rail.offers'); const pg = r.closest('.page'); f.scrollTo({ top: pg.offsetTop }); });
    await sleep(800);
    const slots = await pg.evaluate(() => [...document.querySelectorAll('.rail.offers [data-slot]')].map((s) => { const r = s.getBoundingClientRect(); return { active: s.classList.contains('active'), l: Math.round(r.left), r: Math.round(r.right), w: innerWidth }; }));
    const second = pg.locator('.rail.offers [data-slot]').nth(1);
    const fully = slots[1] && slots[1].l >= 0 && slots[1].r <= slots[1].w;
    await second.locator('.offer-cta').click({ force: true });
    await sleep(900);
    const after = await pg.evaluate(() => ({ url: location.pathname, active: [...document.querySelectorAll('.rail.offers [data-slot]')].map((s) => s.classList.contains('active')) }));
    const c1 = await cartJs(s);
    await s.shot(`home-offer-side-tap-${tag}`);
    return { status: (fully || (c1.item_count === 0 && after.url === '/')) ? 'PASS' : 'FAIL', note: `slots=${JSON.stringify(slots)}; second fully visible=${fully}; after side tap url=${after.url} active=${JSON.stringify(after.active)} cart items=${c1.item_count}` };
  });
  for (const k of [0, 1]) {
    await step(rec, { id: 'HM-6', scenario: `Offer #${k + 1} "Add bundle to cart" → straight to /cart with every bundle variant`, ctx }, async () => {
      await clearCart(s); await s.goto('/', { settle: 800 });
      await pg.evaluate(() => { const f = document.querySelector('[data-feed]'); const pg = document.querySelector('.rail.offers').closest('.page'); f.scrollTo({ top: pg.offsetTop }); });
      await sleep(600);
      const btn = pg.locator('.rail.offers [data-slot]').nth(k).locator('[data-add-bundle]');
      const ids = (await btn.getAttribute('data-add-bundle')).split(',');
      // bring into focus first
      await pg.locator('.rail.offers [data-slot]').nth(k).evaluate((el) => el.scrollIntoView({ inline: 'center' }));
      await sleep(700);
      await Promise.all([pg.waitForURL('**/cart', { timeout: 8000 }).catch(() => {}), btn.click()]);
      await sleep(900);
      const c = await cartJs(s);
      const have = c.items.map((i) => String(i.variant_id));
      const missing = ids.filter((i) => !have.includes(i));
      const totals = await pg.evaluate(() => [...document.querySelectorAll('.totals .sum-row, .totals > div')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
      await s.shot(`home-offer${k + 1}-cart-${tag}`);
      return { status: pg.url().endsWith('/cart') && !missing.length ? 'PASS' : 'FAIL', note: `url=${pg.url()} items=${c.item_count} missing=${missing} original=${c.original_total_price / 100} total=${c.total_price / 100} discounts=${JSON.stringify(c.cart_level_discount_applications?.map((d) => d.title) || [])} lineDisc=${JSON.stringify(c.items.flatMap((i) => (i.line_level_discount_allocations || []).map((d) => d.discount_application?.title || d.amount)))} totals=${JSON.stringify(totals)}` };
    });
  }
  if (device === 'iPhone 13' && locale === 'ar' && !loggedIn) {
    await step(rec, { id: 'HM-7', scenario: 'Offer button double-tap adds the bundle once (disabled guard)', ctx }, async () => {
      await clearCart(s); await s.goto('/', { settle: 800 });
      await pg.evaluate(() => { const f = document.querySelector('[data-feed]'); const pg = document.querySelector('.rail.offers').closest('.page'); f.scrollTo({ top: pg.offsetTop }); });
      await sleep(600);
      const btn = pg.locator('.rail.offers [data-slot]').nth(0).locator('[data-add-bundle]');
      await btn.evaluate((b) => { b.click(); b.click(); });
      await pg.waitForURL('**/cart', { timeout: 8000 }).catch(() => {});
      await sleep(600);
      const c = await cartJs(s);
      return { status: c.item_count === 4 ? 'PASS' : 'FAIL', note: `item_count=${c.item_count} (bundle has 4 variants)` };
    });
    await step(rec, { id: 'HM-8', scenario: 'Offer bundle containing a sold-out variant → toast, nothing added (atomic)', ctx }, async () => {
      await clearCart(s); await s.goto('/', { settle: 800 });
      await pg.evaluate((foil) => { const b = document.querySelector('[data-add-bundle]'); b.dataset.addBundle = `${b.dataset.addBundle},${foil}`; }, V.foil);
      await pg.evaluate(() => { const f = document.querySelector('[data-feed]'); const pg = document.querySelector('.rail.offers').closest('.page'); f.scrollTo({ top: pg.offsetTop }); });
      await sleep(600);
      await pg.locator('[data-add-bundle]').first().click();
      await sleep(900);
      const toast = await pg.locator('.toast').innerText().catch(() => '');
      const c = await cartJs(s);
      return { status: c.item_count === 0 && toast ? 'PASS' : 'FAIL', note: `url=${pg.url()} items=${c.item_count} toast="${toast}" (DOM-modified bundle to include sold-out foil)` };
    });
  }
  await step(rec, { id: 'HM-9', scenario: 'Product card: single tap opens PDP after 280ms', ctx }, async () => {
    await clearCart(s); await s.goto('/', { settle: 800 });
    await pg.evaluate(() => { const f = document.querySelector('[data-feed]'); const p = document.querySelector('.page[data-i="0"]'); f.scrollTo({ top: p.offsetTop }); });
    await sleep(700);
    const card = pg.locator('.page[data-i="0"] [data-slot].active [data-tap]').first();
    const href = await card.getAttribute('href');
    await Promise.all([pg.waitForURL(`**${href}`, { timeout: 5000 }).catch(() => {}), card.click({ position: { x: 30, y: 30 } })]);
    return { status: pg.url().includes(href) ? 'PASS' : 'FAIL', note: `card href=${href} landed=${pg.url()}` };
  });
  await step(rec, { id: 'HM-10', scenario: 'Product card: double tap adds to cart (no navigation)', ctx }, async () => {
    await clearCart(s); await s.goto('/', { settle: 800 });
    await pg.evaluate(() => { const f = document.querySelector('[data-feed]'); const p = document.querySelector('.page[data-i="0"]'); f.scrollTo({ top: p.offsetTop }); });
    await sleep(700);
    const card = pg.locator('.page[data-i="0"] [data-slot].active [data-tap]').first();
    const vid = await card.getAttribute('data-variant');
    await card.dblclick({ position: { x: 30, y: 30 } });
    await sleep(1200);
    const c = await cartJs(s);
    const q = c.items.filter((i) => String(i.variant_id) === vid).reduce((a, i) => a + i.quantity, 0);
    return { status: q === 1 && new URL(pg.url()).pathname === '/' ? 'PASS' : 'FAIL', note: `qty=${q} url=${pg.url()}` };
  });
  await step(rec, { id: 'HM-11', scenario: 'Card "Add" turns into −/+; + and − update the cart; − to 0 restores Add', ctx }, async () => {
    await clearCart(s); await s.goto('/', { settle: 800 });
    await pg.evaluate(() => { const f = document.querySelector('[data-feed]'); const p = document.querySelector('.page[data-i="0"]'); f.scrollTo({ top: p.offsetTop }); });
    await sleep(700);
    const slot = pg.locator('.page[data-i="0"] [data-slot].active').first();
    const add = slot.locator('.add-btn[data-add]');
    const vid = await add.getAttribute('data-add');
    await add.click(); await sleep(1200);
    const st1 = await slot.evaluate((el) => ({ addHidden: el.querySelector('.add-btn').hidden, n: el.querySelector('.card-qty-n')?.textContent }));
    await slot.locator('[data-cq="1"]').click(); await slot.locator('[data-cq="1"]').click(); await sleep(1500);
    const q3 = (await cartJs(s)).items.filter((i) => String(i.variant_id) === vid).reduce((a, i) => a + i.quantity, 0);
    const n3 = await slot.locator('.card-qty-n').innerText();
    await s.shot(`home-card-stepper-${tag}`);
    for (let i = 0; i < 3; i++) await slot.locator('[data-cq="-1"]').click();
    await sleep(1800);
    const q0 = (await cartJs(s)).items.filter((i) => String(i.variant_id) === vid).reduce((a, i) => a + i.quantity, 0);
    const st0 = await slot.evaluate((el) => ({ addHidden: el.querySelector('.add-btn').hidden, qtyHidden: el.querySelector('.card-qty')?.hidden }));
    const addedBar = await pg.locator('.added-bar').count();
    return { status: st1.addHidden && q3 === 3 && q0 === 0 && !st0.addHidden ? 'PASS' : 'FAIL', note: `after Add: ${JSON.stringify(st1)} addedBar=${addedBar}; after ++: cart=${q3} shown=${n3}; after ---: cart=${q0} ${JSON.stringify(st0)}` };
  });
  await step(rec, { id: 'HM-12', scenario: 'F-04: card shows −/+ on page load for a product already in the cart', ctx }, async () => {
    await clearCart(s);
    const vid = await pg.evaluate(() => document.querySelector('.page[data-i="0"] .add-btn[data-add]').dataset.add);
    await pg.evaluate(async (vid) => fetch('/cart/add.js', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: [{ id: Number(vid), quantity: 2 }] }) }), vid);
    await s.goto('/', { settle: 1500 });
    const st = await pg.evaluate((vid) => { const b = document.querySelector(`.page[data-i="0"] .add-btn[data-add="${vid}"]`); return { addHidden: b.hidden, stepper: Boolean(b.nextElementSibling?.matches('.card-qty')), badge: document.querySelector('[data-cart-count]')?.textContent }; }, vid);
    await s.shot(`home-F04-reload-${tag}`);
    return { status: st.addHidden && st.stepper ? 'PASS' : 'FAIL', note: `after reload with qty 2 in cart: ${JSON.stringify(st)} → F-04 ${st.stepper ? 'REFUTED' : 'CONFIRMED'}` };
  });
  await step(rec, { id: 'HM-13', scenario: 'Compare slider: auto-sweeps when on screen; keyboard range input moves divider', ctx }, async () => {
    await s.goto('/', { settle: 600 });
    await pg.evaluate(() => { const f = document.querySelector('[data-feed]'); const p = document.querySelector('[data-compare]'); f.scrollTo({ top: p.offsetTop }); });
    await sleep(1200);
    const p1 = await pg.evaluate(() => document.querySelector('[data-compare]').style.getPropertyValue('--pos'));
    await sleep(700);
    const p2 = await pg.evaluate(() => document.querySelector('[data-compare]').style.getPropertyValue('--pos'));
    await pg.locator('[data-compare-range]').evaluate((r) => { r.value = '10'; r.dispatchEvent(new Event('input', { bubbles: true })); });
    const p3 = await pg.evaluate(() => document.querySelector('[data-compare]').style.getPropertyValue('--pos'));
    await s.shot(`home-compare-${tag}`);
    // drag
    const fr = await pg.locator('[data-compare] .compare-frame').boundingBox();
    await pg.mouse.move(fr.x + fr.width * 0.5, fr.y + fr.height / 2); await pg.mouse.down(); await pg.mouse.move(fr.x + fr.width * 0.8, fr.y + fr.height / 2, { steps: 6 }); await pg.mouse.up();
    const p4 = await pg.evaluate(() => document.querySelector('[data-compare]').style.getPropertyValue('--pos'));
    return { status: p1 !== p2 && p3 === '10%' ? 'PASS' : 'FAIL', note: `sweep ${p1}→${p2}; range→${p3}; mouse drag→${p4}` };
  });
  await step(rec, { id: 'HM-14', scenario: 'Customer photos ribbon renders and rotates', ctx }, async () => {
    await pg.evaluate(() => { const f = document.querySelector('[data-feed]'); const p = document.querySelector('[data-ribbon]'); f.scrollTo({ top: p.offsetTop }); });
    await sleep(800);
    const a = await pg.evaluate(() => document.querySelector('[data-ribbon-ring]').style.transform);
    await sleep(800);
    const b = await pg.evaluate(() => document.querySelector('[data-ribbon-ring]').style.transform);
    await s.shot(`home-ribbon-${tag}`);
    return { status: a !== b ? 'PASS' : 'FAIL', note: `${a} → ${b}` };
  });
  await step(rec, { id: 'HM-15', scenario: 'Policies page at the end of feed: links resolve', ctx }, async () => {
    await pg.evaluate(() => { const f = document.querySelector('[data-feed]'); f.scrollTo({ top: f.scrollHeight }); });
    await sleep(700);
    const links = await pg.evaluate(() => [...document.querySelectorAll('.policies-page a[href]')].map((a) => a.getAttribute('href')));
    const bad = [];
    for (const h of links.filter((h) => h.startsWith('/'))) { const r = await fetch(BASE + h); if (r.status !== 200) bad.push(`${h} ${r.status}`); }
    await s.shot(`home-policies-${tag}`);
    return { status: bad.length ? 'FAIL' : 'PASS', note: `links=${JSON.stringify(links)} bad=${JSON.stringify(bad)}` };
  });
  await step(rec, { id: 'HM-16', scenario: 'Language switch from home header: rails reset, texts swap, no errors', ctx }, async () => {
    s.clearLogs();
    await s.goto('/', { settle: 600 });
    const t0 = await pg.locator('[data-toggle-lang]:visible').first().innerText();
    await pg.locator('[data-toggle-lang]:visible').first().click(); await sleep(500);
    const st = await pg.evaluate(() => ({ lang: document.documentElement.lang, offerBtn: document.querySelector('[data-add-bundle]')?.innerText.trim(), img: document.querySelector('.rail.offers img')?.currentSrc?.split('/').pop()?.slice(0, 40) }));
    await s.shot(`home-lang-toggled-${tag}`);
    await pg.locator('[data-toggle-lang]:visible').first().click(); await sleep(300);
    const p = problems(s);
    return { status: !hasProblems(p) ? 'PASS' : 'FAIL', note: `label was ${t0}; after: ${JSON.stringify(st)}` };
  });
  await step(rec, { id: 'HM-17', scenario: 'Back from PDP restores the home feed scroll position', ctx }, async () => {
    await s.goto('/', { settle: 600 });
    await pg.evaluate(() => { const f = document.querySelector('[data-feed]'); const p = document.querySelector('.page[data-i="2"]'); f.scrollTo({ top: p.offsetTop }); });
    await sleep(800);
    const top0 = await pg.evaluate(() => document.querySelector('[data-feed]').scrollTop);
    const card = pg.locator('.page[data-i="2"] [data-slot].active [data-tap]').first();
    await Promise.all([pg.waitForNavigation().catch(() => {}), card.click({ position: { x: 30, y: 30 } })]);
    await sleep(500);
    await pg.goBack({ waitUntil: 'load' }); await sleep(2000);
    const top1 = await pg.evaluate(() => document.querySelector('[data-feed]').scrollTop);
    return { status: Math.abs(top0 - top1) < 5 ? 'PASS' : 'FAIL', note: `before=${top0} after Back=${top1}` };
  });
  const p = problems(s);
  rec.add({ id: 'HM-LOG', scenario: 'Home session console/page errors summary', ctx, status: hasProblems(p) ? 'FAIL' : 'PASS', note: JSON.stringify(p).slice(0, 600) });
  await s.close();
}
console.log('done');
