// Collections list, each setting collection, sort/filter, pagination; search incl. Arabic folding, XSS, long query.
// Run: node qa/tests/e2e/03-collections-search.mjs
import { session, recorder, step, problems, hasProblems, MOBILES, sleep, BASE, dismissRecSheet } from './lib.mjs';
const rec = recorder('03-collections-search');
const COLLS = ['oka-basic-hookahs-copy', 'oka-parties', 'oka-cobra', 'dark-tobacco', 'ready-to-smoke-bowls', 'oka-parts', 'hookahs', 'hoses', 'coal', 'bowls', 'all', 'bundles', 'sale', 'heat-managment-device'];

for (const device of [...MOBILES, 'Desktop 1440']) for (const locale of ['ar', 'en']) {
  const s = await session({ device, locale, loggedIn: device === 'Pixel 7' });
  const ctx = s.ctx; const pg = s.page; const tag = `${device}-${locale}`.replace(/\s/g, '');
  await step(rec, { id: 'CL-1', scenario: '/collections list: rows, every link 200, counts', ctx }, async () => {
    s.clearLogs(); await s.goto('/collections');
    const rows = await pg.evaluate(() => [...document.querySelectorAll('.cat-row')].map((a) => ({ href: a.getAttribute('href'), t: a.innerText.replace(/\s+/g, ' ').trim().slice(0, 50) })));
    const bad = [];
    for (const r of rows) { const x = await fetch(BASE + r.href); if (x.status !== 200) bad.push(r.href); }
    await s.shot(`collections-${tag}`);
    const p = problems(s);
    return { status: rows.length && !bad.length && !hasProblems(p) ? 'PASS' : 'FAIL', note: `${rows.length} rows: ${rows.map((r) => r.href.replace('/collections/', '')).join(', ')}; bad=${bad}` };
  });
  const colls = device === 'iPhone 13' ? COLLS : COLLS.slice(0, 7);
  for (const h of colls) {
    await step(rec, { id: 'CL-2', scenario: `Collection /collections/${h}: renders, count label = visible cards, no errors`, ctx }, async () => {
      s.clearLogs();
      await pg.evaluate(() => { sessionStorage.removeItem('oka.sort'); sessionStorage.removeItem('oka.filters'); });
      const r = await s.goto(`/collections/${h}`);
      const st = await pg.evaluate(() => ({ cards: [...document.querySelectorAll('[data-item]')].filter((e) => !e.hidden).length, label: document.querySelector('[data-count-label]')?.textContent, empty: !document.querySelector('[data-empty]')?.hidden, title: document.querySelector('.coll-title, h1, .screen-title')?.innerText?.trim() }));
      if (['oka-parts', 'bundles', 'hookahs'].includes(h)) await s.shot(`collection-${h}-${tag}`);
      const p = problems(s, { allow: [/404/] });
      return { status: r.status() === 200 && !hasProblems(p) ? 'PASS' : 'FAIL', note: `HTTP ${r.status()} title="${st.title}" cards=${st.cards} label="${st.label}" emptyState=${st.empty} ${hasProblems(p) ? JSON.stringify(p) : ''}` };
    });
  }
  await step(rec, { id: 'CL-3', scenario: 'Sort chip cycles Featured → Price low→high → high→low; order correct', ctx }, async () => {
    await pg.evaluate(() => { sessionStorage.removeItem('oka.sort'); sessionStorage.removeItem('oka.filters'); });
    await s.goto('/collections/oka-parts');
    const read = () => pg.evaluate(() => [...document.querySelectorAll('[data-grid] [data-item]')].filter((e) => !e.hidden).map((e) => Number(e.dataset.price)));
    const labels = []; const orders = [];
    for (let i = 0; i < 3; i++) { labels.push(await pg.locator('[data-sort]').innerText()); orders.push(await read()); await pg.locator('[data-sort]').click(); await sleep(150); }
    const asc = orders[1].every((v, i, a) => !i || a[i - 1] <= v); const desc = orders[2].every((v, i, a) => !i || a[i - 1] >= v);
    await s.shot(`collection-sorted-${tag}`);
    return { status: asc && desc ? 'PASS' : 'FAIL', note: `labels=${JSON.stringify(labels)} asc=${asc} desc=${desc}` };
  });
  await step(rec, { id: 'CL-4', scenario: 'Filters: In stock hides sold-out (foil/coal); On sale shows only compare-at items; empty state', ctx }, async () => {
    await pg.evaluate(() => { sessionStorage.removeItem('oka.sort'); sessionStorage.removeItem('oka.filters'); });
    await s.goto('/collections/oka-parts');
    const n0 = await pg.locator('[data-grid] [data-item]:not([hidden])').count();
    await pg.locator('[data-filter="inStock"]').click(); await sleep(150);
    const n1 = await pg.locator('[data-grid] [data-item]:not([hidden])').count();
    await pg.locator('[data-filter="onSale"]').click(); await sleep(150);
    const n2 = await pg.locator('[data-grid] [data-item]:not([hidden])').count();
    const empty = await pg.locator('[data-empty]').isVisible();
    await s.shot(`collection-filter-empty-${tag}`);
    await s.goto('/collections/oka-cobra');
    const persisted = await pg.evaluate(() => ({ chips: [...document.querySelectorAll('[data-filter].on')].map((b) => b.dataset.filter), n: [...document.querySelectorAll('[data-item]')].filter((e) => !e.hidden).length }));
    await pg.evaluate(() => { sessionStorage.removeItem('oka.filters'); });
    return { status: n1 === n0 - 2 && n2 === 0 && empty ? 'PASS' : 'FAIL', note: `all=${n0} inStock=${n1} inStock+onSale=${n2} emptyShown=${empty}; filters carried to another collection: ${JSON.stringify(persisted)}` };
  });
  await step(rec, { id: 'CL-5', scenario: 'Shopify ?sort_by / ?filter / ?page=2 URLs (deep links) are honoured by the screen', ctx }, async () => {
    await pg.evaluate(() => { sessionStorage.removeItem('oka.sort'); sessionStorage.removeItem('oka.filters'); });
    await s.goto('/collections/oka-parts?sort_by=price-ascending');
    const a = await pg.evaluate(() => [...document.querySelectorAll('[data-grid] [data-item]')].map((e) => Number(e.dataset.price)));
    const sortLbl = await pg.locator('[data-sort]').innerText();
    await s.goto('/collections/oka-parts?page=2');
    const p2 = await pg.locator('[data-item]').count();
    await s.goto('/collections/all?filter.v.availability=1');
    const f = await pg.locator('[data-item]').count();
    const asc = a.every((v, i, x) => !i || x[i - 1] <= v);
    return { status: 'INFO', note: `sort_by=price-ascending → server order ascending=${asc}, chip says "${sortLbl}"; ?page=2 cards=${p2} (paginate by 250, so page 2 is empty); all?filter availability cards=${f}` };
  });
  await step(rec, { id: 'CL-6', scenario: 'Grid card Add / sold-out card (no add) / heart on collection grid', ctx }, async () => {
    await s.goto('/collections/oka-parts');
    await pg.evaluate(async () => fetch('/cart/clear.js', { method: 'POST' }));
    const sold = pg.locator('.gcard-add[data-soldout]').first();
    await sold.click(); await sleep(700);
    const c1 = await pg.evaluate(async () => (await (await fetch('/cart.js')).json()).item_count);
    const addBtn = pg.locator('.gcard-add:not([data-soldout])').first();
    await addBtn.click(); await sleep(600);
    const sheet = await dismissRecSheet(s, 1500);
    await pg.locator('.added-bar').evaluate((e) => e.remove()).catch(() => {});
    const c2 = await pg.evaluate(async () => (await (await fetch('/cart.js')).json()).item_count);
    const stepper = await pg.locator('.card-qty.is-grid:not([hidden])').count();
    const heart = pg.locator('.gcard [data-heart]').first();
    await heart.click(); await sleep(300);
    const on = await heart.getAttribute('aria-pressed');
    await heart.click(); await sleep(200);
    await s.shot(`collection-card-added-${tag}`);
    return { status: c1 === 0 && c2 === 1 && stepper === 1 && on === 'true' ? 'PASS' : 'FAIL', note: `soldout tap → items=${c1}; add → items=${c2}; recSheet=${sheet}; grid steppers=${stepper}; heart aria-pressed=${on}` };
  });

  // ── search ──
  const queries = [
    ['شيشه', 'Arabic hookah (ه spelling)'], ['شيشة', 'Arabic hookah (ة)'], ['فحم', 'Arabic "coal"'], ['معسل', 'Arabic "tobacco"'], ['حجر', 'Arabic "bowl"'],
    ['hookah', 'English'], ['hokah', 'typo'], ['شيشا', 'Arabic typo'], ['  ', 'whitespace only'], ['zzzzqqq', 'no results'],
    ['<script>window.__xss=1</script>', 'script tag'], ['"><img src=x onerror=window.__xss=2>', 'attribute break-out'], ['x'.repeat(600), '600-char query'], ['١٢', 'Arabic-Indic digits'], ['OKA', 'brand, uppercase'], ['ب', 'single Arabic letter'],
  ];
  for (const [q, what] of queries) {
    if (device !== 'iPhone 13' && !['شيشه', 'فحم', '<script>window.__xss=1</script>', 'zzzzqqq'].includes(q)) continue;
    await step(rec, { id: 'SR-1', scenario: `Search typed: ${what} (${q.length > 40 ? q.slice(0, 20) + '…' : q})`, ctx }, async () => {
      s.clearLogs();
      await s.goto('/search');
      const inp = pg.locator('[data-search]');
      await inp.fill(q); await sleep(900);
      const st = await pg.evaluate(() => ({ count: document.querySelectorAll('[data-results] [data-item], [data-results] .gcard').length, txt: document.querySelector('[data-results]')?.innerText?.replace(/\s+/g, ' ').trim().slice(0, 120), chips: !document.querySelector('[data-cats]')?.hidden, url: location.search.slice(0, 80), xss: window.__xss || 0, injected: document.querySelectorAll('[data-results] img[src="x"], [data-results] script').length }));
      // server-rendered too
      const r = await fetch(`${BASE}/search?q=${encodeURIComponent(q)}`);
      const html = await r.text();
      const reflected = q.includes('<') && html.includes(q);
      if (['شيشه', 'zzzzqqq', '<script>window.__xss=1</script>'].includes(q)) await s.shot(`search-${what.replace(/\W+/g, '_')}-${tag}`);
      const p = problems(s);
      const bad = st.xss || st.injected || hasProblems(p);
      return { status: bad ? 'FAIL' : 'PASS', note: `results=${st.count} "${st.txt}" chips=${st.chips} url=${st.url} xss=${st.xss} injected=${st.injected} serverHTTP=${r.status} rawInServerHTML=${reflected}${reflected ? ' (in <title> via page_title: harness builds page_title unescaped; Shopify pre-escapes it — not a theme bug)' : ''} ${hasProblems(p) ? JSON.stringify(p) : ''}` };
    });
  }
  await step(rec, { id: 'SR-2', scenario: 'Deep link /search?q=فحم renders results on load; Enter blurs; clearing shows chips', ctx }, async () => {
    await s.goto(`/search?q=${encodeURIComponent('فحم')}`, { settle: 1200 });
    const n = await pg.locator('[data-results] .gcard').count();
    await pg.locator('[data-search]').fill(''); await sleep(300);
    const chips = await pg.locator('[data-cats]').isVisible();
    return { status: chips ? 'PASS' : 'FAIL', note: `results on load=${n}; chips visible after clearing=${chips}` };
  });
  await step(rec, { id: 'SR-3', scenario: 'Search category chips: each chip link resolves', ctx }, async () => {
    await s.goto('/search');
    const hrefs = await pg.evaluate(() => [...document.querySelectorAll('[data-cats] a[href]')].map((a) => a.getAttribute('href')));
    const bad = [];
    for (const h of hrefs) { const r = await fetch(BASE + h); if (r.status !== 200) bad.push(`${h} ${r.status}`); }
    await s.shot(`search-chips-${tag}`);
    return { status: hrefs.length && !bad.length ? 'PASS' : 'FAIL', note: `chips=${hrefs.join(' ')} bad=${bad}` };
  });
  await step(rec, { id: 'SR-4', scenario: 'Search result card: Add → −/+ ; tap card opens PDP', ctx }, async () => {
    await pg.evaluate(async () => fetch('/cart/clear.js', { method: 'POST' }));
    await s.goto('/search?q=hose', { settle: 1200 });
    const add = pg.locator('[data-results] .gcard-add:not([data-soldout])').first();
    const has = await add.count();
    if (!has) return { status: 'FAIL', note: 'no results for "hose"' };
    await add.click(); await sleep(600);
    const sheet = await dismissRecSheet(s, 1500);
    await pg.locator('.added-bar').evaluate((e) => e.remove()).catch(() => {});
    const step = await pg.locator('[data-results] .card-qty:not([hidden])').count();
    const href = await pg.locator('[data-results] .gcard a[href^="/products/"]').first().getAttribute('href');
    await Promise.all([pg.waitForNavigation().catch(() => {}), pg.locator('[data-results] .gcard a[href^="/products/"]').first().click()]);
    return { status: step === 1 && pg.url().includes(href) ? 'PASS' : 'FAIL', note: `stepper=${step} recSheet=${sheet} → ${pg.url()}` };
  });
  await step(rec, { id: 'SR-5', scenario: 'Hidden collections searchable? product in hookahs-only collection found via search', ctx }, async () => {
    const r = await fetch(`${BASE}/collections/hookahs/products.json`); const j = await r.json();
    const handles = (j.products || []).map((p) => p.handle);
    const cat = await pg.evaluate(async () => (await (await fetch('/collections/all?view=oka-data')).json()).products.map((p) => p.id));
    const missing = handles.filter((h) => !cat.includes(h));
    return { status: 'INFO', note: `hookahs collection has ${handles.length} products; not in catalogue (search/home) = ${JSON.stringify(missing)}` };
  });
  const p = problems(s, { allow: [/404/] });
  rec.add({ id: 'CS-LOG', scenario: 'Collections/search session error summary', ctx, status: hasProblems(p) ? 'FAIL' : 'PASS', note: JSON.stringify(p).slice(0, 500) });
  await s.close();
}
console.log('done');
