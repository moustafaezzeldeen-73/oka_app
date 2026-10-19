// Performance basics in the harness (NOT the Shopify CDN): bytes, long tasks, CLS, DOM size,
// render-blocking resources, images without dimensions / lazy-loading; plus Slow-4G / 3G + 4x CPU.
import { launch, BASE, seedCart, save } from './lib.mjs';

const PROFILES = {
  none: null,
  'slow-4g': { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, cpu: 4 },
  '3g': { latency: 300, downloadThroughput: (750 * 1024) / 8, uploadThroughput: (250 * 1024) / 8, cpu: 4 },
};
const PAGES = ['/', '/products/oka-cobra', '/products/oka-cloud-white-hookah', '/collections/all?filter.v.availability=1', '/cart', '/pages/orders?order=%239000101'];
const out = {};
for (const [prof, cfg] of Object.entries(PROFILES)) {
  for (const p of (prof === 'none' ? PAGES : PAGES.slice(0, 3))) {
    const s = await launch({ baseURL: BASE, device: 'Pixel 7', locale: 'ar', loggedIn: p.includes('orders'), agent: 'visual', externalTimeoutMs: 1500 });
    await seedCart(s);
    await s.context.addInitScript(() => {
      window.__perf = { cls: 0, shifts: [], longTasks: [], lcp: 0 };
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) { window.__perf.cls += e.value; window.__perf.shifts.push({ v: +e.value.toFixed(4), src: (e.sources || []).map((x) => x.node?.className?.toString?.().slice(0, 40) || x.node?.nodeName).slice(0, 3) }); } }).observe({ type: 'layout-shift', buffered: true }); } catch (e) {}
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.longTasks.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.lcp = Math.round(e.startTime); }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch (e) {}
    });
    const cdp = await s.context.newCDPSession(s.page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    if (cfg) {
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: cfg.latency, downloadThroughput: cfg.downloadThroughput, uploadThroughput: cfg.uploadThroughput });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: cfg.cpu });
    }
    const bytes = { script: 0, stylesheet: 0, image: 0, document: 0, fetch: 0, other: 0, media: 0, font: 0 };
    const reqs = new Map();
    cdp.on('Network.requestWillBeSent', (e) => reqs.set(e.requestId, { type: (e.type || 'Other').toLowerCase(), url: e.request.url }));
    cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (!r) return; const k = r.type === 'xhr' ? 'fetch' : (r.type in bytes ? r.type : 'other'); bytes[k] += e.encodedDataLength; });
    const t0 = Date.now();
    await s.page.goto(p, { waitUntil: 'load', timeout: 180000 });
    const tLoad = Date.now() - t0;
    // "interactive-ish": theme scripts wired (window.Oka) and a main control responds
    await s.page.waitForFunction(() => window.Oka && document.querySelector('#app'), null, { timeout: 120000 });
    const tOka = Date.now() - t0;
    await s.page.waitForTimeout(cfg ? 4000 : 2000);
    const m = await s.page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime;
      const head = [...document.head.querySelectorAll('link[rel=stylesheet], script[src]:not([async]):not([defer]):not([type=module])')].map((e) => e.href || e.src);
      const imgs = [...document.images];
      return {
        dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd), fcp: Math.round(fcp || 0), lcp: window.__perf.lcp,
        cls: +window.__perf.cls.toFixed(4), shifts: window.__perf.shifts.slice(0, 5), longTasks: window.__perf.longTasks, tbtish: window.__perf.longTasks.reduce((a, d) => a + Math.max(0, d - 50), 0),
        domNodes: document.getElementsByTagName('*').length, renderBlocking: head,
        images: imgs.length, imgNoDims: imgs.filter((i) => !i.getAttribute('width') || !i.getAttribute('height')).map((i) => i.className || i.closest('[class]')?.className).slice(0, 8), imgNoDimsCount: imgs.filter((i) => !i.getAttribute('width') || !i.getAttribute('height')).length,
        imgEager: imgs.filter((i) => i.loading !== 'lazy').length, imgLazy: imgs.filter((i) => i.loading === 'lazy').length,
        jsHeapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null,
      };
    });
    out[`${prof} ${p}`] = { tLoad, tOka, bytesKB: Object.fromEntries(Object.entries(bytes).map(([k, v]) => [k, Math.round(v / 1024)])), ...m };
    console.log(prof, p, tLoad, tOka, JSON.stringify(out[`${prof} ${p}`].bytesKB), 'cls', m.cls, 'lt', m.longTasks.length, 'dom', m.domNodes);
    await s.close();
  }
}
save('perf.json', out);
