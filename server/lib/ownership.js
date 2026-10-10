import { findCustomerAddresses, findOrder, ownsOrder } from '../integrations/shopify.js';

/** One of the customer's own saved addresses, or a 404-style refusal. */
export async function ownAddress(customerId, addressId) {
  if (!addressId) throw Object.assign(new Error('choose a delivery address'), { status: 400, code: 'address' });
  const found = (await findCustomerAddresses(customerId)).find((a) => a.id === addressId);
  if (!found) throw Object.assign(new Error('address not found'), { status: 404, code: 'address' });
  return found;
}

/**
 * Loads an order for a mutation or a status read, refusing anything that
 * isn't the session customer's. "Not found" either way, so order numbers
 * can't be probed.
 */
export async function ownOrder(req) {
  const order = await findOrder(req.params.name ?? req.query.order);
  if (!ownsOrder(order, req.session.customerId)) {
    throw Object.assign(new Error('order not found'), { status: 404 });
  }
  return order;
}
