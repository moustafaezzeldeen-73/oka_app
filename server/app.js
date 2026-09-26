import express from 'express';

import { assertAuthConfig } from './auth/session.js';
import authRoutes from './routes/auth.js';
import checkoutRoutes from './routes/checkout.js';
import customerRoutes from './routes/customer.js';
import debugRoutes from './routes/debug.js';
import loyaltyRoutes from './routes/loyalty.js';
import orderRoutes from './routes/orders.js';
import storeRoutes from './routes/store.js';
import subscriptionRoutes from './routes/subscriptions.js';
// TESTING ONLY — delete this import and the mountTestLogin(app) call below before launch.
import { mountTestLogin } from './auth/testLogin.js';

/**
 * The OKA order service, assembled.
 *
 * The mobile app is a public client: anything bundled into it can be read by
 * anyone who downloads it. So the app holds no credentials, and everything
 * that needs authority — the catalogue, pricing and creating orders, reading
 * a customer's history, talking to J&T and Bosta — happens here.
 *
 * Every route that reads or changes a customer's data requires a signed-in
 * session (auth/session.js), acts only on that session's own customer, and
 * checks that any order it touches belongs to them (lib/ownership.js).
 *
 *   routes/store.js          /health, /storefront-config, /catalogue   (public)
 *   routes/auth.js           /auth/otp/*, /auth/me
 *   routes/customer.js       /customer/*   orders, addresses, wishlist, push token
 *   routes/checkout.js       /checkout/quote, POST /orders
 *   routes/orders.js         /orders/:name/cancel|edit|address, /orders/status
 *   routes/loyalty.js        /loyalty, /loyalty/redeem
 *   routes/subscriptions.js  /subscriptions*
 *   routes/debug.js          /debug/*   (staff key only)
 */
export function createApp() {
  assertAuthConfig();

  const app = express();
  // Behind a proxy (Render, Fly, a load balancer) set TRUST_PROXY_HOPS=1 so
  // rate limits key on the real client IP. Unset, X-Forwarded-For is ignored —
  // a client could otherwise send a fake one to dodge the limits.
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 0));
  app.use(express.json({ limit: '256kb' }));

  app.use((req, res, next) => {
    const origin = process.env.ALLOWED_ORIGIN;
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  });

  storeRoutes(app);
  authRoutes(app);
  // TESTING ONLY — delete before launch (see auth/testLogin.js).
  mountTestLogin(app);
  customerRoutes(app);
  checkoutRoutes(app);
  orderRoutes(app);
  loyaltyRoutes(app);
  subscriptionRoutes(app);
  debugRoutes(app);

  return app;
}
