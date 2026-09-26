# OKA — Expo app

A native port of the OKA App prototype for **Expo SDK 57 / Expo Go on iOS**,
reproducing the prototype's layout, animations and transitions, and wired to the
live OKA Egypt Shopify store.

```bash
npm install
npx expo start        # scan the QR code with Expo Go (iOS, SDK 57)
```

---

## What's here

```
App.js                  screen switcher, canvas gradient, safe-area geometry
src/theme.js            design tokens: colours, easings, durations, shadows
src/rtl.js              instant Arabic/English direction switching
src/data.js             bundled catalogue, copy, loyalty rules
src/store.js            state + actions + derived values (cart maths, tiers)
src/haptics.js          snap feedback for the collection feed
src/components/         ui primitives, animation primitives, icons, tab bar
src/screens/            the screens (shop, cart, checkout, orders, account, search, wishlist, support…)
src/overlays/           AR placement view, edit-order sheet
src/api/                order service client, Storefront cart
src/persist.js          what survives closing the app (cart, language, session)
src/push.js             shipment notifications
assets/                 the prototype's product photography
server/                 order service — holds the Admin, J&T and Bosta credentials
```

---

## Animations and transitions

Every animated value is ported from the prototype's stylesheet rather than
re-invented, so timings match one for one.

| Prototype | Native |
| --- | --- |
| `okaFadeIn .45s ease` (opacity 0→1, translateY 10→0) | `<FadeIn>`, fired on mount — screens remount on navigation, exactly as `sc-if` did |
| `okaPop .5s` (scale .7 → 1.15 → 1) | `<Pop>` via `withSequence` |
| `okaGlow 2.6s ease-in-out infinite` | `<Glow>` — `shadowOpacity` .18↔.30, `shadowRadius` 14↔20 |
| lens `transform .45s cubic-bezier(.22,1,.36,1)` | `withTiming` + `Easing.bezier(.22,1,.36,1)` |
| nav icon `scale(1.22\|0.82) .35s` | per-item `withTiming` |
| collection title / product card `.35s ease` | scale + opacity `withTiming` |
| progress bar `width .3s ease` | animated width in `<Progress>` |
| toggle `background .2s`, knob `left .2s` | `<Toggle>` in the account screen |
| `style-active: scale(x)` | `<Press activeScale={x}>` |
| `style-hover: background` | `<Press activeBg>` (press state on touch) |

CSS blur radii are halved when they become React Native `shadowRadius`; inset
shadows use React Native's `boxShadow` string syntax.

### The collection feed

- **Vertical** — one page per collection (`scroll-snap-type: y mandatory` →
  `pagingEnabled`), with a **medium haptic on every snap**.
- **Horizontal** — one notch per product (`snapToOffsets`), with a **light
  haptic on every notch**, fired as the detent engages rather than at momentum
  end so it feels mechanical.
- The **top selector is bound to the feed**: scrolling vertically slides the
  glass lens onto the active collection and auto-centres the strip; tapping a
  selector item scrolls the feed to that collection.

### Right-to-left

The app opens in Arabic. Direction is applied per-style (`row-reverse`,
`textAlign`, mirrored insets) rather than through `I18nManager.forceRTL`, so the
language toggle is instant — no app reload. Rails render in reverse and open on
their first item, matching `dir="rtl"` overflow behaviour in the browser.

### Geometry

The prototype was drawn in a 402×874 iPhone frame with content 54px below the
top of the screen and the tab bar floating 14px above the bottom. `App.js`
derives both from live safe-area insets (`insets.top - 5`, `insets.bottom - 20`),
which reproduces those exact numbers on a 16 Pro and stays correct elsewhere.

---

## Shopify and courier integration

Two kinds of credential with very different blast radii, kept strictly apart:

**Storefront API (public, optional).** Only the live cart uses it
(`src/useShopifyCart.js`). This token is *designed* to ship in a client; set
`EXPO_PUBLIC_SHOPIFY_STOREFRONT_TOKEN` to enable it. Without it the cart stays
local and checkout still works through the service.

**Admin API, J&T and Bosta (secret, server-only).** The catalogue, checkout,
order history, addresses, loyalty and shipment tracking all run through
`server/`. An Admin token grants full control of the store, and **anything
bundled into a React Native app is readable by anyone who downloads it** — the
JS bundle can be extracted from the `.ipa`, and `app.json` `extra` /
`EXPO_PUBLIC_*` values are plain text. These keys live only in `server/.env`
(gitignored).

Without the service configured the app runs on its bundled catalogue for
browsing; ordering needs the service, and the app says so instead of
inventing an order number.

