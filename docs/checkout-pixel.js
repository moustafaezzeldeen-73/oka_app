// OKA — keep the guest's last order in their browser after checkout, the way the cart is kept,
// so the website's Orders page can show it and let them change or cancel it without signing in.
//
// Install: Shopify admin → Settings → Customer events → Add custom pixel →
// name it "OKA last order" → paste this whole file → Save → Connect.
//
// The checkout runs on www.okaegypt.com, so this writes to the same browser storage the theme
// reads. It adds the checkout's token to "oka.lastCheckout" (the theme saved the cart's token
// there when the customer went to checkout); the orders API finds that one order by these tokens.
analytics.subscribe('checkout_completed', async (event) => {
  const c = (event && event.data && event.data.checkout) || {};
  if (!c.token) return;
  let saved = {};
  try { saved = JSON.parse((await browser.localStorage.getItem('oka.lastCheckout')) || '{}') || {}; } catch (e) { saved = {}; }
  saved.checkoutToken = c.token;
  saved.at = Date.now();
  await browser.localStorage.setItem('oka.lastCheckout', JSON.stringify(saved));
});
