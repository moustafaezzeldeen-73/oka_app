// F-03 at runtime: a slow permission answer (getUserMedia delayed by N ms) while the shopper scrolls off and back on.
// Also: tab hidden while the prompt is pending. Prints the call/resolve timeline and live tracks.
import { open, camState, out, sleep } from './lib.mjs';
const toAr = (p) => p.evaluate(() => { const s = document.querySelector('.screen[data-screen="product"]'); s.scrollTo({ top: document.querySelector('[data-ar-view]').offsetTop - 76, behavior: 'instant' }); });
const toTop = (p) => p.evaluate(() => document.querySelector('.screen[data-screen="product"]').scrollTo({ top: 0, behavior: 'instant' }));
const setHidden = (p, hidden) => p.evaluate((hidden) => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') }); document.dispatchEvent(new Event('visibilitychange')); }, hidden);
const timeline = (p) => p.evaluate(() => window.__cam.log.map((l) => `${l.t}ms:${l.ev}${l.name ? '(' + l.name + ')' : ''}`).join(' '));
for (const delay of [0, 300, 1500, 4000]) {
  const s = await open({ gum: delay ? `delay:${delay}` : 'real' });
  await s.goto('/products/oka-cobra');
  await toAr(s.page); await sleep(250); await toTop(s.page); await sleep(250); await toAr(s.page);
  await sleep(delay + 2000);
  const on = await camState(s.page);
  await toTop(s.page); await sleep(1000);
  const away = await camState(s.page);
  out(`race delay=${delay}: on-section`, on, '→ scrolled away', away, away.live ? `LEAK ${away.live} live track(s)` : 'ok', '| timeline', await timeline(s.page));
  if (away.live) await s.shot(`leak-race-${delay}-scrolled-away`);
  await s.close();
}
for (const delay of [1500]) {
  const s = await open({ gum: `delay:${delay}` });
  await s.goto('/products/oka-cobra');
  await toAr(s.page); await sleep(200); await setHidden(s.page, true); await sleep(delay + 800);
  const hid = await camState(s.page);
  await setHidden(s.page, false); await sleep(delay + 800);
  const vis = await camState(s.page);
  await toTop(s.page); await sleep(800);
  out(`hidden-while-pending delay=${delay}: tab hidden`, hid, hid.live ? 'LEAK: camera live in a hidden tab' : '', '| visible again', vis, '| scrolled away', await camState(s.page), '| timeline', await timeline(s.page));
  await s.close();
}
