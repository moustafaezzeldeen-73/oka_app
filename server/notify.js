import { trackOrders } from './shipping.js';
import { addTags, findShippedOrders, getPushTokens, setPushTokens } from './shopify.js';

/**
 * Push notifications for shipment progress, through Expo's push service.
 *
 * A COD parcel that arrives unannounced is a parcel that gets refused, so the
 * notices follow the moments that decide a delivery:
 *
 *   picked    the courier has collected the parcel
 *   out       it is out for delivery today — with the cash to have ready
 *   action    a delivery attempt failed (at most one notice a day)
 *   delivered it arrived
 *
 * Each notice is tagged on the order once sent (`notified:picked`,
 * `notified:out:2026-09-26`, …) so nobody hears the same news twice. Old news
 * is tagged without being sent. Messages go out in the language the order
 * was placed in. Only orders placed in the app are scanned: their customers
 * are the ones with devices.
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const isExpoToken = (t) => /^Expo(nent)?PushToken\[.+\]$/.test(String(t));

/** Out-for-delivery state codes: J&T scan 94, Bosta state 41. */
const OUT_FOR_DELIVERY = { jt: new Set([94]), bosta: new Set([41]) };
const CARRIER_NAME = { jt: 'J&T', bosta: 'Bosta' };
/** An event older than this isn't announced — it's old news. */
const STALE_MS = 24 * 60 * 60 * 1000;

export async function registerPushToken(customerId, token) {
  if (!isExpoToken(token)) throw Object.assign(new Error('not an Expo push token'), { status: 400 });
  const tokens = await getPushTokens(customerId);
  if (!tokens.includes(token)) await setPushTokens(customerId, [...tokens, token]);
  return { ok: true };
}

export async function unregisterPushToken(customerId, token) {
  const tokens = await getPushTokens(customerId);
  if (tokens.includes(token)) await setPushTokens(customerId, tokens.filter((t) => t !== token));
  return { ok: true };
}

/**
 * Sends one message to each token. Returns the tokens Expo reports as dead
 * (app uninstalled, or notifications turned off) so they can be dropped.
 */
async function send(tokens, { title, body, data }) {
  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
    },
    // channelId matches the Android channel the app creates (src/push.js).
    body: JSON.stringify(
      tokens.map((to) => ({ to, title, body, data, sound: 'default', channelId: 'orders', priority: 'high' })),
    ),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Expo push returned ${res.status}`);
  const json = await res.json().catch(() => ({}));
  const tickets = Array.isArray(json.data) ? json.data : [];
  return tokens.filter((_, i) => tickets[i]?.details?.error === 'DeviceNotRegistered');
}

const latestAt = (t) => {
  const times = (t.updates ?? []).map((u) => new Date(u.at).getTime()).filter(Number.isFinite);
  return times.length ? Math.max(...times) : null;
};

/**
 * What this order's customer hasn't been told yet: [{ tag, kind, silent }].
 * `order.tags` records what was already sent. `silent` notices are tagged
 * without a message — old news, or a step overtaken by a later one.
 */
export function dueNotices(order, t, now = Date.now()) {
  if (!t || order.cancelledAt) return [];
  const sent = new Set(order.tags ?? []);
  const last = latestAt(t);
  const fresh = last == null || now - last < STALE_MS;
  const day = new Date(last ?? now).toISOString().slice(0, 10);
  const due = [];

  if (t.step === 3) {
    if (!sent.has('notified:delivered')) due.push({ tag: 'notified:delivered', kind: 'delivered', silent: !fresh });
    return due;
  }
  if (t.step < 2) return due;

  const isOut = OUT_FOR_DELIVERY[t.carrier]?.has(Number(t.stateCode)) ?? false;
  if (t.actionNeeded) {
    const tag = `notified:action:${day}`;
    if (!sent.has(tag)) due.push({ tag, kind: 'action', silent: !fresh });
  } else if (isOut) {
    const tag = `notified:out:${day}`;
    if (!sent.has(tag)) due.push({ tag, kind: 'out', silent: !fresh });
  }
  if (!sent.has('notified:picked')) {
    // "Shipped" is only worth saying while it is the latest news.
    due.unshift({ tag: 'notified:picked', kind: 'picked', silent: !fresh || due.length > 0 });
  }
  return due;
}

/** The message for one notice, in the order's language. */
export function messageFor(order, t, kind) {
  const en = (order.tags ?? []).includes('lang:en');
  const n = order.name;
  const courier = CARRIER_NAME[t?.carrier] ?? (en ? 'the courier' : 'شركة الشحن');
  const cash = order.outstanding > 0 ? Math.round(order.outstanding) : 0;

  if (kind === 'out') {
    return en
      ? ['Out for delivery today', `Order ${n} is on its way to you with ${courier}.${cash ? ` Please have EGP ${cash} ready.` : ''} Keep your phone nearby.`]
      : ['طلبك خارج للتوصيل النهارده', `طلب ${n} في الطريق ليك مع ${courier}.${cash ? ` جهّز ${cash} ج.م للمندوب.` : ''} خلّي موبايلك جنبك.`];
  }
  if (kind === 'action') {
    return en
      ? ['The courier couldn’t reach you', `Delivery of order ${n} didn’t go through. Open the app to call the courier.`]
      : ['المندوب ما قدرش يوصلك', `توصيل طلب ${n} ما تمش. افتح التطبيق وكلّم المندوب.`];
  }
  if (kind === 'delivered') {
    return en
      ? ['Delivered', `Order ${n} has arrived. Thanks for ordering from OKA!`]
      : ['تم التسليم', `طلب ${n} وصل. شكراً لطلبك من أوكا!`];
  }
  return en
    ? ['Your order has shipped', `${courier} has collected order ${n}. We’ll tell you when it’s out for delivery.`]
    : ['طلبك اتشحن', `${courier} استلمت طلب ${n}. هنبلغك لما يخرج للتوصيل.`];
}

export async function notifyShipmentUpdates() {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const orders = (await findShippedOrders(`created_at:>=${since} tag:oka-app`, 200)).filter((o) => o.customerId);
  if (!orders.length) return { sent: 0 };

  const { byName } = await trackOrders(orders, 'ar');
  let sent = 0;
  for (const o of orders) {
    const t = byName.get(o.name);
    const due = dueNotices(o, t);
    if (!due.length) continue;

    try {
      // Customers without the app on a device have no tokens; their orders
      // are left untagged rather than marked as announced.
      let tokens = await getPushTokens(o.customerId);
      if (!tokens.length) continue;
      for (const notice of due) {
        if (!notice.silent) {
          const [title, body] = messageFor(o, t, notice.kind);
          const dead = await send(tokens, { title, body, data: { orderName: o.name } });
          if (dead.length) {
            tokens = tokens.filter((x) => !dead.includes(x));
            await setPushTokens(o.customerId, tokens);
          }
          sent += 1;
        }
        // One notice at a time, so a failure later in the loop doesn't make
        // the next run repeat what already went out.
        await addTags(o.id, [notice.tag]);
      }
    } catch (err) {
      console.error(`[oka][notify] ${o.name}:`, err.message ?? err);
    }
  }
  return { sent };
}
