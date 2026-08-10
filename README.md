# OKA — Expo app

A native port of the OKA App prototype for **Expo SDK 54 / Expo Go on iOS**,
reproducing the prototype's layout, animations and transitions, and wired to the
live OKA Egypt Shopify store.

```bash
npm install
npx expo start        # scan the QR code with Expo Go (iOS, SDK 54)
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
src/api/                Storefront client, order service client, loyalty
assets/                 the prototype's product photography
server/                 order service — holds the Admin + Bosta credentials
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
shadows use RN 0.81's `boxShadow` string syntax.

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

## Shopify integration

Two credentials with very different blast radii, kept strictly apart:

**Storefront API (public, bundled).** Reads published collections/products,
full-text search, and owns the cart. This token is *designed* to ship in a
client. Create it in Shopify admin → Settings → Apps and sales channels →
Develop apps → your app → **API credentials → Storefront API access token**,
then set `EXPO_PUBLIC_SHOPIFY_STOREFRONT_TOKEN`. Scopes needed:
`unauthenticated_read_product_listings`, `unauthenticated_read_collection_listings`,
`unauthenticated_write_checkouts`.

**Admin API + Bosta (secret, server-only).** Creating orders, reading a
customer's history, and pulling delivery status all happen in `server/`. An
Admin token grants full control of the store, and **anything bundled into a
React Native app is readable by anyone who downloads it** — the JS bundle can be
extracted from the `.ipa`, and `app.json` `extra` / `EXPO_PUBLIC_*` values are
plain text. There is no way to hide it client-side, which is why checkout posts
to the service instead.

Without either configured the app runs entirely on its bundled catalogue and
generates local order numbers, so it stays demonstrable offline.

### Data flow

| Feature | Path |
| --- | --- |
| Collections, products | Storefront API → `fetchCatalogue()` (falls back to bundled data) |
| Search | Storefront API `products(query:)` |
| Cart | Storefront Cart API (`cartCreate` / `cartLinesAdd`) |
| Discount codes | `cartDiscountCodesUpdate` |
| Checkout (native) | app → `POST /orders` → Admin `orderCreate` |
| Order status | app → `GET /orders/status` → Admin order + Bosta timeline |
| Loyalty points | app → `GET /loyalty` → Admin store credit balance × 10 |

Bosta deliveries carry the Shopify order name in `businessReference`
(e.g. `#2599321`) — that is the join key between the two systems.

Arabic product titles and descriptions are read from the `oka.title_ar` and
`oka.description_ar` metafields, falling back to the English values when unset.

### Running the service

```bash
cd server
npm install
SHOPIFY_SHOP_DOMAIN=okaegypt.myshopify.com \
SHOPIFY_ADMIN_TOKEN=shpat_… \
BOSTA_API_KEY=… \
npm start
```

Then point the app at it with `EXPO_PUBLIC_OKA_SERVICE_URL`.

Admin scopes required: `write_orders`, `read_orders`, `read_customers`,
`write_customers` (for the redemption metafield), `read_fulfillments`.

---

## Notes

- No custom native modules: everything used (Reanimated, Gesture Handler, SVG,
  Blur, Linear Gradient, Haptics, Image) ships inside Expo Go for SDK 54.
- The bundled catalogue is the prototype's 22 products; the live store has 38
  active products across 15 collections, so the Storefront path shows more.
- The Categories screen has no tab of its own, matching the prototype.
