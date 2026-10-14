# 02 — Security & privacy audit: OKA App Theme (test, unpublished)

**Auditor:** security & privacy QA agent · **Date:** 2026-10-14
**Target:** theme `191458214186` (source `/home/user/oka_app/theme`, live settings `qa/settings_data.live.json`), order service `/home/user/oka_app/server`, J&T connector `/home/user/jt-mcp-server/src`.

## Scope and method

- **Read in full:** `layout/theme.liquid`, `layout/password.liquid`, `assets/oka.js` (927 lines), `assets/oka-screens.js` (3,240 lines, all of it), `config/settings_schema.json`, `config/settings_data.json`, the live settings, `snippets/test-lookup.liquid`, `snippets/order-detail.liquid`, `sections/oka-orders|oka-track|oka-support|main-search|main-404|main-product|oka-ar|main-password.liquid`, `templates/collection.oka-data.liquid`, `docs/checkout-pixel.js`, the theme README, and the server's `app.js`, `auth/*.js`, `lib/ownership.js`, the guard in `lib/http.js`, and the route list. From `jt-mcp-server` I read `http.ts`, `server.ts`, `analytics.ts`, `shopifyOrders.ts` and the README.
- **Grepped for every Liquid `{{ }}` output and JS HTML sink** across all remaining sections and snippets. JS sinks checked: innerHTML, insertAdjacentHTML, postMessage, eval/new Function, document.write, `javascript:`, cookies, third-party URLs.
- **Validated locally, no live calls.** PoCs in `/tmp/claude-0/-home-user/f8c05fe6-59bd-5456-bf73-9d9620bab1c3/scratchpad/poc/`:
  - liquidjs 10.19.0 rendered the real `layout/theme.liquid` and `snippets/order-detail.liquid` with the live settings (API key replaced by a stand-in `f`×48).
  - Playwright/Chromium ran the real `oka.js` + `oka-screens.js`; every non-local request was aborted.
  - A copy of `jt-mcp-server` ran on loopback with dummy J&T credentials, inside a no-network namespace, only to enumerate which tools a key registers.
  - Server tests ran loopback-only.
- **Not done (safety rules):** no request to the run.app URL, J&T, Bosta, Salestrail, the live storefront, or any Shopify/Render mutation. No real key value is in this report; PoCs use a stand-in. Customer PII is masked.
- **Not covered / needs the deployment owner:** the *deployed* configuration of the `website-app-...run.app` service — its `ALLOWED_TOOLS` and whether it implements the `customer_*` order actions. Its source is not in any local repo and calling it is forbidden, so blast radius is given as a confirmed minimum (from the connector source) plus a source-based worst case.

## Findings

| ID | Severity | Area | Title |
|---|---|---|---|
| SEC-01 | Blocker | Secrets | A live API key is rendered into `window.OKA` on every theme page for every visitor (guest, 404, password, cached) |
| SEC-02 | Blocker | PII / privacy | The website key enumerates any customer's shipments + order contents by phone number (`track_by_phone`) |
| SEC-03 | Critical | Secrets / config | One URL + one key is shared between `orders_api_*` and `jt_tracking_*`; if that endpoint has the connector's default tool set, the public key can create/cancel shipments and read finance/PII |
| SEC-04 | High | XSS | Stored XSS in the signed-in order view: address fields are written to `innerHTML` unescaped in `oka-screens.js` |
| SEC-05 | High | Privacy | `test_panel` staff J&T lookup ships in the theme and is reachable by anyone if the setting is ever on |
| SEC-06 | High | Privacy | Guest "last order" (name, phone, address, items, total) persists in `localStorage` and is shown to the next person on a shared device |
| SEC-07 | Medium | Supply chain | External scripts (`model-viewer`, Nominatim) loaded with no Subresource Integrity / pinned-hash |
| SEC-08 | Medium | Dependency | `npm audit` on the server reports 1 critical (`proxy-addr` IP spoofing) + 3 moderate (`qs`) |
| SEC-09 | Low | Hardening | No theme-controlled CSP / `rel=noopener` is fine but no framing guard; order numbers + AWB travel in query strings (referrer leak) |
| SEC-10 | Info | Good practice | App-proxy HMAC, storefront-token signing, server ownership checks, and the production test-login guard are implemented correctly |

