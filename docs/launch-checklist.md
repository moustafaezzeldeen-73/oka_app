# Launch checklist

Everything to do before the app goes to real customers.

## Remove the testing sign-in

- [ ] Delete `server/auth/testLogin.js`, then the `mountTestLogin(app)` line and
      its import in `server/app.js`.
- [ ] In `server/routes/store.js`, remove the `testLoginEnabled` import and the
      `testLogin` field of `signIn` in `/storefront-config`.
- [ ] Delete `app/src/components/TestLoginPanel.js`, then its import and
      `<TestLoginPanel />` in `app/src/screens/SignInScreen.js`.
- [ ] Delete `app/src/api/auth.js`'s `testLogin` export.
- [ ] Remove `TEST_LOGIN_KEY` from the server's environment and
      `EXPO_PUBLIC_TEST_LOGIN` from `app/.env` / EAS environment variables.
- [ ] Delete `server/test/testLogin.test.js` and the "test login does not exist"
      case in `server/test/routes.test.js`.

Even if forgotten, the route refuses to mount when `NODE_ENV=production`.

## Server environment

- [ ] `NODE_ENV=production`
- [ ] `SESSION_SECRET` — 32+ random characters (`openssl rand -hex 32`); the
      server won't start without it in production
- [ ] Shopify, J&T (and Bosta, for old orders) credentials
- [ ] `STAFF_DEBUG_KEY` — or leave unset to hide `/debug/*` entirely
- [ ] `TRUST_PROXY_HOPS=1` when behind a proxy or load balancer
- [ ] `SUBSCRIPTIONS_DATA_DIR` on a persistent disk
- [ ] `JOBS_ENABLED=false` on every instance but one
- [ ] `LOYALTY_START_DATE` — the day points start being earned
- [ ] `MIN_ORDER_EGP` — keep 150, or 0 to match the website
- [ ] `SUPPORT_WHATSAPP` — the support number shown in Help

## Phone sign-in

- [ ] WhatsApp Cloud API: a phone number, a permanent token, and an approved
      **authentication** template; set `OTP_PROVIDER=whatsapp`,
      `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_OTP_TEMPLATE`.

## Shopify

- [ ] Admin API scopes listed in [architecture.md](architecture.md#shopify-scopes),
      including `write_draft_orders`, `read_discounts`, `write_discounts` and
      the store-credit scopes.
- [ ] If the store's delivery rates change, update the estimate table in
      `server/config/zones.js` (orders always use Shopify's own rates).

## App build

- [ ] `eas init` (project id for push notifications), then `eas build`.
- [ ] Android: FCM credentials (`eas credentials`) for notifications.
- [ ] `EXPO_PUBLIC_OKA_SERVICE_URL` set to the production server in the EAS
      build environment.
- [ ] Payments: card and wallet stay hidden until a gateway is connected and
      `PAYMENT_GATEWAY` is set on the server.

## App Store and Google Play

- [ ] Age rating for tobacco references (17+ on the App Store); the app asks
      for 18+ confirmation on first launch.
- [ ] Picnic products live in the catalogue, so the app isn't tobacco-only.
- [ ] Privacy policy and terms URLs (served from `POLICIES_BASE_URL`).
- [ ] Account deletion: Account → Delete account tags the customer
      `deletion-requested`; someone has to process those.
