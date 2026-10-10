// OKA — keep the buyer's orders in their browser after checkout, the way the
// cart is kept, so the website's Orders page shows them without signing in.
//
// Install: Shopify admin → Settings → Customer events → Add custom pixel →
// name it "OKA orders in browser" → paste this whole file → Save → Connect.
//
// The checkout runs on www.okaegypt.com, so this writes to the same browser
// storage the theme reads (theme/assets/oka-screens.js → guestLastOrder):
//   oka.lastOrder   { name, phone }      the phone the J&T lookup uses
//   oka.guestOrders [ { id, at, phone, total, items, city, street } ]  newest first, 10 kept
analytics.subscribe('checkout_completed', async (event) => {
  const c = (event && event.data && event.data.checkout) || {};
  const ship = c.shippingAddress || {};
  const phone = c.phone || ship.phone || (c.billingAddress && c.billingAddress.phone) || '';
  const order = {
    id: (c.order && c.order.id) || c.token || String(Date.now()),
    at: event.timestamp || new Date().toISOString(),
    phone: phone,
    total: c.totalPrice ? Number(c.totalPrice.amount) : null,
    items: (c.lineItems || []).map((li) => ({
      title: li.title,
      variant: li.variant && li.variant.title && li.variant.title !== 'Default Title' ? li.variant.title : '',
      quantity: li.quantity,
      image: li.variant && li.variant.image ? li.variant.image.src : null,
    })),
    city: ship.city || '',
    street: [ship.address1, ship.address2].filter(Boolean).join(', '),
  };
  let list = [];
  try { list = JSON.parse((await browser.localStorage.getItem('oka.guestOrders')) || '[]') || []; } catch (e) { list = []; }
  list = [order].concat(list.filter((o) => o.id !== order.id)).slice(0, 10);
  await browser.localStorage.setItem('oka.guestOrders', JSON.stringify(list));
  if (phone) await browser.localStorage.setItem('oka.lastOrder', JSON.stringify({ name: '', phone: phone }));
});
