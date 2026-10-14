// F: store.get() only falls back when the key is missing; a stored JSON value of the wrong shape
// ("null", a number, an array from an older version) is returned as-is and crashes callers.
const { makePage, tick } = require('./harness');
function trial(key, value, where = 'local') {
  const errors = [];
  const { w, doc } = makePage({
    body: `<div class="gcard"><button class="heart-btn" data-heart="h"><svg><path/></svg></button></div>`,
    fetchImpl: (u) => Promise.resolve({ status: 200, body: u.startsWith('/cart.js') ? { items: [], item_count: 0 } : { cats: [], products: [] } }),
    setup(win) { (where === 'local' ? win.localStorage : win.sessionStorage).setItem(key, value); win.addEventListener('error', (e) => errors.push(e.message)); },
  });
  try { doc.querySelector('[data-heart]').dispatchEvent(new w.MouseEvent('click', { bubbles: true })); } catch (e) { errors.push(e.message); }
  let rec; try { rec = w.Oka.recommend({ products: [{ id: 'x', cat: 'c', price: 10 }] }); } catch (e) { errors.push('recommend(): ' + e.message); }
  try { w.Oka.viewed.add('h'); } catch (e) { errors.push('viewed.add(): ' + e.message); }
  return errors;
}
(async () => {
  console.log("localStorage oka.wishlist = 'null' →", trial('oka.wishlist', 'null'));
  console.log("sessionStorage oka.viewed = '{}' →", trial('oka.viewed', '{}', 'session'));
  console.log('Control (valid values) →', trial('oka.wishlist', '{}'));
})();
