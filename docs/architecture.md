# Architecture

Two programs:

- **`app/`** — the Expo (SDK 57) shop app. Holds no secrets.
- **`server/`** — the order service. Holds the Shopify Admin, J&T and Bosta
  credentials, prices every order, and runs the background jobs.

## Server layout

```
server/
├─ index.js              starts the service and the background jobs
├─ app.js                assembles the Express app — lists every route file
├─ routes/               one file per area (what URL does what)
│  ├─ store.js             /health, /storefront-config, /catalogue   (public)
│  ├─ auth.js              /auth/otp/start, /auth/otp/verify, /auth/me
│  ├─ customer.js          /customer/orders, addresses, wishlist, push-token, delete-request
│  ├─ checkout.js          /checkout/quote, POST /orders
│  ├─ orders.js            /orders/:name/cancel|edit|address, /orders/status
│  ├─ loyalty.js           /loyalty, /loyalty/redeem
│  ├─ subscriptions.js     /subscriptions…
│  └─ debug.js             /debug/jt, /debug/bosta   (staff key only)
├─ auth/                 sessions, one-time codes, and the TESTING-only test login
├─ config/               policy.js (commercial rules), zones.js (governorates, fee table)
├─ services/             checkout, loyalty, notifications, subscriptions, tracking, jobs
├─ integrations/         shopify.js (Admin API), jt.js, bosta.js
├─ lib/                  small helpers: errors, ownership checks, rate limits, timeline, time format
└─ test/                 node:test suites — `npm test`
```

## App layout

```
app/
├─ App.js                screen switcher, safe-area geometry, overlays
├─ app.json              Expo config
└─ src/
   ├─ screens/           one file per screen
   ├─ overlays/          AR viewer, edit-order sheet, age gate
   ├─ components/        UI and animation primitives, icons, tab bar, product grid
   ├─ api/               calls to the server (client.js, auth.js, …)
   ├─ state/             store.js (state, actions, derived totals), persist.js (what survives a restart)
   ├─ hooks/             push registration, pull-to-refresh, wishlist sync, Storefront cart
   ├─ lib/               search/sort/filter, RTL helpers, haptics, AR helpers, build version
   ├─ data.js            bundled catalogue, copy (Arabic + English), default policy
   └─ theme.js           design tokens
```

Navigation is a small stack in `state/store.js` (`goTo`, `goBack`, `goTab`),
ported one-for-one from the prototype; every screen is listed in `App.js`.

## Security model

- The app holds no secrets. Every route that reads or changes a customer's
  data needs a signed session (`server/auth/session.js`) and acts only on that
  session's Shopify customer id. Order routes also check that the order
  belongs to that customer.
- Prices, shipping and discounts are computed on the server
  (`server/services/checkout.js`). The app sends only variant ids, quantities, a code,
  a saved-address id and a payment method.
- Sessions expire after 30 days. `SESSION_SECRET` is required in production.
- Sign-in, one-time codes, quotes, orders and redemptions are rate-limited.
- `/debug/*` answers 404 unless the request carries `x-staff-key: $STAFF_DEBUG_KEY`.

---

## Credentials

Two kinds of credential with very different blast radii, kept strictly apart:

**Storefront API (public, optional).** Only the live cart uses it
(`app/src/hooks/useShopifyCart.js`). This token is *designed* to ship in a client; set
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
| Store policy | app → `GET /storefront-config` → `server/config/policy.js` + `config/zones.js` (fee table, minimum, payment methods, governorates, rewards) |
| Collections, products | app → `GET /catalogue` → Admin `collectionByIdentifier` (60 s cache; falls back to bundled data) |
| Sign-in | app → `/auth/otp/start` + `/auth/otp/verify` → one-time code, find-or-create the Shopify customer |
| Cart totals, discount codes, shipping | app → `POST /checkout/quote` → live variant prices + Shopify `draftOrderCalculate` (discounts and the store's shipping rates) |
| Checkout | app → `POST /orders` (signed in) → server re-prices → Admin `orderCreate` |
| Order history + tracking | app → `GET /customer/orders` → Admin orders + J&T (Bosta for older orders) |
| Edit / cancel / redirect | app → `/orders/:name/…` → only the session customer's own, unfulfilled orders |
| Loyalty | app → `/loyalty`, `/loyalty/redeem` → store credit balance; redeeming returns a voucher code |
| Subscribe & Save | app → `/subscriptions` → hourly job → Admin `orderCreate`, re-priced every cycle |
| Notifications | app → `/customer/push-token`; a job pushes "shipped", "out for delivery", "courier couldn't reach you", "delivered" |

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

## Background jobs

`server/services/jobs.js` runs, in the server process:

| Job | Every | Does |
| --- | --- | --- |
| Subscriptions | hour | Turns due subscriptions into COD orders, re-priced from the live catalogue, shipping from the store's rate |
| Notifications | 30 min | Pushes shipment progress to customers' phones |
| Loyalty | 6 hours | Credits points for delivered orders (from `LOYALTY_START_DATE`) |

Jobs pause until Shopify credentials are set. Run them on exactly one
instance (`JOBS_ENABLED=false` on the others).

## Notifications

`server/services/notify.js` checks orders placed in the app every 30 minutes and
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

## Shopify scopes

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

## Diagnostics

- `GET /health` — which credentials are set, and whether Shopify, J&T and Bosta
  each answer.
- `GET /debug/jt?order=%232745921` with header `x-staff-key: $STAFF_DEBUG_KEY`
  — every J&T shipment filed under an order, which one the app picked, and the
  timeline it builds (`&raw=1` for J&T's own records).
- `GET /debug/bosta?tracking=…` with the same header — the same for a legacy
  Bosta AWB.
