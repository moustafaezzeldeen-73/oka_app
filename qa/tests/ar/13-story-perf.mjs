// Story sections (EN/AR), description fallback, overflow at 320 px; bytes and long tasks; Back restores scroll onto the AR section.
import { open, camState, out, sleep } from './lib.mjs';
const T = process.argv[2]; const run = (n) => !T || T === n;
if (run('story')) {
  for (const h of ['oka-cloud-white-hookah', 'oka-cobra', 'oka-cobra-oka-base', 'oka-black-tobacco', 'oka-black-tobacco-plate', 'oka-cobra-led-rechargeable-base', 'trio-party', 'the-hexa-party', 'tongs', 'tongs-foil-combo', 'standard-15-g-bowl-glazed', 'oka-stem']) {
    for (const locale of ['ar', 'en']) {
      const s = await open({ locale, device: 'Small 320' });
      await s.goto(`/products/${h}`);
      const r = await s.page.evaluate(() => {
        const vis = (e) => e && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0;
        const story = document.querySelector('.story');
        const desc = document.querySelector('.desc');
        const shown = (root) => root ? [...root.querySelectorAll('.l-en,.l-ar')].filter(vis).map((e) => e.className).reduce((a, c) => (a[c] = (a[c] || 0) + 1, a), {}) : null;
        const descTxt = desc ? [...desc.querySelectorAll('.l-en,.l-ar')].filter(vis).map((e) => e.textContent.trim().slice(0, 50)).join('|') : null;
        const arabic = (t) => /[؀-ۿ]/.test(t || '');
        const sc = document.querySelector('.screen[data-screen="product"]');
        const over = [...sc.querySelectorAll('.story *, .desc, .pdp-title, .arx-panel *')].filter((e) => vis(e) && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'auto').map((e) => e.className || e.tagName).slice(0, 5);
        return { lang: document.documentElement.lang, dir: document.documentElement.dir, story: story?.className || null, storyLangSpans: shown(story), desc: descTxt, descIsArabic: desc ? arabic(descTxt) : null, horizontalOverflow: sc.scrollWidth > sc.clientWidth, overflowing: over };
      });
      out(`${h} [${locale}]`, r);
      if (['oka-cloud-white-hookah', 'trio-party'].includes(h)) { await s.page.evaluate(() => { const st = document.querySelector('.story, .desc'); st && st.scrollIntoView(); }); await sleep(300); await s.shot(`story-${h}-${locale}-320`); }
      await s.close();
    }
  }
}
if (run('long')) { // long text: stretch a story headline and description 6x (Arabic and English) at 320 px
  for (const locale of ['ar', 'en']) {
    const s = await open({ locale, device: 'Small 320' });
    await s.goto('/products/oka-cobra');
    const r = await s.page.evaluate(() => {
      document.querySelectorAll('.story-h span, .story-lead span, .stat b span, .feat b span').forEach((e) => { e.textContent = (e.textContent + ' ').repeat(6) + 'Supercalifragilisticexpialidocious_ultra_long_unbroken_token_أوكاأوكاأوكاأوكاأوكاأوكاأوكا'; });
      const sc = document.querySelector('.screen[data-screen="product"]');
      const over = [...document.querySelectorAll('.story *')].filter((e) => e.getClientRects().length && e.getBoundingClientRect().right > innerWidth + 1 || e.getBoundingClientRect().left < -1).map((e) => e.className || e.tagName).slice(0, 6);
      return { pageHScroll: sc.scrollWidth > sc.clientWidth, offscreen: over, heroH: Math.round(document.querySelector('.story-hero').getBoundingClientRect().height), vh: innerHeight };
    });
    out(`long text [${locale}]`, r);
    await s.page.evaluate(() => document.querySelector('.story-hero').scrollIntoView()); await sleep(300); await s.shot(`story-long-${locale}-320`);
    await s.close();
  }
}
if (run('perf')) {
  for (const [label, path, scroll] of [['PDP load, no scroll', '/products/oka-cloud-white-hookah', false], ['PDP + scroll to AR', '/products/oka-cloud-white-hookah', true], ['AR screen', '/products/oka-cloud-white-hookah?view=ar', false], ['PDP no model', '/products/trio-party', false]]) {
    const s = await open({ extraInit: () => { window.__lt = []; try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: true }); } catch (e) {} } });
    const bytes = { total: 0, mv: 0, glb: 0, video: 0, n: 0 };
    s.page.on('requestfinished', async (r) => { const z = (await r.sizes().catch(() => ({ responseBodySize: 0 }))).responseBodySize; bytes.total += z; bytes.n++; if (/model-viewer/.test(r.url())) bytes.mv += z; if (/\.glb/.test(r.url())) bytes.glb += z; if (/\.mp4|m3u8/.test(r.url())) bytes.video += z; });
    await s.goto(path);
    if (scroll) await s.page.evaluate(() => { const sc = document.querySelector('.screen[data-screen="product"]'); sc.scrollTo({ top: document.querySelector('[data-ar-view]').offsetTop - 76, behavior: 'instant' }); });
    await sleep(4000);
    out(label, { ...bytes, longTasksMs: await s.page.evaluate(() => window.__lt), cam: (await camState(s.page)).live });
    await s.close();
  }
}
if (run('back')) { // shopper scrolled to the AR section, opened another product, pressed Back
  const s = await open({ gum: 'real' });
  await s.goto('/products/oka-cobra');
  await s.page.evaluate(() => { const sc = document.querySelector('.screen[data-screen="product"]'); sc.scrollTo({ top: document.querySelector('[data-ar-view]').offsetTop - 76, behavior: 'instant' }); });
  await sleep(1500);
  await s.page.evaluate(() => { const sc = document.querySelector('.screen[data-screen="product"]'); sc.scrollTo({ top: sc.scrollHeight, behavior: 'instant' }); }); await sleep(1000);
  out('scrolled to bottom (related):', await camState(s.page));
  await s.page.evaluate(() => { const sc = document.querySelector('.screen[data-screen="product"]'); sc.scrollTo({ top: document.querySelector('[data-ar-view]').offsetTop - 76, behavior: 'instant' }); }); await sleep(1200);
  await s.page.goto('/collections/all', { waitUntil: 'load' }); await sleep(600);
  await s.page.goBack({ waitUntil: 'load' }); await sleep(2500);
  out('after Back to the PDP (fresh load):', { scrollTop: await s.page.evaluate(() => document.querySelector('.screen[data-screen="product"]').scrollTop), cam: await camState(s.page) });
  // fresh session, direct load of the PDP: no camera
  await s.close();
}
