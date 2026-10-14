# OKA theme — local storefront harness

A local emulation of the Shopify storefront for the theme in `theme/`, so QA can
drive every page with Playwright while the live store/CDN are unreachable.
Liquid is rendered with [liquidjs](https://liquidjs.com) plus Shopify-specific
objects, filters and tags; data comes from read-only Admin API exports of the
real store.

## Start

```bash
cd qa/harness && npm install          # once (liquidjs, express, @google/model-viewer)
node qa/harness/server.mjs            # from the repo root → http://localhost:9292
PORT=9310 QA_OUT_DIR=/tmp/qa-agentA node qa/harness/server.mjs   # several in parallel
```

| Env | Default | Meaning |
| --- | --- | --- |
| `PORT` | `9292` | listen port |
| `QA_OUT_DIR` | `qa/harness/out` | where logs go (use one per concurrent server) |
| `QA_SETTINGS` | `qa/settings_data.live.json` | theme settings (merged over `config/settings_schema.json` defaults; re-read on every request — point at an edited copy to test e.g. `proxy_path`, `whatsapp`, `test_panel`, `min_order`) |
| `QA_MOCK_MODE` | `success` | default external-API mock mode (see Mocks) |
| `QA_SEARCH_METAFIELDS` | `1` | `0` = `/search` ignores the `oka.title_ar` metafield (Shopify's default search doesn't index metafields unless Search & Discovery is configured) |
| `QA_THEME_DIR` | `theme/` | theme to render |
| `QA_NO_CACHE` | – | `1` = re-parse Liquid on every request (when editing a theme copy) |
| `QA_WARN_STDERR` | – | `1` = also print every non-info render warning to stderr |

Smoke test (starts its own server on 9391): `node qa/harness/smoke.mjs` → `qa/reports/smoke.md`, `smoke.json`, screenshots in `qa/reports/screenshots/harness-smoke/`.
Rebuild fixtures after re-exporting `qa/fixtures/raw/*.json`: `node qa/harness/build-fixtures.mjs`.

## Outputs (`$QA_OUT_DIR`)

| File | Content |
| --- | --- |
| `render-warnings.json` | per page (`GET <url> [locale(,customer)]`): every unknown variable / property / filter / tag / setting / missing file, each classed `harness-gap` (Shopify supports it, we don't), `theme-suspect` (Shopify would also return nil/error → likely theme bug), `uncertain`, or `info` (benign, e.g. optional `render` params, template fallbacks). The page's non-info count is also in the response header `x-qa-render-warnings`; `x-qa-template` names the template used. `GET /__qa/warnings` = last page's list. |
| `external-calls.jsonl` | every request to a non-local host (method, url, headers with keys masked, JSON body, tool name, mock mode, response) and every local stand-in for a CDN asset |
| `checkouts.jsonl` | what the storefront handed to checkout: items, prices, discounts, note, attributes, codes, cart token |
| `forms.jsonl` | customer/contact/address form posts (field names only, no values except province) |

## Routes

All routes also work under `/ar/…` (Shopify's alternate-locale URL: `request.locale` = ar, non-primary, product/collection/page **translations applied** as Translate & Adapt would). `?locale=ar` also works.

| Route | Template / behaviour |
| --- | --- |
| `/` | `index.json` |
| `/collections` | `list-collections.json` |
| `/collections/:handle` (`?sort_by=`, `?filter.v.availability=1`, `?filter.v.price.gte/lte`, `?filter.p.product_type/vendor/tag`, `?page=`) | `collection.json` (or `collection.<suffix>`); `all` = all live products |
| `/collections/all?view=oka-data` | `collection.oka-data.liquid` — the theme's catalogue JSON (`?view=` selects any `type.view` template) |
| `/collections/:h/products.json` | Shopify's public collection JSON |
| `/products/:handle` (`?variant=`), `/collections/:c/products/:handle` | `product.json` (resource `template_suffix` honoured with fallback, e.g. hookahs carry `product-oka` → falls back to `product`) |
| `/products/:handle?view=ar` | `product.ar.json` (the theme links to it as `p.url | append: '?view=ar'`) |
| `/products/:handle.js` / `.json` | AJAX product JSON / public product JSON |
| `/pages/:handle` (`?view=`) | `page.<template_suffix>` — real pages: account, orders, addresses, loyalty, subscriptions, wishlist, support, checkout-review, track, about-us, how-to-use, contact, faq (suffix `faq` has no template → `page`), online-store |
| `/search?q=` | `search.json`; matching folds Arabic (ة/ه, ى/ي, أإآ/ا, diacritics, tatweel, Arabic-Indic digits) |
| `/search/suggest(.json)?q=` | predictive search JSON |
| `/recommendations/products(.json)?product_id=&limit=&intent=` | JSON (or `section_id=` HTML) |
| `/cart` | `cart.json` |
| `GET /cart.js`, `POST /cart/add.js` (JSON or form, `id`/`quantity`/`properties` or `items[]`), `/cart/change.js` (`id` = key or variant id, or `line`), `/cart/update.js` (`updates`, `note`, `attributes`, `discount`), `/cart/clear.js` | Cart AJAX API, stateful per `qa_sid` cookie. Errors: 422 sold out (`The product 'X' is already sold out.`), 422 over inventory (`You can only add N X to the cart.` / `You can't add more X to the cart.`), 422 `Cannot find variant` (unknown or non-live variant), 400 missing items / unknown line. `sections=` param returns rendered sections. |
| `/cart/add`, `POST /cart`, `/cart/change?…`, `/cart/clear` | non-AJAX form posts (redirect) |
| `/cart/VARIANT:QTY,…` | cart permalink → checkout stub |
| `/discount/CODE?redirect=/cart` | adds the code to the cart (`discount_codes`) |
| `/checkout`, `/cart/checkout`, `/checkouts/*` | **stub** page + `checkouts.jsonl` record |
| `/account`, `/account/addresses`, `/account/orders/:id` | `customers/*` (logged-in only, else 302 → `/account/login?return_url=`) |
| `/account/login`, `/account/register`, `/account/reset/:id/:token`, `/account/activate/:id/:token`, `/account/logout` | classic customer templates and form handlers (`POST /account/login` with password `wrong` → error; any other → logged in) |
| `/customer_authentication/login?return_to=` | stub of Shopify-hosted sign-in (new customer accounts; `routes.storefront_login_url` points here) |
| `POST /account/addresses`, `POST /account/addresses/:id` (`_method=delete/put`) | address forms (session copy of the fake customer) |
| `POST /contact` | contact form → `?contact_posted=true` → `form.posted_successfully?` |
| `/policies/:handle` | Shopify-rendered policy (refund-policy, privacy-policy, shipping-policy, terms-of-service, contact-information) inside the layout |
| `/password`, `/gift_cards/:code`, anything else → `404.json` (status 404) |
| `?sections=a,b` / `?section_id=a` on any page | Section Rendering API (template section keys like `main`, or section file names like `main-cart`) |
| `/apps/oka/*` | App-proxy (order service) mock — only used if `proxy_path` = `/apps/oka` |
| `/cdn/shop/t/<id>/assets/<file>` | `theme/assets` (what `asset_url` returns) |
| `/cdn/shop/…` | image placeholder (SVG at the real image's dimensions, scaled to `?width=`) |
| `/cdn/shopifycloud-mirror/…` | stand-ins for cdn.shopify.com videos (empty mp4) and 3D models (a 0.3 m box `.glb`; `.usdz` → 404) |

QA control: `GET /__qa/health`, `/__qa/warnings[?all=1]`, `/__qa/session`, `POST /__qa/reset` (empty cart, fresh customer), `/__qa/login?return_to=`, `/__qa/logout`, `/__qa/mock?mode=`, `POST /__qa/external` (used by `pw.mjs`).

## Cookies

| Cookie | Meaning |
| --- | --- |
| `qa_customer=1` | logged in as the **fake** customer in `qa/fixtures/customer.json` (3 Egyptian addresses: Cairo default, Giza, Aswan; 6 orders `#9000101…#9000106`: unfulfilled COD, partially fulfilled with J&T AWB, fulfilled with "tong free" discount, cancelled, paid+fulfilled, unfulfilled small order; 2500 piasters store credit = 250 points). `?qa_customer=1` on any URL sets it. |
| `qa_sid` | session (cart, flash messages, the customer's address edits). In memory: restarting the server resets it. |
| `qa_mock=<spec>` | external mock mode (below). `?qa_mock=<spec>` on any URL sets it. |

## Mocks (external hosts)

The theme calls `https://website-app-…run.app/mcp` (orders API: `customer_get_order`, `customer_quote_order`, `customer_update_order`, `customer_cancel_order`, `customer_rate_order`; J&T website tracking: `track_delivery`, `track_by_phone`), `nominatim.openstreetmap.org` (address from GPS), `ajax.googleapis.com` (model-viewer), and links to `wa.me` / `jtexpress-eg.com`. With `pw.mjs` **every** non-local request is intercepted, logged, and answered from `lib/mocks.mjs`; nothing reaches the internet (model-viewer 4.0.0 is served from npm).

`<spec>` = a mode, or `tool:mode` overrides plus a default, e.g. `customer_get_order:timeout,track_delivery:malformed,success`.

| Mode | Response |
| --- | --- |
| `success` | realistic JSON-RPC `result.content[0].text` payloads built from the fake customer's orders and the zone fees in settings |
| `sse` | the same as `text/event-stream` (`data: {…}`) |
| `cors` | 200 without `Access-Control-Allow-Origin` (browser blocks it — what a non-whitelisted origin gets) |
| `error401` / `error500` | HTTP 401 / 500 |
| `timeout` | request hangs, then aborted (`externalTimeoutMs`, default 8 s in pw.mjs) |
| `malformed` | truncated JSON |
| `rpc-error` | JSON-RPC `error` (MCP input validation) |
| `tool-error` / `not-found` / `shipped` | `result.isError` with a generic / "couldn't find an order" / "already been shipped" message |
| `empty` | no scans / no shipments |

The orders-API payload shapes are inferred from the theme's consumers in `assets/oka-screens.js`; the real service contract wasn't available here.

## Playwright helper (`pw.mjs`)

```js
import { launch, startServer } from './qa/harness/pw.mjs';
const srv = await startServer({ port: 9310, outDir: '/tmp/qa-me' });   // optional
const s = await launch({ baseURL: srv.url, device: 'Pixel 7', locale: 'en', loggedIn: true,
  cameraPermission: 'denied', mocks: 'customer_cancel_order:error500', agent: 'orders-tester' });
await s.goto('/pages/orders');               // waits for load + 400 ms
await s.shot('orders-list');                  // qa/reports/screenshots/orders-tester/orders-list.png
s.logs.console / pageErrors / requestFailed / httpErrors / external / documents
await s.close(); await srv.stop();
```

- `device`: any Playwright device (`'iPhone 13'`, `'Pixel 7'`, …) run in Chromium, or `'Desktop 1440'`, `'Desktop 1024'`, `'Small 320'`.
- `locale`: seeds the theme's language once per context (`localStorage['oka.lang']`) and Accept-Language; `urlLocale: true` also prefixes paths with `/ar`.
- `ageConfirmed` (default true) pre-answers the 18+ gate; pass `false` to test it.
- `cameraPermission`: `granted` = Chromium fake camera (`--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`, green test pattern) + permission granted; `denied` = `getUserMedia` rejects `NotAllowedError`; `none` = `NotFoundError` and no devices (both simulated in an init script).
- Geolocation is granted at Nasr City, Cairo.
- `s.setMocks(spec)`, `s.setLoggedIn(bool)`, `s.renderWarnings()`, `s.clearLogs()`.

## Fixtures (`qa/fixtures/`)

Exported 2026-10-14 with read-only Admin GraphQL queries (`raw/*.json`), normalised by `build-fixtures.mjs`:
50 products (37 ACTIVE+published, 7 DRAFT, 6 ARCHIVED) with variants, inventory/policy, media (images, 3D models, videos), all metafields (`oka.title_ar`, `oka.description_ar`, `custom.*`, `what.123`, `shopify.*`, …) and Arabic translations; 15 collections with admin product order, sort order, `oka.title_ar`, translations; 14 pages; 3 menus; 5 policies; 264 Files (for `shopify://shop_images/…` settings); the 4 real automatic discounts; shop money format (`{{amount}} EGP`), locales (en primary, ar published), timezone Africa/Cairo.
Edge cases present in real data: sold out with `deny` policy (`1-pcs-of-foil`, `3-coconut-coal-pcs`), compare-at prices (`oka-cobra-oka-base`, `trio-party`, `the-hexa-party`), negative inventory with `continue` (most products), products without `oka.description_ar`, draft/archived products inside theme collections, empty collections (`bundles`, `sale`, `heat-managment-device`). **Not present in the store:** multi-variant products and products without images — variant pickers / no-image paths can't be tested with real data.
No customer data was exported: `customer.json` is synthetic. Code discounts `QA10`, `QA50OFF`, `QAMIN300` (min 300 EGP), `QAFREESHIP`, `QAEXPIRED` are **fake** (the store has no active codes).

## Known fidelity gaps vs real Shopify (read before filing a bug)

- **Checkout is not emulated.** `/checkout` is a stub that records the hand-off. Shipping rates, COD fee, store-credit redemption, checkout validation and the checkout pixel (`docs/checkout-pixel.js`) never run.
- **Images/videos/3D:** CDN files are placeholders (correct dimensions when known); videos are empty files (no playback); 3D models are a generic box GLB, `.usdz` (iOS Quick Look) 404s. Real AR (Scene Viewer / Quick Look / WebXR) can't run in headless Chromium.
- **Liquid engine** is liquidjs, not Shopify's Ruby Liquid: floats print without a trailing `.0` (`189` vs `189.0`); integer division and half-away-from-zero rounding are emulated; `json` escapes `< > &` like Rails (assumed, unverified); error messages differ; lax-parsing quirks of Shopify's parser aren't reproduced.
- **Shopify objects** are modelled for what this theme uses (+ common properties); exotic properties log `harness-gap`. `customer.store_credit_account.balance` is an integer in the currency subunit (matches Shopify's documented output). `shop.url`/`canonical_url` use the real primary domain `https://www.okaegypt.com`; `request.host` is the local host.
- **Discounts:** the 4 real automatic discounts (tong free, Valentines, Trio/Hexa Party) are re-implemented from their Admin definitions; none combine, so the single best one applies, and a code only applies if it beats them. Shopify's real allocation/selection rules may differ in edge cases. Cart error texts are close to, not guaranteed identical to, Shopify's.
- **Sorting/search/recommendations:** `best-selling` uses the admin collection order (no sales data); search, predictive search and recommendations use simple local algorithms, not Shopify's.
- **Customer accounts:** the store appears to use *new* customer accounts (its menu links to `account.okaegypt.com`), where `/account/*` theme templates are not shown and sign-in is Shopify-hosted. The classic templates are rendered anyway for coverage; the hosted sign-in is a stub.
- **Locales:** only `title`/`body_html` translations exist; the theme's `locales/*.json` contain one key. Market/currency switching isn't emulated (EGP only).
- **content_for_header** only defines `window.Shopify` (shop, locale, currency, theme, routes.root); Shopify's analytics, web pixels, preview bar, consent and checkout-prefetch scripts are absent.
- **App proxy** (`/apps/oka`) responses and HMAC signing are mocked; with the live settings `proxy_path` is empty, so the theme doesn't use it.
- Sessions are in memory per server process; fixtures are a 2026-10-14 snapshot.
