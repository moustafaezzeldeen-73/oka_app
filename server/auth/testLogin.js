/**
 * ─────────────────────────────────────────────────────────────────────────
 *  TESTING ONLY — "sign in as any real customer".  DELETE BEFORE LAUNCH.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Lets a tester open the app as any existing Shopify customer, by phone or
 * email, so real orders, addresses, loyalty and subscriptions can be checked
 * end to end without that customer's phone.
 *
 * It is off unless ALL of these hold:
 *   • TEST_LOGIN_KEY is set, at least 16 characters (never shipped in the app —
 *     the tester types it)
 *   • NODE_ENV is not "production"
 * Every use is logged with the customer it opened, and the session it issues
 * is marked `test: true`.
 *
 * To remove it before launch:
 *   1. delete this file
 *   2. delete the `mountTestLogin(app)` line and its import in server/app.js
 *   3. delete app/src/components/TestLoginPanel.js and its import and
 *      <TestLoginPanel /> in app/src/screens/SignInScreen.js
 *   4. remove TEST_LOGIN_KEY / EXPO_PUBLIC_TEST_LOGIN from your env files
 */

import crypto from 'node:crypto';

import { issueToken } from './session.js';
import { rateLimit } from '../lib/rateLimit.js';
import { findCustomerProfile } from '../integrations/shopify.js';

export function testLoginEnabled() {
  const key = process.env.TEST_LOGIN_KEY || '';
  return key.length >= 16 && process.env.NODE_ENV !== 'production';
}

function keyMatches(given) {
  const a = Buffer.from(String(given ?? ''));
  const b = Buffer.from(process.env.TEST_LOGIN_KEY || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function mountTestLogin(app) {
  if (!testLoginEnabled()) {
    if (process.env.TEST_LOGIN_KEY) {
      console.warn('[oka][test-login] disabled (production, or TEST_LOGIN_KEY shorter than 16 characters)');
    }
    return;
  }
  console.warn('[oka][test-login] ENABLED — any customer can be opened with the test key. Remove before launch.');

  app.post(
    '/auth/test-login',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: 'too many test sign-ins' }),
    async (req, res) => {
      const { identifier, key } = req.body ?? {};
      if (!keyMatches(key)) return res.status(401).json({ error: 'wrong test key' });
      if (!identifier) return res.status(400).json({ error: 'phone or email is required' });
      try {
        const customer = await findCustomerProfile(identifier);
        if (!customer) return res.status(404).json({ error: `no customer found for ${identifier}` });
        console.warn(`[oka][test-login] opened ${customer.id} (${identifier})`);
        return res.json({
          token: issueToken({ identifier, customerId: customer.id, via: 'test-login', test: true }),
          via: 'test-login',
          test: true,
          customer,
        });
      } catch (err) {
        return res.status(502).json({ error: err.message ?? String(err) });
      }
    },
  );
}
