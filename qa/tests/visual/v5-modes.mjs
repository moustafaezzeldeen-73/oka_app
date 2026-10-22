// Dark mode, Chrome auto-dark, forced colours, 200 % zoom / text scaling, fonts, computed contrast.
import path from 'node:path';
import { launch, BASE, seedCart, save, probe, QA } from './lib.mjs';

const { DEVICES } = await import(path.join(QA, 'harness/pw.mjs'));
DEVICES['zoom200-phone'] = { viewport: { width: 195, height: 332 }, deviceScaleFactor: 4, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36' };
DEVICES['zoom200-desk'] = { viewport: { width: 640, height: 400 }, deviceScaleFactor: 2, isMobile: false, hasTouch: false };
const out = {};
const PAGES = ['/', '/collections/oka-cobra', '/products/oka-cobra', '/cart', '/pages/checkout-review', '/pages/orders?order=%239000101', '/pages/addresses?view=oka-add-address', '/pages/support', '/search?q=hookah'];

/** text contrast, compositing alpha colours over the nearest solid ancestor background (gradients → assumed #fff) */
function contrastProbe() {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const blend = (f, b) => [0, 1, 2].map((i) => f[i] * f[3] + b[i] * (1 - f[3])).concat(1);
  const lum = (c) => { const a = c.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; };
  const bgOf = (el) => {
    const stack = [];
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage !== 'none' && !/url\(/.test(cs.backgroundImage)) { const g = cs.backgroundImage.match(/rgba?\([^)]+\)/g); if (g) { const cols = g.map(parse); const dark = cols.filter((c) => c[3] > 0.5 && (c[0] + c[1] + c[2]) / 3 < 100); if (dark.length) { stack.push(dark[0]); break; } } }
      const b = parse(cs.backgroundColor); if (b && b[3] > 0) { stack.push(b); if (b[3] >= 1) break; }
    }
    let bg = [255, 255, 255, 1];
    for (let i = stack.length - 1; i >= 0; i--) bg = blend(stack[i], bg);
    return bg;
  };
  const res = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('#app *')) {
    if (el.closest('[inert],[aria-hidden=true],svg')) continue;
    if (!el.checkVisibility || !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
    if (!own) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    let fg = parse(cs.color); if (!fg) continue;
    let op = 1; for (let e = el; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
    fg = [fg[0], fg[1], fg[2], fg[3] * op];
    const bg = bgOf(el);
    const f = blend(fg, bg);
    const L1 = lum(f); const L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize); const bold = Number(cs.fontWeight) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    const key = `${el.className}|${own.slice(0, 20)}`;
    if (ratio < need && !seen.has(key)) { seen.add(key); res.push({ cls: String(el.className).slice(0, 40), text: own.slice(0, 40), color: cs.color, ratio: Math.round(ratio * 100) / 100, need, size }); }
  }
  return res;
}

// 1. computed contrast in light mode (ar + en)
for (const locale of ['ar', 'en']) {
  const s = await launch({ baseURL: BASE, device: 'iPhone 13', locale, loggedIn: true, agent: 'visual' });
  await seedCart(s);
  const r = {};
  for (const p of PAGES) { await s.goto(p, { settle: 1200 }); r[p] = await s.page.evaluate(contrastProbe); }
  out[`contrast-${locale}`] = r;
  await s.close();
}

// 2. prefers-color-scheme: dark — does anything change?
{
  const s = await launch({ baseURL: BASE, device: 'iPhone 13', locale: 'ar', agent: 'visual' });
  await seedCart(s);
  const r = {};
  for (const scheme of ['light', 'dark']) {
    await s.page.emulateMedia({ colorScheme: scheme });
    await s.goto('/products/oka-cobra', { settle: 1000 });
    r[scheme] = await s.page.evaluate(() => ({ body: getComputedStyle(document.body).backgroundColor, app: getComputedStyle(document.querySelector('.app')).backgroundImage.slice(0, 60), ink: getComputedStyle(document.body).color, colorScheme: getComputedStyle(document.documentElement).colorScheme, metaColorScheme: document.querySelector('meta[name=color-scheme]')?.content || null }));
    await s.shot(`mode-${scheme}-pdp`);
  }
  out.darkPref = r;
  await s.close();
}

// 3. Chrome auto dark mode (Android "Dark theme for web pages" / Samsung Internet forced dark)
{
  const { chromium } = (await import('node:module')).createRequire(import.meta.url)('/opt/node22/lib/node_modules/playwright');
  const b = await chromium.launch({ args: ['--enable-features=WebContentsForceDark', '--blink-settings=forceDarkModeEnabled=true'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, baseURL: BASE });
  await ctx.addInitScript(() => { try { localStorage.setItem('oka.age', 'true'); localStorage.setItem('oka.lang', 'ar'); } catch (e) {} });
  await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.fulfill({ status: 204, body: '' }));
  const pg = await ctx.newPage();
  for (const p of ['/', '/products/oka-cobra', '/cart']) { await pg.goto(p); await pg.waitForTimeout(1200); await pg.screenshot({ path: path.join(QA, 'reports/screenshots/visual', `mode-forcedark-${p.replace(/[^\w]+/g, '_') || 'home'}.png`) }); }
  out.forceDark = 'screenshots mode-forcedark-*.png';
  await b.close();
}

