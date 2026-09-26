import crypto from 'node:crypto';

import { normalizePhone } from './shopify.js';

/**
 * Phone sign-in with a one-time code.
 *
 * Phone OTP is how Egyptian shoppers expect to sign in, and it does double
 * duty for a COD store: every order comes from a number that has proven it
 * can receive a message, which cuts fake orders and unreachable customers —
 * a large part of the 15% of parcels that come back.
 *
 * Codes are kept hashed in memory for 5 minutes with 5 attempts each. The
 * sender is pluggable through OTP_PROVIDER:
 *
 *   whatsapp  Meta WhatsApp Cloud API, using an approved "authentication"
 *             template (WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID,
 *             WHATSAPP_OTP_TEMPLATE, optional WHATSAPP_TEMPLATE_LANG)
 *   console   prints the code in the server log — development only, refused
 *             when NODE_ENV=production
 *
 * With no provider configured, phone sign-in answers 503 and the app says so.
 */

const CODE_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const pending = new Map(); // phone → { hash, expiresAt, attempts }

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pending) if (v.expiresAt <= now) pending.delete(k);
}, 60 * 1000).unref();

const hash = (phone, code) => crypto.createHash('sha256').update(`${phone}:${code}`).digest('hex');

export function otpProvider() {
  const p = process.env.OTP_PROVIDER || null;
  if (p === 'console' && process.env.NODE_ENV === 'production') return null;
  if (p === 'whatsapp') {
    const ok = process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_OTP_TEMPLATE;
    return ok ? 'whatsapp' : null;
  }
  return p === 'console' ? 'console' : null;
}

async function sendWhatsApp(phone, code) {
  const url = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone.replace(/^\+/, ''),
      type: 'template',
      template: {
        name: process.env.WHATSAPP_OTP_TEMPLATE,
        language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'ar' },
        // Authentication templates take the code in the body and again on
        // the copy-code button.
        components: [
          { type: 'body', parameters: [{ type: 'text', text: code }] },
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
        ],
      },
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`WhatsApp returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

/** Sends a fresh code. Returns the normalised phone it went to. */
export async function startOtp(rawPhone) {
  const provider = otpProvider();
  if (!provider) {
    const err = new Error('phone sign-in is not configured on the server');
    err.status = 503;
    throw err;
  }
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    const err = new Error('enter a valid Egyptian mobile number');
    err.status = 400;
    throw err;
  }

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  pending.set(phone, { hash: hash(phone, code), expiresAt: Date.now() + CODE_TTL_MS, attempts: 0 });

  if (provider === 'whatsapp') await sendWhatsApp(phone, code);
  else console.warn(`[oka][otp:console] code for ${phone} is ${code}`);
  return { phone };
}

/** True once, for the right code; every wrong guess counts toward the limit. */
export function verifyOtp(rawPhone, code) {
  const phone = normalizePhone(rawPhone);
  const entry = phone ? pending.get(phone) : null;
  if (!entry || entry.expiresAt <= Date.now()) return { ok: false, error: 'the code has expired — request a new one' };

  entry.attempts += 1;
  const given = Buffer.from(hash(phone, String(code ?? '').trim()));
  const want = Buffer.from(entry.hash);
  if (!crypto.timingSafeEqual(given, want)) {
    if (entry.attempts >= MAX_ATTEMPTS) pending.delete(phone);
    return { ok: false, error: 'that code is not right' };
  }
  pending.delete(phone);
  return { ok: true, phone };
}
