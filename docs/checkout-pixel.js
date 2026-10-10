// OKA — remember the buyer's phone after checkout, so the website's Orders
// page can show their orders (and let them change or cancel) without
// signing in.
//
// Install: Shopify admin → Settings → Customer events → Add custom pixel →
// name it "OKA last order" → paste this whole file → Save → Connect.
// Customer privacy: "Not required" (it only stores the phone the buyer just
// typed, in their own browser, on okaegypt.com).
//
// The checkout runs on www.okaegypt.com, so this writes to the same browser
// storage the theme reads (key "oka.lastOrder", see theme/assets/oka-screens.js).
analytics.subscribe('checkout_completed', async (event) => {
  const c = (event && event.data && event.data.checkout) || {};
  const phone = c.phone || (c.shippingAddress && c.shippingAddress.phone) || (c.billingAddress && c.billingAddress.phone) || '';
  if (!phone) return;
  await browser.localStorage.setItem('oka.lastOrder', JSON.stringify({ name: '', phone: phone }));
});
