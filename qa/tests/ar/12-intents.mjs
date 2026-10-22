// What model-viewer hands to the OS when "Real size on your table (AR)" is tapped:
// Android → Scene Viewer intent:// URL; iOS → <a rel="ar" href=usdz> (Quick Look), forced via relList.supports('ar').
import { open, MODEL_PRODUCTS, camState, out, sleep } from './lib.mjs';
const hook = () => {
  window.__ar = [];
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { window.__ar.push({ rel: this.rel, href: this.href, img: !!this.querySelector('img') }); };
  if (/iPhone/.test(navigator.userAgent)) {
    const sup = DOMTokenList.prototype.supports;
    DOMTokenList.prototype.supports = function (t) { return t === 'ar' ? true : sup.call(this, t); };
  }
};
for (const device of ['Pixel 7', 'iPhone 13']) {
  for (const h of MODEL_PRODUCTS) {
    const s = await open({ device, extraInit: hook });
    const navs = []; s.page.on('request', (r) => { if (r.isNavigationRequest()) navs.push(r.url()); });
    await s.goto(`/products/${h}?view=ar`); await sleep(2500);
    const before = await camState(s.page);
    const can = await s.page.evaluate(() => document.querySelector('model-viewer')?.canActivateAR);
    await s.page.click('[data-ar-live]'); await sleep(1500);
    const ar = await s.page.evaluate(() => window.__ar);
    out(`${device} ${h}: canActivateAR=${can}`, { anchors: ar.map((a) => ({ rel: a.rel, href: decodeURIComponent(a.href).replace(/https?:\/\/localhost:9430/g, '<host>').slice(0, 420) })), navs: navs.slice(1).map((u) => u.slice(0, 200)), camBefore: before.live, camAfter: (await camState(s.page)).live });
    await s.close();
  }
}
