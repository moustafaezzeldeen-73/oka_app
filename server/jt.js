/**
 * J&T Express Egypt client — shipment lookup and tracking.
 *
 * J&T is OKA's courier. Every call goes to the JMS open platform as a form
 * post whose only field is `bizContent` (a JSON string), signed in headers:
 *
 *   apiAccount  the platform account id
 *   timestamp   ms since epoch
 *   digest      base64(md5(bizContent + privateKey))
 *
 * Calls that read the customer's own orders carry a second, business-level
 * digest inside bizContent, derived from the customer code and password.
 *
 * Shipments are created with `txlogisticId = SHOPIFY<order number>` (a
 * re-created one gets a V2/V3 suffix), which is the join back to Shopify —
 * J&T's AWB (`billCode`, JEG…) is never written onto the Shopify order.
 */

import { createHash } from 'node:crypto';

import { cairoLocalToIso, fmtCairo } from './timefmt.js';

const BASE = (process.env.JT_API_BASE_URL || 'https://openapi.jtjms-eg.com/webopenplatformapi')
  .replace(/\/+$/, '');
const TIMEOUT_MS = Number(process.env.JT_TIMEOUT_MS ?? 10000);

/** J&T caps both batch endpoints at 30 references per call. */
const BATCH = 30;

/** Re-created shipments get a suffix; these are the ones worth asking about. */
const REF_SUFFIXES = ['', 'V2', 'V3'];

/** orderStatus 104 — cancelled before pickup; never the live shipment. */
const CANCELLED = 104;

const md5 = (s) => createHash('md5').update(s, 'utf8');

export const hasJT = () =>
  Boolean(process.env.JT_API_ACCOUNT && process.env.JT_PRIVATE_KEY);

function config() {
  const account = process.env.JT_API_ACCOUNT;
  const privateKey = process.env.JT_PRIVATE_KEY;
  if (!account || !privateKey) {
    throw new Error('Missing required environment variables: JT_API_ACCOUNT / JT_PRIVATE_KEY');
  }
  return { account, privateKey };
}

/** The request signature — exported so it can be checked against J&T's docs. */
export function signBody(bizContent, privateKey) {
  return md5(bizContent + privateKey).digest('base64');
}

/**
 * The customer-level digest order reads need:
 * base64(md5(customerCode + UPPER(hex(md5(password + "jadada236t2"))) + privateKey)).
 */
export function customerDigest(customerCode, password, privateKey) {
  const pwd = md5(`${password}jadada236t2`).digest('hex').toUpperCase();
  return md5(customerCode + pwd + privateKey).digest('base64');
}

