import { findShipmentsByOrderNames, getOrders, toTracking, trace } from '../integrations/jt.js';
import { actionNeeded, findDeliveryByOrderName, getDelivery, toUpdates } from '../integrations/bosta.js';
import { requireStaff } from '../lib/http.js';

/** Staff-only courier diagnostics (header x-staff-key: $STAFF_DEBUG_KEY). */

export default function debugRoutes(app) {
  /**
   * What J&T actually returns for one order or AWB.
   *
   * `?order=#2745921` shows every J&T shipment filed under that order (including
   * cancelled attempts) and which one the app picked; `?tracking=JEG…` traces
   * one AWB. `?raw=1` adds J&T's own records.
   */
  app.get('/debug/jt', requireStaff, async (req, res) => {
    const { tracking, order, raw } = req.query;
    const lang = req.query.lang === 'en' ? 'en' : 'ar';
    if (!tracking && !order) {
      return res.status(400).json({ error: 'tracking or order is required' });
    }
    try {
      let shipments = [];
      let picked = null;
      if (order) {
        const n = String(order).replace(/^#/, '');
        shipments = await getOrders([`SHOPIFY${n}`, `SHOPIFY${n}V2`, `SHOPIFY${n}V3`]);
        picked = (await findShipmentsByOrderNames([order])).get(order) ?? null;
      }
      const awb = tracking ?? picked?.billCode ?? null;
      const scans = awb ? (await trace([awb])).get(awb) ?? [] : [];
      return res.json({
        found: Boolean(awb),
        shipments: shipments.map((r) => ({
          txlogisticId: r.txlogisticId ?? null,
          billCode: r.billCode ?? null,
          orderStatus: r.orderStatus ?? null,
          createOrderTime: r.createOrderTime ?? null,
        })),
        picked: picked?.billCode ?? null,
        scanCount: scans.length,
        tracking: awb ? toTracking(awb, scans, lang) : null,
        ...(raw ? { rawShipments: shipments, rawScans: scans } : {}),
      });
    } catch (err) {
      return res.status(502).json({ found: false, error: String(err.message ?? err) });
    }
  });

  /**
   * What Bosta actually returns for one AWB or order name.
   *
   * A silent lookup failure looked exactly like a shipment with no events, and
   * cost several rounds of guessing to find. This answers the question directly:
   * which endpoint answered, what the raw state was, and how many timeline rows
   * came back. `?raw=1` returns Bosta's own record for the awkward cases.
   */
  app.get('/debug/bosta', requireStaff, async (req, res) => {
    const { tracking, order, raw } = req.query;
    if (!tracking && !order) {
      return res.status(400).json({ error: 'tracking or order is required' });
    }
    try {
      const delivery = tracking
        ? await getDelivery(tracking)
        : await findDeliveryByOrderName(order);

      if (!delivery) {
        return res.json({ found: false, tracking: tracking ?? null, order: order ?? null });
      }
      return res.json({
        found: true,
        trackingNumber: delivery.trackingNumber ?? null,
        businessReference: delivery.businessReference ?? null,
        state: delivery.state?.value ?? null,
        stateCode: delivery.state?.code ?? null,
        waitingForBusinessAction: Boolean(delivery.state?.waitingForBusinessAction),
        exceptionCount: (delivery.state?.exception ?? []).length,
        timelineRows: (delivery.timeline ?? []).length,
        courier: delivery.star?.name ?? null,
        courierPhone: delivery.star?.phone ?? null,
        updates: toUpdates(delivery, req.query.lang === 'en' ? 'en' : 'ar'),
        actionNeeded: actionNeeded(delivery, req.query.lang === 'en' ? 'en' : 'ar'),
        ...(raw ? { rawDelivery: delivery } : {}),
      });
    } catch (err) {
      return res.status(502).json({ found: false, error: String(err.message ?? err) });
    }
  });
}
