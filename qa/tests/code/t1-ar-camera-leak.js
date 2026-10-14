// F: the product page's AR section can leave a camera stream running (scroll away/back while the
// permission prompt / getUserMedia is still pending → two getUserMedia calls; the first stream is orphaned).
const { makePage, tick } = require('./harness');
const productHtml = `
<div class="screen" data-screen="product" data-handle="h" data-variant="1" data-price="100" data-stock="5" data-url="/products/h">
  <button data-share></button><button data-wish><svg></svg></button>
  <div class="ship-box"><i data-ship-pct></i><div data-ship-txt></div></div>
  <span data-qty-val></span><span data-fee></span><span data-eta></span>
  <section data-ar-view data-glb="/m.glb" data-title="t">
    <video data-ar-cam hidden></video><div data-ar-reticle hidden></div><div data-ar-stage></div>
    <div data-ar-loading></div><div data-ar-status><span data-ar-status-text></span></div><button data-ar-live></button>
  </section>
</div>`;
let ioCb = null;
const streams = [];
const pending = [];
const { w } = makePage({
  body: productHtml,
  fetchImpl: (u) => Promise.resolve({ status: 200, body: u.includes('cart.js') ? { items: [], item_count: 0, total_price: 0, original_total_price: 0 } : { cats: [], products: [] } }),
  setup(win) {
    win.IntersectionObserver = class { constructor(cb) { ioCb = cb; } observe() {} disconnect() {} };
    win.customElements.define('model-viewer', class extends win.HTMLElement {});
    win.HTMLMediaElement.prototype.play = () => Promise.resolve();
    Object.defineProperty(win.navigator, 'mediaDevices', { value: { getUserMedia: () => new Promise((res) => {
      const s = { id: streams.length + 1, live: true, getTracks() { return [{ stop: () => { s.live = false; } }]; } };
      streams.push(s); pending.push(() => res(s));
    }) } });
  },
});
(async () => {
  await tick(10);
  const fire = (ratio) => ioCb([{ intersectionRatio: ratio, isIntersecting: ratio > 0 }]);
  fire(0.9);  // section fills the screen → start(): getUserMedia #1 (prompt showing)
  await tick();
  fire(0.1);  // shopper scrolls on before answering → stop()
  await tick();
  fire(0.9);  // …and back → start(): getUserMedia #2 while #1 is still pending
  await tick();
  pending.forEach((resolve) => resolve()); // shopper taps Allow; both calls resolve
  await tick(20);
  console.log('getUserMedia calls:', streams.length);
  fire(0.1);  // scroll away → stop()
  await tick();
  streams.forEach((s) => console.log(`stream #${s.id} still live after stop(): ${s.live}`));
  console.log(streams.some((s) => s.live) ? 'BUG REPRODUCED: a camera stream is never stopped (camera light stays on)' : 'no leak');
})();
