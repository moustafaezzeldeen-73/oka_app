// Layout sweep: every HTML route × viewport × {ar, en} (guest, root URL form).
//   node v2-widths.mjs <viewportName> [routeFilter]
import path from 'node:path';
import { launch, ROUTES, BASE, seedCart, save, probe, coveredProbe, QA } from './lib.mjs';

const { DEVICES } = await import(path.join(QA, 'harness/pw.mjs'));
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
const TABLET_UA = 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const DESK_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
export const VIEWPORTS = {
  'p320': [320, 568, 'phone'], 'p360': [360, 740, 'phone'], 'p375': [375, 667, 'phone'], 'p390': [390, 844, 'phone'], 'p412': [412, 915, 'phone'], 'p430': [430, 932, 'phone'],
  'l667': [667, 375, 'phone'], 'l844': [844, 390, 'phone'], 'l932': [932, 430, 'phone'],
  't768': [768, 1024, 'tablet'], 't820': [820, 1180, 'tablet'], 'tl1024': [1024, 768, 'tablet'], 'tl1180': [1180, 820, 'tablet'],
  'd1024': [1024, 768, 'desk'], 'd1280': [1280, 800, 'desk'], 'd1440': [1440, 900, 'desk'], 'd1920': [1920, 1080, 'desk'],
};
for (const [k, [w, h, kind]] of Object.entries(VIEWPORTS)) {
  DEVICES[`v-${k}`] = { viewport: { width: w, height: h }, deviceScaleFactor: kind === 'desk' ? 1 : 2, isMobile: kind !== 'desk', hasTouch: kind !== 'desk', userAgent: kind === 'phone' ? MOBILE_UA : kind === 'tablet' ? TABLET_UA : DESK_UA };
}

const vp = process.argv[2];
const filter = process.argv[3];
const res = [];
for (const locale of ['ar', 'en']) {
  const s = await launch({ baseURL: BASE, device: `v-${vp}`, locale, agent: 'visual', externalTimeoutMs: 1500 });
  if (vp.startsWith('l')) await s.page.addInitScript(() => {}); // orientation comes from viewport aspect in Chromium emulation
  await seedCart(s);
  for (const [route] of ROUTES) {
    if (filter && !route.includes(filter)) continue;
    if (route.includes('view=oka-data')) continue;
    const row = { vp, locale, route };
    try {
      await s.goto(route, { settle: 700 });
      const p = await s.page.evaluate(probe);
      row.lang = p.lang; row.docOverflow = p.docOverflow; row.docScrollW = p.docScrollW;
      row.outOfViewport = p.outOfViewport.slice(0, 8); row.clipped = p.clipped.filter((c) => !c.ellipsis && !c.clamp).slice(0, 8); row.ellipsis = p.clipped.filter((c) => c.ellipsis || c.clamp).length;
      row.lock = await s.page.evaluate(() => {
        const app = document.querySelector('#app');
        const mq = matchMedia('(orientation: landscape) and (max-height: 540px) and (hover: none) and (pointer: coarse)').matches;
        const r = app.getBoundingClientRect();
        return { mq, transform: getComputedStyle(app).transform, appW: Math.round(r.width), appH: Math.round(r.height), appL: Math.round(r.left), appT: Math.round(r.top), rot: getComputedStyle(document.documentElement).getPropertyValue('--rot') };
      });
      row.covered = await s.page.evaluate(coveredProbe);
      if (['/', '/products/oka-cobra', '/cart', '/pages/checkout-review', '/collections/oka-cobra', '/pages/orders?order=%239000101'].includes(route)) await s.shot(`w-${vp}-${locale}-${route.replace(/^\//, '').replace(/[^\w]+/g, '_') || 'home'}`);
    } catch (e) { row.error = e.message.slice(0, 200); }
    res.push(row);
  }
  await s.close();
}
save(`widths-${vp}.json`, res);
console.log(vp, res.length, 'docOverflow', res.filter((r) => r.docOverflow).length, 'oov', res.filter((r) => r.outOfViewport?.length).length, 'clipped', res.filter((r) => r.clipped?.length).length, 'covered', res.filter((r) => r.covered?.length).length);
