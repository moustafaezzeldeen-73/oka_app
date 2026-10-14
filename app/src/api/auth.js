import { call } from './client';

/**
 * The signed-in customer: sign-in, orders, addresses, wishlist, checkout.
 * Every call that touches a customer's data sends the session token; the
 * server works out whose data it is from the token alone.
 */

/* ── Sign-in ── */

export const startOtp = (phone) => call('/auth/otp/start', { method: 'POST', body: { phone } });

export const verifyOtp = ({ phone, code, name }) =>
  call('/auth/otp/verify', { method: 'POST', body: { phone, code, name } });

/** Restores a saved session: the customer, or a 401 if the token is no longer valid. */
export const fetchMe = (token) => call('/auth/me', { token });

/** TESTING ONLY — see server/auth/testLogin.js. Delete before launch. */
export const testLogin = ({ identifier, key }) =>
  call('/auth/test-login', { method: 'POST', body: { identifier, key } });

/* ── Store policy ── */

export const fetchStorefrontConfig = () => call('/storefront-config');

/* ── Orders ── */

export const fetchCustomerOrders = ({ token, lang }) => call(`/customer/orders?lang=${lang}`, { token });

export const fetchOrderStatus = ({ orderNumber, lang, token }) =>
  call(`/orders/status?order=${encodeURIComponent(orderNumber)}&lang=${lang}`, { token });

export const cancelShopifyOrder = (orderName, token) =>
  call(`/orders/${encodeURIComponent(orderName)}/cancel`, { method: 'POST', token, body: {} });

/** `lines` is the desired end state: [{ variantId, quantity }]. */
export const editShopifyOrder = (orderName, lines, token) =>
  call(`/orders/${encodeURIComponent(orderName)}/edit`, { method: 'POST', token, body: { lines } });

/** Redirects an order to another of the customer's saved addresses. */
export const updateOrderAddress = (orderName, addressId, token) =>
  call(`/orders/${encodeURIComponent(orderName)}/address`, { method: 'POST', token, body: { addressId } });

/* ── Checkout ── */

/**
 * The server's price for a basket. `lines` is [{ variantId, quantity }];
 * the token is optional (the cart quotes before sign-in).
 */
export const fetchQuote = ({ lines, discountCode, addressId, paymentMethod }, token) =>
  call('/checkout/quote', { method: 'POST', token, body: { lines, discountCode, addressId, paymentMethod } });

/** Places the order. Retrying with the same idempotencyKey can't create a second one. */
export const placeOrder = (payload, token) => call('/orders', { method: 'POST', token, body: payload });

/* ── Addresses ── */

export const fetchCustomerAddresses = (token) => call('/customer/addresses', { token });

/** `address` is { name, phone, street, building, city, provinceCode }. */
export const saveCustomerAddress = (address, token, { setAsDefault = false } = {}) =>
  call('/customer/addresses', { method: 'POST', token, body: { address, setAsDefault } });

export const setDefaultAddress = (addressId, token) =>
  call('/customer/addresses/default', { method: 'POST', token, body: { addressId } });

export const deleteAddress = (addressId, token) =>
  call('/customer/addresses/delete', { method: 'POST', token, body: { addressId } });

/* ── Wishlist, notifications, account ── */

export const fetchWishlist = (token) => call('/customer/wishlist', { token });

export const saveWishlist = (ids, token) => call('/customer/wishlist', { method: 'POST', token, body: { ids } });

export const registerPushToken = (pushToken, token, remove = false) =>
  call('/customer/push-token', { method: 'POST', token, body: { token: pushToken, remove } });

export const requestAccountDeletion = (token) => call('/customer/delete-request', { method: 'POST', token, body: {} });

/* ── Loyalty ── */

export const fetchLoyalty = (token) => call('/loyalty', { token });

/** Returns { voucher: { code, endsAt, reward }, balance }. */
export const redeemReward = (rewardId, token) => call('/loyalty/redeem', { method: 'POST', token, body: { rewardId } });
