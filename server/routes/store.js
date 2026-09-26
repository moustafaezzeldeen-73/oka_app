import { FEE_TIER_THRESHOLD, PROVINCES, ZONE_FEES } from '../config/zones.js';
import { POLICY, REWARDS, paymentMethods } from '../config/policy.js';
import { otpProvider } from '../auth/otp.js';
import { testLoginEnabled } from '../auth/testLogin.js';
import { fetchAdminCatalogue, findOrder, hasShopify } from '../integrations/shopify.js';
import { hasJT, pingJT } from '../integrations/jt.js';
import { hasBosta, pingBosta } from '../integrations/bosta.js';
import { fail } from '../lib/http.js';

/** Public, no sign-in: health, the store's policy, and the catalogue. */

export default function storeRoutes(app) {
  /**
   * Health is a diagnostic, so it must always answer — a dependency that hangs
   * is reported as a timeout rather than being allowed to hang the request.
   */
  const withDeadline = (promise, ms, label) =>
    Promise.race([
      promise,
      new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: `${label} timed out after ${ms}ms` }), ms)),
    ]);

  app.get('/health', async (_req, res) => {
    const env = {
      shopify: hasShopify(),
      jt: hasJT(),
      jtCustomer: Boolean(process.env.JT_CUSTOMER_CODE && process.env.JT_CUSTOMER_PASSWORD),
      bosta: hasBosta(),
    };

    // Checked side by side — one slow dependency no longer delays the others.
    const [shopify, jt, bosta] = await Promise.all([
      withDeadline(
        findOrder('#1').then(() => ({ ok: true })).catch((e) => ({ ok: false, error: e.message })),
        16000,
        'shopify',
      ),
      withDeadline(pingJT(), 12000, 'jt'),
      hasBosta() ? withDeadline(pingBosta(), 10000, 'bosta') : { ok: false, error: 'not configured' },
    ]);

    res.json({ ok: true, env, shopify, jt, bosta });
  });

  /**
   * Everything the app needs to price and present the store honestly: the
   * shipping policy, payment methods on offer, governorates, loyalty rewards
   * and the subscription discount. Public.
   */
  app.get('/storefront-config', (_req, res) => {
    res.json({
      currency: POLICY.currency,
      // The store's fee table, for estimates before an address is chosen.
      // Quotes with an address use Shopify's own rate.
      shipping: { tierThreshold: FEE_TIER_THRESHOLD, zones: ZONE_FEES },
      minOrder: POLICY.minOrder,
      prepaidShippingDiscount: POLICY.prepaidShippingDiscount,
      paymentMethods: paymentMethods(),
      provinces: PROVINCES,
      loyalty: { pointsPerEgp: POLICY.loyalty.pointsPerEgp, earnPointsPerEgp: POLICY.loyalty.earnPointsPerEgp, rewards: REWARDS },
      subscriptionDiscountPct: POLICY.subscriptionDiscountPct,
      signIn: { otp: Boolean(otpProvider()), testLogin: testLoginEnabled() },
      support: {
        whatsapp: process.env.SUPPORT_WHATSAPP || null,
        policiesBaseUrl: process.env.POLICIES_BASE_URL || 'https://www.okaegypt.com/policies',
      },
    });
  });

  /* ── Catalogue ─────────────────────────────────────────────────────────── */

  /**
   * Product catalogue, served from the Admin API so the app never needs a
   * second Shopify credential. `?ids=` is the app's local category ids
   * (comma-separated); omit it to get the app's default set.
   */
  const DEFAULT_CATALOGUE_IDS = [
    'hookahs', 'tobacco', 'accessories', 'oka-parts', 'hoses', 'coal', 'dark-tobacco', 'bowls',
  ];

  /**
   * The catalogue is the same for every shopper and changes rarely, but it is
   * the heaviest query the app makes and every launch asks for it. A short
   * cache — shared by concurrent requests while one is in flight — keeps a
   * burst of app opens from becoming a burst of Admin API calls.
   */
  const CATALOGUE_TTL_MS = Number(process.env.CATALOGUE_TTL_MS ?? 60000);
  const catalogueCache = new Map(); // key → { at, promise }

  app.get('/catalogue', async (req, res) => {
    const ids = req.query.ids ? String(req.query.ids).split(',').filter(Boolean) : DEFAULT_CATALOGUE_IDS;
    const key = ids.join(',');
    let hit = catalogueCache.get(key);
    if (!hit || Date.now() - hit.at > CATALOGUE_TTL_MS) {
      hit = { at: Date.now(), promise: fetchAdminCatalogue(ids) };
      catalogueCache.set(key, hit);
      // A failure is never cached — the next request tries again.
      hit.promise.catch(() => catalogueCache.delete(key));
    }
    try {
      return res.json(await hit.promise);
    } catch (err) {
      return fail(res, err);
    }
  });
}
