import express from "express";
import * as shopify from "../lib/shopify.js";
import * as bosta from "../lib/bosta.js";
import { readAll, shipmentsByOrderId } from "../lib/ledger.js";
import { runAudit } from "../services/audit.js";
import { shipBatch, shipOrder } from "../services/shipping.js";
import { auditOrders } from "../domain/audit.js";
import { PROVINCES } from "../domain/zones.js";
import { loadParams } from "../domain/risk.js";
import { config, credentialStatus } from "../config.js";

export const router = express.Router();

// Async route errors would otherwise become an unhandled rejection and hang
// the request, so every handler goes through this.
const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

const intParam = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const boolParam = (value) => value === true || value === "true" || value === "1";

router.get("/health", (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    credentials: credentialStatus(),
    riskParams: loadParams(),
  });
});

/**
 * The warehouse's main pull: unfulfilled orders in the window, each already
 * carrying its audit verdict and any AWB it already has, so the UI renders
 * one list instead of stitching three calls together.
 */
router.get(
  "/orders",
  wrap(async (req, res) => {
    const windowDays = intParam(req.query.windowDays, 2);
    const orders = await shopify.fetchUnfulfilledOrders({ windowDays });
    const audit = auditOrders(orders);
    const auditById = new Map(audit.orders.map((result) => [result.orderId, result]));
    const shipments = shipmentsByOrderId();

    res.json({
      windowDays,
      windowStart: shopify.windowStartUtc(windowDays),
      summary: audit.summary,
      duplicateGroups: audit.duplicateGroups,
      orders: orders.map((order) => ({
        ...order,
        audit: auditById.get(order.id) || null,
        shipment: shipments.get(order.id) || null,
      })),
    });
  }),
);

router.get(
  "/orders/audit",
  wrap(async (req, res) => {
    const orders = await shopify.fetchUnfulfilledOrders({ windowDays: intParam(req.query.windowDays, 2) });
    // Writing corrections back requires an explicit apply=true AND dryRun=false.
    res.json(
      await runAudit(orders, {
        apply: boolParam(req.query.apply),
        dryRun: !boolParam(req.query.commit),
      }),
    );
  }),
);

/**
 * Creates shipments. Defaults to a dry run in every direction: the request
 * has to opt in, and BOSTA_LIVE_SHIPMENTS has to be on for the opt-in to mean
 * anything.
 */
router.post(
  "/shipments",
  wrap(async (req, res) => {
    const { orderIds = [], dryRun = true, force = false, fulfill = false } = req.body || {};

    const orders = orderIds.length
      ? (await Promise.all(orderIds.map((id) => shopify.fetchOrder(id)))).filter(Boolean)
      : await shopify.fetchUnfulfilledOrders({ windowDays: intParam(req.body?.windowDays, 2) });

    if (!orders.length) {
      return res.status(404).json({ error: "No matching unfulfilled orders." });
    }

    res.json(await shipBatch(orders, { dryRun, force, fulfill }));
  }),
);

router.post(
  "/shipments/:orderId",
  wrap(async (req, res) => {
    const order = await shopify.fetchOrder(decodeURIComponent(req.params.orderId));
    if (!order) return res.status(404).json({ error: "Order not found" });

    const { dryRun = true, force = false, fulfill = false } = req.body || {};
    res.json(await shipOrder(order, { dryRun, force, fulfill }));
  }),
);

/** AWB labels for a batch, returned as base64 PDF chunks of at most 50. */
router.post(
  "/awb",
  wrap(async (req, res) => {
    const { trackingNumbers = [], awbType = "A6", lang = "en" } = req.body || {};
    if (!trackingNumbers.length) return res.status(400).json({ error: "trackingNumbers is required" });

    const chunks = [];
    for (const chunk of bosta.chunkForPrinting(trackingNumbers)) {
      chunks.push(await bosta.printAwb(chunk, { awbType, lang }));
    }
    res.json({ chunks, total: trackingNumbers.length });
  }),
);

router.get(
  "/tracking/:trackingNumber",
  wrap(async (req, res) => {
    const delivery = await bosta.trackDelivery(req.params.trackingNumber);
    res.json({ delivery, outcome: bosta.classifyState(delivery?.state) });
  }),
);

router.get(
  "/risk/:trackingNumber",
  wrap(async (req, res) => {
    res.json(await bosta.orderRisk(req.params.trackingNumber));
  }),
);

router.get("/ledger/:name", (req, res) => {
  const allowed = ["shipments", "audit"];
  if (!allowed.includes(req.params.name)) return res.status(404).json({ error: "Unknown ledger" });
  res.json({ entries: readAll(req.params.name) });
});

router.get("/reference/provinces", (req, res) => {
  res.json({ provinces: PROVINCES.map(({ aliases, ...rest }) => rest) });
});

router.get(
  "/reference/shipping-zones",
  wrap(async (req, res) => {
    res.json(await shopify.fetchShippingZones());
  }),
);

router.get(
  "/reference/bosta-cities",
  wrap(async (req, res) => {
    res.json({ cities: await bosta.listCities() });
  }),
);

router.get(
  "/reference/pickup-locations",
  wrap(async (req, res) => {
    res.json({ locations: await bosta.listPickupLocations() });
  }),
);

// Upstream failures carry their own status; anything else is a real bug here.
router.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.service ? error.status || 502 : 500;
  res.status(status).json({
    error: error.message,
    service: error.service || null,
    details: error.body || null,
  });
});

export { config };
