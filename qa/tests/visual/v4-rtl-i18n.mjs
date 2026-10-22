// RTL / bidi / i18n behaviour: language switch persistence, catalogue cache mixing,
// bidi rendering of +phone / #order / AWB / prices, input direction, RTL carousels.
import { launch, BASE, seedCart, save } from './lib.mjs';

const out = {};
const state = (p) => p.evaluate(() => ({ url: location.pathname + location.search, lang: document.documentElement.lang, dir: document.documentElement.dir, stored: localStorage.getItem('oka.lang') }));

// ── 1. language persistence ─────────────────────────────────────────────
{
  const s = await launch({ baseURL: BASE, device: 'iPhone 13', locale: 'ar', agent: 'visual' });
  const log = [];
  await s.goto('/', { settle: 800 }); log.push(['start /', await state(s.page)]);
  await s.page.click('header [data-toggle-lang]'); await s.page.waitForTimeout(300); log.push(['toggle → EN', await state(s.page)]);
  await s.goto('/collections', { settle: 600 }); log.push(['navigate /collections', await state(s.page)]);
  await s.page.reload(); await s.page.waitForTimeout(600); log.push(['reload', await state(s.page)]);
  await s.goto('/products/oka-cobra', { settle: 600 }); log.push(['/products/oka-cobra', await state(s.page)]);
  // a link on the page (side menu "Home")
  await s.goto('/ar/products/oka-cobra', { settle: 600 }); log.push(['/ar/products/oka-cobra with EN saved', await state(s.page)]);
  await s.page.click('header [data-toggle-lang]'); await s.page.waitForTimeout(300); log.push(['toggle on /ar page', await state(s.page)]);
  // After toggling to EN on an /ar URL, what does the page show?
  out.enOnArUrlText = await s.page.evaluate(() => [...document.querySelectorAll('.l-en')].filter((e) => e.checkVisibility()).map((e) => e.textContent.trim()).filter((t) => /[؀-ۿ]/.test(t)).slice(0, 15));
  await s.shot('i18n-en-toggled-on-ar-url-pdp');
  const homeHref = await s.page.evaluate(() => document.querySelector('.side-link')?.getAttribute('href'));
  log.push(['side-menu Home href on /ar page', homeHref]);
  await s.goto(homeHref || '/ar/', { settle: 800 }); log.push(['follow Home link', await state(s.page)]);
  out.langPersistence = log;
  await s.close();
}

// ── 2. catalogue sessionStorage cache mixing languages ───────────────────
{
  const s = await launch({ baseURL: BASE, device: 'iPhone 13', locale: 'en', agent: 'visual' });
  await seedCart(s);
  await s.goto('/ar/', { settle: 2500 });
  const cached = await s.page.evaluate(() => { const c = JSON.parse(sessionStorage.getItem('oka.catalogue') || 'null'); return c ? { cat0: c.data.cats[0], p0: { titleEn: c.data.products[0].titleEn, url: c.data.products[0].url } } : null; });
  out.cacheAfterArVisit = cached;
  // Now go to the English (primary) URL, within the 60 s cache window
  await s.goto('/cart', { settle: 2500 });
  out.cartEnAfterAr = { state: await state(s.page), arabicInEnglishUI: await s.page.evaluate(() => [...document.querySelectorAll('#content *')].filter((e) => e.children.length === 0 && e.checkVisibility() && /[؀-ۿ]/.test(e.textContent)).map((e) => `${e.className}: ${e.textContent.trim().slice(0, 50)}`).slice(0, 15)), links: await s.page.evaluate(() => [...document.querySelectorAll('#content a[href^="/ar/"]')].map((a) => a.getAttribute('href')).slice(0, 8)) };
  await s.shot('i18n-cart-en-after-ar-catalogue-cache');
  await s.goto('/search?q=cobra', { settle: 2000 });
  out.searchEnAfterAr = await s.page.evaluate(() => [...document.querySelectorAll('#content *')].filter((e) => e.children.length === 0 && e.checkVisibility() && /[؀-ۿ]/.test(e.textContent)).map((e) => `${e.className}: ${e.textContent.trim().slice(0, 50)}`).slice(0, 10));
  await s.shot('i18n-search-en-after-ar-catalogue-cache');
  // control: fresh context, no /ar visit
  const s2 = await launch({ baseURL: BASE, device: 'iPhone 13', locale: 'en', agent: 'visual' });
  await seedCart(s2);
  await s2.goto('/cart', { settle: 2500 });
  out.cartEnControl = await s2.page.evaluate(() => [...document.querySelectorAll('#content *')].filter((e) => e.children.length === 0 && e.checkVisibility() && /[؀-ۿ]/.test(e.textContent)).map((e) => `${e.className}: ${e.textContent.trim().slice(0, 50)}`).slice(0, 15));
  await s2.close();
  await s.close();
}

