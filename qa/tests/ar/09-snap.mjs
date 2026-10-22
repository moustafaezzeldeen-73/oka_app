// Snap scrolling on the PDP: wheel / keyboard / touch-fling, where it stops, whether the AR section traps the scroll,
// and whether landing on it opens the camera. Also: browsers without :has() (rule dropped).
import { open, camState, out, sleep } from './lib.mjs';
const st = (p) => p.evaluate(() => Math.round(document.querySelector('.screen[data-screen="product"]').scrollTop));
const H = '/products/oka-cloud-white-hookah';
// Desktop wheel
for (const device of ['Desktop 1440', 'Desktop 1024']) {
  const s = await open({ device });
  await s.goto(H); await s.page.mouse.move(700, 400);
  const pos = [];
  for (let i = 0; i < 20; i++) { await s.page.mouse.wheel(0, 120); await sleep(350); pos.push(await st(s.page)); }
  out(`${device} wheel 20×120px (350 ms apart): scrollTop`, pos.join(' '), 'max', await s.page.evaluate(() => { const e = document.querySelector('.screen[data-screen="product"]'); return e.scrollHeight - e.clientHeight; }), 'cam', await camState(s.page));
  await s.page.evaluate(() => document.querySelector('.screen[data-screen="product"]').scrollTo({ top: 0, behavior: 'instant' })); await sleep(500);
  const pos2 = [];
  for (let i = 0; i < 6; i++) { await s.page.mouse.wheel(0, 1000); await sleep(700); pos2.push(await st(s.page)); }
  out(`${device} wheel 6×1000px: scrollTop`, pos2.join(' '));
  // keyboard
  await s.page.evaluate(() => document.querySelector('.screen[data-screen="product"]').scrollTo({ top: 0, behavior: 'instant' })); await sleep(500);
  await s.page.click('.pdp-title').catch(() => {});
  const k = {};
  for (const key of ['PageDown', 'Space', 'ArrowDown', 'End']) {
    await s.page.evaluate(() => document.querySelector('.screen[data-screen="product"]').scrollTo({ top: 0, behavior: 'instant' })); await sleep(300);
    const l = []; for (let i = 0; i < (key === 'End' ? 1 : 5); i++) { await s.page.keyboard.press(key); await sleep(600); l.push(await st(s.page)); }
    k[key] = l.join(' ');
  }
  out(`${device} keyboard (focus on title):`, k);
  await s.close();
}
// Touch fling on phones (CDP synthesized scroll gesture)
for (const device of ['iPhone 13', 'Pixel 7', 'Small 320']) {
  const s = await open({ device });
  await s.goto(H);
  const cdp = await s.context.newCDPSession(s.page);
  const vp = s.page.viewportSize();
  const pos = [];
  for (let i = 0; i < 8; i++) {
    await cdp.send('Input.synthesizeScrollGesture', { x: Math.round(vp.width / 2), y: Math.round(vp.height * 0.7), yDistance: -Math.round(vp.height * 0.6), speed: 2500, gestureSourceType: 'touch' });
    await sleep(900); pos.push(await st(s.page));
  }
  const secs = await s.page.evaluate(() => { const sc = document.querySelector('.screen[data-screen="product"]'); return [...sc.querySelectorAll('.snap-pg, .story-hero, .story-grid, .story-box, .story-cross, .story-steps')].map((e) => `${e.className.split(' ')[1] || e.className.split(' ')[0]}:${Math.round(e.offsetTop)}`).join(' '); });
  out(`${device} touch swipes (0.6 screen each): scrollTop`, pos.join(' '), '| sections', secs, '| cam', await camState(s.page));
  // big fling from the top: does it stop at AR and open the camera?
  await s.page.evaluate(() => document.querySelector('.screen[data-screen="product"]').scrollTo({ top: 0, behavior: 'instant' })); await sleep(600);
  await cdp.send('Input.synthesizeScrollGesture', { x: Math.round(vp.width / 2), y: Math.round(vp.height * 0.85), yDistance: -Math.round(vp.height * 0.8), speed: 6000, gestureSourceType: 'touch' });
  await sleep(2500);
  out(`${device} one hard fling from top → scrollTop`, await st(s.page), 'cam', await camState(s.page));
  await s.shot(`snap-fling-${device}`);
  await s.close();
}
// :has() unsupported — simulate by removing rules containing :has from the stylesheet (what an old engine does: drop the whole rule)
{
  const s = await open({});
  await s.goto(H);
  const r = await s.page.evaluate(() => {
    const dropped = [];
    for (const sh of document.styleSheets) { let rules; try { rules = sh.cssRules; } catch (e) { continue; } for (let i = rules.length - 1; i >= 0; i--) { if (rules[i].cssText.includes(':has(')) { dropped.push(rules[i].selectorText?.slice(0, 120)); sh.deleteRule(i); } } }
    const sc = document.querySelector('.screen[data-screen="product"]');
    const align = [...sc.querySelectorAll('.snap-pg, .story-hero, .ar-inline')].map((e) => getComputedStyle(e).scrollSnapAlign);
    return { dropped, align, snapType: getComputedStyle(sc).scrollSnapType };
  });
  out('no-:has() simulation:', r);
  await s.close();
}
