import { trackOrders } from './shipping.js';
import { addTags, findShippedOrders, getPushTokens, setPushTokens } from './shopify.js';

/**
 * Push notifications for shipment progress, through Expo's push service.
 *
 * A COD parcel that arrives unannounced is a parcel that gets refused, so the
 * notices that matter most are "on its way" (with the cash to have ready) and
 * "the courier couldn't reach you". The job looks at orders shipped in the
 * last 14 days, and tags each order with the steps already announced
 * (`notified:2`, `notified:3`, `notified:action`) so nobody hears the same
 * news twice.
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const isExpoToken = (t) => /^Expo(nent)?PushToken\[.+\]$/.test(String(t));

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

async function send(tokens, title, body, data) {
  if (!tokens.length) return;
  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
    },
    body: JSON.stringify(tokens.map((to) => ({ to, title, body, data, sound: 'default' }))),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Expo push returned ${res.status}`);
}

const message = (o, t, kind) => {
  const cod = o.outstanding > 0 ? ` جهّز ${Math.round(o.outstanding)} ج.م للمندوب.` : '';
  if (kind === 'action') {
    return ['المندوب محتاج يوصلك', `ما قدرناش نوصلك بطلب ${o.name}. افتح التطبيق وكلّم المندوب.`];
  }
  if (kind === 3) return ['تم التسليم', `طلب ${o.name} وصل. شكراً لطلبك من أوكا!`];
  return ['طلبك في الطريق', `طلب ${o.name} خرج مع ${t.carrier ?? 'شركة الشحن'}.${cod}`];
};

export async function notifyShipmentUpdates() {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  // Only orders placed in the app: their customers are the ones with devices.
  const orders = (await findShippedOrders(`created_at:>=${since} tag:oka-app`, 200)).filter((o) => o.customerId);
  if (!orders.length) return { sent: 0 };

  const { byName } = await trackOrders(orders, 'ar');
  let sent = 0;
  for (const o of orders) {
    const t = byName.get(o.name);
    if (!t) continue;
    const due = [];
    if (t.actionNeeded && !o.tags.includes('notified:action')) due.push('action');
    if (t.step >= 2 && t.step < 3 && !o.tags.includes('notified:2')) due.push(2);
    if (t.step === 3 && !o.tags.includes('notified:3')) due.push(3);
    if (!due.length) continue;

    try {
      // Customers without the app have no tokens; their orders are left
      // untagged rather than marked as announced.
      const tokens = await getPushTokens(o.customerId);
      if (!tokens.length) continue;
      for (const kind of due) {
        const [title, body] = message(o, t, kind);
        await send(tokens, title, body, { orderName: o.name });
        sent += 1;
      }
      await addTags(o.id, due.map((k) => `notified:${k}`));
    } catch (err) {
      console.error(`[oka][notify] ${o.name}:`, err.message ?? err);
    }
  }
  return { sent };
}
