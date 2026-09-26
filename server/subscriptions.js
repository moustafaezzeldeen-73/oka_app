import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Subscription orders — "subscribe & save".
 *
 * There is no payment gateway wired up (this store runs on cash on
 * delivery), so a subscription here is not a billing contract the way
 * Shopify's own Subscriptions feature means it — there is no card on file to
 * charge automatically. It is a standing instruction: the scheduler
 * (scheduler.js) turns it into a real Shopify order, COD, on each due date,
 * through the exact same order-creation path checkout uses.
 *
 * State lives in a JSON file rather than a database. The rest of this app
 * gets by without one — every screen is either live Shopify/Bosta data or a
 * customer metafield — and a subscription list small enough for one merchant
 * doesn't need one either.
 */

import { POLICY } from './policy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/**
 * Point SUBSCRIPTIONS_DATA_DIR at a persistent disk in production: most hosts
 * wipe the app directory on every deploy, and the subscriptions with it.
 */
const DATA_DIR = process.env.SUBSCRIPTIONS_DATA_DIR || path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'subscriptions.json');

/**
 * Delivery frequencies. Every one gets the same discount (policy.js — 5% by
 * default): the old ladder gave 15% on weekly orders, more than the store's
 * whole margin, on a parcel that still costs 80 EGP to deliver.
 */
export const FREQUENCIES = [
  { id: 'monthly', en: 'Every month', ar: 'كل شهر', intervalDays: 30 },
  { id: 'biweekly', en: 'Every 2 weeks', ar: 'كل أسبوعين', intervalDays: 14 },
  { id: 'weekly', en: 'Every week', ar: 'كل أسبوع', intervalDays: 7 },
].map((f) => ({ ...f, discountPct: POLICY.subscriptionDiscountPct }));

const frequencyById = (id) => FREQUENCIES.find((f) => f.id === id) ?? null;

/** A subscription stops retrying and needs a human once it's failed this many cycles in a row. */
const MAX_CONSECUTIVE_FAILURES = 3;

let cache = null;

async function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(await readFile(FILE, 'utf8'));
  } catch {
    cache = [];
  }
  return cache;
}

/**
 * Writes go through a temp file and a rename, which is atomic: a crash mid-
 * write leaves the previous file intact instead of a truncated one. Writes
 * are also serialised, so two requests can't interleave.
 */
let writing = Promise.resolve();
function save() {
  writing = writing.then(async () => {
    await mkdir(DATA_DIR, { recursive: true });
    const tmp = `${FILE}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(cache, null, 2));
    await rename(tmp, FILE);
  });
  return writing;
}

/** Every subscription belonging to whoever is signed in under this identifier. */
export async function listSubscriptions(customerId) {
  const all = await load();
  return all
    .filter((s) => s.customerId === customerId)
    .map((s) => ({ ...s, discountPct: POLICY.subscriptionDiscountPct }));
}

function addDays(intervalDays, from) {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + intervalDays);
  return d.toISOString();
}

/** Only what a subscription needs from each line — never a price. */
function cleanItems(items) {
  const out = (items ?? [])
    .map((it) => ({
      variantId: it.variantId,
      quantity: Math.min(50, Math.floor(Number(it.quantity))),
      title: String(it.title ?? '').slice(0, 120),
    }))
    .filter((it) => it.variantId && it.quantity > 0);
  if (!out.length) throw new Error('at least one item is required');
  return out;
}

/**
 * Starts a new subscription.
 *
 * `items` is [{ variantId, quantity, title }] — prices are looked up live on
 * every cycle (scheduler.js), so a price change or a sale reaches subscribers
 * and nothing the app sends can set one. `address` is a saved-address `raw`
 * record the route has already checked belongs to this customer.
 */
export async function createSubscription({ customerId, customerName, email, frequencyId, items, address }) {
  const freq = frequencyById(frequencyId);
  if (!freq) throw new Error(`unknown frequency: ${frequencyId}`);
  if (!address?.address1 || !address?.city) throw new Error('a delivery address is required');

  const all = await load();
  const sub = {
    id: `sub_${randomUUID()}`,
    customerId,
    customerName: customerName ?? null,
    email: email ?? null,
    frequencyId,
    items: cleanItems(items),
    address,
    status: 'active',
    createdAt: new Date().toISOString(),
    nextOrderDate: addDays(freq.intervalDays, new Date()),
    lastOrderAt: null,
    lastOrderName: null,
    ordersCreated: 0,
    consecutiveFailures: 0,
    lastError: null,
  };
  all.push(sub);
  await save();
  return sub;
}

function findOwned(all, id, customerId) {
  const sub = all.find((s) => s.id === id);
  // Same answer whether it doesn't exist or isn't yours.
  if (!sub || sub.customerId !== customerId) throw new Error('subscription not found');
  return sub;
}

/** Pause, resume, or cancel — resuming clears whatever stalled it before. */
export async function setStatus(id, customerId, status) {
  const all = await load();
  const sub = findOwned(all, id, customerId);
  sub.status = status;
  if (status === 'active') {
    sub.consecutiveFailures = 0;
    sub.lastError = null;
    // A subscription paused for a while shouldn't dump every missed cycle on
    // resume — it picks up from now, not from whenever it was paused.
    const freq = frequencyById(sub.frequencyId);
    if (new Date(sub.nextOrderDate) < new Date()) {
      sub.nextOrderDate = addDays(freq.intervalDays, new Date());
    }
  }
  await save();
  return sub;
}

/** Replaces items, frequency and/or address on an existing subscription. */
export async function updateSubscription(id, customerId, patch) {
  const all = await load();
  const sub = findOwned(all, id, customerId);
  if (patch.items?.length) sub.items = cleanItems(patch.items);
  if (patch.frequencyId) {
    if (!frequencyById(patch.frequencyId)) throw new Error(`unknown frequency: ${patch.frequencyId}`);
    sub.frequencyId = patch.frequencyId;
  }
  if (patch.address) sub.address = patch.address;
  await save();
  return sub;
}

/** Every active subscription whose next delivery is due — the scheduler's feed. */
export async function dueSubscriptions(now = new Date()) {
  const all = await load();
  return all.filter((s) => s.status === 'active' && new Date(s.nextOrderDate) <= now);
}

/**
 * Records a cycle's outcome.
 *
 * A success rolls the subscription forward by one interval from its due date
 * (not from "now"), so a subscription doesn't drift later every time the
 * scheduler runs a little behind. A failure is left due so the next tick
 * retries it, up to MAX_CONSECUTIVE_FAILURES — past that it is parked in
 * `action_needed` rather than retried forever against, say, a variant that no
 * longer exists.
 */
export async function markCycleResult(id, { ok, orderName, error }) {
  const all = await load();
  const sub = all.find((s) => s.id === id);
  if (!sub) return;
  const freq = frequencyById(sub.frequencyId);

  if (ok) {
    sub.lastOrderAt = new Date().toISOString();
    sub.lastOrderName = orderName ?? null;
    sub.ordersCreated += 1;
    sub.consecutiveFailures = 0;
    sub.lastError = null;
    sub.nextOrderDate = addDays(freq.intervalDays, new Date(sub.nextOrderDate));
  } else {
    sub.consecutiveFailures = (sub.consecutiveFailures ?? 0) + 1;
    sub.lastError = String(error ?? 'unknown error');
    if (sub.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      sub.status = 'action_needed';
    }
  }
  await save();
}