### Data flow

| Feature | Path |
| --- | --- |
| Store policy | app → `GET /storefront-config` → `server/policy.js` (shipping, minimum, payment methods, governorates, rewards) |
| Collections, products | app → `GET /catalogue` → Admin `collectionByIdentifier` (60 s cache; falls back to bundled data) |
| Sign-in | app → `/auth/otp/start` + `/auth/otp/verify` → one-time code, find-or-create the Shopify customer |
| Cart totals, discount codes, shipping | app → `POST /checkout/quote` → live variant prices + Shopify `draftOrderCalculate` (discounts and the store's shipping rates) |
| Checkout | app → `POST /orders` (signed in) → server re-prices → Admin `orderCreate` |
| Order history + tracking | app → `GET /customer/orders` → Admin orders + J&T (Bosta for older orders) |
| Edit / cancel / redirect | app → `/orders/:name/…` → only the session customer's own, unfulfilled orders |
| Loyalty | app → `/loyalty`, `/loyalty/redeem` → store credit balance; redeeming returns a voucher code |
| Subscribe & Save | app → `/subscriptions` → hourly job → Admin `orderCreate`, re-priced every cycle |
| Notifications | app → `/customer/push-token`; a job pushes "on its way", "delivered", "courier couldn't reach you" |

**J&T Express** is the current courier. Shipments are created with
`txlogisticId = SHOPIFY<order number>` (a re-created one gets `V2`/`V3`), which
is the join key: the service looks up every order's shipment in one batched
`order/getOrders` call, then traces all AWBs (`JEG…`) in one `logistics/trace`
call. Scans become bilingual timeline rows; failed-attempt codes (no answer,
wrong address, refused) become an "Action needed" notice with the courier's
number. **Bosta** is kept as a fallback so orders shipped before the switch keep
their history — its deliveries carry the order number in `businessReference`.

Arabic product titles and descriptions are read from the `oka.title_ar` and
`oka.description_ar` metafields, falling back to the English values when unset.

---

## Security model

- The app holds no secrets. Every route that reads or changes a customer's
  data needs a signed session (`server/auth.js`) and acts only on that
  session's Shopify customer id. Order routes also check that the order
  belongs to that customer.
- Prices, shipping and discounts are computed on the server
  (`server/checkout.js`). The app sends only variant ids, quantities, a code,
  a saved-address id and a payment method.
- Sessions expire after 30 days. `SESSION_SECRET` is required in production.
- Sign-in, one-time codes, quotes, orders and redemptions are rate-limited.
- `/debug/*` answers 404 unless the request carries `x-staff-key: $STAFF_DEBUG_KEY`.

---

## Commercial policy

**Shipping matches the website.** For every quote and order with an address,
the fee is the store's own Shopify rate for that address and basket
(`draftOrderCalculate` → available shipping rates, cheapest one), and the
order's shipping line carries that rate's name. Before an address is chosen,
the app estimates from a copy of the store's fee table in `server/zones.js`:

| Zone | Under 300 EGP | 300 EGP and over |
| --- | --- | --- |
| Cairo, Giza, 6th of October, Helwan, Alexandria | 60 | 36 |
| Delta and Canal | 70 | 46 |
| Upper Egypt, Sinai, Red Sea, Matrouh, New Valley | 80 | 56 |

Update that table if the store's delivery profiles change; orders themselves
always follow Shopify.

The rest lives in `server/policy.js` and can be overridden from the
environment:

| | Default | Why |
| --- | --- | --- |
| Minimum order | 150 EGP | Below ~141 EGP a COD order loses money once failed deliveries (15%, ~80 EGP courier cost each) are counted. The website has none; `MIN_ORDER_EGP=0` matches it |
| Payment methods | Cash on delivery | Card and wallet appear only once a gateway is connected (`PAYMENT_GATEWAY`) |
| Prepaid perk | 10 EGP off the store's shipping rate | Prepaid removes ~12 EGP of expected failure cost; gateway fees take most of it. Off until a gateway is connected |
| Loyalty earn | 1 point per EGP of delivered product — 10% back | The store's choice. Credited only after delivery, so refused parcels earn nothing |
| Loyalty redeem | 200 pts → 20 off 300+, 500 → 50 off 600+, 800 → 80 off 800+, 1500 → 150 off 1,500+ | 10 points = 1 EGP. Each reward is a single-use voucher code worth at most 10% of its minimum basket |
| Subscribe & Save | 5% off, every frequency | The old 15% weekly tier gave away more than the whole margin |

Points earning starts only when `LOYALTY_START_DATE` is set, and only for
orders created on or after it, so switching it on doesn't credit the whole
order history at once.

---

## Sign-in

Customers sign in with their mobile number and a one-time code
(`server/otp.js`). The first sign-in creates the Shopify customer. Checkout
requires sign-in, so every COD order comes from a number that has received a
message.

Set `OTP_PROVIDER=whatsapp` with a WhatsApp Cloud API token, phone number id
and an approved **authentication** template (`WHATSAPP_OTP_TEMPLATE`). During
development `OTP_PROVIDER=console` prints each code in the server log; it is
refused when `NODE_ENV=production`.

### Testing: sign in as any customer (remove before launch)

To test as a real customer without their phone:

1. Set `TEST_LOGIN_KEY` (16+ characters) in `server/.env`, and leave
   `NODE_ENV` unset or `development`.
2. Build the app with `EXPO_PUBLIC_TEST_LOGIN=1`.
3. On the sign-in screen, the red dashed **TESTING** panel takes a phone or
   email and the key, and opens that customer's real account. Every use is
   logged on the server, and the Account screen shows "Test sign-in".

It is contained in two files. To remove it before launch:

1. Delete `server/testLogin.js`, then the `mountTestLogin(app)` line and its
   import in `server/index.js`.
2. Delete `src/components/TestLoginPanel.js`, then its import and
   `<TestLoginPanel />` in `src/screens/SignInScreen.js`.
3. Remove `TEST_LOGIN_KEY` and `EXPO_PUBLIC_TEST_LOGIN` from your env files.

Even if it is forgotten, the route refuses to mount when `NODE_ENV=production`.

---

### Running the service

```bash
cd server
npm install
cp ../.env.example .env   # then fill in the server section
npm start
npm test                  # pricing, sessions, test-login gating, checkout
```

Then point the app at it with `EXPO_PUBLIC_OKA_SERVICE_URL`. Check the wiring:

- `GET /health` — which credentials are set, and whether Shopify, J&T and Bosta
  each answer (J&T's check verifies both the API key and the customer password)
- `GET /debug/jt?order=%232745921` with `x-staff-key` — every J&T shipment
  filed under an order, which one the app picked, and the timeline it builds
  (`&raw=1` for J&T's own records)
- `GET /debug/bosta?tracking=…` with `x-staff-key` — the same for a legacy Bosta AWB

Admin API version defaults to `2026-07`. Admin scopes required:

| Scope | Used for |
| --- | --- |
| `read_orders`, `write_orders` | order history, creating orders, edits, cancels, tags |
| `read_customers`, `write_customers` | sign-in (find or create), addresses, wishlist, push tokens |
| `read_products` | catalogue and live prices |
| `read_fulfillments` | tracking numbers |
| `write_draft_orders` | `draftOrderCalculate`: discount codes and the store's shipping rates |
| `read_discounts`, `write_discounts` | loyalty voucher codes |
| `read_store_credit_accounts`, `read_store_credit_account_transactions`, `write_store_credit_account_transactions` | loyalty balance, earning and redeeming |

Run background jobs (subscriptions, notifications, loyalty earning) on exactly
one instance: set `JOBS_ENABLED=false` on the others. Point
`SUBSCRIPTIONS_DATA_DIR` at a persistent disk.

### Notifications

`server/notify.js` checks orders placed in the app every 30 minutes and
pushes, in the language the order was placed in:

| When | Message |
| --- | --- |
| The courier collects the parcel | "Your order has shipped" |
| Out for delivery (J&T scan 94, Bosta state 41) | "Out for delivery today — have EGP … ready", with the COD amount |
| A delivery attempt fails | "The courier couldn't reach you" (at most once a day) |
| Delivered | "Delivered" |

Each notice is tagged on the order (`notified:…`) so it goes out once, and
events older than a day are tagged without being sent. Tapping a notice opens
that order. Tokens Expo reports as dead are dropped, and signing out
unregisters the device. The app offers notifications on the order
confirmation screen, and in Account.

To make it work:

- Run `eas init` so `app.json` has `extra.eas.projectId`.
- Test on a real phone. Expo Go works on iOS; on Android use a development
  build, since Expo Go on Android has no remote notifications since SDK 53.
- For Android builds, add FCM credentials to the EAS project
  (`eas credentials`).

---

## Notes

- No custom native modules: everything used (Reanimated, Gesture Handler, SVG,
  Blur, Linear Gradient, Haptics, Image) ships inside Expo Go for SDK 57.
- The bundled catalogue is the prototype's 22 products; the live store has 38
  active products across 15 collections, so the live catalogue shows more.
- The Categories screen has no tab of its own, matching the prototype.
