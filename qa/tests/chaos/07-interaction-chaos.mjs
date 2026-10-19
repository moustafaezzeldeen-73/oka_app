// Scenario 4 — interaction chaos. Rapid-fire clicks (10x/200ms) on every button, double form
// submits, Back during pending requests, device rotation mid-flow, resize/zoom, open menu while a
// sheet is open, Escape spam, 10k-char and mixed-script inputs, Egyptian phone formats, email edge
// cases. Drives the real theme JS in Chromium against the shared harness. Local only.
import fs from 'node:fs';
import path from 'node:path';
import { launch } from '../../harness/pw.mjs';

const BASE = process.argv[2] || 'http://localhost:9440';
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'out');
fs.mkdirSync(OUT, { recursive: true });
const report = { base: BASE, cases: [] };
const errs = (s) => ({ pageErrors: s.logs.pageErrors.map((e) => e.message).slice(0, 6), consoleErr: s.logs.console.filter((c) => c.type === 'error').map((c) => c.text).slice(0, 4) });
const seed = () => { try { localStorage.setItem('oka.age', 'true'); localStorage.setItem('__qa_seeded', '1'); } catch {} };

async function newS(opts = {}) { const s = await launch({ baseURL: BASE, device: 'Pixel 7', locale: 'en', agent: 'chaos', mocks: 'success', ...opts }); await s.page.addInitScript(seed); return s; }

// 1) rapid-fire 10x/200ms on every button on key pages
for (const route of ['/products/oka-cobra', '/collections/hookahs', '/cart', '/', '/pages/orders']) {
  const s = await newS({ loggedIn: /orders/.test(route) });
  await s.goto(route, { settle: 600 });
  // Buttons only (no links); each burst = 10 clicks within ~200ms. Navigation mid-burst is recorded, not fatal.
  let fired;
  try {
    fired = await s.page.evaluate(async () => {
      const btns = Array.from(document.querySelectorAll('button:not([data-sign-out]):not([data-delete-account]), [data-add], [data-buy], [data-step], [data-heart]')).filter((b) => b.tagName !== 'A');
      let clicks = 0;
      for (const b of btns.slice(0, 40)) { for (let i = 0; i < 10; i++) { try { b.click(); clicks++; } catch {} await new Promise((r) => setTimeout(r, 20)); } }
      return { buttons: btns.length, clicks };
    });
  } catch (e) { fired = { navigatedAway: true, note: e.message.split('\n')[0] }; }
  // dismiss any alert so later state is readable
  await s.page.evaluate(() => document.querySelectorAll('.alert-btn').forEach((b) => b.click())).catch(() => {});
  await s.page.waitForTimeout(1200);
  const serverCart = await (await fetch(BASE + '/cart.js', { headers: { cookie: (await s.context.cookies()).map((c) => `${c.name}=${c.value}`).join('; ') } })).json().catch(() => ({}));
  report.cases.push({ name: `rapid-fire ${route}`, ...fired, serverItemCount: serverCart.item_count, serverItems: (serverCart.items || []).map((i) => [i.handle, i.quantity]), ...errs(s) });
  await s.close();
}

// 2) PDP double-tap Add to Cart (SEC/F-05 style) — quantify units added per chosen qty
{
  const s = await newS();
  await s.goto('/products/oka-cobra', { settle: 500 });
  // bump qty to 2 if a qty stepper exists, then double-tap buy fast
  await s.page.evaluate(() => { const plus = document.querySelector('.pdp [data-step="1"], [data-qty-plus], [data-step="1"]'); plus && plus.click(); });
  await s.page.evaluate(() => { const b = document.querySelector('[data-buy]'); if (b) { b.click(); b.click(); b.click(); } });
  await s.page.waitForTimeout(1200);
  const cart = await (await fetch(BASE + '/cart.js', { headers: { cookie: (await s.context.cookies()).map((c) => `${c.name}=${c.value}`).join('; ') } })).json().catch(() => ({}));
  report.cases.push({ name: 'pdp triple-tap add', serverItemCount: cart.item_count, items: (cart.items || []).map((i) => [i.handle, i.quantity]), ...errs(s) });
  await s.close();
}

