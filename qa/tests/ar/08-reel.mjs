// Video reel: attributes, play/pause as it scrolls in/out, reduced motion, missing file, a11y, and two videos visible at once.
import { open, out, sleep } from './lib.mjs';
const track = () => {
  window.__media = [];
  const P = HTMLMediaElement.prototype; const play = P.play; const pause = P.pause;
  P.play = function () { window.__media.push({ ev: 'play', t: Math.round(performance.now()), src: this.currentSrc.split('/').pop().slice(0, 20), cam: this.hasAttribute('data-ar-cam') }); return play.call(this); };
  P.pause = function () { window.__media.push({ ev: 'pause', t: Math.round(performance.now()), cam: this.hasAttribute('data-ar-cam') }); return pause.call(this); };
};
const reelLog = (p) => p.evaluate(() => window.__media.filter((m) => !m.cam).map((m) => m.ev).join(','));
const scrollToSel = (p, sel) => p.evaluate((sel) => { const s = document.querySelector('.screen[data-screen="product"]'); const a = document.querySelector(sel); s.scrollTo({ top: a.offsetTop - 76, behavior: 'instant' }); }, sel);
for (const h of ['oka-cloud-white-hookah', 'oka-black-tobacco-plate', 'oka-black-tobacco']) {
  for (const opts of [{}, { reducedMotion: 'reduce' }]) {
    const s = await open({ extraInit: track });
    if (opts.reducedMotion) await s.page.emulateMedia({ reducedMotion: 'reduce' });
    await s.goto(`/products/${h}`);
    const attrs = await s.page.evaluate(() => [...document.querySelectorAll('[data-reel-item] video')].map((v) => ({ muted: v.muted, mutedAttr: v.hasAttribute('muted'), autoplayAttr: v.hasAttribute('autoplay'), playsinline: v.hasAttribute('playsinline'), loop: v.loop, controls: v.controls, preload: v.preload, poster: !!v.poster, sources: [...v.querySelectorAll('source')].map((x) => x.src.split('.').slice(-2).join('.').slice(-30)), tracks: v.querySelectorAll('track').length, ariaLabel: v.getAttribute('aria-label'), title: v.title, soundBtn: v.parentElement.querySelector('[data-reel-sound]')?.getAttribute('aria-label'), soundPressed: v.parentElement.querySelector('[data-reel-sound]')?.getAttribute('aria-pressed') })));
    const atLoad = await reelLog(s.page);
    await scrollToSel(s.page, '[data-reel]'); await sleep(1200);
    const inView = await reelLog(s.page);
    await s.page.evaluate(() => document.querySelector('.screen[data-screen="product"]').scrollTo({ top: 99999, behavior: 'instant' })); await sleep(800);
    const away = await reelLog(s.page);
    const net = await s.page.evaluate(() => performance.getEntriesByType('resource').filter((r) => /\.mp4|\.m3u8/.test(r.name)).map((r) => `${r.name.split('/').pop().slice(-28)}:${r.transferSize}`));
    out(`${h}${opts.reducedMotion ? ' reduced-motion' : ''}`, { attrs, atLoad, inView, afterScrollAway: away, mediaRequests: net, errs: s.logs.pageErrors.map((e) => e.message) });
    if (!opts.reducedMotion && h === 'oka-cloud-white-hookah') { await scrollToSel(s.page, '[data-reel]'); await sleep(300); await s.shot('reel-cloud-white'); }
    await s.close();
  }
}
// sound toggle a11y + missing file
{
  const s = await open({ extraInit: track });
  await s.page.route(/\.mp4/, (r) => r.fulfill({ status: 404, body: '' }));
  await s.goto('/products/oka-black-tobacco');
  await scrollToSel(s.page, '[data-reel]'); await sleep(1200);
  await s.page.click('[data-reel-sound]'); await sleep(300);
  out('missing mp4 (404): video error?', await s.page.evaluate(() => { const v = document.querySelector('[data-reel-item] video'); return { error: v.error?.code, networkState: v.networkState, readyState: v.readyState, posterShown: !!v.poster, itemCls: v.parentElement.className, soundAria: v.parentElement.querySelector('[data-reel-sound]').getAttribute('aria-label'), muted: v.muted }; }), 'log', await reelLog(s.page));
  await s.shot('reel-missing-file');
  await s.close();
}
// two videos visible at once (inject a second reel item before the theme script runs → desktop width)
{
  const s = await open({ device: 'Desktop 1440', extraInit: () => {
    const P = HTMLMediaElement.prototype; window.__playing = new Set(); const play = P.play; const pause = P.pause;
    P.play = function () { if (!this.hasAttribute('data-ar-cam')) window.__playing.add(this); return play.call(this).catch(() => {}); };
    P.pause = function () { window.__playing.delete(this); return pause.call(this); };
    document.addEventListener('DOMContentLoaded', () => { const it = document.querySelector('[data-reel-item]'); if (it) { it.after(it.cloneNode(true)); it.after(it.cloneNode(true)); } });
  } });
  await s.goto('/products/oka-black-tobacco');
  await scrollToSel(s.page, '[data-reel]'); await sleep(1500);
  out('desktop, 3 reel items: simultaneously "playing" (play() called, not paused):', await s.page.evaluate(() => window.__playing.size), 'items visible ratio:', await s.page.evaluate(() => [...document.querySelectorAll('[data-reel-item]')].map((e) => { const r = e.getBoundingClientRect(); return Math.round(r.width) + 'px@' + Math.round(r.left); })));
  await s.shot('reel-desktop-3-items');
  await s.close();
}
