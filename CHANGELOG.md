# Changelog

Everything that has changed in the OKA shop app, newest first.

## 2026-09-26 — Launch readiness

The fixes from the full feature review, the move to Expo SDK 57, and a
tidy-up of the repository.

### Repository and tooling
- The Expo app lives in `app/`, the order service in `server/`, guides in
  `docs/`. The root `package.json` runs everything:
  - `npm run setup` installs both and creates the `.env` files with
    development secrets.
  - `npm run dev` starts the server and Expo in one terminal and points the
    app at the server automatically: local network, Codespaces, or a
    cloudflared tunnel.
- App source is grouped: `state/`, `hooks/`, `lib/`, `api/`, `screens/`,
  `components/`, `overlays/`.
- The server is split by job:
  - `routes/` has one file per area.
  - Code is grouped into `auth/`, `config/`, `services/`, `integrations/` and
    `lib/`.
  - `app.js` assembles the app, and `index.js` starts it.
- ESLint (Expo config) for the app. `npm run check` runs lint, the server
  tests and both bundles.
- 34 server tests, including route-level checks that customer and order
  routes refuse requests without a session or from the wrong customer.
- Env files are split into `app/.env.example` and `server/.env.example`.

### Expo SDK 57
- SDK 54 → 57: React Native 0.86, React 19.2, Reanimated 4.5, Worklets 0.10.
- Back-swipe uses `scheduleOnRN` (Worklets) instead of the deprecated `runOnJS`.
- Removed `newArchEnabled` and `edgeToEdgeEnabled`; both are always on now.

### Security
- Every customer and order route needs a signed-in session and acts only on
  that session's customer. Orders are checked for ownership, and order
  numbers can't be probed.
- Removed the master password, the unverified Google/Apple sign-in, and the
  `?identifier=` fallbacks that exposed any customer's data by phone number.
- Phone sign-in with one-time codes, sent by the WhatsApp Cloud API (or
  printed in the server log in development). The first sign-in creates the
  customer.
- Sessions expire after 30 days, and `SESSION_SECRET` is required in
  production.
- Rate limits on sign-in, codes, quotes, orders and redemptions.
- `/debug/*` requires a staff key.
- **Testing only:** sign in as any real customer with a test key. The code is
  in `server/auth/testLogin.js` and `app/src/components/TestLoginPanel.js`, and
  it's refused in production. See `docs/launch-checklist.md`.

### Checkout and pricing
- Orders are priced on the server from live variants. The app can no longer
  set prices or shipping.
- **Shipping matches the website.** The fee is the store's own Shopify rate
  for the address and basket, and the order's shipping line carries that
  rate's name. Before an address is chosen, the app estimates from the
  store's fee table (60/36, 70/46 or 80/56 EGP, with the lower fee from
  300 EGP).
- Discount codes are checked by Shopify's rules and actually charged. Before,
  the shopper was quoted the discount but the order didn't carry it.
- A failed order says why and keeps the cart. It used to show a made-up
  order number.
- Checkout requires sign-in and a saved address. Orders no longer ship to the
  sample customer.
- Cash on delivery only until a card gateway is connected. Prepaid orders
  will then get 10 EGP off shipping.
- Minimum order 150 EGP (`MIN_ORDER_EGP`; 0 matches the website).
- Idempotency keys stop double orders.

### Loyalty
- 10% back: 1 point per EGP of delivered products, 10 points = 1 EGP.
  Points are credited only after delivery, starting from `LOYALTY_START_DATE`.
- Redeeming gives a single-use voucher code (copy it, or apply it to the
  cart). Before, it removed store credit and gave nothing. The points come
  back if the code can't be created.

### Notifications
- Pushes for "shipped", "out for delivery — have EGP … ready", "courier
  couldn't reach you" (once a day at most) and "delivered".
- Messages use the order's language and the courier's name.
- Old events are skipped, and each notice is sent only once.
- Dead phones are dropped.
- Tapping a notice opens the order.
- Signing out unregisters the phone.
- The app offers notifications right after an order is placed.

### Subscriptions
- Re-priced from the live catalogue each cycle, with the store's shipping
  rate. No prices are stored from the app.
- A flat 5% discount (the old 15% weekly tier was above the margin).
- The data file is written atomically, and its location is configurable.

### Shop features
- Search (Arabic spelling variants), sort, and In stock / On sale filters.
- Product page: image gallery, sale price, share, a sold-out state,
  quantities capped at stock.
- Wishlist screen, Order again, Help/FAQ/policies with WhatsApp support.
- Addresses: governorate picker, landmark, delete, optional default,
  delivery estimate.
- Cart, language, wishlist, vouchers and sign-in survive closing the app.
- 18+ age confirmation, and an account deletion request.

### Fixes
- Editing an order could put quantities on the wrong products (lines were
  matched by position). Lines are now matched by product variant.
- Rate limits no longer trust a spoofable `X-Forwarded-For` by default.
- Background jobs pause, instead of erroring, until Shopify is configured.

## Before 2026-09-26

The earlier history of the app, in brief (see `git log` for detail):

- Native Expo port of the OKA prototype: animations, the snap-scrolling
  collection feed with haptics, instant Arabic/English switching, and real AR
  for products with 3D models.
- Live Shopify catalogue, native checkout, order history, editable orders and
  addresses, store-credit loyalty.
- Tracking on Bosta, then on J&T Express, with a merged Shopify and courier
  timeline and "action needed" notices with the courier's number.
- Subscribe & Save as a standalone recurring-order mode.