// ── 3. bidi rendering checks (visual order of characters) ──────────────
function bidiProbe() {
  const res = [];
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const xOf = (node, i) => { const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + 1); const b = r.getBoundingClientRect(); return b.width ? b.left : null; };
  for (let n; (n = tw.nextNode());) {
    const t = n.textContent;
    const p = n.parentElement;
    if (!p || !p.checkVisibility || !p.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
    if (p.closest('script,style')) continue;
    const pats = [
      ['plus-phone', /\+\d{6,}/g, (m, i) => [i, i + 1]],
      ['hash-order', /#\d{4,}/g, (m, i) => [i, i + 1]],
      ['minus-amount', /[-−]\s?[\d٠-٩]+/g, (m, i) => [i, i + m.length - 1]],
      ['digit-groups', /\d{2,4}(?: \d{2,4}){1,3}/g, (m, i) => [i, i + m.length - 1]],
      ['egp-amount', /EGP \d+/g, (m, i) => [i, i + m.length - 1]],
      ['awb', /JEG[A-Z0-9]{6,}/g, (m, i) => [i, i + m.length - 1]],
    ];
    for (const [kind, re, idx] of pats) {
      for (const m of t.matchAll(re)) {
        const [a, b] = idx(m[0], m.index);
        const xa = xOf(n, a); const xb = xOf(n, b);
        if (xa == null || xb == null) continue;
        // logical first char should be visually left of the last (LTR run)
        res.push({ kind, text: m[0], context: t.trim().slice(0, 70), ok: xa < xb, cls: p.className?.toString().slice(0, 40), dir: getComputedStyle(p).direction, bidi: getComputedStyle(p).unicodeBidi });
      }
    }
  }
  return res;
}
{
  const res = {};
  for (const locale of ['ar', 'en']) {
    const s = await launch({ baseURL: BASE, device: 'iPhone 13', locale, loggedIn: true, agent: 'visual' });
    await seedCart(s);
    for (const r of ['/pages/account', '/pages/addresses', '/pages/orders', '/pages/orders?order=%239000101', '/pages/orders?order=%239000102', '/pages/orders?order=%239000103', '/pages/track?awb=JEGQA0000000002&order=%239000103', '/account', '/account/orders/9100000003', '/account/addresses', '/pages/checkout-review', '/cart', '/pages/loyalty', '/pages/support', '/products/oka-cobra-oka-base', '/pages/addresses?view=oka-add-address']) {
      await s.goto(r, { settle: 1500 });
      const b = await s.page.evaluate(bidiProbe);
      res[`${locale} ${r}`] = b;
      if (locale === 'ar' && /orders\?order|account$|addresses$|checkout-review|track/.test(r)) await s.shot(`bidi-ar-${r.replace(/[^\w]+/g, '_')}`);
    }
    await s.close();
  }
  out.bidi = res;
}

// ── 4. input direction for phone/email/numeric fields in RTL ─────────────
{
  const s = await launch({ baseURL: BASE, device: 'iPhone 13', locale: 'ar', loggedIn: true, agent: 'visual' });
  const res = {};
  for (const r of ['/pages/addresses?view=oka-add-address', '/pages/contact', '/account/login', '/account/register', '/pages/track', '/search', '/cart', '/pages/checkout-review', '/account/addresses', '/pages/orders']) {
    await s.goto(r, { settle: 1200 });
    res[r] = await s.page.evaluate(async () => {
      const list = [];
      for (const e of document.querySelectorAll('input:not([type=hidden]),textarea')) {
        if (!e.checkVisibility()) continue;
        const cs = getComputedStyle(e);
        const latinish = /tel|email|number|url/.test(e.type) || /phone|mobile|email|awb|code|zip|postal|order/i.test(`${e.name} ${e.id} ${e.className} ${e.placeholder} ${e.autocomplete}`);
        list.push({ name: e.name || e.className, type: e.type, inputmode: e.inputMode, autocomplete: e.autocomplete, dir: cs.direction, attrDir: e.getAttribute('dir'), textAlign: cs.textAlign, placeholder: e.placeholder, latinish });
      }
      return list;
    });
  }
  // type a phone number in RTL field and check caret / visual order
  await s.goto('/pages/addresses?view=oka-add-address', { settle: 1200 });
  const tel = await s.page.$('input[type=tel], input[name*=phone i]');
  if (tel) {
    await tel.fill('+201001234567');
    out.telTyped = await tel.evaluate((e) => ({ value: e.value, dir: getComputedStyle(e).direction }));
    await s.shot('rtl-add-address-phone-typed');
  }
  out.inputs = res;
  await s.close();
}

// ── 5. RTL carousels: start position, active-slot tracking, dots ─────────
{
  const res = {};
  for (const locale of ['ar', 'en']) {
    const s = await launch({ baseURL: BASE, device: 'iPhone 13', locale, agent: 'visual' });
    await s.goto('/', { settle: 1500 });
    res[locale] = await s.page.evaluate(async (locale) => {
      const rows = [];
      const rails = [...document.querySelectorAll('.hscroll, .rail, [data-rail]')].filter((r) => r.scrollWidth > r.clientWidth + 10).slice(0, 6);
      for (const r of rails) {
        r.scrollIntoView({ block: 'center' });
        await new Promise((z) => setTimeout(z, 300));
        const first = r.children[0]?.getBoundingClientRect();
        const box = r.getBoundingClientRect();
        const startOk = locale === 'ar' ? Math.abs(first.right - box.right) < 40 : Math.abs(first.left - box.left) < 40;
        const activeBefore = [...r.querySelectorAll('.active')].map((e) => [...r.children].indexOf(e));
        r.scrollBy({ left: locale === 'ar' ? -r.clientWidth : r.clientWidth, behavior: 'instant' });
        await new Promise((z) => setTimeout(z, 700));
        const activeAfter = [...r.querySelectorAll('.active')].map((e) => [...r.children].indexOf(e));
        const dots = r.parentElement.querySelector('.dots, [data-dots]');
        rows.push({ cls: r.className.slice(0, 40), scrollLeft: Math.round(r.scrollLeft), startOk, activeBefore, activeAfter, snap: getComputedStyle(r).scrollSnapType, dots: dots ? [...dots.children].findIndex((d) => d.classList.contains('on') || d.classList.contains('active')) : null });
      }
      return rows;
    }, locale);
    await s.shot(`rtl-home-rails-${locale}`);
    await s.close();
  }
  out.rails = res;
}
save('rtl-i18n.json', out);
console.log(JSON.stringify(out.langPersistence, null, 0));
