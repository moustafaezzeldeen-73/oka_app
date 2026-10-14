// F: cart page −/+ is not serialised. Two quick "+" taps on a line with qty 1 both send quantity 2
// (the row's data-qty is only refreshed when the first response re-renders), so one tap is lost;
// and out-of-order responses leave the screen showing a stale cart.
const { makePage, tick } = require('./harness');
let server = { qty: 1 };
const calls = [];
const cartOf = () => ({ token: 't', item_count: server.qty, total_price: server.qty * 10000, original_total_price: server.qty * 10000, discount_codes: [],
  items: server.qty ? [{ key: 'k1', variant_id: 111, quantity: server.qty, handle: 'h', product_title: 'P', url: '/products/h', original_price: 10000, original_line_price: server.qty * 10000, product_has_only_default_variant: true }] : [] });
const delays = [];
const { w, doc } = makePage({
  body: `<div class="screen" data-screen="cart"><div data-cart-root></div></div><script type="application/json" data-cart-json>${JSON.stringify(cartOf())}</script>`,
  fetchImpl: (u, o) => {
    if (u === '/cart/change.js') {
      const body = JSON.parse(o.body); calls.push(body.quantity);
      const d = delays.shift() ?? 30;
      return new Promise((r) => setTimeout(() => { server.qty = body.quantity; r({ status: 200, body: cartOf() }); }, d));
    }
    if (u.startsWith('/cart.js')) return Promise.resolve({ status: 200, body: cartOf() });
    return Promise.resolve({ status: 200, body: { cats: [], products: [] } });
  },
});
const plus = () => doc.querySelector('.line [data-step="1"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const minus = () => doc.querySelector('.line [data-step="-1"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
(async () => {
  await tick(20);
  console.log('Scenario A: qty 1, tap + twice quickly (shopper wants 3)');
  plus(); plus();
  await tick(120);
  console.log('  /cart/change.js quantities sent:', JSON.stringify(calls), '→ server qty', server.qty, '| shown', doc.querySelector('.step-qty')?.textContent);
  console.log(server.qty !== 3 ? '  BUG REPRODUCED: one tap lost' : '  OK');

  console.log('Scenario B: qty 2, tap + then − quickly; the + response is slower (arrives last)');
  calls.length = 0; server.qty = 2; w.Oka.setCart(cartOf()); await tick();
  delays.push(80, 10);
  plus(); minus();
  await tick(200);
  console.log('  sent:', JSON.stringify(calls), '→ server ends at', server.qty, '(the last request the server processed), screen shows', doc.querySelector('.step-qty')?.textContent);
  console.log('  Two overlapping /cart/change.js calls with no ordering — final state depends on network timing.');
})();
