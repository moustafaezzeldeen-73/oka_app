// Tab hidden (visibilitychange) with the camera on: does the theme stop it? Logs each step.
import { open, camState, out, sleep } from './lib.mjs';
const setHidden = (p, hidden) => p.evaluate((hidden) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
  document.dispatchEvent(new Event('visibilitychange'));
  return { hidden: document.hidden, live: window.__camLive(), tracks: window.__cam.streams.map((s) => s.getTracks().map((t) => t.readyState).join()) };
}, hidden);
for (const where of ['pdp', 'arpage']) {
  const s = await open({ gum: 'real' });
  await s.goto(where === 'pdp' ? '/products/oka-cobra' : '/products/oka-cobra?view=ar');
  if (where === 'pdp') await s.page.evaluate(() => { const sc = document.querySelector('.screen[data-screen="product"]'); sc.scrollTo({ top: document.querySelector('[data-ar-view]').offsetTop - 76, behavior: 'instant' }); });
  await sleep(1500);
  out(where, 'on', await camState(s.page), 'video srcObject?', await s.page.evaluate(() => !!document.querySelector('[data-ar-cam]').srcObject));
  out(where, 'hide →', await setHidden(s.page, true));
  await sleep(300);
  out(where, 'hidden +300ms', await camState(s.page), 'video srcObject?', await s.page.evaluate(() => !!document.querySelector('[data-ar-cam]').srcObject), 'cls', await s.page.evaluate(() => document.querySelector('[data-ar-cam]').closest('.ar-screen').className));
  out(where, 'show →', await setHidden(s.page, false));
  await sleep(1500);
  out(where, 'visible +1.5s', await camState(s.page));
  // real hidden: open another page in front (headless: does visibility change?)
  const p2 = await s.context.newPage(); await p2.goto('about:blank'); await p2.bringToFront(); await sleep(800);
  out(where, 'other tab in front: document.hidden=', await s.page.evaluate(() => document.visibilityState), await camState(s.page));
  await s.close();
}
