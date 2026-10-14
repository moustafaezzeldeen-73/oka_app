// OKA — keep the guest's last order in their browser after checkout, the way the cart is kept,
// so the website's Orders page can show it and let them change or cancel it without signing in.
//
// Install: Shopify admin → Settings → Customer events → Add custom pixel →
// name it "OKA last order" → paste this whole file → Save → Connect.
//
// The checkout runs on www.okaegypt.com, so this writes to the same browser storage the theme
// reads. It saves to "oka.lastCheckout":
//   checkoutToken  how the orders API finds this one order (with the cart token the theme saved)
//   order          what was bought, where it goes and the totals, so the Orders page can show
//                  the order straight away, before the API answers
analytics.subscribe('checkout_completed', async (event) => {
  const c = (event && event.data && event.data.checkout) || {};
  if (!c.token) return;
  const amount = (m) => Number((m && m.amount) || 0);
  const a = c.shippingAddress || {};
  const items = (c.lineItems || []).map((li) => {
    const v = li.variant || {};
    return {
      title: (v.product && v.product.title) || li.title || '',
      variant: v.title && v.title !== 'Default Title' ? v.title : '',
      variantId: v.id ? String(v.id) : '',
      quantity: li.quantity || 0,
      unitPrice: amount(v.price),
      image: (v.image && v.image.src) || '',
    };
  });
  const itemsTotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const order = {
    orderId: c.order && c.order.id ? String(c.order.id) : '',
    placedAt: Date.now(),
    items,
    address: {
      name: [a.firstName, a.lastName].filter(Boolean).join(' '),
      address1: a.address1 || '', address2: a.address2 || '',
      city: a.city || '', province: a.province || '', provinceCode: a.provinceCode || '',
    },
    phone: a.phone || c.phone || '',
    itemsTotal,
    discount: amount(c.discountsAmount),
    shipping: amount(c.shippingLine && c.shippingLine.price),
    total: amount(c.totalPrice),
  };
  let saved = {};
  try { saved = JSON.parse((await browser.localStorage.getItem('oka.lastCheckout')) || '{}') || {}; } catch (e) { saved = {}; }
  saved.checkoutToken = c.token;
  saved.order = order;
  saved.at = Date.now();
  await browser.localStorage.setItem('oka.lastCheckout', JSON.stringify(saved));
});
