import { findCustomerProfile, findOrCreateCustomerByPhone } from '../integrations/shopify.js';
import { issueToken, requireSession } from '../auth/session.js';
import { startOtp, verifyOtp } from '../auth/otp.js';
import { fail } from '../lib/http.js';
import { rateLimit } from '../lib/rateLimit.js';

/** Phone sign-in with a one-time code, and session restore. */

export default function authRoutes(app) {
  const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'too many sign-in attempts — try again later' });
  const otpPhoneLimit = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    key: (req) => `otp:${String(req.body?.phone ?? '').replace(/\D/g, '').slice(-10)}`,
    message: 'too many codes requested for this number — try again in an hour',
  });

  /* ── Sign-in ───────────────────────────────────────────────────────────── */

  /** Sends a one-time code to the phone. */
  app.post('/auth/otp/start', authLimit, otpPhoneLimit, async (req, res) => {
    try {
      const { phone } = await startOtp(req.body?.phone);
      return res.json({ ok: true, phone });
    } catch (err) {
      return fail(res, err);
    }
  });

  /** Checks the code, then signs in — creating the account on first use. */
  app.post('/auth/otp/verify', authLimit, async (req, res) => {
    const result = verifyOtp(req.body?.phone, req.body?.code);
    if (!result.ok) return res.status(401).json({ error: result.error });
    try {
      const { customer, created } = await findOrCreateCustomerByPhone(result.phone, req.body?.name);
      return res.json({
        token: issueToken({ identifier: result.phone, customerId: customer.id, via: 'otp' }),
        via: 'otp',
        customer,
        created,
      });
    } catch (err) {
      return fail(res, err);
    }
  });

  /** The signed-in customer, used by the app to restore a saved session. */
  app.get('/auth/me', requireSession, async (req, res) => {
    try {
      const customer = await findCustomerProfile(req.session.customerId);
      if (!customer) return res.status(401).json({ error: 'account not found' });
      return res.json({ customer, via: req.session.via, test: Boolean(req.session.test) });
    } catch (err) {
      return fail(res, err);
    }
  });
}
