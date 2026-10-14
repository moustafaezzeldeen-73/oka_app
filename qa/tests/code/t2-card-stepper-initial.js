// F: a collection/home card for a product that is ALREADY in the cart still shows "Add" after a fresh page load,
// because getCart() on boot never dispatches oka:cart, so syncCardSteppers() never re-runs.
const { makePage, tick } = require('./harness');
const cart = { token: 't', item_count: 2, total_price: 20000, original_total_price: 20000, items: [{ key: 'k1', variant_id: 111, quantity: 2, handle: 'h' }] };
const { w, doc } = makePage({
  body: `<div class="screen" data-screen="collection-like"><div class="gcard"><button class="gcard-add" data-add="111">Add</button></div></div>`,
  fetchImpl: (u) => Promise.resolve({ status: 200, body: u.startsWith('/cart.js') ? cart : { cats: [], products: [] } }),
});
(async () => {
  await tick(50);
  const btn = doc.querySelector('.gcard-add');
  console.log('cart loaded, qty of variant 111 =', w.Oka.cartQtyOf(111));
  console.log('Add button hidden?', btn.hidden, '| stepper present?', Boolean(doc.querySelector('.card-qty')));
  console.log(!btn.hidden ? 'BUG REPRODUCED: product is in the cart (qty 2) but its card still shows "Add" instead of − 2 +' : 'OK');
  // Control: any later cart event fixes it
  w.Oka.setCart(cart); await tick();
  console.log('after an oka:cart event → Add hidden?', btn.hidden, 'stepper text:', doc.querySelector('.card-qty-n')?.textContent);
})();