// 4. forced colours (Windows High Contrast)
{
  const s = await launch({ baseURL: BASE, device: 'Desktop 1440', locale: 'en', agent: 'visual' });
  await seedCart(s);
  await s.page.emulateMedia({ forcedColors: 'active' });
  const r = {};
  for (const p of ['/', '/collections/oka-cobra', '/products/oka-cobra', '/cart']) {
    await s.goto(p, { settle: 1000 });
    r[p] = await s.page.evaluate(() => {
      const chips = [...document.querySelectorAll('.chip')].slice(0, 3).map((c) => ({ cls: c.className, bg: getComputedStyle(c).backgroundColor, border: getComputedStyle(c).borderStyle + ' ' + getComputedStyle(c).borderWidth, color: getComputedStyle(c).color }));
      const iconBtns = [...document.querySelectorAll('button')].filter((b) => !b.innerText.trim() && b.checkVisibility()).slice(0, 8).map((b) => ({ cls: b.className, border: getComputedStyle(b).borderStyle, svgStroke: b.querySelector('path')?.getAttribute('stroke'), svgFill: b.querySelector('path')?.getAttribute('fill') }));
      return { chips, iconBtns, forcedRules: [...document.styleSheets].some((ss) => { try { return [...ss.cssRules].some((r) => /forced-colors/.test(r.cssText)); } catch (e) { return false; } }) };
    });
    await s.shot(`mode-forced-colors-${p.replace(/[^\w]+/g, '_') || 'home'}`);
  }
  out.forcedColors = r;
  await s.close();
}

// 5. 200 % zoom = 195-px-wide phone / 640-px desktop; and 200 % text-only scaling (px font sizes doubled)
for (const dev of ['zoom200-phone', 'zoom200-desk']) {
  for (const locale of ['ar', 'en']) {
    const s = await launch({ baseURL: BASE, device: dev, locale, agent: 'visual' });
    await seedCart(s);
    const r = {};
    for (const p of PAGES) {
      await s.goto(p, { settle: 1000 });
      const pr = await s.page.evaluate(probe);
      r[p] = { docOverflow: pr.docOverflow, oov: pr.outOfViewport.slice(0, 6), clipped: pr.clipped.filter((c) => !c.ellipsis && !c.clamp).slice(0, 6), lock: await s.page.evaluate(() => getComputedStyle(document.querySelector('#app')).transform) };
      if (locale === 'ar') await s.shot(`zoom-${dev}-${locale}-${p.replace(/[^\w]+/g, '_') || 'home'}`);
    }
    out[`${dev}-${locale}`] = r;
    await s.close();
  }
}
for (const locale of ['ar', 'en']) {
  const s = await launch({ baseURL: BASE, device: 'iPhone 13', locale, agent: 'visual' });
  await seedCart(s);
  const r = {};
  for (const p of PAGES) {
    await s.goto(p, { settle: 1000 });
    await s.page.evaluate(() => { const els = [...document.querySelectorAll('#app *')]; const sizes = els.map((e) => parseFloat(getComputedStyle(e).fontSize)); els.forEach((e, i) => { e.style.fontSize = `${sizes[i] * 2}px`; const lh = getComputedStyle(e).lineHeight; if (lh.endsWith('px')) e.style.lineHeight = 'normal'; }); });
    await s.page.waitForTimeout(300);
    const pr = await s.page.evaluate(probe);
    r[p] = { docOverflow: pr.docOverflow, oov: pr.outOfViewport.slice(0, 6), clippedHard: pr.clipped.filter((c) => !c.ellipsis && !c.clamp).slice(0, 8), clippedCount: pr.clipped.length };
    await s.shot(`textscale200-${locale}-${p.replace(/[^\w]+/g, '_') || 'home'}`);
  }
  out[`textScale200-${locale}`] = r;
  // what the browser's own font-size setting does (default font size 32px): px-based CSS ignores it
  const cdp = await s.context.newCDPSession(s.page);
  await cdp.send('Page.setFontSizes', { fontSizes: { standard: 32, fixed: 26 } }).catch(() => {});
  await s.goto('/products/oka-cobra', { settle: 800 });
  out[`defaultFont32-${locale}`] = await s.page.evaluate(() => ({ title: getComputedStyle(document.querySelector('h1') || document.body).fontSize, body: getComputedStyle(document.body).fontSize, pxRules: [...document.styleSheets].reduce((n, ss) => { try { return n + [...ss.cssRules].filter((r) => /font-size:\s*[\d.]+px/.test(r.cssText)).length; } catch (e) { return n; } }, 0), remRules: [...document.styleSheets].reduce((n, ss) => { try { return n + [...ss.cssRules].filter((r) => /font-size:\s*[\d.]+(rem|em)/.test(r.cssText)).length; } catch (e) { return n; } }, 0) }));
  await s.close();
}

// 6. fonts: which families actually render, any web-font requests
{
  const s = await launch({ baseURL: BASE, device: 'iPhone 13', locale: 'ar', agent: 'visual' });
  const fontReqs = [];
  s.page.on('request', (q) => { if (q.resourceType() === 'font') fontReqs.push(q.url()); });
  await s.goto('/products/oka-cobra', { settle: 1000 });
  const cdp = await s.context.newCDPSession(s.page);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const doc = await cdp.send('DOM.getDocument');
  const h1 = await cdp.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'h1' });
  const fonts = h1.nodeId ? await cdp.send('CSS.getPlatformFontsForNode', { nodeId: h1.nodeId }) : null;
  out.fonts = { fontRequests: fontReqs, h1PlatformFonts: fonts?.fonts, stack: await s.page.evaluate(() => getComputedStyle(document.body).fontFamily) };
  await s.close();
}
save('modes.json', out);
console.log('done');
