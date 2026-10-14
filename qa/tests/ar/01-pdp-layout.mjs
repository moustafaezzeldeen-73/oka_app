// PDP: which sections render per product, their scroll positions, and whether the camera starts without scrolling.
import { open, MODEL_PRODUCTS, NO_MODEL, camState, arInfo, out, sleep } from './lib.mjs';
for (const device of ['iPhone 13', 'Pixel 7', 'Desktop 1440']) {
  for (const h of [...MODEL_PRODUCTS, ...NO_MODEL]) {
    const s = await open({ device });
    const reqs = [];
    s.page.on('request', (r) => reqs.push(r.url()));
    await s.goto(`/products/${h}`);
    await sleep(1500);
    const lay = await s.page.evaluate(() => {
      const sc = document.querySelector('.screen[data-screen="product"]');
      const secs = [...sc.querySelectorAll('.snap-pg, .story-hero, .story-grid, .story-box, .story-cross, .story-steps')].map((e) => ({ c: e.className.split(' ').slice(0, 3).join('.'), top: Math.round(e.getBoundingClientRect().top + sc.scrollTop), h: Math.round(e.getBoundingClientRect().height), snap: getComputedStyle(e).scrollSnapAlign }));
      return { vh: innerHeight, scrollH: sc.scrollHeight, snapType: getComputedStyle(sc).scrollSnapType, overflowY: getComputedStyle(sc).overflowY, secs, arCard: !!document.querySelector('.ar-card'), chip3d: !!document.querySelector('.pdp-3d'), reel: document.querySelectorAll('[data-reel-item] video').length, story: document.querySelector('.story')?.className || null };
    });
    out(device, h, { ...lay, secs: lay.secs.map((x) => `${x.c}@${x.top}(${x.h},${x.snap})`).join(' '), cam: await camState(s.page), ar: await arInfo(s.page), mvReq: reqs.filter((u) => /model-viewer|\.glb|\.usdz/.test(u)).length });
    if (h === 'oka-cloud-white-hookah') await s.shot(`pdp-top-${device}`);
    await s.close();
  }
}
