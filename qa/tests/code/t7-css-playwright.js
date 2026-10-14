// CSS checks in real Chromium with the theme's oka.css.
//  (a) portrait lock fires in PORTRAIT when the on-screen keyboard shrinks the viewport (WebView / Firefox / Chrome<108),
//  (b) the "Added to cart" bar and toasts are hidden behind the full-screen AR page (z-index 46/45 < 50).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.resolve(__dirname, '../../../theme/assets/oka.css'), 'utf8');
const page = (body, extraHead = '') => `<!doctype html><html lang="ar" dir="rtl" class="portrait-lock" style="--rot:-90deg"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style>${extraHead}</head><body class="t-product t-product-ar">${body}</body></html>`;
(async () => {
  const browser = await chromium.launch();
  // (a) a 360×640 phone held upright; keyboard open → visible viewport ~360×300 (layout-viewport resize, as Android WebView does)
  for (const [w, h, label] of [[360, 640, 'portrait, keyboard closed'], [360, 300, 'portrait, keyboard open (viewport shrunk)'], [800, 360, 'real landscape']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }] });
    await p.setContent(page(`<div class="app" id="app"><main class="content"><div class="screen"><input class="search-input" placeholder="search"></div></main></div>`));
    const r = await p.evaluate(() => ({
      mq: matchMedia('(orientation: landscape) and (max-height: 540px) and (hover: none) and (pointer: coarse)').matches,
      transform: getComputedStyle(document.getElementById('app')).transform,
    }));
    console.log(`(a) ${label} ${w}x${h}: lock media query matches=${r.mq}; .app transform=${r.transform}`);
    await ctx.close();
  }
  // (b) AR screen + the "added" bar oka.js appends to #app after Add to cart
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.setContent(page(`<div class="app" id="app"><main class="content"><div class="shopify-section"><div class="screen ar-screen" data-screen="product-ar"><div class="arx-panel"><button class="arx-add">Add</button></div></div></div></main>
     <div class="added-bar" id="bar"><span class="added-txt">Added to cart</span></div><div class="toast" id="toast">Added</div></div>`));
  const hit = await p.evaluate(() => {
    const at = (el) => { const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return el.contains(top) ? 'visible' : `covered by ${top.className}`; };
    return { bar: at(document.getElementById('bar')), toast: at(document.getElementById('toast')) };
  });
  console.log('(b) on the AR screen: added-bar is', hit.bar, '| toast is', hit.toast);
  await p.screenshot({ path: path.join(__dirname, 'out', 't7-ar-added-bar.png') });
  await browser.close();
})();
