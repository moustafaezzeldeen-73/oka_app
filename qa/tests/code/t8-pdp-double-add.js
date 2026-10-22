// F: the product page's "Add to Cart" has no in-flight guard: a double tap (or an impatient second tap on a
// slow connection) sends two /cart/add.js calls with the chosen quantity.
const { makePage, tick } = require('./harness');
const adds = [];
const { w, doc } = makePage({
  body: `<div class="screen" data-screen="product" data-handle="h" data-variant="111" data-price="100" data-stock="99" data-url="/products/h">
    <button data-share></button><button data-wish><svg></svg></button><i data-ship-pct></i><div data-ship-txt></div>
    <button data-qty="1"></button><span data-qty-val></span><span data-fee></span><span data-eta></span></div>
    <div class="buy-bar"><button data-buy><span data-buy-price></span></button></div>`,
  fetchImpl: (u, o) => {
    if (u === '/cart/add.js') { adds.push(JSON.parse(o.body).items[0].quantity); return new Promise((r) => setTimeout(() => r({ status: 200, body: {} }), 300)); }
    return Promise.resolve({ status: 200, body: u.startsWith('/cart.js') ? { items: [], item_count: 0, total_price: 0, original_total_price: 0 } : { cats: [], products: [] } });
  },
});
(async () => {
  await tick(20);
  doc.querySelector('[data-qty="1"]').click(); // qty 2
  doc.querySelector('[data-buy]').click();
  await tick(100);                              // second tap while the first is in flight
  doc.querySelector('[data-buy]').click();
  await tick(800);
  console.log('/cart/add.js calls:', adds.length, 'quantities:', JSON.stringify(adds), '→ cart gets', adds.reduce((a, b) => a + b, 0), 'units for a shopper who chose 2');
})();