async function call(path, biz) {
  const { account, privateKey } = config();
  const bizContent = JSON.stringify(biz);

  const res = await fetch(`${BASE}/api/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      apiAccount: account,
      digest: signBody(bizContent, privateKey),
      timestamp: String(Date.now()),
    },
    body: new URLSearchParams({ bizContent }).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`J&T ${path} returned HTTP ${res.status}: ${text.slice(0, 200)}`);
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`J&T ${path} returned non-JSON: ${text.slice(0, 200)}`);
  }
  // J&T answers HTTP 200 for everything; the verdict is in `code`.
  if (String(json.code) !== '1') {
    throw new Error(`J&T ${path}: ${json.msg ?? 'request failed'} (code ${json.code})`);
  }
  return json.data;
}

const chunk = (list, n) => {
  const out = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
};

/** Pages come back as a bare array or wrapped in records/list, by endpoint. */
const rowsOf = (data) =>
  Array.isArray(data) ? data : data?.records ?? data?.list ?? data?.data ?? [];

/* ── Lookups ────────────────────────────────────────────────────────────── */

/** Scan history for up to any number of AWBs → Map(billCode → details[]). */
export async function trace(billCodes = []) {
  const codes = [...new Set(billCodes.filter(Boolean).map(String))];
  const found = new Map();
  const pages = await Promise.all(
    chunk(codes, BATCH).map((part) => call('logistics/trace', { billCodes: part.join(',') })),
  );
  for (const row of pages.flatMap(rowsOf)) {
    if (row?.billCode) found.set(String(row.billCode), Array.isArray(row.details) ? row.details : []);
  }
  return found;
}

/** Raw J&T order records by our own reference (SHOPIFY…), for debugging. */
export async function getOrders(refs = []) {
  const code = process.env.JT_CUSTOMER_CODE;
  const password = process.env.JT_CUSTOMER_PASSWORD;
  if (!code || !password) {
    throw new Error('Missing required environment variables: JT_CUSTOMER_CODE / JT_CUSTOMER_PASSWORD');
  }
  const digest = customerDigest(code, password, config().privateKey);
  const pages = await Promise.all(
    chunk(refs, BATCH).map((part) =>
      call('order/getOrders', { customerCode: code, digest, command: 1, serialNumber: part }),
    ),
  );
  return pages.flatMap(rowsOf);
}

const orderNumber = (name) => String(name ?? '').replace(/^#/, '').trim();

/** "SHOPIFY2745921V2" → "2745921". */
const refToOrder = (ref) => String(ref ?? '').replace(/^SHOPIFY/i, '').replace(/V\d+$/i, '');

const createdMs = (o) => new Date(String(o.createOrderTime ?? '').replace(' ', 'T')).getTime() || 0;

/**
 * The live J&T shipment for each Shopify order name → Map(name → order).
 *
 * All orders are resolved together in a couple of batched calls. When an
 * order was shipped more than once (a cancelled first attempt, then a V2),
 * the newest shipment that was not cancelled wins; an order whose only
 * shipments were cancelled is treated as not shipped.
 */
export async function findShipmentsByOrderNames(names = []) {
  const wanted = names.map(orderNumber).filter(Boolean);
  const found = new Map();
  if (!wanted.length) return found;

  const refs = wanted.flatMap((n) => REF_SUFFIXES.map((s) => `SHOPIFY${n}${s}`));
  const rows = await getOrders(refs);

  for (const row of rows) {
    if (!row?.billCode || Number(row.orderStatus) === CANCELLED) continue;
    const n = refToOrder(row.txlogisticId);
    const prev = found.get(n);
    if (!prev || createdMs(row) > createdMs(prev)) found.set(n, row);
  }

  // Keyed back by the caller's own spelling (#2745921 or 2745921).
  const byName = new Map();
  for (const name of names) {
    const hit = found.get(orderNumber(name));
    if (hit) byName.set(name, hit);
  }
  return byName;
}

/** Confirms both the platform signature and the customer password. */
export async function pingJT() {
  if (!hasJT()) return { ok: false, error: 'J&T is not configured' };
  try {
    await getOrders(['SHOPIFY0']);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/* ── Timeline ───────────────────────────────────────────────────────────── */

/**
 * J&T's failed-attempt codes, in both languages. The courier's own
 * description is English-only and sometimes Chinese, so the known ones are
 * translated here; anything else falls back to the English text J&T sent.
 */
const PROBLEMS = {
  202: ['No answer, or phone switched off', 'لم يتم الرد أو الهاتف مغلق'],
  205: ['Delivery rescheduled at your request', 'تم تأجيل التوصيل بناءً على طلبك'],
  301: ['Address incomplete or incorrect', 'العنوان غير مكتمل أو غير صحيح'],
  310: ['Routing correction at the hub', 'تصحيح مسار الشحنة في الفرع'],
  1002: ['Delivery refused by phone', 'تم رفض الاستلام تليفونياً'],
  1004: ['Refused — contents did not match on opening', 'تم رفض الاستلام — المحتوى غير مطابق'],
  1005: ['Refused on inspection', 'تم رفض الاستلام بعد المعاينة'],
  1010: ['Delivery refused via WhatsApp', 'تم رفض الاستلام عبر واتساب'],
};
const REFUSED = new Set([1002, 1004, 1005, 1010]);

/** "Abnormal parcelScan,202,No Answer…,<courier note>" → its parts. */
function parseProblem(scan) {
  const parts = String(scan.probleDescription ?? scan.problemDescription ?? '').split(',');
  const code = Number(scan.problemType ?? parts[1]) || null;
  return {
    code,
    english: (parts[2] ?? '').trim() || null,
    note: parts.slice(3).join(',').trim() || null,
  };
}

const problemText = (p, ar) =>
  PROBLEMS[p.code]?.[ar ? 1 : 0] ?? p.english ?? (ar ? 'تعذّر التوصيل' : 'Delivery could not be completed');

const COURIER_RE = /J&T courier\s+(.+?)\s*\((\+?\d[\d\s-]{7,})\)/i;
const CONTACT_RE = /contact the J&T courier\s*:\s*(\+?\d[\d\s-]{7,})/i;

const place = (s) => s.scanNetworkName || s.scanNetworkCity || s.scanNetworkProvince || '';

/** One scan → the row text the order screen shows. */
function rowText(s, ar) {
  const code = Number(s.scanTypeCode);
  const at = place(s);
  switch (code) {
    case 10:
      return ar ? 'تم استلام الشحنة من أوكا' : 'Collected from OKA';
    case 50:
      return s.nextStopName
        ? ar
          ? `غادرت ${at} متجهة إلى ${s.nextStopName}`
          : `Left ${at} for ${s.nextStopName}`
        : ar
          ? `غادرت ${at}`
          : `Left ${at}`;
    case 92:
      return ar ? `وصلت إلى ${at}` : `Arrived at ${at}`;
    case 94: {
      const who = COURIER_RE.exec(s.desc ?? '')?.[1];
      if (!who) return ar ? 'الطلب خارج للتوصيل' : 'Out for delivery';
      return ar ? `الطلب خارج للتوصيل مع ${who}` : `Out for delivery with ${who}`;
    }
    case 100:
      return ar ? 'تم التسليم' : 'Delivered';
    case 110: {
      const p = parseProblem(s);
      const head = `${ar ? 'محاولة توصيل لم تتم' : 'Delivery attempt failed'}: ${problemText(p, ar)}`;
      // The courier's own note is usually Arabic and specific ("the customer
      // asked for Saturday") — worth a second line in either language.
      return p.note ? `${head}\n${p.note}` : head;
    }
    case 111:
      return ar ? 'رجعت إلى أوكا' : 'Returned to OKA';
    case 120:
      return ar ? `محفوظة في ${at} للمحاولة التالية` : `Kept at ${at} for the next attempt`;
    case 172:
      return ar ? 'في طريق الرجوع إلى أوكا' : 'On its way back to OKA';
    default:
      return s.scanType || s.desc || (ar ? 'تحديث من J&T' : 'J&T update');
  }
}

/** Oldest first, with J&T's occasional duplicate scans collapsed. */
function orderedScans(details = []) {
  const scans = details
    .map((s) => ({ ...s, at: cairoLocalToIso(s.scanTime) }))
    .filter((s) => s.at)
    .sort((a, b) => new Date(a.at) - new Date(b.at));
  return scans.filter((s, i) => {
    const prev = scans[i - 1];
    return !prev || prev.scanTypeCode !== s.scanTypeCode || place(prev) !== place(s) || prev.desc !== s.desc;
  });
}

const digits = (s) => s.replace(/[\s-]/g, '');

/** Whom to call about this parcel, if anyone is carrying it right now. */
function courierOf(scans, latest) {
  const none = { courier: null, courierPhone: null };
  if (!latest) return none;
  const code = Number(latest.scanTypeCode);
  if (code !== 94 && code !== 100 && code !== 110) return none;
  const named = COURIER_RE.exec(latest.desc ?? '');
  if (named) return { courier: named[1].trim(), courierPhone: digits(named[2]) };

  // A failed attempt lists only numbers; the name is on that run's
  // out-for-delivery scan.
  const contact = CONTACT_RE.exec(latest.desc ?? '');
  const run = [...scans].reverse().find((s) => Number(s.scanTypeCode) === 94);
  const fromRun = run ? COURIER_RE.exec(run.desc ?? '') : null;
  if (fromRun) return { courier: fromRun[1].trim(), courierPhone: digits(fromRun[2]) };
  return contact ? { courier: 'J&T', courierPhone: digits(contact[1]) } : none;
}

function actionFor(latest, courierPhone, ar) {
  if (Number(latest?.scanTypeCode) !== 110) return null;
  const p = parseProblem(latest);
  // A rescheduled slot or an internal routing fix needs nothing from the shopper.
  if (p.code === 205 || p.code === 310) return null;

  const call = courierPhone
    ? ar ? ` كلّم المندوب على ${courierPhone}.` : ` Call the courier on ${courierPhone}.`
    : '';
  if (p.code === 202) {
    return ar
      ? `المندوب ما قدرش يوصلك تليفونياً — خلّي موبايلك مفتوح ورد على مكالمات J&T.${call}`
      : `The courier couldn't reach you by phone — keep your phone on and answer calls from J&T.${call}`;
  }
  if (p.code === 301) {
    return ar
      ? `المندوب ما لقاش العنوان — أكّد العنوان بالتفصيل.${call}`
      : `The courier couldn't find your address — please confirm it in full.${call}`;
  }
  if (REFUSED.has(p.code)) {
    return ar
      ? 'الشحنة اتسجلت إنها مرفوضة وهترجع لأوكا. لو ده حصل بالغلط تواصل معانا.'
      : 'This delivery was recorded as refused and is going back to OKA. If that was a mistake, contact us.';
  }
  return ar
    ? `آخر محاولة توصيل ما تمتش: ${problemText(p, ar)}.${call}`
    : `The last delivery attempt failed: ${problemText(p, ar)}.${call}`;
}

