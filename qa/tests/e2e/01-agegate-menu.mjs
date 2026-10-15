// Age gate, side menu, header language switch. Run: node qa/tests/e2e/01-agegate-menu.mjs
import { session, recorder, step, problems, hasProblems, ALL_DEVICES, sleep } from './lib.mjs';
const rec = recorder('01-agegate-menu');

for (const device of ALL_DEVICES) for (const locale of ['ar', 'en']) {
  const ctx = `${device}/${locale}/guest`;
  const s = await session({ device, locale, ageConfirmed: false });
  const pg = s.page;
  await step(rec, { id: 'AG-1', scenario: 'Age gate shown on first visit to /', ctx }, async () => {
    await s.goto('/');
    const n = await pg.locator('.age-gate').count();
    const txt = await pg.locator('.age-gate .age-title').innerText().catch(() => '');
    await s.shot(`agegate-first-${device}-${locale}`);
    return { status: n === 1 ? 'PASS' : 'FAIL', note: `gate count=${n}, title="${txt.trim()}"` };
  });
  await step(rec, { id: 'AG-2', scenario: 'Age gate: is there a decline ("No"/"under 18") path?', ctx }, async () => {
    const btns = await pg.locator('.age-gate button').allInnerTexts();
    await pg.keyboard.press('Escape');
    const still = await pg.locator('.age-gate').count();
    return { status: btns.length === 2 && still === 1 ? 'FAIL' : 'PASS', note: `buttons=${JSON.stringify(btns.map((b) => b.trim()))}; Escape leaves gate=${still === 1}. No decline/exit option exists.` };
  });
  await step(rec, { id: 'AG-3', scenario: 'Age gate blocks interaction / keyboard focus behind it', ctx }, async () => {
    // Tab a few times and see whether focus lands outside the gate
    let outside = 0;
    for (let i = 0; i < 6; i++) {
      await pg.keyboard.press('Tab');
      outside += await pg.evaluate(() => (document.activeElement && !document.activeElement.closest('.age-gate') && document.activeElement !== document.body ? 1 : 0));
    }
    const role = await pg.locator('.age-gate').getAttribute('role');
    const covers = await pg.evaluate(() => { const r = document.querySelector('.age-gate').getBoundingClientRect(); return r.width >= innerWidth - 2 && r.height >= innerHeight - 2; });
    return { status: outside ? 'FAIL' : 'PASS', note: `focus escaped gate on ${outside}/6 Tab presses; role=${role}; covers viewport=${covers}` };
  });
  await step(rec, { id: 'AG-4', scenario: 'Age gate language button toggles language', ctx }, async () => {
    const before = await pg.evaluate(() => document.documentElement.lang);
    await pg.locator('.age-gate [data-lang]').click();
    const after = await pg.evaluate(() => [document.documentElement.lang, document.documentElement.dir]);
    await pg.locator('.age-gate [data-lang]').click();
    const back = await pg.evaluate(() => document.documentElement.lang);
    return { status: before !== after[0] && back === before ? 'PASS' : 'FAIL', note: `${before} -> ${after.join('/')} -> ${back}` };
  });
  await step(rec, { id: 'AG-5', scenario: 'Accept gate → hidden, stored, not shown after reload', ctx }, async () => {
    await pg.locator('.age-gate [data-yes]').click();
    const gone = await pg.locator('.age-gate').count();
    const stored = await pg.evaluate(() => localStorage.getItem('oka.age'));
    await s.goto('/');
    const again = await pg.locator('.age-gate').count();
    return { status: gone === 0 && again === 0 && stored === 'true' ? 'PASS' : 'FAIL', note: `after click=${gone}, oka.age=${stored}, after reload=${again}` };
  });
  await step(rec, { id: 'AG-6', scenario: 'localStorage cleared → gate returns', ctx }, async () => {
    await pg.evaluate(() => localStorage.removeItem('oka.age'));
    await s.goto('/collections');
    const n = await pg.locator('.age-gate').count();
    await pg.locator('.age-gate [data-yes]').click().catch(() => {});
    return { status: n === 1 ? 'PASS' : 'FAIL', note: `gate on /collections after clearing=${n}` };
  });
  if (device === 'iPhone 13') {
    // deep links in a fresh context
    for (const path of ['/products/oka-cobra', '/products/oka-cloud-white-hookah?view=ar', '/cart', '/pages/orders', '/search?q=x', '/nope-404', '/password', '/policies/refund-policy', '/checkout']) {
      await step(rec, { id: 'AG-7', scenario: `Deep link with no prior visit shows gate: ${path}`, ctx }, async () => {
        const s2 = await session({ device, locale, ageConfirmed: false });
        await s2.goto(path);
        const n = await s2.page.locator('.age-gate').count();
        const isTheme = await s2.page.evaluate(() => Boolean(window.Oka));
        await s2.close();
        // checkout stub isn't a theme page
        return { status: n === 1 || !isTheme ? 'PASS' : 'FAIL', note: `gate=${n}, theme JS loaded=${isTheme}` };
      });
    }
    await step(rec, { id: 'AG-8', scenario: 'Gate with storage blocked (localStorage throws) — gate shows every page, accept still dismisses', ctx }, async () => {
      const s2 = await session({ device, locale, ageConfirmed: false });
      await s2.context.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } }); });
      await s2.goto('/');
      const n1 = await s2.page.locator('.age-gate').count();
      await s2.page.locator('.age-gate [data-yes]').click().catch(() => {});
      const n2 = await s2.page.locator('.age-gate').count();
      await s2.goto('/collections');
      const n3 = await s2.page.locator('.age-gate').count();
      const p = problems(s2);
      await s2.close();
      return { status: n1 === 1 && n2 === 0 && !hasProblems(p) ? 'PASS' : 'FAIL', note: `shown=${n1} dismissed=${n2 === 0} shown again next page=${n3} (expected with blocked storage) errors=${JSON.stringify(p.pageErrors)}` };
    });
  }

  // ── side menu ──
  await step(rec, { id: 'MN-1', scenario: 'Side menu opens from header ☰, aria-expanded, inert removed, focus on panel', ctx }, async () => {
    await s.goto('/');
    await pg.locator('.age-gate [data-yes]').click().catch(() => {});
    const opener = pg.locator('[data-menu-open]:visible').first();
    await opener.click();
    await sleep(450);
    const st = await pg.evaluate(() => ({ open: document.querySelector('#app').classList.contains('menu-open'), inert: document.querySelector('#side-menu').hasAttribute('inert'), exp: [...document.querySelectorAll('[data-menu-open]')].map((b) => b.getAttribute('aria-expanded')), focus: document.activeElement && document.activeElement.id, links: [...document.querySelectorAll('.side-link')].map((a) => a.getAttribute('href')) }));
    await s.shot(`menu-open-${device}-${locale}`);
    return { status: st.open && !st.inert && st.exp.every((x) => x === 'true') && st.focus === 'side-menu' ? 'PASS' : 'FAIL', note: JSON.stringify(st) };
  });
  await step(rec, { id: 'MN-2', scenario: 'Side menu closes with Escape and returns focus to opener', ctx }, async () => {
    await pg.keyboard.press('Escape');
    await sleep(300);
    const st = await pg.evaluate(() => ({ open: document.querySelector('#app').classList.contains('menu-open'), inert: document.querySelector('#side-menu').hasAttribute('inert'), focusMenuOpen: Boolean(document.activeElement && document.activeElement.matches('[data-menu-open]')) }));
    return { status: !st.open && st.inert && st.focusMenuOpen ? 'PASS' : 'FAIL', note: JSON.stringify(st) };
  });
  await step(rec, { id: 'MN-3', scenario: 'Side menu closes via scrim tap and via ✕', ctx }, async () => {
    await pg.locator('[data-menu-open]:visible').first().click(); await sleep(400);
    // tap scrim far from the panel
    const sb = await pg.locator('.menu-scrim').boundingBox();
    await pg.mouse.click(locale === 'ar' ? sb.x + 15 : sb.x + sb.width - 15, 300); await sleep(350);
    const a = await pg.evaluate(() => document.querySelector('#app').classList.contains('menu-open'));
    await pg.locator('[data-menu-open]:visible').first().click(); await sleep(400);
    await pg.locator('.side-close').click(); await sleep(350);
    const b = await pg.evaluate(() => document.querySelector('#app').classList.contains('menu-open'));
    return { status: !a && !b ? 'PASS' : 'FAIL', note: `open after scrim=${a}, after ✕=${b}` };
  });
  if (device === 'Desktop 1440') await step(rec, { id: 'MN-3b', scenario: 'Desktop: click outside the 430px app column closes the menu', ctx }, async () => {
    await pg.locator('[data-menu-open]:visible').first().click(); await sleep(400);
    const vw = pg.viewportSize().width;
    await pg.mouse.click(locale === 'ar' ? 20 : vw - 20, 300); await sleep(350);
    const open = await pg.evaluate(() => document.querySelector('#app').classList.contains('menu-open'));
    await pg.keyboard.press('Escape'); await sleep(300);
    return { status: open ? 'FAIL' : 'PASS', note: `menu still open after clicking the page backdrop outside #app: ${open}` };
  });
  await step(rec, { id: 'MN-4', scenario: 'Side menu: Tab cannot reach links while closed (inert)', ctx }, async () => {
    let reached = 0;
    for (let i = 0; i < 25; i++) { await pg.keyboard.press('Tab'); reached += await pg.evaluate(() => (document.activeElement && document.activeElement.closest('#side-menu') ? 1 : 0)); }
    return { status: reached ? 'FAIL' : 'PASS', note: `menu elements focused ${reached}/25` };
  });
  if (device !== 'Desktop 1440') {
    await step(rec, { id: 'MN-5', scenario: 'Side menu: swipe towards edge closes (touch)', ctx }, async () => {
      await pg.locator('[data-menu-open]:visible').first().click(); await sleep(400);
      const box = await pg.locator('#side-menu').boundingBox();
      const y = box.y + 200; const x0 = box.x + box.width / 2; const dx = locale === 'ar' ? 120 : -120;
      await pg.evaluate(({ x0, y, dx }) => {
        const m = document.querySelector('#side-menu');
        const t0 = new Touch({ identifier: 1, target: m, clientX: x0, clientY: y });
        const t1 = new Touch({ identifier: 1, target: m, clientX: x0 + dx, clientY: y + 5 });
        m.dispatchEvent(new TouchEvent('touchstart', { touches: [t0], changedTouches: [t0], bubbles: true }));
        m.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [t1], bubbles: true }));
      }, { x0, y, dx });
      await sleep(350);
      const open = await pg.evaluate(() => document.querySelector('#app').classList.contains('menu-open'));
      return { status: !open ? 'PASS' : 'FAIL', note: `open after swipe=${open}` };
    });
  }
  // every link
  const links = await pg.evaluate(() => [...document.querySelectorAll('.side-link')].map((a) => ({ href: a.getAttribute('href'), text: a.innerText.trim().replace(/\s+/g, ' ') })));
  for (const l of links) {
    if (device === 'Desktop 1440' && locale === 'en') { /* fewer on desktop */ }
    await step(rec, { id: 'MN-6', scenario: `Side menu link → ${l.href} ("${l.text}") navigates, active state, menu closed after Back`, ctx }, async () => {
      s.clearLogs();
      await s.goto('/');
      await pg.locator('[data-menu-open]:visible').first().click(); await sleep(350);
      const isActiveHere = await pg.locator(`.side-link[href="${l.href}"]`).evaluate((a) => a.classList.contains('active'));
      if (isActiveHere) {
        await pg.locator(`.side-link[href="${l.href}"]`).click(); await sleep(350);
        const open = await pg.evaluate(() => document.querySelector('#app').classList.contains('menu-open'));
        return { status: !open && pg.url().endsWith('/') ? 'PASS' : 'FAIL', note: `active link: just closes (open=${open})` };
      }
      await Promise.all([pg.waitForNavigation({ waitUntil: 'load' }), pg.locator(`.side-link[href="${l.href}"]`).click()]);
      await sleep(300);
      const url = new URL(pg.url());
      const active = await pg.evaluate((h) => document.querySelector(`.side-link[href="${h}"]`)?.classList.contains('active'), l.href);
      await pg.goBack({ waitUntil: 'load' }); await sleep(300);
      const openAfterBack = await pg.evaluate(() => document.querySelector('#app')?.classList.contains('menu-open'));
      const p = problems(s);
      return { status: url.pathname === l.href.split('?')[0] && active && !openAfterBack && !hasProblems(p) ? 'PASS' : 'FAIL', note: `landed ${url.pathname}${url.search}; active=${active}; menu open after Back=${openAfterBack}; ${hasProblems(p) ? JSON.stringify(p) : ''}` };
    });
  }
  await step(rec, { id: 'MN-7', scenario: 'Menu handle (edge) opens the menu on inner pages', ctx }, async () => {
    await s.goto('/collections');
    const h = pg.locator('.menu-handle');
    const vis = await h.isVisible();
    if (vis) await h.click(); else await pg.locator('[data-menu-open]:visible').first().click();
    await sleep(400);
    const open = await pg.evaluate(() => document.querySelector('#app').classList.contains('menu-open'));
    await pg.keyboard.press('Escape');
    return { status: open ? 'PASS' : 'FAIL', note: `handle visible=${vis}, open=${open}` };
  });
  await step(rec, { id: 'LG-1', scenario: 'Header language switch toggles dir/lang, label, persists across navigation', ctx }, async () => {
    await s.goto('/');
    const before = await pg.evaluate(() => [document.documentElement.lang, document.documentElement.dir, document.querySelector('[data-lang-label]').textContent]);
    await pg.locator('.circle-34[data-toggle-lang]:visible, [data-toggle-lang]:visible').first().click();
    await sleep(300);
    const after = await pg.evaluate(() => [document.documentElement.lang, document.documentElement.dir, document.querySelector('[data-lang-label]').textContent, localStorage.getItem('oka.lang')]);
    await s.goto('/collections/oka-cobra');
    const nav = await pg.evaluate(() => document.documentElement.lang);
    await s.goto('/ar/collections/oka-cobra');
    const navAr = await pg.evaluate(() => document.documentElement.lang);
    await s.shot(`lang-switched-${device}-${locale}`);
    // put back
    await pg.evaluate((l) => localStorage.setItem('oka.lang', l), locale);
    const ok = before[0] !== after[0] && after[0] === nav;
    return { status: ok ? 'PASS' : 'FAIL', note: `before=${before.join('/')} after=${after.join('/')} next page=${nav}; on /ar/ URL=${navAr} (F-07: ${after[0] === 'en' && navAr === 'ar' ? 'CONFIRMED: English does not stick on /ar/ URLs' : 'n/a'})` };
  });
  await s.close();
}
console.log('done');
