// Desktop: once the 3D model is in the PDP AR section, does mouse-wheel over it zoom the model instead of scrolling the page?
import { open, out, sleep } from './lib.mjs';
const s = await open({ device: 'Desktop 1440' });
await s.goto('/products/oka-carbon-black-hookah');
await s.page.addStyleTag({ content: '.screen[data-screen="product"]{scroll-snap-type:none!important}' });
await s.page.evaluate(() => { const sc = document.querySelector('.screen[data-screen="product"]'); sc.scrollTo({ top: document.querySelector('[data-ar-view]').offsetTop - 76, behavior: 'instant' }); });
await s.page.waitForFunction(() => document.querySelector('[data-ar-view] model-viewer')?.loaded, null, { timeout: 15000 });
await sleep(800);
const box = await s.page.evaluate(() => { const r = document.querySelector('[data-ar-view] model-viewer').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
await s.page.evaluate(() => { window.__prevented = 0; document.addEventListener('wheel', (e) => { if (e.defaultPrevented) window.__prevented++; }, { capture: false }); });
const st0 = await s.page.evaluate(() => document.querySelector('.screen[data-screen="product"]').scrollTop);
await s.page.mouse.move(box.x, box.y);
for (let i = 0; i < 5; i++) { await s.page.mouse.wheel(0, 200); await sleep(300); }
const st1 = await s.page.evaluate(() => document.querySelector('.screen[data-screen="product"]').scrollTop);
out('wheel ×5 over the model: page scrollTop', st0, '→', st1, '| wheel events defaultPrevented:', await s.page.evaluate(() => window.__prevented), '| camera-orbit now', await s.page.evaluate(() => document.querySelector('[data-ar-view] model-viewer').getCameraOrbit().toString()));
await s.page.mouse.move(20, 300);
for (let i = 0; i < 3; i++) { await s.page.mouse.wheel(0, 200); await sleep(300); }
out('wheel ×3 beside the model (x=20):', await s.page.evaluate(() => document.querySelector('.screen[data-screen="product"]').scrollTop));
await s.close();