// 3) contact form double submit + hostile inputs (10k, mixed script, phones, emails)
{
  const s = await newS();
  await s.goto('/pages/contact', { settle: 500 });
  const emails = ['a@b', 'plenty@sub.domain.co', 'foo..bar@x.com', '"a b"@x.com', 'no-at', 'x@x.' + 'a'.repeat(300)];
  const phones = ['01012345678', '+201012345678', '002012345678', '٠١٠١٢٣٤٥٦٧٨', '0100 123 4567', '  01012345678  ', '0199999999', '1012345678'];
  const probe = await s.page.evaluate(({ emails, phones, big }) => {
    const out = { forms: document.querySelectorAll('form').length };
    const form = document.querySelector('form');
    if (form) {
      const q = (n) => form.querySelector(`[name*="${n}"]`);
      const em = form.querySelector('input[type=email], [name*="email"]');
      const body = form.querySelector('textarea, [name*="body"]');
      if (em) { em.value = emails[2]; em.dispatchEvent(new Event('input', { bubbles: true })); }
      if (body) { body.value = big; body.dispatchEvent(new Event('input', { bubbles: true })); }
      out.submitted = 0;
      for (let i = 0; i < 3; i++) { try { form.requestSubmit ? form.requestSubmit() : form.submit(); out.submitted++; } catch {} }
    }
    return out;
  }, { emails, phones, big: 'x'.repeat(10000) + ' عربي mixed اختبار' });
  await s.page.waitForTimeout(500);
  report.cases.push({ name: 'contact double-submit + hostile input', ...probe, url: s.page.url(), ...errs(s) });
  await s.close();
}

// 4) add-address form: every Egyptian phone format + validation result (EG_MOBILE regex)
{
  const s = await newS();
  await s.goto('/pages/addresses?view=oka-add-address', { settle: 600 });
  const phones = ['01012345678', '01112345678', '01212345678', '01512345678', '+201012345678', '00201012345678', '٠١٠١٢٣٤٥٦٧٨٩', '0101234567', '010123456789', '0191234567'];
  const results = await s.page.evaluate((phones) => {
    const RE = /^(?:\+?20|0)?1[0125]\d{8}$/;
    return phones.map((p) => ({ phone: p, strippedPass: RE.test(p.replace(/[\s-]/g, '')), arabicDigitsPass: RE.test(p.replace(/[\s-]/g, '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))) }));
  }, phones);
  report.cases.push({ name: 'add-address EG phone formats (theme regex)', results });
  await s.close();
}

// 5) open menu while a sheet is open; Escape spam; resize; rotation mid-flow
{
  const s = await newS();
  await s.goto('/products/oka-cobra', { settle: 500 });
  await s.page.evaluate(() => { document.querySelector('[data-add]')?.click(); }); // may open rec-sheet later
  await s.page.evaluate(() => { window.Oka?.openMenu?.(); });
  await s.page.evaluate(() => { const b = document.querySelector('[data-replace]'); b && b.click(); }); // variant/change sheet
  await s.page.waitForTimeout(300);
  await s.page.evaluate(() => { window.Oka?.openMenu?.(); });
  for (let i = 0; i < 12; i++) await s.page.keyboard.press('Escape');
  await s.page.setViewportSize({ width: 740, height: 360 }); // rotate to landscape
  await s.page.waitForTimeout(150);
  await s.page.setViewportSize({ width: 360, height: 740 });
  await s.page.evaluate(() => { document.body.style.zoom = '2'; window.dispatchEvent(new Event('resize')); });
  await s.page.waitForTimeout(200);
  const stuck = await s.page.evaluate(() => ({ menuOpen: document.querySelector('#app')?.classList.contains('menu-open'), scrims: document.querySelectorAll('.scrim, .alert-scrim').length, sheets: document.querySelectorAll('.sheet').length, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
  report.cases.push({ name: 'menu+sheet+escape+rotate+zoom', stuck, ...errs(s) });
  await s.close();
}

// 6) Back during a pending cart request
{
  const s = await newS();
  await s.goto('/collections/hookahs', { settle: 400 });
  let slow = true;
  await s.page.route('**/cart/*.js', async (route) => { if (slow) await new Promise((r) => setTimeout(r, 2500)); return route.continue(); });
  await s.goto('/products/oka-cobra', { settle: 400 });
  await s.page.evaluate(() => document.querySelector('[data-buy],[data-add]')?.click());
  await s.page.waitForTimeout(300);
  await s.page.goBack({ waitUntil: 'load' }).catch((e) => e);
  await s.page.waitForTimeout(400);
  slow = false;
  report.cases.push({ name: 'back during pending add', url: s.page.url(), ...errs(s) });
  await s.close();
}

fs.writeFileSync(path.join(OUT, '07-interaction-chaos.json'), JSON.stringify(report, null, 1));
console.log(`interaction cases: ${report.cases.length}`);
for (const c of report.cases) console.log(`${(c.name).padEnd(44)} err=${JSON.stringify(c.pageErrors || [])} cerr=${JSON.stringify(c.consoleErr || [])} ${c.serverItemCount != null ? 'cartCount=' + c.serverItemCount + ' items=' + JSON.stringify(c.serverItems || c.items) : ''} ${c.stuck ? JSON.stringify(c.stuck) : ''} ${c.results ? JSON.stringify(c.results) : ''} ${c.submitted != null ? 'submitted=' + c.submitted + ' url=' + c.url : ''}`);
