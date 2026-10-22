// Portrait lock (landscape phones, tablets, desktop, soft keyboard) + overlay z-index stacking.
import path from 'node:path';
import { launch, BASE, seedCart, save, QA } from './lib.mjs';

const { DEVICES } = await import(path.join(QA, 'harness/pw.mjs'));
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
DEVICES['phone-land'] = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA };
DEVICES['phone-port'] = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA };
DEVICES['tab-land'] = { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA.replace('Pixel 7', 'SM-X710').replace(' Mobile', '') };
DEVICES['desk'] = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false };
const out = {};
const lockState = (p) => p.evaluate(() => {
  const app = document.querySelector('#app'); const r = app.getBoundingClientRect();
  return { vw: innerWidth, vh: innerHeight, mq: matchMedia('(orientation: landscape) and (max-height: 540px) and (hover: none) and (pointer: coarse)').matches, rot: document.documentElement.style.getPropertyValue('--rot'), transform: getComputedStyle(app).transform, box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], orientation: window.orientation, screenAngle: screen.orientation?.angle, active: document.activeElement?.tagName + '.' + (document.activeElement?.className || '') };
});

const ONLY = process.env.ONLY;
if (!ONLY) {
// 1. phone landscape: device angle 90 (left) and -90/270 (right)
for (const angle of [90, 270]) {
  const s = await launch({ baseURL: BASE, device: 'phone-land', locale: 'ar', agent: 'visual' });
  await s.context.addInitScript((a) => { Object.defineProperty(window, 'orientation', { get: () => (a === 270 ? -90 : a), configurable: true }); }, angle);
  await seedCart(s);
  const r = {};
  for (const p of ['/', '/products/oka-cobra', '/cart', '/pages/checkout-review']) {
    await s.goto(p, { settle: 1000 });
    r[p] = await lockState(s.page);
    // does a tap on a visible control reach it through the rotation?
    r[p].hit = await s.page.evaluate(() => {
      const b = [...document.querySelectorAll('#content button, #content a[href]')].find((e) => { const q = e.getBoundingClientRect(); return q.width > 20 && q.top > 60 && q.bottom < innerHeight - 20 && q.left > 20 && q.right < innerWidth - 20; });
      if (!b) return null; const q = b.getBoundingClientRect(); const h = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
      return { target: b.className, ok: b === h || b.contains(h) };
    });
    await s.shot(`lock-phone-land-${angle}-${p.replace(/[^\w]+/g, '_') || 'home'}`);
  }
  // open the side menu while rotated: does it slide in from the right edge of the rotated layout?
  await s.goto('/', { settle: 800 });
  await s.page.evaluate(() => window.Oka.openMenu()); await s.page.waitForTimeout(500);
  r.menu = await s.page.evaluate(() => { const m = document.querySelector('#side-menu').getBoundingClientRect(); return [Math.round(m.left), Math.round(m.top), Math.round(m.width), Math.round(m.height)]; });
  await s.shot(`lock-phone-land-${angle}-menu-open`);
  out[`phoneLandscape-${angle}`] = r;
  await s.close();
}

// 2. soft keyboard: portrait 390x844 → 390x300 with a focused input (Android WebView / pre-Chrome-108 behaviour)
for (const [dev, small] of [['phone-port', { width: 390, height: 300 }], ['tab-land', { width: 1180, height: 450 }]]) {
  const s = await launch({ baseURL: BASE, device: dev, locale: 'ar', loggedIn: true, agent: 'visual' });
  await seedCart(s);
  const r = {};
  for (const [p, sel] of [['/search', 'input'], ['/cart', '.discount-input'], ['/pages/addresses?view=oka-add-address', 'input.field-input'], ['/pages/contact', 'textarea']]) {
    await s.page.setViewportSize(dev === 'phone-port' ? { width: 390, height: 844 } : { width: 1180, height: 820 });
    await s.goto(p, { settle: 1000 });
    const el = await s.page.$(sel);
    if (!el) { r[p] = 'no input'; continue; }
    await el.focus();
    const before = await lockState(s.page);
    await s.page.setViewportSize(small);
    await s.page.waitForTimeout(400);
    const after = await lockState(s.page);
    const inputBox = await el.evaluate((e) => { const q = e.getBoundingClientRect(); return { box: [Math.round(q.left), Math.round(q.top), Math.round(q.width), Math.round(q.height)], visible: q.bottom > 0 && q.top < innerHeight && q.right > 0 && q.left < innerWidth, stillFocused: document.activeElement === e }; });
    r[p] = { before, after, inputBox };
    await s.shot(`lock-keyboard-${dev}-${p.replace(/[^\w]+/g, '_')}`);
  }
  out[`keyboard-${dev}`] = r;
  await s.close();
}

// 3. desktop + tablet landscape: never locked
for (const dev of ['desk', 'tab-land']) {
  const s = await launch({ baseURL: BASE, device: dev, locale: 'en', agent: 'visual' });
  await s.goto('/', { settle: 800 });
  out[`noLock-${dev}`] = await lockState(s.page);
  await s.close();
}

}
// 4. z-index stacking of overlays
{
  const s = await launch({ baseURL: BASE, device: 'iPhone 13', locale: 'ar', agent: 'visual', ageConfirmed: false });
  await seedCart(s);
  const r = {};
  await s.goto('/', { settle: 1000 });
  // age gate up: keyboard user opens the menu behind it
  await s.page.focus('header [data-menu-open]');
  await s.page.keyboard.press('Enter'); await s.page.waitForTimeout(500);
  r.menuOverAgeGate = await s.page.evaluate(() => { const m = document.querySelector('#side-menu').getBoundingClientRect(); const h = document.elementFromPoint(m.left + m.width / 2, m.top + m.height / 2); return { menuOpen: document.querySelector('#app').classList.contains('menu-open'), topAtMenu: h?.closest('#side-menu') ? 'side-menu' : h?.className, gate: !!document.querySelector('.age-gate') }; });
  await s.shot('z-menu-over-agegate');
  await s.page.keyboard.press('Escape');
  await s.page.evaluate(() => { localStorage.setItem('oka.age', 'true'); document.querySelector('.age-gate')?.remove(); });
  // toast/added-bar vs open menu, sheet, alert
  await s.page.evaluate(() => window.Oka.openMenu()); await s.page.waitForTimeout(400);
  await s.page.evaluate(() => window.Oka.toast('QA toast')); await s.page.waitForTimeout(100);
  r.toastOverMenu = await s.page.evaluate(() => { const t = document.querySelector('.toast').getBoundingClientRect(); const h = document.elementFromPoint(t.left + t.width / 2, t.top + t.height / 2); return h?.closest('.toast') ? 'toast on top' : h?.className; });
  await s.shot('z-toast-over-menu');
  await s.page.evaluate(() => window.Oka.closeMenu());
  await s.goto('/cart', { settle: 1500 });
  const chg = await s.page.$('.line-variant');
  if (chg) { await chg.click(); await s.page.waitForTimeout(800); }
  r.sheetCoversChrome = await s.page.evaluate(() => { const out = {}; for (const sel of ['.menu-handle', '.top-bar [data-menu-open]', '.top-bar [data-toggle-lang]']) { const q = document.querySelector(sel).getBoundingClientRect(); const h = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); out[sel] = h?.className?.toString?.().slice(0, 30); } out.sheetOpen = !!document.querySelector('.sheet'); return out; });
  await s.shot('z-cart-sheet');
  out.zindex = r;
  await s.close();
}
import fs0 from "node:fs";
const prev = (() => { try { return JSON.parse(fs0.readFileSync(new URL("./out/lock-zindex.json", import.meta.url))); } catch (e) { return {}; } })();
save('lock-zindex.json', ONLY ? { ...prev, ...out } : out);
console.log(JSON.stringify(out, null, 1).slice(0, 6000));
