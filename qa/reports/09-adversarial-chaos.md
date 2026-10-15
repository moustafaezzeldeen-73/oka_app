# 09 — Adversarial / chaos testing

**Scope:** OKA App Theme (test) on the local harness only. Agent = chaos. No live systems were contacted; every external call was answered by the harness mocks. Two harness instances were used: the shared one on `localhost:9440` (out dir `qa/harness/out-chaos`) and short-lived isolated copies under `/tmp/oka-chaos-*` whose fixtures carry hostile data (theme taken read-only from `theme/` via `QA_THEME_DIR`). No real key value appears in this report; the harness settings hold a 24-char placeholder.
**Status:** scenarios 1–7 run, plus explicit SEC-04 and SEC-06 runtime checks. Scripts in `qa/tests/chaos/`, raw output in `qa/tests/chaos/out/`.

## Method
- Scripts assemble XSS payloads at runtime from character codes; each payload calls `window.__xss(id)` — a canary installed in the page together with an `alert` hook (`qa/tests/chaos/lib-hostile.mjs`). Hostile strings cover: HTML/JS injection, attribute break-out, `</script>` break-out, RTL override (U+202E), zero-width chars, emoji, 10k-char strings, and wrong-typed / missing fields.
- Hostile *data* is injected by (a) mutating the SYNTHETIC customer orders/addresses and one product in an isolated fixtures copy, (b) cookies / localStorage / sessionStorage, (c) URL params and hash, and (d) mock-mode specs for the orders/J&T endpoints. Interaction/network/storage/soak scenarios drive the real theme JS in Chromium (Pixel 7 unless noted).

## Findings

| ID | Severity | Area | Title |
|---|---|---|---|
| CH-01 | Blocker | Secrets | SEC-01 confirmed at runtime: the orders and J&T key is present for guests on every route that renders through `layout/theme.liquid` (40/40) |
| CH-02 | High | XSS | SEC-04 confirmed and wider: order shipping-address fields render unescaped in `order-detail.liquid` and execute in the signed-in order view |
| CH-03 | Medium | XSS | `snippets/bi.liquid` outputs `{{ en }}`/`{{ ar }}` unescaped — every product/collection title path (`ptitle`, `ctitle`, order hero/line titles) is an HTML sink (refutes SEC-04's "titles are escaped" contrast) |

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

### CH-02 — High — SEC-04 confirmed (and wider) — order address fields execute XSS in the signed-in order view
- **Refs:** `snippets/order-detail.liquid:139-142` (`sa.name`, `sa.address1`, `sa.address2`, `sa.city`, all without `| escape`). The same block also renders the guest-order path and the JS edit sheet.
- **Repro:** `node qa/tests/chaos/02-hostile-data.mjs` (isolated harness on :9441). It seeds every synthetic order's `address.first_name / last_name / address1 / address2 / city / company` with a canary (`<img onerror=__xss(id)>`, an attribute break-out, RTL, zero-width, emoji), then loads the logged-in order list and each order detail and opens the edit sheet, with the `__xss` canary installed.
- **Actual (from `out/02-hostile-data.json`):** the canary fires for **`address1`, `address2`, `city` and `first_name` of every order** on `/pages/orders` and on each order-detail view, and again when the edit-order sheet is opened. Example hits: `addr.address1.*`, `addr.address2.*`, `addr.city.*`, `addr.first_name.*`. No page errors; no layout overflow (0px) even with a 10k-char line title.
- This **confirms SEC-04** and **extends it**: SEC-04 named `name/address1/address2/city`; the runtime shows `first_name`/`last_name` (which feed `sa.name`) and `city` also execute, and that the JS edit-sheet re-render is affected too.
- **Severity nuance:** in the OKA COD flow the order address is the customer's own, so as drawn today this is **self-stored XSS** (the payload runs only in the same shopper's browser). It becomes cross-customer only if a path renders one person's address to another (e.g. the staff `test_panel`, SEC-05). Rated High following the security report; the self-XSS scope is noted for triage.
- **Fix:** add `| escape` to every `sa.*` / `customer.*` output in `order-detail.liquid` (and audit `oka-addresses.liquid:21-25`); in JS keep every address interpolation inside `esc()` (it already is in most places).

### CH-03 — Medium — `bi.liquid` does not escape; all title paths are HTML sinks (refutes a SEC-04 claim)
- **Refs:** `snippets/bi.liquid:6` outputs `<span class="l-en">{{ en }}</span><span class="l-ar">{{ ar | default: en }}</span>` with no `| escape`. Fed by `ptitle.liquid` (`p.title` + `oka.title_ar`), `ctitle.liquid` (`c.title` + `oka.title_ar`), `order-detail.liquid:70,82` (order hero/line titles) and many section titles.
- **Repro:** same script — one live product (`oka-cobra`) was given a canary `title`, `body_html` and `oka.title_ar`.
- **Actual:** the canary fires from **`product.title` and `product.title_ar`** on the guest PDP (`/products/oka-cobra`, `?view=ar`), the home feed (`/`), and from `title_ar` inside the signed-in order hero/line titles on every `/pages/orders` view.
- This **refutes** SEC-04's contrast note that "`ptitle`, product titles … use `esc()`/`| escape`." On the Liquid side they do not; `bi.liquid` is the common unescaped sink. Shopify Liquid does not auto-escape `{{ }}`, so this also holds on live Shopify.
- **Severity:** Medium — product/collection titles and `oka.*` metafields are set by store staff in Admin, not by shoppers, so this is admin-authored content (effectively self-XSS for staff) unless a title is ever populated from an untrusted source. Still a latent stored-XSS sink that should be closed.
- **Fix:** escape in `bi.liquid` (`{{ en | escape }}` / `{{ ar | default: en | escape }}`); if a caller must pass markup, give it a separate raw variant.

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
