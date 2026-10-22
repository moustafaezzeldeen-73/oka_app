// The dedicated AR screen (/products/<h>?view=ar): per product × camera outcome, model-viewer attributes,
// failure paths (CDN down, GLB 404, no WebGL), add to cart + feedback visibility, "Real size" button.
import { open, MODEL_PRODUCTS, NO_MODEL, camState, arInfo, out, sleep } from './lib.mjs';
const T = process.argv[2];
const run = (n) => !T || T === n;
const covered = (page, sel) => page.evaluate((sel) => {
  const el = [...document.querySelectorAll(sel)].pop();
  if (!el) return { present: false };
  const r = el.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { present: true, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], z: getComputedStyle(el).zIndex, visibleOnTop: !!top && (el === top || el.contains(top)), coveredBy: top && !(el === top || el.contains(top)) ? (top.className || top.tagName) : null, text: el.textContent.trim().slice(0, 60) };
}, sel);

if (run('matrix')) {
  for (const h of [...MODEL_PRODUCTS, ...NO_MODEL]) {
    for (const [perm, gum] of (h === 'oka-cobra' ? [['granted', 'real'], ['denied', 'real'], ['none', 'real'], ['granted', 'NotReadableError'], ['granted', 'OverconstrainedError'], ['granted', 'undefined'], ['granted', 'pending']] : [['granted', 'real']])) {
      const s = await open({ cameraPermission: perm, gum });
      const reqs = [];
      s.page.on('requestfinished', async (r) => { if (/model-viewer|\.glb|\.usdz/.test(r.url())) { const sz = (await r.sizes().catch(() => ({}))).responseBodySize; reqs.push(`${r.url().split('/').pop().slice(0, 40)}:${sz}`); } });
      const resp = await s.goto(`/products/${h}?view=ar`);
      const t1 = await arInfo(s.page);
      await sleep(3000);
      const t2 = await arInfo(s.page);
      await s.shot(`arpage-${h}-${perm}-${gum}`);
      out(`${h} ?view=ar perm=${perm} gum=${gum} status=${resp.status()}`, { atLoad: { status: t1.status, cam: t1.camHidden }, after3s: { status: t2.status, state: t2.state, cls: t2.cls, loading: t2.loading, photoHidden: t2.photoHidden, mvLoaded: t2.mvLoaded, canAR: t2.canActivateAR }, cam: await camState(s.page), reqs, errs: s.logs.pageErrors.map((e) => e.message), httpErr: s.logs.httpErrors.map((e) => `${e.status} ${e.url.split('/').pop()}`) });
      await s.close();
    }
  }
}
if (run('failures')) {
  const cases = {
    'cdn-hang-first': async (s) => s.page.route(/model-viewer/, () => {}),
    'cdn-abort': async (s) => s.page.route(/model-viewer/, (r) => r.abort('failed')),
    'glb-404': async (s) => s.page.route(/\.glb/, (r) => r.fulfill({ status: 404, body: 'nope' })),
    'glb-corrupt': async (s) => s.page.route(/\.glb/, (r) => r.fulfill({ status: 200, contentType: 'model/gltf-binary', body: 'not a glb' })),
    'no-webgl': async (s) => s.context.addInitScript(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/i.test(t) ? null : g.call(this, t, ...a); }; if (window.OffscreenCanvas) { const og = OffscreenCanvas.prototype.getContext; OffscreenCanvas.prototype.getContext = function (t, ...a) { return /webgl/i.test(t) ? null : og.call(this, t, ...a); }; } }),
  };
  for (const [name, setup] of Object.entries(cases)) {
    for (const where of ['arpage', 'pdp']) {
      for (const perm of ['granted', 'denied']) {
        const s = await open({ cameraPermission: perm });
        await setup(s);
        let loadErr = null; const tl = Date.now();
        await s.goto(where === 'arpage' ? '/products/oka-cobra?view=ar' : '/products/oka-cobra', { timeout: 12000 }).catch((e) => { loadErr = e.message.split('\n')[0]; });
        const loadMs = Date.now() - tl;
        if (where === 'pdp') await s.page.evaluate(() => { const sc = document.querySelector('.screen[data-screen="product"]'); const a = document.querySelector('[data-ar-view]'); sc.scrollTo({ top: a.offsetTop - 76, behavior: 'instant' }); });
        await sleep(5000);
        const i = await arInfo(s.page);
        await s.shot(`fail-${name}-${where}-${perm}`, { timeout: 5000 }).catch(() => {});
        const readyState = await s.page.evaluate(() => document.readyState);
        out(`${name} ${where} perm=${perm}`, { loadMs, loadErr, readyState, status: i.status, state: i.state, cls: i.cls, loading: i.loading, photoHidden: i.photoHidden, mv: !!i.mv, mvLoaded: i.mvLoaded, cam: await camState(s.page), errs: s.logs.pageErrors.map((e) => e.message.slice(0, 120)), console: s.logs.console.map((e) => e.text.slice(0, 120)).slice(0, 3) });
        await s.close();
      }
    }
  }
}
if (run('add')) { // add to cart on the AR screen: feedback visible? double-tap?
  for (const locale of ['en', 'ar']) {
    const s = await open({ locale });
    await s.goto('/products/oka-cobra?view=ar'); await sleep(1500);
    let addCalls = 0; s.page.on('request', (r) => { if (r.url().includes('/cart/add')) addCalls++; });
    await s.page.click('.arx-add');
    await sleep(700);
    const bar = await covered(s.page, '.added-bar'); const toast = await covered(s.page, '.toast');
    await s.shot(`arpage-add-feedback-${locale}`);
    const cart = await s.page.evaluate(() => fetch('/cart.js').then((r) => r.json()).then((c) => c.items.map((i) => `${i.handle}x${i.quantity}`)));
    out(`add ${locale}: add calls=${addCalls} cart=${cart}`, { addedBar: bar, toast, rec: await covered(s.page, '.rec-sheet') });
    // double tap
    await s.page.evaluate(() => { const b = document.querySelector('.arx-add'); b.click(); b.click(); }); await sleep(1500);
    out(`double-tap ${locale}:`, await s.page.evaluate(() => fetch('/cart.js').then((r) => r.json()).then((c) => c.items.map((i) => `${i.handle}x${i.quantity}`))));
    await s.close();
  }
  // sold-out product on AR screen + error alert visibility
  const s = await open({});
  await s.goto('/products/1-pcs-of-foil?view=ar'); await sleep(800);
  out('sold-out AR page: add button present?', await s.page.$('.arx-add') !== null, await arInfo(s.page));
  await s.goto('/products/oka-cobra?view=ar'); await sleep(800);
  await s.page.route(/\/cart\/add/, (r) => r.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ status: 422, message: 'Cart Error', description: 'You can only add 0 OKA Cobra to the cart.' }) }));
  await s.page.click('.arx-add'); await sleep(800);
  out('add error alert on AR screen:', await covered(s.page, '.alert-card, .alert-scrim, .oka-alert, [role="alertdialog"]'));
  await s.shot('arpage-add-error');
  await s.close();
}
if (run('live')) { // "Real size on your table (AR)" button in headless Chromium (canActivateAR false)
  for (const device of ['Pixel 7', 'iPhone 13', 'Desktop 1440']) {
    const s = await open({ device });
    await s.goto('/products/oka-cobra?view=ar'); await sleep(2500);
    const before = await camState(s.page);
    await s.page.click('[data-ar-live]'); await sleep(600);
    out(`live-AR ${device}: canActivateAR=${(await arInfo(s.page)).canActivateAR}`, { alert: await covered(s.page, '.alert-scrim'), alertText: await s.page.evaluate(() => document.querySelector('.alert-scrim')?.textContent.trim().slice(0, 140)), camBefore: before, camAfter: await camState(s.page) });
    await s.shot(`arpage-live-btn-${device}`);
    await s.close();
  }
}
if (run('a11y')) { // what's exposed to assistive tech on the AR screen
  const s = await open({});
  await s.goto('/products/oka-cobra?view=ar'); await sleep(2500);
  const snap = await s.page.accessibility.snapshot({ interestingOnly: true }).catch(() => null);
  out('a11y tree (AR screen):', JSON.stringify(snap).slice(0, 1500));
  out('focus order:', await s.page.evaluate(async () => { const l = []; for (let i = 0; i < 8; i++) { l.push(document.activeElement?.className || document.activeElement?.tagName); } return [...document.querySelectorAll('a,button,model-viewer,[tabindex]')].filter((e) => !e.closest('[inert]') && e.offsetParent !== null).map((e) => e.tagName + '.' + (e.getAttribute('aria-label') || e.className).slice(0, 30)); }));
  await s.close();
}