Positives up front (SEC-10): the server side is sound. App-proxy verification uses a constant-time compare and a 300 s replay window (`auth/appProxy.js:44-58`), storefront tokens are HMAC-signed server-side and are **not** forgeable from the theme because the secret (`STOREFRONT_TOKEN_SECRET`) never leaves the server — the page only ever carries a signature (`auth/storefront.js:97-141`, `layout/theme.liquid:129-134`). Every `/customer/*`, `/orders/*`, `/loyalty/*`, `/subscriptions/*` route sits behind `requireSession` and `ownOrder`/`ownAddress` ("not found" either way, so order numbers can't be probed — `lib/ownership.js`). Test-login refuses to mount in production and uses a constant-time key compare (`auth/testLogin.js:194-203`). The server test suite is **66/66 green offline** (it only needs loopback; it binds `127.0.0.1` and makes no external calls).

---

### SEC-01 — Blocker — A live API key is rendered into every page for every visitor

**Files:** `layout/theme.liquid:114-135` (the `window.OKA` block), live values in `qa/settings_data.live.json` (`orders_api_key`, `jt_tracking_key` — a 48-hex key; `orders_api_url` = `jt_tracking_url` = the same `…run.app/mcp`).

**What happens.** `layout/theme.liquid` emits, inline and unconditionally:
- `orders: { url: <orders_api_url>, key: <orders_api_key>, … }` whenever `orders_api_key` is non-blank (line 125-127), and
- `jt: { url: <jt_tracking_url>, key: <jt_tracking_key> }` whenever both are non-blank (line 135).

`layout/theme.liquid` is the layout for **every** storefront page, so the key lands in the HTML of the home page, product pages, cart, search, 404, and any Shopify-cached page. It is not gated on `customer`, on a page type, or on anything else.

**Repro (local, no live call).** `node render.mjs layout <template>` renders the real layout with the live settings (key replaced by `f`×48). For templates `404`, `index`, `customers/login`, `cart`, `search`, `page.oka-orders` the output every time contains, for a **guest**:

```
orders: { url: "https://website-app-...run.app/mcp", key: "ffff…(48)", ratings: false },
jt:     { url: "https://website-app-...run.app/mcp", key: "ffff…(48)" }, customer: null
```

The password page (`layout/password.liquid`) does **not** include `window.OKA`, so the storefront-password splash is clear; the 404 and all normal pages are not.

**Why the "safe in the page" claim is wrong.** `config/settings_schema.json:175` and `:214` tell the operator the key is "safe in the page" because it "can only reach those customer actions" / is "tracking only." That is only true if the *deployed* service enforces it (see SEC-03). The theme README itself (`README.md:40`) says the opposite for the connector token: "Never put that token in the theme … anything in a theme is public." A browser-visible key is readable by every visitor via View Source.

**Expected vs actual.** Expected: no bearer credential in client HTML; the browser should reach the order/tracking service through the Shopify App Proxy (same-origin, Shopify vouches for the signed-in customer — the mechanism the README describes and the server already supports). Actual: a raw key is shipped to every browser.

**Fix.** Route order-change and tracking through the App Proxy / order service (`/apps/oka` → `server/`), exactly as `README.md` describes; the server already holds the J&T connector token out of the browser. If a direct browser→service path must stay, it must be an endpoint that takes **no** standing secret and authenticates the shopper per-request (App-Proxy signature or storefront token), not a shared API key. Remove `orders_api_key`/`jt_tracking_key` from theme settings.

---

### SEC-02 — Blocker — The website key enumerates any customer's shipments and order contents by phone

**Files:** connector `jt-mcp-server/src/server.ts:470-485` (`track_by_phone`), `analytics.ts:512-556`, `shopifyOrders.ts:36-95`; theme caller `oka-screens.js:1337-1346` (`jtByPhone`) and the staff panel `:3110-3139`.

**Confirmed minimum blast radius.** Even in the connector's intended "website" mode (`ALLOWED_TOOLS=track_delivery,track_by_phone`, which I confirmed by enumeration — see SEC-03 PoC), the key that SEC-01 exposes unlocks `track_by_phone`. Given **only a phone number**, it returns that customer's J&T shipments from the last 60 days (up to 10), each with status, full scan history, AWB, created date, and — when the website deployment has `SHOPIFY_STORE_DOMAIN`+`SHOPIFY_ADMIN_TOKEN` set, which the theme's own staff panel assumes — the Shopify **order number and the products ordered** (title, variant, quantity, image) via an Admin API `read_orders` lookup (`shopifyOrders.ts:36-95`). The connector README acknowledges this directly (`jt-mcp-server/README.md:86`: "anyone holding it can see what a phone number ordered — … drop `track_by_phone` from `ALLOWED_TOOLS` before the storefront goes live").

So any visitor who reads the key from the page (SEC-01) can, for an arbitrary Egyptian mobile number, learn whether that person is an OKA customer, what they bought, and where their parcels are. That is a privacy breach of other customers' data — a Blocker by the brief's definition ("leaks … PII").

**No live call was made.** This finding is from the connector source and the theme code that calls it; I did not query the deployed endpoint.

**Fix.** As SEC-01 — remove the public key. Additionally, the website deployment should **not** carry `track_by_phone` at all (README's own advice), and phone→shipment lookups for a signed-in customer should go through the server, which already scopes to the session's own customer.

---

### SEC-03 — Critical — Shared URL + key across `orders_api_*` and `jt_tracking_*`; worst-case the public key is a full shipping/finance/PII console

**Files:** live settings (`orders_api_url` == `jt_tracking_url` == `…run.app/mcp`, and `orders_api_key` == `jt_tracking_key`); connector `jt-mcp-server/src/server.ts:125-137` (the `ALLOWED_TOOLS` filter), `http.ts:11-67`.

**The design intent** (schema text, README) is two *separate* Cloud Run deployments: a locked-down "website" one with `ALLOWED_TOOLS` set, and a full one for Claude's connector. But the live theme points **both** theme settings at the **same** URL with the **same** key. If that one deployment is the restricted one, SEC-01/02 stand as written. If it is **not** restricted (or the theme's `customer_*` order actions required `ALLOWED_TOOLS` to be widened to include write actions), the public key reaches every tool the connector registers.

**Enumerated locally (no live call).** Running the connector copy on loopback with a stand-in key:
- `ALLOWED_TOOLS` unset → `tools/list` returns **all 19 tools**, including `create_delivery`, `create_deliveries`, `cancel_delivery`, `cancel_deliveries`, `list_deliveries`, `get_waybill_info`, `shipment_finance`, `shipment_outcomes`, `phone_followup_report` (the last two expose COD money, governorate/city, and **customer name + phone** for follow-up).
- `ALLOWED_TOOLS=track_delivery,track_by_phone` → `tools/list` returns exactly those **2 tools**.

So the connector's restriction mechanism works; whether it is applied on the live box is unknown to this audit and must be checked by the owner. The authn model (`http.ts:42-50`) accepts the key via `x-api-key` **or** `Authorization: Bearer`; the CORS allow-list (`server.ts:15-18`) only limits *browsers*, and a key lifted from the page can be replayed from any non-browser client (curl, script) with no Origin restriction — confirmed in the PoC: the same request with the key but **no Origin header** returns the full tool list (CORS is not an auth control). A missing key is correctly rejected with 401.

**Worst-case impact if the live endpoint is unrestricted:** anyone with the page key could create or cancel real J&T shipments, read shipment finance (COD in/out), and pull name+phone+city for every recent order via `phone_followup_report`/`shipment_outcomes`. That is the "blast radius" the brief asks about; I state it as conditional because confirming it would require a forbidden live call.

**Fix.** (1) Do not share one key/URL between "tracking" and "order changes." (2) Verify the live `…run.app` deployment has `ALLOWED_TOOLS` set to a read-only, tracking-only set and no `create_*/cancel_*`. (3) Best: remove the browser key entirely (SEC-01). (4) The connector should enforce tool scope by **key**, not rely on a separate deployment that a mis-set env var silently widens.

---

### SEC-04 — High — Stored XSS in the signed-in order view (address fields → innerHTML, unescaped)

**Files:** `oka-screens.js` — `paintLive`/`loadLive` build order HTML; the signed-in order detail is server-rendered and escaped, **but** the guest-order path (`guestLastOrder`, `:1610-1641`) and the edit/quote re-renders write customer-controlled strings through template-literal `innerHTML` using the local `esc()` only where the author remembered it. The order-detail *delivery address* block in `snippets/order-detail.liquid:139-142` outputs `sa.name`, `sa.address1`, `sa.address2`, `sa.city` with **no `| escape`**.

**Repro (local).** `node render.mjs order` renders the real `snippets/order-detail.liquid` with an order whose `shipping_address.name`/`address1` contain `"<img src=x onerror=…>"`. The rendered HTML contains the live `onerror` attribute (not entity-encoded). Loading that fragment in Chromium (Playwright) executed the handler: PoC reported `order-detail stored-XSS executed: true` with 2 injected `<img onerror>` nodes. The address text comes from the order's shipping address, which a shopper can set at checkout and (via the edit-order sheet) afterwards — so the payload is attacker-authored data that renders in the victim's own account page.

**Contrast:** almost everywhere else the theme is careful — `bi.liquid`, `ptitle`, product titles, and the JS helpers use `esc()`/`| escape`, and `{{ cart | json }}` / `| json` are used for the script-tag JSON (`main-cart.liquid:10`, no `</script>` break-out found). The address block is the gap.

**Fix.** Add `| escape` to every `sa.*`/`customer.*`/`a.*` output in `order-detail.liquid` (lines 139-142) and audit the address lines in `oka-addresses.liquid:21-25` and the checkout/guest renders for the same. In JS, ensure every interpolation of API/address data goes through `esc()`.

---

### SEC-05 — High — Staff J&T lookup panel ships in the production theme

**Files:** `snippets/test-lookup.liquid`, render gate `sections/oka-orders.liquid:59-60` (`{% if settings.test_panel %}`), JS `oka-screens.js:3058-3151` (`testLookup`), setting `config/settings_schema.json:229-238` (`test_panel`, default false).

Live `settings_data.live.json` has `test_panel: false`, so it is **off right now** — but the snippet, its controller, and the setting all ship in the theme, and a single settings toggle turns on a phone→all-shipments console on the public `/pages/orders` page for **any visitor** (it reads the same public `jt_tracking_key`). This is the SEC-02 capability exposed as a ready-made UI. The code comments and README say to delete it before publishing; it is still present.

**Fix.** Delete `snippets/test-lookup.liquid`, the render line (`oka-orders.liquid:59-60`), `testLookup()` (`oka-screens.js:3058-3151`, plus the boot hook `:3230-3232`), and the `test_panel` setting before the theme is published.

---

### SEC-06 — High — Guest "last order" PII persists on a shared device and is shown to the next person

**Files:** `oka.js:256-264` (`rememberCheckout` writes `oka.lastCheckout`), `docs/checkout-pixel.js:29-49` (writes name/address/phone/items/total), `oka-screens.js:1578-1707` (`guestLastOrder` renders it on `/pages/orders`).

A guest checkout stores, in `localStorage.oka.lastCheckout`, the order's **name, phone, full address, line items and totals** (checkout-pixel.js) — permanently, with no expiry. On `/pages/orders` with no sign-in, `guestLastOrder` renders all of it, and offers **Edit / Cancel** when the order is still unfulfilled. On a shared/public device (very common for COD retail in the region) the next person sees the previous shopper's order and delivery address and, while unfulfilled, could edit or cancel it.

**Repro (local, Playwright).** With the real `oka.js`+`oka-screens.js`, I seeded `oka.lastCheckout` (fake PII) as the checkout pixel would, then loaded `/pages/orders` as a different visitor (no sign-in). The page rendered "Your last order … Delivering to **Shopper A · 0100000XXXX · 12 Example St … Nasr City, Cairo** … Total (cash on delivery) EGP 1536." No external calls were made.

**Spoofing note (brief's question).** The "which order is mine" decision is the cart/checkout token kept in `localStorage` (`oka.lastCheckout.cartToken`/`checkoutToken`), plus the pixel's snapshot. These are opaque tokens, not forgeable to *another* order (the orders API re-checks them server-side), but they are plain localStorage: anyone with the device reads/replaces them, and the snapshot alone (shown before the API answers) is fully attacker-controllable client-side.

**Fix.** Expire `oka.lastCheckout` after a short window (e.g. hours), clear it on sign-out and on "cancel"/"delivered," and don't render a stored snapshot for edit/cancel without a fresh server confirmation. Consider not persisting address/phone in localStorage at all — fetch it from the server per view.

---

### SEC-07 — Medium — External scripts without Subresource Integrity

**Files:** `oka.js:679` loads `https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js` with no `integrity`/`crossorigin`; `oka-screens.js:2577` fetches from `nominatim.openstreetmap.org` (reverse geocode of the shopper's GPS). The product JSON-LD and OG tags are fine.

A compromised or substituted CDN response for model-viewer executes in the storefront origin. Nominatim receives the shopper's precise coordinates (expected for the feature, but note the third-party data flow for the privacy policy).

**Fix.** Add SRI `integrity` + `crossorigin="anonymous"` to the model-viewer tag (or self-host it in `assets/`). Document the Nominatim geolocation flow in the privacy policy.

---

### SEC-08 — Medium — Server dependency vulnerabilities

**Evidence:** `cd server && npm ci && npm audit` → **4 vulnerabilities (1 critical, 3 moderate)**: `proxy-addr` critical (IP spoofing via IPv4-mapped IPv6 trust subnet) and `qs` (array-limit bypass + DoS) pulled in through `express@4.22.2`/`body-parser`. The `proxy-addr` issue matters here because `app.js:284` sets `trust proxy` from `TRUST_PROXY_HOPS` and rate limits key on the derived IP — spoofable forwarded headers can undercut the rate limiting.

**Fix.** `npm audit fix` (updates `qs`/`body-parser`; bump `express`). Re-run the suite (66/66 currently).

---

### SEC-09 — Low — Clickjacking / referrer leakage within theme control

- The theme can't set response headers, but tracking links carry the order number and AWB in the query string: `order-detail.liquid:167` builds `/pages/track?awb=…&order=<order name>`, and `oka-screens.js:1409-1416` reads them. The "Also see it on the J&T website" link (`oka-track.liquid:16-19`) is `target=_blank rel=noopener` — good — but navigations to the external J&T site can leak the AWB via Referer. Add `rel="noopener noreferrer"` and consider a `referrer` policy meta.
- No framing guard is possible from Liquid; recommend `X-Frame-Options`/`frame-ancestors` at the Shopify/CDN layer (store-level, outside this theme).

**Age gate (brief item 7):** `oka.js:655-669` — the age gate is a pure client-side overlay stored in `localStorage.oka.age`; it does **not** gate content server-side, is invisible to crawlers/no-JS, and is dismissed by a single click with no real verification. Acceptable as UX but **not a compliance control** for a tobacco/hookah store; note it for legal. (Severity: Low as a security issue, but flag for compliance.)

## Git history (secrets)

`git log -p` scanned on both repos (`oka_app`, 103 commits; `jt-mcp-server`):
- **No real secrets committed.** Every `shpat_…`/token/key hit in history is a placeholder (`shpat_xxxxxx…`, `shpat_do_not_leak_me`, `shpat_test…`, `proxy-secret-for-tests`, `you…` in `.env.example`) used in docs or tests — including a regression test (`jt-mcp-server test/config.test.js`) that explicitly asserts the health endpoint never returns a secret's value. Masked matches (locations only): `server`/test files set `SHOPIFY_ADMIN_ACCESS_TOKEN`/`SHOPIFY_APP_PROXY_SECRET` to test constants; `.env.example` holds placeholders. The only occurrence of the live run.app key is in `qa/settings_data.live.json` (already redacted there) and this brief — neither is a leak introduced by history.
- `.gitignore` correctly excludes `.env`, `.env.*`, and `server/data/` (runtime customer records).

## Scenarios executed (coverage record)

- [x] Render `window.OKA` for guest on 404 / index / login / cart / search / orders → **FAIL** (key present every time) — SEC-01
- [x] Confirm password splash excludes `window.OKA` → **PASS** (clean)
- [x] Enumerate tools a key unlocks, `ALLOWED_TOOLS` unset vs tracking-only → confirmed 19 vs 2 — SEC-03
- [x] Key accepted via `x-api-key` and `Bearer`; request with key but no Origin still works (CORS ≠ auth) → **FAIL** — SEC-03
- [x] Request with no key → 401 → **PASS** (auth required when a token is set)
- [x] `track_by_phone` returns other customers' order contents by phone (source review + connector README) → **FAIL** — SEC-02
- [x] Stored XSS via order shipping address in `order-detail.liquid`, executed in Chromium → **FAIL** — SEC-04
- [x] Guest last-order PII shown to a second visitor on the same browser (Playwright) → **FAIL** — SEC-06
- [x] `{{ cart | json }}` / JSON-LD `</script>` break-out → **PASS** (uses `| json`)
- [x] Search term reflected (`main-search.liquid:8` `| escape`; JS builds results with `esc()`) → **PASS**
- [x] Open redirect in `return_to`/checkout/`afterSignIn` → **PASS** (afterSignIn only `location.replace(next)` to an internal path; no attacker-supplied absolute URL sink found)
- [x] `javascript:`/postMessage/eval/document.write sinks → **PASS** (none found)
- [x] External scripts SRI → **FAIL** (model-viewer, Nominatim) — SEC-07
- [x] Storefront token forgeable from theme? → **PASS** (secret stays server-side; page carries only HMAC signature)
- [x] App-proxy HMAC: constant-time compare + 300 s replay window + shop check → **PASS** (`appProxy.js:44-58`)
- [x] Server ownership checks on orders/addresses/subscriptions → **PASS** (`lib/ownership.js`, "not found" either way)
- [x] Test-login disabled in production + constant-time key compare → **PASS** (`testLogin.js:194-203`)
- [x] `test_panel` present in theme, off in live settings → **FAIL** (ships; one toggle exposes it) — SEC-05
- [x] CSRF on state-changing routes: all `/orders|customer|loyalty|subscriptions` mutations are POST behind `requireSession`; proxy/token auth is header/signature-based (not ambient cookies), so classic CSRF doesn't apply → **PASS**
- [x] `cd server && npm ci && npm test` offline → **66/66 PASS** (loopback-only namespace; no external network needed) — the two failures seen with the loopback interface *down* were only the test harness unable to reach `127.0.0.1`, not product behaviour
- [x] `npm audit` (server) → **FAIL** (1 critical, 3 moderate) — SEC-08
- [x] Git history secret scan (both repos) → **PASS** (placeholders only)
- [x] Age gate bypass / crawler/no-JS gating → client-only, bypassable — compliance note (SEC-09)

## Needs manual test on a real device / live preview

- **Confirm the live `…run.app` deployment's `ALLOWED_TOOLS`** (and whether it implements the `customer_*` order actions). This decides whether SEC-03's worst case (public key = create/cancel/finance/PII) is real. Must be done by the owner via gcloud/Render — not callable from here.
- Whether the live service has `SHOPIFY_STORE_DOMAIN`+`SHOPIFY_ADMIN_TOKEN` set (makes SEC-02 leak order contents, not just AWB status).
- The real storefront's response headers (CSP, `X-Frame-Options`, Referrer-Policy) — set at Shopify/CDN level, not visible in the theme source.
- Camera/AR permission prompt behaviour and GPS→Nominatim flow on a real phone (SEC-07 privacy).
