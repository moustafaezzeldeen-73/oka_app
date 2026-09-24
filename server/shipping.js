/**
 * Which courier is carrying each order, and where its parcel is.
 *
 * J&T is the current courier; Bosta carried the older orders, which still
 * need their history. Resolution per order, cheapest first:
 *
 *   1. an AWB on the Shopify fulfilment — JEG… (or company J&T) is traced on
 *      J&T, anything else is looked up on Bosta
 *   2. a J&T shipment whose reference is SHOPIFY<order number>
 *   3. a Bosta delivery whose businessReference is the order number
 *
 * Steps 1–2 are batched across all orders (two or three J&T calls in total,
 * however many orders), and step 3 only runs for what J&T didn't claim.
 */

import { hasJT, findShipmentsByOrderNames, toTracking, trace } from './jt.js';
import {
  bostaTracking,
  findDeliveriesByOrderNames,
  findDeliveryByTracking,
  getDelivery,
  hasBosta,
} from './bosta.js';

const isJtAwb = (o) =>
  /^JEG/i.test(String(o.trackingNumber ?? '')) || /j\s*&?\s*t/i.test(String(o.trackingCompany ?? ''));

const refOf = (name) => String(name ?? '').replace(/^#/, '');

/**
 * `orders`: [{ name, trackingNumber?, trackingCompany? }].
 * Returns { byName: Map(name → tracking | null), error: string | null }.
 *
 * Failures are collected rather than swallowed, so the app can say "we
 * couldn't reach the courier" instead of implying there is no shipment.
 */
export async function trackOrders(orders, lang = 'ar') {
  const errors = [];
  const note = (label) => (err) => {
    const raw = String(err?.message ?? err);
    const msg = raw.startsWith(label) ? raw : `${label}: ${raw}`;
    if (!errors.includes(msg)) errors.push(msg);
    return null;
  };
  const byName = new Map(orders.map((o) => [o.name, null]));

  /* J&T — known AWBs plus reference lookups, then one batched trace. */
  const jtAwb = new Map(); // name → billCode
  if (hasJT()) {
    for (const o of orders) if (o.trackingNumber && isJtAwb(o)) jtAwb.set(o.name, o.trackingNumber);

    const unknown = orders.filter((o) => !o.trackingNumber).map((o) => o.name);
    const shipments = unknown.length
      ? (await findShipmentsByOrderNames(unknown).catch(note('J&T'))) ?? new Map()
      : new Map();
    for (const [name, row] of shipments) jtAwb.set(name, row.billCode);

    if (jtAwb.size) {
      const scans = (await trace([...jtAwb.values()]).catch(note('J&T'))) ?? null;
      for (const [name, billCode] of jtAwb) {
        // Even when tracing failed, the AWB is real — show it with no events
        // rather than dropping the order back to "not shipped".
        byName.set(name, toTracking(billCode, scans?.get(billCode) ?? [], lang));
      }
    }
  }

  /* Bosta — legacy orders only. */
  if (hasBosta()) {
    const left = orders.filter((o) => !jtAwb.has(o.name));
    const withAwb = left.filter((o) => o.trackingNumber && !isJtAwb(o));
    const withoutAwb = left.filter((o) => !o.trackingNumber);

    const byRef = withoutAwb.length
      ? (await findDeliveriesByOrderNames(withoutAwb.map((o) => o.name)).catch(note('Bosta'))) ??
        new Map()
      : new Map();

    await Promise.all([
      ...withAwb.map(async (o) => {
        const d = await findDeliveryByTracking(o.trackingNumber).catch(note('Bosta'));
        byName.set(o.name, bostaTracking(d, lang));
      }),
      ...withoutAwb.map(async (o) => {
        const summary = byRef.get(refOf(o.name));
        if (!summary?.trackingNumber) return;
        // The scan returns summaries; the detail record carries the timeline.
        const d = (await getDelivery(summary.trackingNumber).catch(note('Bosta'))) ?? summary;
        byName.set(o.name, bostaTracking(d, lang));
      }),
    ]);
  }

  return { byName, error: errors.length ? errors.join('; ') : null };
}
