// Minimal jsdom harness: loads the theme's real assets (oka.js, oka-screens.js) into a fake page.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ASSETS = path.resolve(__dirname, '../../../theme/assets');
const okaJs = fs.readFileSync(path.join(ASSETS, 'oka.js'), 'utf8');
const screensJs = fs.readFileSync(path.join(ASSETS, 'oka-screens.js'), 'utf8');

const CFG = {
  defaultLang: 'en', ageGate: false, proxy: '', orders: null, service: '', serviceToken: null, jt: null, whatsapp: '',
  minOrder: 0, tier: 300, zones: { metro: { under: 60, over: 36 }, delta: { under: 70, over: 46 }, far: { under: 80, over: 56 } },
  pointsPerEgp: 10, earnPointsPerEgp: 1, subscriptionDiscount: 5, shopDomain: 'x', catalogueUrl: '/collections/all?view=oka-data',
  routes: { root: '/', cart: '/cart', checkout: '/checkout', search: '/search', collections: '/collections', login: '/account/login',
    logout: '/account/logout', account: '/pages/account', orders: '/pages/orders', addresses: '/pages/addresses',
    addAddress: '/pages/addresses?view=oka-add-address', checkoutReview: '/pages/checkout-review', loyalty: '/pages/loyalty',
    subscriptions: '/pages/subscriptions', subscribe: '/pages/subscriptions?view=oka-subscribe', wishlist: '/pages/wishlist', support: '/pages/support' },
  customer: null,
};

/** body: inner HTML of #app; fetchImpl(url, opts) => Promise<{status, body}>; setup(window) runs before the scripts. */
function makePage({ body = '', cfg = {}, fetchImpl, setup, url = 'https://shop.test/' } = {}) {
  const dom = new JSDOM(`<!doctype html><html lang="en" dir="ltr"><head></head><body><div class="app" id="app"><main class="content">${body}</main></div></body></html>`,
    { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.OKA = { ...CFG, ...cfg };
  w.fetch = (u, o = {}) => (fetchImpl ? fetchImpl(String(u), o) : Promise.resolve({ status: 200, body: {} })).then((r) => {
    const txt = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
    return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => txt, json: async () => JSON.parse(txt) };
  });
  w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  if (setup) setup(w);
  w.eval(okaJs);
  w.eval(screensJs);
  return { dom, w, doc: w.document };
}
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
module.exports = { makePage, tick };
