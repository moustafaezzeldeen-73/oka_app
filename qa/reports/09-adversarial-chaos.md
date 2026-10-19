# 09 — Adversarial / chaos testing

**Scope:** OKA App Theme (test) on the local harness only. Agent = chaos. No live systems were contacted; every external call was answered by the harness mocks. Two harness instances were used: the shared one on `localhost:9440` (out dir `qa/harness/out-chaos`) and short-lived isolated copies under `/tmp/oka-chaos-*` whose fixtures carry hostile data (theme taken read-only from `theme/` via `QA_THEME_DIR`). No real key value appears in this report; the harness settings hold a 24-char placeholder.
**Status:** scenarios 1–7 run, plus explicit SEC-04 and SEC-06 runtime checks. Scripts in `qa/tests/chaos/`, raw output in `qa/tests/chaos/out/`. **Not covered:**
- hostile/wrong-typed payloads in mocked orders-API/J&T *responses* (row 1f);
- driving the signed-in Edit/Cancel with another customer's number/phone (row 6d).

Both are listed for follow-up.

**Confirm/refute tally vs earlier reports:**
- **Confirmed:** SEC-01 (CH-01), SEC-04 (CH-02, wider), SEC-06 (CH-12), F-02 and F-05 under latency (CH-07), F-11 (CH-04), F-15 (CH-08).
- **Refuted:** the SEC-04 contrast note that product titles are escaped (CH-03).
- **New:** CH-03, CH-05, CH-06, CH-09, CH-10, CH-11, CH-13.

## Method
- Scripts assemble XSS payloads at runtime from character codes; each payload calls `window.__xss(id)` — a canary installed in the page together with an `alert` hook (`qa/tests/chaos/lib-hostile.mjs`). Hostile strings cover: HTML/JS injection, attribute break-out, `</script>` break-out, RTL override (U+202E), zero-width chars, emoji, 10k-char strings, and wrong-typed / missing fields.
- Hostile *data* is injected by (a) mutating the SYNTHETIC customer orders/addresses and one product in an isolated fixtures copy, (b) cookies / localStorage / sessionStorage, (c) URL params and hash, and (d) mock-mode specs for the orders/J&T endpoints. Interaction/network/storage/soak scenarios drive the real theme JS in Chromium (Pixel 7 unless noted).

## Findings

