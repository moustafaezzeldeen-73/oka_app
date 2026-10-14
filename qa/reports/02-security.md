# 02 — Security & privacy audit: OKA App Theme (test, unpublished)

**Auditor:** security & privacy QA agent · **Date:** 2026-10-14
**Target:** theme `191458214186` (source `/home/user/oka_app/theme`, live settings `qa/settings_data.live.json`), order service `/home/user/oka_app/server`, J&T connector `/home/user/jt-mcp-server/src`.

## Scope and method

- **Read in full:** `layout/*.liquid`, `assets/oka.js`, `assets/oka-screens.js` (all 3,240 lines), `config/*`, the live settings, the orders, track, support, search, 404, product, AR and password sections, `snippets/test-lookup.liquid`, `snippets/order-detail.liquid`, `templates/collection.oka-data.liquid`, `docs/checkout-pixel.js`, the theme README, the server's `app.js`, `auth/*`, `lib/ownership.js`, `lib/http.js` and route list, and `jt-mcp-server`'s `http.ts`, `server.ts`, `analytics.ts`, `shopifyOrders.ts` and README.
- **Grepped for every Liquid output and JS HTML sink** in all remaining sections, snippets and templates.
- **Local validation only.** PoC scripts are in `/tmp/claude-0/-home-user/f8c05fe6-59bd-5456-bf73-9d9620bab1c3/scratchpad/poc/`. They are:
  - liquidjs 10.19.0 rendering the real Liquid files;
  - Playwright 1.56.1 / Chromium with every external request aborted;
  - a loopback-only copy of `jt-mcp-server` running with dummy credentials.

  No request went to the run.app URL, J&T, Bosta, the storefront or any Shopify mutation. No real key value is in this report; PoCs used a stand-in key of `f`×48.
- **Not covered:** the deployed configuration of the Cloud Run service `website-app-649584328410`. Its source isn't local, gcloud has no credentials, and calling it is forbidden. Its `ALLOWED_TOOLS` and whether it implements the theme's `customer_*` actions are therefore unknown. Blast radius below is given as a confirmed minimum and a source-based worst case.

## Findings

| ID | Severity | Area | Title |
|---|---|---|---|
| SEC-01 | Blocker | Secrets | `orders_api_key` / `jt_tracking_key` are printed into `window.OKA` on every theme page for every visitor |
| SEC-02 | Blocker | PII / IDOR | The public key turns order access into "anyone who knows a phone number"; order edit/cancel is authorised only by order number + phone |
| SEC-03 | High | XSS | Customer/order address fields are output into HTML without `escape` (stored XSS confirmed in Chromium with theme code) |
| SEC-04 | High | Storage / shared device | The guest's last order (name, phone, address, items, tokens) persists in localStorage indefinitely; the next user of the browser sees it and can act on it |
| SEC-05 | Medium | Misleading config docs | `settings_schema.json` tells the merchant both keys are "safe in the page" — the opposite of the theme README |
| SEC-06 | Medium | CSRF (dormant) | App-proxy POST routes (cancel order, subscription cancel…) need no body and no anti-CSRF token |
| SEC-07 | Medium | Compliance | Age gate is JS + localStorage only; no-JS clients and crawlers get all tobacco content |
| SEC-08 | Low | Storage | Sign-out leaves `oka.lastOrder`, `oka.lastCheckout`, `oka.vouchers`, `oka.rated` and others behind |
| SEC-09 | Low | Third-party / privacy | model-viewer is loaded from a CDN without SRI; GPS is sent to OpenStreetMap; the camera starts on scroll |
| SEC-10 | Low | Connector hardening | `jt-mcp-server`: CORS is the only "origin" control; non-constant-time key compare; open if the token is unset; no rate limit |
| SEC-11 | Low | Server deps | `npm audit`: 1 critical (proxy-addr), 3 moderate (qs/express/body-parser) |
| SEC-12 | Info | Server auth | App-proxy HMAC, storefront token and test-login guard are sound (details and minor notes) |
| SEC-13 | Info | Git history | No real secrets found in `oka_app` or `jt-mcp-server` history (placeholders only) |
| SEC-14 | Info | Data exposure | `?view=oka-data` publishes exact inventory counts; order numbers appear in URLs |

---

### SEC-01 — Blocker — API key exposed to every visitor

**Refs:**
- `layout/theme.liquid:125-127` renders `orders: { url, key }` when `orders_api_key` is non-blank, into an inline `<script>` that sets `window.OKA`.
- `layout/theme.liquid:135` does the same for `jt: { url, key }`.
- The keys are used by `assets/oka-screens.js:1304-1324` (`jtCall`, header `x-api-key`) and `:1444-1466` (`ordersApi`).

**Who receives it:** every page that uses `layout/theme.liquid`. That is every template except `password` (own layout, no `window.OKA`), `gift_card` and `collection.oka-data` (`layout none`). It includes 404, c