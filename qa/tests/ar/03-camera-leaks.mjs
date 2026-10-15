// Camera stream lifecycle on the PDP AR section and the ?view=ar screen: count getUserMedia calls and live tracks.
import { open, camState, out, sleep } from './lib.mjs';
const H = '/products/oka-cobra';
const sc = (page, f) => page.evaluate(f);
const toAr = (p) => sc(p, () => { const s = document.querySelector('.screen[data-screen="product"]'); const a = document.querySelector('[data-ar-view]'); s.scrollTo({ top: a.offsetTop - 12 - (parseFloat(getComputedStyle(s).scrollPaddingTop) || 0), behavior: 'instant' }); });
const toTop = (p) => sc(p, () => document.querySelector('.screen[data-screen="product"]').scrollTo({ top: 0, behavior: 'instant' }));
const toBottom = (p) => sc(p, () => { const s = document.querySelector('.screen[data-screen="product"]'); s.scrollTo({ top: s.scrollHeight, behavior: 'instant' }); });
const setHidden = (p, hidden) => sc(p, (hidden) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
  document.dispatchEvent(new Event('visibilitychange'));
}, hidden);
const T = process.argv[2];
const run = (name) => !T || T === name;

if (run('repeat')) { // A: in/out 10 times, waiting for each to settle
  const s = await open({ gum: 'real' });
  await s.goto(H);
  const series = [];
  for (let i = 0; i < 10; i++) { await toAr(s.page); await sleep(700); const a = await camState(s.page); await toTop(s.page); await sleep(400); const b = await camState(s.page); series.push(`${a.live}/${b.live}`); }
  out('A repeat in/out x10 (live on/off):', series.join(' '), await camState(s.page));
  await s.close();
}
if (run('race')) { // B: F-03 race — permission prompt (simulated 1.5 s getUserMedia), scroll away and back before it resolves
  for (const delay of [300, 1500, 4000]) {
    const s = await open({ gum: `delay:${delay}` });
    await s.goto(H);
    await toAr(s.page); await sleep(150); await toTop(s.page); await sleep(150); await toAr(s.page); await sleep(delay + 1500);
    const inSec = await camState(s.page);
    await toTop(s.page); await sleep(800);
    const away = await camState(s.page);
    await s.shot(`leak-race-${delay}-away`);
    out(`B race delay=${delay}: on AR`, inSec, 'after scrolling away', away, away.live ? `LEAK: ${away.live} live track(s) with section off-screen` : 'no leak');
    await s.close();
  }
  // B2: away-only (in, out before resolve) — should end with 0
  const s = await open({ gum: 'delay:1500' });
  await s.goto(H); await toAr(s.page); await sleep(150); await toTop(s.page); await sleep(2500);
  out('B2 in→out before resolve:', await camState(s.page));
  await s.close();
}
if (run('fast')) { // C: fast scroll through the whole page
  for (const gum of ['real', 'delay:800']) {
    const s = await open({ gum });
    await s.goto(H);
    await s.page.evaluate(async () => { const sc = document.querySelector('.screen[data-screen="product"]'); for (let y = 0; y < sc.scrollHeight; y += 60) { sc.scrollTo({ top: y, behavior: 'instant' }); await new Promise((r) => requestAnimationFrame(r)); } });
    await sleep(2500);
    out(`C fast scroll-through gum=${gum} (ended at bottom):`, await camState(s.page));
    // and back up through it
    await s.page.evaluate(async () => { const sc = document.querySelector('.screen[data-screen="product"]'); for (let y = sc.scrollHeight; y >= 0; y -= 60) { sc.scrollTo({ top: y, behavior: 'instant' }); await new Promise((r) => requestAnimationFrame(r)); } });
    await sleep(2500);
    out(`C fast scroll back up gum=${gum} (ended at top):`, await camState(s.page));
    // mouse wheel through it (desktop-ish), 10 notches
    await s.page.mouse.move(200, 300);
    for (let i = 0; i < 12; i++) { await s.page.mouse.wheel(0, 300); await sleep(60); }
    await sleep(2500);
    out(`C wheel x12 gum=${gum}:`, await camState(s.page), 'scrollTop', await s.page.evaluate(() => document.querySelector('.screen[data-screen="product"]').scrollTop));
    await s.close();
  }
}
if (run('hidden')) { // D: tab hidden / visible (visibilitychange)
  const s = await open({ gum: 'real' });
  await s.goto(H); await toAr(s.page); await sleep(1500);
  const on = await camState(s.page);
  await setHidden(s.page, true); await sleep(500); const hid = await camState(s.page);
  await setHidden(s.page, false); await sleep(1500); const vis = await camState(s.page);
  out('D hidden/visible on AR section:', { on, hid, vis });
  // hidden while the section is off-screen: must not start
  await toTop(s.page); await sleep(500); await setHidden(s.page, true); await sleep(300); await setHidden(s.page, false); await sleep(1500);
  out('D hide/show while scrolled away:', await camState(s.page));
  await s.close();
  // D2: tab hidden while getUserMedia is pending → stream lands in a hidden tab
  const s2 = await open({ gum: 'delay:1500' });
  await s2.goto(H); await toAr(s2.page); await sleep(200); await setHidden(s2.page, true); await sleep(2500);
  out('D2 hidden while pending → after resolve (tab still hidden):', await camState(s2.page));
  await setHidden(s2.page, false); await sleep(2000);
  out('D2 visible again:', await camState(s2.page));
  await s2.close();
  // D3: AR screen (?view=ar)
  const s3 = await open({ gum: 'real' });
  await s3.goto(`${H}?view=ar`); await sleep(1500);
  const a = await camState(s3.page); await setHidden(s3.page, true); await sleep(300); const b = await camState(s3.page); await setHidden(s3.page, false); await sleep(1500);
  out('D3 ?view=ar on/hidden/visible:', a, b, await camState(s3.page));
  await s3.close();
}
if (run('nav')) { // E: navigating away (full nav) and bfcache back/forward
  for (const start of ['pdp', 'arpage']) {
    const s = await open({ gum: 'real' });
    await s.context.addInitScript(() => {
      window.addEventListener('pageshow', (e) => { const l = JSON.parse(sessionStorage.getItem('__nav') || '[]'); l.push({ ev: 'pageshow', persisted: e.persisted, url: location.pathname + location.search }); sessionStorage.setItem('__nav', JSON.stringify(l)); });
      window.addEventListener('pagehide', (e) => { const l = JSON.parse(sessionStorage.getItem('__nav') || '[]'); l.push({ ev: 'pagehide', persisted: e.persisted, live: window.__camLive ? window.__camLive() : null }); sessionStorage.setItem('__nav', JSON.stringify(l)); });
    });
    await s.goto(start === 'pdp' ? H : `${H}?view=ar`);
    if (start === 'pdp') { await toAr(s.page); }
    await sleep(1500);
    const on = await camState(s.page);
    await s.page.goto('/collections/all', { waitUntil: 'load' }); await sleep(800);
    await s.page.goBack({ waitUntil: 'load' }); await sleep(2000);
    const back = await camState(s.page);
    const nav = await s.page.evaluate(() => sessionStorage.getItem('__nav'));
    const pers = JSON.parse(nav).filter((x) => x.ev === 'pageshow').pop();
    out(`E ${start}: on`, on, '| after nav away+back', back, '| restored from bfcache?', pers?.persisted, '| pagehide live tracks:', JSON.parse(nav).filter((x) => x.ev === 'pagehide').map((x) => x.live));
    // For the AR screen: the "Back" chevron is a plain link to the PDP
    if (start === 'arpage') {
      await s.page.click('.arx-top a[aria-label="Back"]'); await s.page.waitForLoadState('load'); await sleep(1000);
      out('E arpage back-chevron → url', s.page.url(), 'cam on PDP', await camState(s.page));
    }
    await s.close();
  }
}
if (run('denied-repeat')) { // F: denied — how many getUserMedia calls (= prompts on browsers that re-ask) when scrolling in/out 5 times
  for (const cam of ['denied', 'none']) {
    const s = await open({ cameraPermission: cam });
    await s.goto(H);
    for (let i = 0; i < 5; i++) { await toAr(s.page); await sleep(600); await toTop(s.page); await sleep(300); }
    out(`F ${cam}: scroll in/out x5 →`, await camState(s.page));
    await s.close();
  }
}
