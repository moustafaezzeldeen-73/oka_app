/**
 * Append-only JSONL ledger.
 *
 * This exists to fix the sharpest edge in the manual OKA workflow: without a
 * record of which orders already have an AWB, running the batch twice in one
 * day creates duplicate REAL shipments for the same orders, and nothing
 * catches it. The shipment ledger is the app's own record, independent of
 * Shopify tags, so the duplicate check works even when tags are ignored.
 *
 * Append-only on purpose — a shipment that turned out wrong is corrected by a
 * later entry, never by rewriting history.
 */

import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

function ensureDir() {
  fs.mkdirSync(config.dataDir, { recursive: true });
}

function filePath(name) {
  return path.join(config.dataDir, `${name}.jsonl`);
}

export function append(name, record) {
  ensureDir();
  const entry = { ...record, loggedAt: new Date().toISOString() };
  fs.appendFileSync(filePath(name), JSON.stringify(entry) + "\n", "utf8");
  return entry;
}

export function readAll(name) {
  const file = filePath(name);
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null; // A torn last line from a crash shouldn't kill the read.
      }
    })
    .filter(Boolean);
}

/** Most recent shipment ledger entry per Shopify order id. */
export function shipmentsByOrderId() {
  const map = new Map();
  for (const entry of readAll("shipments")) {
    if (entry.orderId) map.set(entry.orderId, entry);
  }
  return map;
}

/** True if this order already has a real (non-dry-run) AWB on record. */
export function hasShipment(orderId) {
  const entry = shipmentsByOrderId().get(orderId);
  return Boolean(entry && entry.trackingNumber && !entry.dryRun);
}