| ID | Severity | Area | Title |
|---|---|---|---|
| CH-01 | Blocker | Secrets | SEC-01 confirmed at runtime: the orders and J&T key is present for guests on every route that renders through `layout/theme.liquid` (40/40) |
| CH-02 | High | XSS | SEC-04 confirmed and wider: order shipping-address fields render unescaped in `order-detail.liquid` and execute in the signed-in order view |
| CH-03 | Medium | XSS | `snippets/bi.liquid` outputs `{{ en }}`/`{{ ar }}` unescaped — every product/collection title path (`ptitle`, `ctitle`, order hero/line titles) is an HTML sink (refutes SEC-04's "titles are escaped" contrast) |
| CH-04 | Low | Storage | Wrong-typed `oka.wishlist` (`null`) and `oka.pendingCode` (`{}`) throw on load (confirms F-11, adds `pendingCode`) |
| CH-05 | Low | Redirect | Stored `oka.afterSignIn` is followed without validation, including off-site `//host/…` URLs (an open redirect if storage is ever written by an attacker) |
| CH-06 | Medium | Orders / network | A guest's placed order disappears (shows "No orders yet") on any orders-API failure: 500, 502, 429, timeout, CORS, truncated JSON, RPC error |
| CH-07 | Medium | Cart / network | Out-of-order cart responses leave the wrong quantity (+ then − → 3 instead of 2), and a PDP double tap under latency adds twice (confirms F-02 and F-05 under network delay) |
| CH-08 | Low | Errors | Offline add: raw English "Failed to fetch" alert in the Arabic UI, plus an unhandled promise rejection from the PDP buy handler |
| CH-09 | Medium | Forms / i18n | Mobile numbers typed in Arabic-Indic digits (٠١٠…) or with the `0020` prefix are rejected as invalid by add-address (and by the same regex in edit-order) |
| CH-10 | Medium | Orders / cart | "Order again" has no in-flight guard: quick repeat taps add the order's items again (1-item order → 2 in the cart) |
| CH-11 | Low | A11y / UX | Escape closes the side menu but not open sheets (a variant sheet + scrim stay after 12× Escape) |
| CH-12 | High | Privacy | SEC-06 confirmed: on a shared browser, the next visitor (not signed in) sees the previous guest's order (items, name, phone, address, total) and is offered Edit / Cancel |
| CH-13 | Info | Orders API | Theme-level order lookup: the guest path sends only opaque session tokens (no order number or phone); the signed-in path sends order number + phone taken from the page DOM; the theme does no client-side throttling. Protection rests entirely on the server |

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

### CH-04 — Low — wrong-typed storage values crash two screens
- **Refs:** `assets/oka.js:486` (`wishlist.all()` returns the parsed value as-is); `assets/oka-screens.js:1096` (`oka.pendingCode` read, then `.trim()` called on it).
- **Repro:** `node qa/tests/chaos/03-storage-chaos.mjs`. It sets each of the 18 theme storage keys (14 localStorage, 4 sessionStorage) to `null`, `{}`, a string, broken JSON and a 20k-char string, then loads the screen that reads the key (90 cases).
- **Actual:**
  - `oka.wishlist = null` → `/collections/hookahs` throws "Cannot read properties of null (reading 'oka-cloud-white-hookah')" twice; the hearts don't paint.
  - `oka.pendingCode = {}` → `/cart` throws `code.trim is not a function`.
  - The other 87 cases render without errors. `oka.viewed` didn't crash with these values; F-11 crashed it with `{}`, which this run only tried on localStorage keys.
- **Expected:** values that fail to parse or have the wrong type fall back to defaults.
- **Fix:** check the shape inside `store.get` callers (`typeof w === 'object' && w ? w : {}`, `typeof code === 'string'`). Confirms and extends F-11.

### CH-05 — Low — `oka.afterSignIn` is navigated to without validation
- **Refs:** `assets/oka.js:613-619` (`resumeAfterSignIn` → `location.replace(next)`).
- **Repro:** `node qa/tests/chaos/03b-aftersignin-check.mjs` (seeds the value once, then loads `/pages/account` while signed in).
- **Actual:**
  - `{}` → navigates to `/pages/[object Object]` (a 404).
  - `"a string"` → navigates to `/pages/a%20string`.
  - `"//example.invalid/x"` → navigates **off-site** to `http://example.invalid/x`. The harness intercepted and stubbed that request; nothing left localhost.
  - No redirect loop: the value is deleted before the redirect. (The timeouts in the first `03` run came from the test re-seeding the key on every page load. They are a test artifact, not a bug.)
- **Impact:** only theme code writes this key, with fixed internal paths, so this needs an existing storage-write primitive (another XSS, or a shared device). It's defence in depth.
- **Fix:** accept only same-origin paths: `if (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')) location.replace(next)`.

### CH-06 — Medium — guest's order vanishes on any orders-API error
- **Refs:** `assets/oka-screens.js:1650-1667` (`guestLastOrder.load`). The `catch` around `customer_get_order` swallows every error. When no pixel snapshot exists, the code hides the box and shows the empty state.
- **Repro:** `node qa/tests/chaos/04-network-chaos.mjs`. It seeds `oka.lastCheckout` with cart/checkout tokens and no snapshot, then loads `/pages/orders` under each mock mode.
- **Actual:**
  - `success`, `sse` and `empty` show "Your last order #9000101 …".
  - `error500`, `cors`, `timeout`, `malformed` (truncated JSON), `rpc-error` and `not-found` all show **"No orders yet"**. So do a 429 with `Retry-After: 120` and a 502 with an HTML body (the box is simply blank).
  - The shopper is never told the service failed or asked to retry. There are no page errors.
- **Expected:** a transient failure (5xx/429/timeout/network) says "couldn't load your order, try again". Only a definite "not found" should fall back to empty.
- **Fix:** tell `not-found` apart from transport/HTTP errors in that `catch`. For the latter, render a retry notice and honour `Retry-After`.
- J&T tracking (same test, `/pages/track`) handles every failure mode with "We couldn't reach J&T just now…" (PASS). `empty` correctly shows "No scans yet".

### CH-07 — Medium — cart quantity wrong under network reordering; PDP double-add under latency
- **Refs:** `assets/oka-screens.js:1028-1035` (cart −/+ not serialised, F-02); `:509-515` (PDP buy, no in-flight guard, F-05).
- **Repro:** `node qa/tests/chaos/04b-cart-network.mjs`. It sets the cart quantity to 2, makes the first `/cart/change.js` 2.5 s slow, then taps + and − on the cart line.
- **Actual:**
  - The page sent quantities `[3, 1]`. The slow `3` landed last, so the **server cart ends at 3 and the page shows 3**; the shopper wanted 2. The COD total follows the wrong quantity.
  - Separately, with 3 s latency on `/cart/add.js`, tapping PDP "Add to Cart" twice put **2 units** in the cart.
- **Status:** confirms F-02 and F-05 and shows they happen under realistic slow-network timing.
- **Fix:** as F-02/F-05 — serialise cart changes (send absolute target quantities, ignore stale responses) and disable `[data-buy]` while a request is in flight.

### CH-08 — Low — offline add shows a raw error and leaks an unhandled rejection
- **Repro:** same script; go offline, then tap "Add to Cart".
- **Actual:** the alert reads "Could not add / **Failed to fetch**" (English, raw), and the page logs an unhandled rejection `Failed to fetch`. `addToCart` re-throws (`oka.js:223`) and the PDP buy listener (`oka-screens.js:510-515`) doesn't catch it. Screenshot: `qa/reports/screenshots/chaos/offline-add-alert.png`. Confirms F-15 and adds the unhandled rejection.
- **Fix:** map network errors to a localised "You're offline" message; add `.catch(() => {})` in the buy handler.

### CH-09 — Medium — Arabic-Indic digits and the `0020` prefix fail phone validation
- **Refs:** `assets/oka-screens.js:2608` (add-address: `/^(\+?20|0)?1[0125]\d{8}$/` after removing spaces and dashes); `:2002` (`EG_MOBILE` in the edit-order sheet, same pattern). Neither converts ٠-٩ to 0-9.
- **Repro:** `node qa/tests/chaos/07b-reorder-phones.mjs`. It fills the real add-address form (street, area, governorate) with each phone format and submits.
- **Actual:**

  | Input | Result |
  |---|---|
  | `01012345678` | accepted |
  | `+201012345678` | accepted |
  | `0100 123 4567` | accepted |
  | `0100-123-4567` | accepted |
  | `  01012345678  ` (leading/trailing spaces) | accepted |
  | `+20 100 123 4567` | accepted |
  | **`٠١٠١٢٣٤٥٦٧٨`** (Arabic-Indic digits) | **rejected** — "Please add: a valid mobile number" |
  | **`00201012345678`** | **rejected** |
  | `0101234567` (too short) | rejected (correct) |
  | `01912345678` (`019` prefix) | rejected (correct) |

- **Impact:** the store's default language is Arabic. Many Arabic Android keyboards type ٠-٩, so a correct number is refused with a message that doesn't say why. The same applies when changing the phone in the edit-order sheet.
- **Fix:** before testing, convert digits (`.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))` and the Persian ۰-۹), and accept a `00` international prefix (`^(?:\+|00)?20|0`).

### CH-10 — Medium — "Order again" adds the order twice on a quick repeat tap
- **Refs:** `assets/oka-screens.js:1964-1983` (`[data-reorder]`: `addManyToCart` with no busy or disabled state, then `go(cart)`).
- **Repro:** same script. Signed in, open order `#9000105` (1 × The Hexa Party), tap the visible "Order again" 3 times quickly.
- **Actual:** the cart ends with **2 × the-hexa-party**. The first two taps both reached `/cart/add.js` before the redirect to `/cart`. In `07` (button bursts on `/pages/orders`), 10 bursts produced 10 × white hookah + 20 × bowls. That burst also clicked hidden order details programmatically, so it overstates the effect, but it confirms there is no guard at all.
- **Impact:** the COD total gets doubled cart contents if the shopper doesn't notice in the cart.
- **Fix:** disable the button / add `busy` while the add is in flight (the offer buttons already do this).

### CH-11 — Low — Escape doesn't close sheets
- **Repro:** `07` case "menu+sheet+escape+rotate+zoom". Open the cart line's "Change" sheet, open the menu, press Escape 12×, rotate to 740×360 and back, set zoom 2.
- **Actual:** the menu closes. One `.sheet` and its `.scrim` stay open, there is no horizontal overflow, and no errors. `wireMenu` (`oka.js` keydown) only calls `closeMenu()`; sheets (variant, rec, edit-order) have no Escape handler.
- **Fix:** close the top-most sheet on Escape and return focus to its opener.

### CH-12 — High — SEC-06 confirmed: previous guest's order shown, with Edit/Cancel, to the next visitor
- **Refs:** `assets/oka.js:256-264` (`rememberCheckout`), `docs/checkout-pixel.js` (writes the snapshot), `assets/oka-screens.js:1578-1707` (`guestLastOrder`). `oka.lastCheckout` has an `at` timestamp but nothing ever checks it. Sign-out (`:2411`) clears `oka.addr`, `oka.wishlist` and `oka.cancelled` but **not** `oka.lastCheckout` or `oka.lastOrder`.
- **Repro:** `node qa/tests/chaos/05-guest-order.mjs`, part (a). Shopper A's checkout leaves `oka.lastCheckout` (cart and checkout tokens plus a synthetic snapshot) in localStorage. A new, not-signed-in visitor in the same browser opens `/pages/orders`.
- **Actual:** the page shows **"Your last order #9000101 · Processing · OKA white … Delivering to <name> · <phone> · <street>, …"**, and the **Edit order** and **Cancel Order** buttons are present. The snapshot is still stored afterwards. No sign-in or other check stands between the second visitor and those actions; possession of the browser is enough.
- **Status:** **confirms SEC-06** at runtime. The order shown came from the mocked `customer_get_order` answering the stored tokens, which is the path a real placed order takes.
- **Fix:** as SEC-06 — expire `oka.lastCheckout` (hours, not forever), clear it on sign-out and after cancel/delivery, and require a fresh confirmation (e.g. an OTP to the order's phone) before Edit/Cancel.

### CH-13 — Info — what the browser sends for order lookups (scenario 6)
- **Repro:** `05-guest-order.mjs`, parts (b)–(d). The requests to the mocked `…run.app/mcp` are captured.
- **Guest path:** with `oka.lastCheckout` set to arbitrary token strings, the page sends **exactly one** `customer_get_order` with `arguments = { session: { checkoutToken, cartToken } }`. No order number or phone is sent, so a shopper **cannot steer the guest UI to another order by typing a number/phone**. The only handle is the opaque token, and whether a guessed token is accepted is decided by the real service.
  - Mock caveat: the harness mock answers *any* session with order `#9000101` (it doesn't validate tokens). The guessed tokens therefore "worked" here. **This is not evidence about the real service** and is not reported as a finding.
- **Signed-in path:** on `/pages/orders` load the page sends only `track_delivery` (AWBs). `customer_get_order`, `customer_update_order` and `customer_cancel_order` are sent on Edit/Cancel with `{ orderNumber, phone }` read from the order card's DOM `data-order-detail` / `data-phone` (`oka-screens.js:1911`). Whoever controls the DOM controls those two values, so the service must bind the order to the signed-in customer and must not trust number + phone alone. That is SEC-02/SEC-03's concern; this run did not drive it further.
- **Client-side throttling:** 25 back-to-back `customer_get_order` calls from page script each left the page; 26 requests were seen at the route. The theme has no throttle, back-off or lockout. Rate limiting (the API's "too many attempts" message exists in `ordersApiMessage`) must be enforced server-side. Enumeration resistance therefore depends entirely on the live service, which can't be tested from here.

## Scenarios executed

| # | Scenario | Result |
|---|---|---|
| 5a | Raw HTML of 60 routes (guest) checked for the key | FAIL: 40/40 layout routes contain it |
| 5b | `window.OKA` in Chromium on 44 HTML routes (guest) | FAIL: present on all layout routes |
| 5c | Section API, `view=oka-data`, product/cart/search JSON checked for the key | PASS: not present |
| 5d | Password page and stubs | PASS: no `window.OKA` |
| 5e | Guest page script reads the key and calls the (mocked) API | FAIL: possible |
| 1a | Canaries in all 6 synthetic orders' shipping addresses (first/last name, address1/2, city, company) → logged-in order list, 3 order details, edit sheet | FAIL: executes (CH-02) |
| 1b | Canary in `customer.first_name` → `/pages/account` | FAIL: executes (`oka-account.liquid:8`, `customer.name` unescaped) — same class as CH-02, self-XSS |
| 1c | Canary in product `title`, `body_html`, `oka.title_ar` → PDP, AR view, home, collection, search, oka-data JSON | FAIL on PDP, AR view and home (title, title_ar via `bi.liquid`, CH-03); PASS on collection grid, search results and oka-data (escaped / `| json`) |
| 1d | `body_html` canary on the PDP | PASS: no execution (description goes through `strip_html`) |
| 1e | 10k-char line title, RTL override, zero-width chars, emoji in order/address fields | PASS: no crash, 0px horizontal overflow on order pages (the raw oka-data JSON page is wide, as expected for JSON) |
| 1f | Hostile / wrong-typed / oversized payloads in mocked orders-API and J&T responses (canaries in scan text, courier, `sigPicUrl`, order fields; arrays vs objects; 10k scans) | NOT RUN in this pass. Code reading only: every API string goes through `esc()` except `trackingHtml`'s `href="${esc(o.photo)}"` (`oka-screens.js:1406`), which escapes HTML but doesn't restrict the URL scheme. `jtShape`/`summary` assume array/object shapes (`[...scans]`, `quote.lostCodes.join`), so wrong types would throw. **Needs a follow-up run** |
| 1g | Hostile values in URL params (`awb`, `order`, `q`, `view`, `return_to`) | Partly covered: `q` reflected escaped (PASS, also in `01`); `awb`/`order` are written with `textContent` (code). No separate canary run |
| — | SEC-04 runtime check | **CONFIRMED** (CH-02), wider than reported |
| 2a | 18 storage keys × 5 corrupt/oversized values (90 cases) | FAIL ×2 (CH-04: `oka.wishlist=null`, `oka.pendingCode={}`); 87 PASS; 3 `oka.afterSignIn` timeouts were a test artifact (re-checked in 2b) |
| 2b | `oka.afterSignIn` corrupt values, seeded once | FAIL: navigates to junk/off-site URL once (CH-05); no loop |
| 2c | Quota exceeded (`setItem` throws) on 4 pages + wishlist toggle | PASS: no errors |
| 2d | Storage disabled (Safari-private style: the storage getters throw) on 6 pages | PASS: all render, no page errors |
| 2e | Cookies cleared between add-to-cart and `/cart` | PASS (expected): cart shows empty with recommendations; no error |
| 2f | sessionStorage cleared mid-search | PASS: catalogue refetched, results shown |
| 2g | Two tabs toggling wishlist hearts at the same time | INFO: last writer wins. Tab 2's writes overwrote tab 1's (2 of up to 6 hearts survived), with no error. Lost wishlist toggles across tabs; Low UX |
| 3a | Guest last order (`customer_get_order`) under 10 failure modes: 500, 502 HTML, 429 + Retry-After, timeout, CORS, truncated JSON, RPC error, not-found, plus SSE and empty | FAIL ×8 (CH-06: the order silently disappears); PASS for sse/empty |
| 3b | J&T tracking page under malformed / 500 / timeout / empty / tool-error | PASS: localised "couldn't reach J&T" or "No scans yet"; no crash |
| 3c | PDP add with 3 s latency + double tap | FAIL: 2 units added (CH-07 / F-05) |
| 3d | Offline toggled mid add | FAIL Low: raw "Failed to fetch" + unhandled rejection (CH-08) |
| 3e | Cart change out of order (slow +, fast −) | FAIL: server and UI end at 3 instead of 2 (CH-07 / F-02) |
| 3f | Search catalogue with sessionStorage wiped (refetch) | PASS (see 2f) |
| 3g | 30 s latency | Covered by the 8 s `timeout` mock (the request is aborted); same result as 3a/3b. A full 30 s hang wasn't run separately |
| 4a | 10-click bursts on every button: PDP, collection, cart, home, orders | PASS (no page errors) everywhere; **FAIL** on orders: reorder multiplies the cart (CH-10) |
| 4b | PDP "Add to Cart" ×3 quickly (qty 1) | FAIL: 3 units in the cart (F-05 confirmed) |
| 4c | Contact form: 3× submit, 10k-char body, Arabic + Latin mixed, odd email (`foo..bar@x.com`) | PASS: one normal post (`?contact_posted=true`), no errors. Email format is not validated client-side (left to Shopify) — Info |
| 4d | Egyptian phone formats through the real add-address form (10 formats) | FAIL: Arabic-Indic digits and `0020` rejected (CH-09); spaces, dashes, `+20` and trimming PASS |
| 4e | Open the menu while a sheet is open + 12× Escape + rotate + zoom 2 | FAIL Low: the sheet stays open (CH-11); no overflow, no errors |
| 4f | Back during a pending (2.5 s) add-to-cart | PASS: back navigation completes, no errors or stuck spinner |
| 4g | Edit-order typing with 10k / emoji / mixed script | Not run separately: the edit sheet re-render on every keystroke is already shown by F-06; `maxlength` (60/200) caps the input |
| 6a | Guest path request shape with arbitrary stored tokens | INFO: only `session` tokens are sent, never number/phone (CH-13) |
| 6b | Signed-in request shape on load / on Edit | INFO: load = `track_delivery` only; Edit/Cancel send number + phone from the DOM (code, `:1911`) |
| 6c | Client-side rate limiting (25 rapid calls) | FAIL (Info): none in the theme; all requests leave the page |
| 6d | Changing another customer's order number/phone in the signed-in DOM and observing the service | NOT RUN: the outcome depends on the live service (forbidden to call); the request shape is documented in 6b |
| 7 | 15-minute soak, `06-soak.mjs`: one tab, 1270 random navigations across 10 routes with add / heart / menu / stepper / Escape / Back; CDP metrics every 40 iterations, then a forced GC | **PASS**: 0 page errors and 0 navigation errors. During the run, heap swung 5–69 MB, listeners 65–2878 and live documents up to 2364. That is uncollected garbage from navigations plus bfcache: after `HeapProfiler.collectGarbage` everything returns to the start values (heap 1.6→1.6 MB, listeners 74→75, documents 31→15, DOM nodes 982→982). No leak. Limits: full navigations reset each document, so a leak inside one long-lived document (e.g. a single PDP left open for hours) is only covered between navigations; timer counts were not instrumented |
| — | SEC-04 (address XSS) runtime check | NOT RUN (neither confirmed nor refuted here) |
| — | SEC-06 runtime check: next visitor sees the stored guest order + Edit/Cancel; no expiry; not cleared on sign-out | **CONFIRMED** (CH-12) |

## Needs manual test / follow-up
- Follow-up runs: row 1f (hostile mocked API responses, including whether the `sigPicUrl` href, `oka-screens.js:1406`, accepts a script-scheme URL) and row 6d.
- CH-09 on real Arabic Android keyboards (Gboard Arabic, Samsung Arabic): which digit set do they insert in `type=tel` fields?
- CH-12 / SEC-06 on a real shared device with the real checkout pixel (the harness doesn't run Shopify checkout or the pixel).
- CH-06 against the live orders service's real error shapes (429 body, Cloud Run 5xx pages).
- CH-07 / CH-10 on a throttled 3G profile on the live preview.
- Long single-document soak (a PDP or cart left open for an hour, with timers instrumented).
- Whether the live `…run.app` deployment restricts tools by key (see SEC-03). This needs the owner; calling it from here is forbidden.
