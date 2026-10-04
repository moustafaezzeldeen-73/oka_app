# Changelog

Everything that has changed in the OKA shop app, newest first.

## 2026-10-03 (later) — A cleaner home feed

### Shopify theme (`theme/`)
- The collection selector strip under the logo is gone; the logo bar is all
  that sits above the feed, and it shrinks once you scroll past the first page.
- Empty collections are hidden everywhere — home feed, categories, search,
  the app data — and come back by themselves once they have an active product
  (`snippets/live-collections.liquid`). On the home feed a collection whose
  products all appeared in an earlier one counts as empty too.
- Offers holds only things you can buy: the bundle offers (and any offer with
  a product). Picture-only promos were removed from it.
- Banners fill the screen: tall posters edge to edge; square and wide ones
  whole, over a blurred copy of themselves, so no text is cut.
- The original site's before/after slider is back, full screen, just above
  OKA Cobra (new `Before / after slider` block): drag sideways to compare;
  it nudges once when it comes into view.
- Portrait lock: on a phone turned sideways the layout is turned back, so
  the shop stays upright as if rotation were locked (and
  `screen.orientation.lock('portrait')` is asked for where browsers allow it).

## 2026-10-03 — Side menu, the website's banners, tracking via the GCP connector

### Shopify theme (`theme/`)
- The bottom tab bar is gone. A collapsible side menu replaces it: a slim
  handle on the leading edge of every screen (and ☰ in the home header) opens
  it; the scrim, ✕, Escape or a swipe back towards the edge closes it. It
  slides from the right in Arabic. Home, categories, search, cart (with its
  badge), orders & tracking, account, points, subscriptions, wishlist,
  support and the language switch live there.
- Offers start with the live website's two bundle offers — the banner and a
  button that adds the whole bundle in one cart call — followed by the
  existing promos. Offer cards take each banner's own shape.
- The live website's graphic banners keep their places: each is a feed page of
  its own, just before the collection it introduces on okaegypt.com. New
  `Banner` block (image, "show before collection", link, optional bundle).
- The feed's collections follow the live homepage's order: Premium Hookahs,
  Parties, Cobra, Dark Tobacco, ready-to-smoke bowls, parts, then basic
  hookahs, hoses, coal and bowls (theme settings → Collections).

### Order service
- J&T tracking can run through OKA's J&T connector on GCP (`jt-mcp-server`):
  set `JT_CONNECTOR_URL` and `JT_CONNECTOR_TOKEN` and every tracking lookup —
  the app's and the website's — calls its `list_deliveries` and
  `track_delivery` tools. Only those two read tools are ever called. The token
  stays in the server's environment; the theme and the app never see it.
  `/health` reports which route J&T is on (`jt.via`).

## 2026-10-02 — The app on the website

### Shopify theme (`theme/`)
- Every app screen as a Shopify theme, in Arabic and English: the collection
  feed, categories, collections, search, product page, cart, checkout review,
  orders, account, addresses, loyalty, subscriptions, wishlist, support, sign-in,
  age gate and AR. Packaged as `dist/oka-theme.zip`; see `theme/README.md`.
- Signing in is optional; guests see what an account gets them (live
  tracking, points on the order) and can check out without one.

### The website reaches the order service
- `server/auth/appProxy.js`: Shopify App Proxy requests (`/proxy/*`) are
  verified and run as the storefront's signed-in customer, so the website gets
  the app's live J&T timeline, courier call and WhatsApp, edit and cancel,
  points redemption and subscriptions from the same routes.
- New setting `SHOPIFY_APP_PROXY_SECRET`; `render.yaml` deploys the service.

## 2026-09-30 — Merged the base branch's September 29 work

Four commits landed on the base branch while this work was open. They were
written against the old flat layout and are carried into the new one here.

### Shipping follows Shopify everywhere
- Estimates before an address is chosen (cart, product page) and for an
  address Shopify has no rate for now come from the store's delivery profile,
  read live from Shopify (`GET /shipping/scheme`, 5-minute cache). The fee
  table is only the fallback when Shopify can't be read.
- The cart and product page bar names the next cheaper tier: "add 60 EGP more
  and shipping drops to 36 EGP", or free shipping where the store offers it.
- Checkout shows the rate's name, and says when shipping is still an estimate.
- Addresses saved before the governorate picker are matched to a governorate
  from their text — Arabic or English, including district names like
  "مدينة نصر" or "Sheikh Zayed" — so they price and route like new ones.
- Needs the `read_shipping` Admin scope.

### Orders
- Invoice on every order: each line at the price actually charged (after
  every discount, following edits), then subtotal, discount, shipping, total,
  payment method and the cash to have ready.
- Cancelling confirms with a message, shows the order as cancelled at once
  (Shopify cancels in the background), and a red banner says when. Cancel is
  disabled on cancelled and shipped orders; cancelling twice is not an error.

### Fixes
- The home feed and the category strip no longer bounce each other up and
  down on iOS.
- The catalogue loads even when Shopify's per-query cost limit would refuse
  it: an over-budget query is split in half until it fits. Throttled Admin
  API calls are retried.
- 3D models are looked up directly instead of scanning every product's media.

### App
- Splash screen configured through the `expo-splash-screen` plugin (SDK 57).
- Build tag `oka-v24`.

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
