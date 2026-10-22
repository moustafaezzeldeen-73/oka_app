// F: the "Edit order" sheet rebuilds its whole innerHTML on every keystroke in a delivery field.
// The focused <input> is destroyed and a new one focused with the caret forced to the end:
// editing the middle of a name/street jumps the caret, and on Android (Gboard composition) /
// Arabic IMEs the replaced element breaks composition (keyboard flicker, lost/duplicated letters).
const { makePage, tick } = require('./harness');
const view = { orderNumber: '#1001', canCancel: true, canEdit: true, cancelled: false, total: 236, itemsTotal: 200, shipping: 36, discount: 0,
  phone: '01012345678', address: { name: 'Ahmed Ali', provinceCode: 'C', city: 'Nasr City', address1: '14 Nasr St', address2: '' },
  items: [{ variantId: 111, quantity: 1, title: 'Bowl', unitPrice: 200, options: [] }] };
const det = `<div data-order-detail="#1001" data-fulfilled="false" data-cancelled="false" data-phone="01012345678" data-province="C" data-lines='[{"variantId":111,"quantity":1}]'>
  <div class="cancelled-banner" data-cancelled-banner hidden></div><div data-state-label></div><div data-updates></div><div data-live-extra></div>
  <div class="items"><div class="item-row"><div class="item-price">x</div></div></div>
  <div class="order-actions"><button data-edit-order>Edit</button><button data-cancel-order>Cancel</button></div></div>`;
const { w, doc } = makePage({
  body: `<div class="screen" data-screen="orders" data-standalone>${det}</div>`,
  cfg: { orders: { url: 'https://orders.test/mcp', key: 'K', ratings: false }, customer: { id: 1, name: 'A', phone: '01012345678', addresses: [] } },
  fetchImpl: (u) => Promise.resolve(u.startsWith('https://orders.test')
    ? { status: 200, body: { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: JSON.stringify(view) }] } } }
    : { status: 200, body: u.startsWith('/cart.js') ? { items: [], item_count: 0 } : { cats: [], products: [] } }),
});
(async () => {
  await tick(10);
  doc.querySelector('[data-edit-order]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await tick(50);
  let input = doc.querySelector('.edit-order [data-f="name"]');
  console.log('sheet open:', Boolean(input), 'value:', input.value);
  input.focus();
  // Shopper puts the caret after "Ahmed" (position 5) and types "o" → "Ahmedo Ali"
  input.setSelectionRange(5, 5);
  input.value = 'Ahmedo Ali'; input.setSelectionRange(6, 6);
  const before = input;
  input.dispatchEvent(new w.Event('input', { bubbles: true }));
  const after = doc.querySelector('.edit-order [data-f="name"]');
  console.log('same <input> element after one keystroke?', before === after, '| focused element is the new input?', doc.activeElement === after);
  console.log('caret expected at 6, actual at', after.selectionStart, '(value length', after.value.length + ')');
  if (before !== after && after.selectionStart !== 6) console.log('BUG REPRODUCED: input replaced on each keystroke; caret jumps to the end');
})();
