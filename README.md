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
src/screens/            the 12 screens
src/overlays/           AR placement view, edit-order sheet
src/api/                order service client, Storefront cart, loyalty
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

Without the service configured the app runs entirely on its bundled catalogue
and generates local order numbers, so it stays demonstrable offline.

### Data flow

| Feature | Path |
| --- | --- |
| Collections, products | app → `GET /catalogue` → Admin `collectionByIdentifier` (60 s cache; falls back to bundled data) |
| Cart | Storefront Cart API when a token is set, otherwise local |
| Checkout (native) | app → `POST /orders` → Admin `orderCreate` |
| Order history + tracking | app → `GET /customer/orders` → Admin orders + J&T (Bosta for older orders) |
| Single order status | app → `GET /orders/status` → same, for one order |
| Loyalty points | app → `GET /loyalty` → Admin store credit balance × 10 |
| Subscribe & Save | app → `/subscriptions` → hourly scheduler → Admin `orderCreate` |

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

### Running the service

```bash
cd server
npm install
cp ../.env.example .env   # then fill in the server section
npm start
```

Then point the app at it with `EXPO_PUBLIC_OKA_SERVICE_URL`. Check the wiring:

- `GET /health` — which credentials are set, and whether Shopify, J&T and Bosta
  each answer (J&T's check verifies both the API key and the customer password)
- `GET /debug/jt?order=%232745921` — every J&T shipment filed under an order,
  which one the app picked, and the timeline it builds (`&raw=1` for J&T's own
  records)
- `GET /debug/bosta?tracking=…` — the same for a legacy Bosta AWB

Admin API version defaults to `2026-07`. Admin scopes required: `write_orders`,
`read_orders`, `read_customers`, `write_customers`, `read_products`,
`read_fulfillments`, and for the store-credit-backed loyalty balance:
`read_store_credit_accounts`, `read_store_credit_account_transactions`,
`write_store_credit_account_transactions`. Without the store-credit scopes,
`/loyalty` and `/loyalty/redeem` fail and the app falls back to its demo
balance rather than blocking the rest of the app.

---

## Notes

- No custom native modules: everything used (Reanimated, Gesture Handler, SVG,
  Blur, Linear Gradient, Haptics, Image) ships inside Expo Go for SDK 57.
- The bundled catalogue is the prototype's 22 products; the live store has 38
  active products across 15 collections, so the live catalogue shows more.
- The Categories screen has no tab of its own, matching the prototype.
