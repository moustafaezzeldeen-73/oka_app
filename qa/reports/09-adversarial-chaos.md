# 09 — Adversarial / chaos testing (partial run)

**Scope:** OKA App Theme (test) on the local harness only (`localhost:9440`, out dir `qa/harness/out-chaos`). No live systems were contacted. Every external call was answered by the harness mocks.
**Status:** **Incomplete.** Only scenario 5 (key exposure) was run end to end. Scenarios 1–4, 6 and 7 were **not executed** in this run. Their rows below are marked NOT RUN, and no result is claimed for them.

## Method
- `qa/tests/chaos/01-key-exposure.mjs` checks 60 routes. For each one it fetches the raw HTTP body as a guest and searches it for the harness's placeholder key value and the orders/J&T host. It also loads each HTML route in Chromium (Pixel 7, guest) and inspects `window.OKA` and `window.Oka.CFG`. Last, it checks whether a script on a guest page can read the key and call the (mocked) endpoint.
- Raw results: `qa/tests/chaos/out/01-key-exposure.json`. No real key value appears anywhere. The harness settings carry a placeholder.

## Findings

| ID | Severity | Area | Title |
|---|---|---|---|
| CH-01 | Blocker | Secrets | SEC-01 confirmed at runtime: the orders and J&T key is present for guests on every route that renders through `layout/theme.liquid` (40/40) |

### CH-01 — Blocker — key on every guest page (confirms SEC-01)
- **Refs:** `layout/theme.liquid:125-135` (the `window.OKA` `orders` / `jt` blocks).
- **Repro:** start the harness, then run `node qa/tests/chaos/01-key-exposure.mjs http://localhost:9440`.
- **Actual:**
  - Every response rendered with the theme layout contains the key placeholder twice: once for `orders_api_key` and once for `jt_tracking_key`.
  - Affected route types: home, collections (including paginated/sorted and empty collections), product pages (including `?view=ar` and the 404 for a draft product), all 14 `/pages/*` templates, search, cart, account login/register, policies, the 404 page, and the `/ar/…` versions of these.
  - In the browser, `window.OKA.orders.key` and `window.OKA.jt.key` are both set for a guest. They are the same value, the two URLs are identical, and the key is also reachable through `window.Oka.CFG`.
  - Script on a guest page could read the key and call `track_by_phone` against the mock, which returned 200. This supports the SEC-02 attack path; no live call was made.
- **Not present** in:
  - Section Rendering API responses (`?sections=` / `?section_id=` on collections, products, orders and cart)
  - `/collections/all?view=oka-data`
  - `products.json` / `.js`, `/cart.js`, `/search/suggest`, `robots.txt`, `sitemap.xml`
  - the password page, and the harness stubs (`/checkout`, hosted login, gift card)
- **Expected:** no bearer credential in any HTML sent to the client.
- **Fix:** see SEC-01 (route the calls through the App Proxy / server and remove the keys from theme settings).

## Scenarios executed

| # | Scenario | Result |
|---|---|---|
| 5a | Raw HTML of 60 routes (guest) checked for the key | FAIL: 40/40 layout routes contain it |
| 5b | `window.OKA` in Chromium on 44 HTML routes (guest) | FAIL: present on all layout routes |
| 5c | Section API, `view=oka-data`, product/cart/search JSON checked for the key | PASS: not present |
| 5d | Password page and stubs | PASS: no `window.OKA` |
| 5e | Guest page script reads the key and calls the (mocked) API | FAIL: possible |
| 1 | Hostile data injection / XSS canary across data sources and mocked API responses | NOT RUN |
| 2 | Storage chaos (corrupt, quota, disabled, concurrent tabs) | NOT RUN |
| 3 | Network chaos (latency, 429/5xx, truncation, offline, out-of-order) | NOT RUN |
| 4 | Interaction chaos (rapid clicks, double submit, Back, rotate, input edge cases, phone formats) | NOT RUN |
| 6 | Guest order flow abuse / enumeration at theme level | NOT RUN |
| 7 | 15-minute soak (heap, listeners, DOM, timers) | NOT RUN |
| — | SEC-04 (address XSS) runtime check | NOT RUN (neither confirmed nor refuted here) |
| — | SEC-06 (shared-device last order) runtime check | NOT RUN (neither confirmed nor refuted here) |

## Needs manual test / follow-up
- All NOT RUN scenarios above need a follow-up run.
- Whether the live `…run.app` deployment restricts tools by key (see SEC-03). This needs the owner; calling it from here is forbidden.
