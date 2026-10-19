// Permission prompt open → tab goes to background → shopper's "Allow" lands while hidden: is the camera live in a hidden tab?
// Then: tab visible again while the first call is still pending → two calls → orphan?
import { open, camState, out, sleep } from './lib.mjs';
const setHidden = (p, hidden) => p.evaluate((hidden) => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') }); document.dispatchEvent(new Event('visibilitychange')); }, hidden);
for (const where of ['pdp', 'arpage']) {
  // 1) resolve while hidden
  let s = await open({ gum: 'pending' });
  await s.goto(where === 'pdp' ? '/products/oka-cobra' : '/products/oka-cobra?view=ar');
  if (where === 'pdp') await s.page.evaluate(() => { const sc = document.querySelector('.screen[data-screen="product"]'); sc.scrollTo({ top: document.querySelector('[data-ar-view]').offsetTop - 76, behavior: 'instant' }); });
  await sleep(1200);
  await setHidden(s.page, true); await sleep(200);
  await s.page.evaluate(() => window.__camReleasePending());
  await sleep(7000);
  out(`${where} 1) Allow lands while tab hidden:`, await camState(s.page));
  await s.close();
  // 2) visible again while still pending, then both answered
  s = await open({ gum: 'pending' });
  await s.goto(where === 'pdp' ? '/products/oka-cobra' : '/products/oka-cobra?view=ar');
  if (where === 'pdp') await s.page.evaluate(() => { const sc = document.querySelector('.screen[data-screen="product"]'); sc.scrollTo({ top: document.querySelector('[data-ar-view]').offsetTop - 76, behavior: 'instant' }); });
  await sleep(1200);
  await setHidden(s.page, true); await sleep(200); await setHidden(s.page, false); await sleep(300);
  await s.page.evaluate(() => window.__camReleasePending());
  await sleep(9000);
  const on = await camState(s.page);
  if (where === 'pdp') await s.page.evaluate(() => document.querySelector('.screen[data-screen="product"]').scrollTo({ top: 0, behavior: 'instant' }));
  else await setHidden(s.page, true);
  await sleep(800);
  out(`${where} 2) hide/show during prompt, then Allow: on`, on, `→ after ${where === 'pdp' ? 'scrolling away' : 'tab hidden'}`, await camState(s.page));
  await s.close();
}
