import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'subscriptions.json');

/**
 * Discount climbs with delivery frequency — the more often a customer commits
 * to buying, the more they save. Ordered least → most frequent, which is also
 * the order the app lists them in, so the discount visibly grows as a shopper
 * scans down toward a shorter interval.
 */
export const FREQUENCIES = [
  { id: 'monthly', en: 'Every month', ar: 'كل شهر', intervalDays: 30, discountPct: 5 },
  { id: 'biweekly', en: 'Every 2 weeks', ar: 'كل أسبوعين', intervalDays: 14, discountPct: 10 },
  { id: 'weekly', en: 'Every week', ar: 'كل أسبوع', intervalDays: 7, discountPct: 15 },
];

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

async function save() {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(FILE, JSON.stringify(cache, null, 2));
}

/** Every subscription belonging to whoever is signed in under this identifier. */
export async function listSubscriptions(identifier) {
  const all = await load();
  return all.filter((s) => s.identifier === identifier);
}

function addDays(intervalDays, from) {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + intervalDays);
  return d.toISOString();
}

/**
 * Starts a new subscription.
 *
 * `items` is [{ variantId, title, price, quantity }], already resolved
 * against the live catalogue by the caller — this module has no catalogue
 * access of its own. `address` is the structured shipping-address record the
 * checkout and order-edit flows already use, and `shippingFee` is whatever
 * the app quoted for that address at signup — recomputing it per cycle would
 * need the same city-fee logic the client already ran once, so the quoted
 * figure is simply carried forward.
 */
export async function createSubscription({
  identifier,
  customerId,
  customerName,
  email,
  frequencyId,
  items,
  address,
  shippingFee,
}) {
  const freq = frequencyById(frequencyId);
  if (!freq) throw new Error(`unknown frequency: ${frequencyId}`);
  if (!items?.length) throw new Error('at least one item is required');
  if (!address?.address1 || !address?.city) throw new Error('a delivery address is required');

  const all = await load();
  const sub = {
    id: `sub_${randomUUID()}`,
    identifier,
    customerId: customerId ?? null,
    customerName: customerName ?? null,
    email: email ?? null,
    frequencyId,
    discountPct: freq.discountPct,
    items,
    address,
    shippingFee: Number(shippingFee ?? 0),
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

function findOwned(all, id, identifier) {
  const sub = all.find((s) => s.id === id);
  if (!sub) throw new Error('subscription not found');
  if (sub.identifier !== identifier) throw new Error('this subscription does not belong to you');
  return sub;
}

/** Pause, resume, or cancel — resuming clears whatever stalled it before. */
export async function setStatus(id, identifier, status) {
  const all = await load();
  const sub = findOwned(all, id, identifier);
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
export async function updateSubscription(id, identifier, patch) {
  const all = await load();
  const sub = findOwned(all, id, identifier);
  if (patch.items?.length) sub.items = patch.items;
  if (patch.frequencyId) {
    const freq = frequencyById(patch.frequencyId);
    if (!freq) throw new Error(`unknown frequency: ${patch.frequencyId}`);
    sub.frequencyId = patch.frequencyId;
    sub.discountPct = freq.discountPct;
  }
  if (patch.address) sub.address = patch.address;
  if (patch.shippingFee != null) sub.shippingFee = Number(patch.shippingFee);
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