/**
 * One J&T shipment → the order screen's tracking shape, identical to what
 * the Bosta path produces so the routes and the app treat both alike.
 *
 *   step 1  AWB issued, not collected yet
 *   step 2  collected and moving (returns stay here — never "delivered")
 *   step 3  delivered
 */
export function toTracking(billCode, details, lang = 'ar') {
  const ar = lang === 'ar';
  const scans = orderedScans(details);
  // A parcel held overnight (120) is still wherever the last real event left
  // it, so it never hides a failed attempt from the action-needed check.
  const meaningful = scans.filter((s) => Number(s.scanTypeCode) !== 120);
  const latest = meaningful[meaningful.length - 1] ?? scans[scans.length - 1] ?? null;
  const delivered = scans.some((s) => Number(s.scanTypeCode) === 100);
  const { courier, courierPhone } = courierOf(meaningful, latest);

  return {
    carrier: 'jt',
    trackingNumber: billCode,
    stateCode: latest ? Number(latest.scanTypeCode) : null,
    stateLabel: latest
      ? rowText(latest, ar).split('\n')[0]
      : ar ? 'في انتظار استلام J&T' : 'Waiting for J&T to collect',
    step: delivered ? 3 : scans.length ? 2 : 1,
    courier: delivered ? null : courier,
    courierPhone: delivered ? null : courierPhone,
    actionNeeded: delivered ? null : actionFor(latest, courierPhone, ar),
    updates: scans.map((s) => ({
      text: rowText(s, ar),
      time: fmtCairo(s.at, ar),
      done: true,
      at: s.at,
    })),
  };
}
