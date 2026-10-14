# 05 — Code correctness & robustness review (OKA App Theme, test/unpublished)

**Reviewer:** code-correctness agent  **Date:** 2026-10-14  **Branch:** `claude/vigilant-edison-1v8qwz`

## Scope
Every file in `/home/user/oka_app/theme` (layout, 27 sections, 18 snippets, 28 templates, config, locales, assets).
`assets/oka.js` (927 lines), `assets/oka-screens.js` (3240 lines) and `assets/oka.css` (1550 lines) were read in full.
Focus: functional correctness and robustness (Liquid, JS logic, CSS/layout, browser support, regressions).
Security, money math and store data are covered by other reports and only touched where they intersect.

## Method
- Line-by-line read of all Liquid/JS/CSS.
- Static tooling: Shopify Theme Check (`@shopify/theme-check-node` 3.30.1, recommended + `all` configs) → `qa/reports/theme-check-correctness.txt`;
  `node --check` on both JS assets; ESLint 10 with a browser flat config (`qa/tests/lint/eslint.config.mjs`) → `qa/tests/lint/eslint-output.txt`;
  every `{% schema %}` block, `templates/*.json`, `config/*.json`, `locales/*.json` parsed with Node; every template's section `type` checked for an existing section file.
- Dynamic proofs: the real theme assets loaded in jsdom (`qa/tests/code/harness.js`) with mocked `fetch`/`getUserMedia`/`IntersectionObserver`, and the real `oka.css` in Playwright Chromium. Scripts `qa/tests/code/t1…t8-*.js`, outputs in `qa/tests/code/out/`.
- Read-only Admin API queries (shop locales, product variant counts). No mutations, no theme writes, no calls to the orders/J&T endpoints.
- `git log -p` of the last 15 theme commits reviewed for regressions.

## Not covered / limits
- The live storefront and real devices are unreachable from this container: everything about real iOS/Android/WebView behaviour is reasoned from code + Chromium emulation and listed under "Needs manual test".
- Money math (fees, totals, store credit) → money report; secret exposure (`orders_api_key`, `jt_tracking_key` in page source, test panel) → security report.

## Static results summary
| Check | Result |
|---|---|
| `node --check oka.js / oka-screens.js` | PASS (both parse) |
| ESLint (no-undef, no-redeclare, eqeqeq, no-unused-vars, no-shadow…) | 0 errors, 9 warnings — all benign: 5× `no-shadow` (`t`, `raf`, `go`, `product`), unused `ADDR_LIMITS` and `openEditSheet` (dead code, see F-20), 1× promise-executor-return (harmless `setTimeout` in `new Promise`) |
| Theme Check (recommended) | 4 offenses: 2× `ImgWidthAndHeight` (main-product.liquid:123, oka-ar.liquid:36), 2× `BlockIdUsage` (oka-home.liquid:103,118 — comparing block ids, acceptable) |
| Theme Check (all) | + `AssetSizeCSS` (oka.css 105 KB > 100 KB), `AssetSizeJavaScript` (both scripts on every page) |
| Section schemas (27) | all valid JSON; setting/block ids unique; `oka-home` max_blocks 30, `limit`s valid; presets present where blocks exist |
| templates/*.json (28), settings_schema/settings_data, locales | all parse; every referenced section type exists |
| `{% render %}` scope | all snippets receive what they use (`p`, `c`, `block`, `order`, `idx`, `eager`, `standalone`, `dedupe`); `order-detail` uses `customer` (global, fine) |
| `paginate` / limits | `customer.orders` by 20 ✓; `collection.products` by 250 (max allowed) ✓; non-paginated `c.products limit: 50` (see F-18) |

## Findings

| ID | Severity | Area | Title |
|---|---|---|---|
| F-01 | High | CSS / layout | Portrait lock rotates the whole shop sideways when the on-screen keyboard opens (viewport-height media query) |
| F-02 | Medium | JS / cart | Cart page −/+ is not serialised: fast taps are lost or applied in the wrong order |
| F-03 | Medium | JS / AR | Product-page AR section can orphan a camera stream (camera stays on) |
| F-04 | Medium | JS / cards | "Add turns into −/+" does not appear on page load for products already in the cart |
| F-05 | Medium | JS / PDP | "Add to Cart" has no in-flight guard — double tap adds twice the chosen quantity |
| F-06 | Medium | JS / orders | Edit-order sheet rebuilds its inputs on every keystroke (caret jumps, breaks IME/Gboard composition) |
| F-07 | Medium | Liquid / i18n | Choosing English does not stick on `/ar/…` URLs — every navigation reverts to Arabic |
| F-08 | Medium | CSS / AR | On the AR screen the "Added to cart" bar and toasts render behind the screen (no feedback) |
| F-09 | Medium | CSS / layout | Pre-`dvh` browsers: app is `100vh` tall with `body{overflow:hidden}` → bottom buy/place bar cut off |
| F-10 | Medium | UX / AR | AR section requests the camera by itself while scrolling; one generic message for all camera failures |
| F-11 | Low | JS / storage | Wrong-shaped stored values crash wishlist hearts, recommendations and the product page |
| F-12 | Low | CSS / compat | `:has()` inside a selector list disables all product-page snap rules on older browsers |
| F-13 | Low | A11y / motion | Reduced-motion ignored by most animations; `maximum-scale=1` blocks zoom |
| F-14 | Low | Liquid / JS | Hard-coded, locale-unaware URLs (`/cart/*.js`, `/pages/*`, `/products/…?view=ar`, `/ar` policy prefix) |
| F-15 | Low | JS / errors | Raw/unlocalised error texts reach shoppers (offline, 429, non-JSON orders-API reply) |
| F-16 | Low | JS / edge | Guest order −/+ inert when `canEdit && !canCancel`; cart Checkout button stays a spinner after Back |
| F-17 | Info | Liquid / PDP | No variant picker on the product page (latent: all 37 active products are single-variant today) |
| F-18 | Info | Liquid | Catalogue/search/home/categories read only the first 50 products of each collection |
| F-19 | Info | Docs | README/CHANGELOG claims out of date (WhatsApp edit route, "theme check clean", pages list, no 10-04…10-14 entries) |
| F-20 | Info | JS | Dead code and testing-only code shipped (`openEditSheet`, `ADDR_LIMITS`, `testLookup`) |
| F-21 | Info | Compat | Effective browser floor: JS = ES2020 (Chrome/WebView 80, iOS 13.4, Samsung Internet 13); layout = Chrome 108 / iOS 15.4 / Samsung 21 |

---

### F-01 — High — Portrait lock rotates the shop when the keyboard opens
**Where:** `assets/oka.css:1153-1162`, `layout/theme.liquid:86-110` (`--rot` = −90° when `window.orientation` is 0).
The lock is `@media (orientation: landscape) and (max-height: 540px) and (hover: none) and (pointer: coarse)`. `orientation` is computed from the *viewport*, not the device. Wherever the soft keyboard shrinks the layout viewport (Android System WebView = Facebook/Instagram/TikTok in-app browsers, Firefox Android, Chrome < 108, older Samsung Internet), a phone held upright with the keyboard open has width > height, the query matches, and `.app` is rotated −90° while the shopper types (search, discount code, add-address form, edit-order sheet, contact form).
**Repro:** `qa/tests/code/t7-css-playwright.js` (Chromium, touch + coarse pointer emulated, real `oka.css`).
```
(a) portrait, keyboard closed 360x640: lock media query matches=false; .app transform=none
(a) portrait, keyboard open (viewport shrunk) 360x300: lock media query matches=true; .app transform=matrix(0, -1, 1, 0, -150, -180)
(a) real landscape 800x360: lock media query matches=true; ...
```
**Expected:** layout stays upright while typing. **Actual:** the whole UI turns sideways as soon as a field is focused (the input then moves, often closing the keyboard).
**Fix:** decide "phone is sideways" from the device, not the viewport: toggle a class from JS using `screen.orientation.type`/`window.orientation` (both unaffected by the keyboard) and key the CSS on that class; or add `interactive-widget=resizes-visual` to the viewport meta (Chrome 108+ only) as a partial mitigation. Also consider dropping the CSS-rotation lock for in-app browsers.

### F-02 — Medium — Cart page −/+ race
**Where:** `assets/oka-screens.js:1028-1035` (`q = line.dataset.qty + step`, `await O.changeLine(...)` with no queue). The card steppers (`oka.js:787-807`) are serialised; the cart page is not.
**Repro:** `qa/tests/code/t3-cart-rapid-steps.js`
```
Scenario A: qty 1, tap + twice quickly (shopper wants 3)
  /cart/change.js quantities sent: [2,2] → server qty 2 | shown 2
  BUG REPRODUCED: one tap lost
Scenario B: qty 2, tap + then − quickly; the + response is slower (arrives last)
  sent: [3,1] → server ends at 3 ...
```
**Expected:** +,+ → 3; +,− → 2. **Actual:** 2 and 3/1 (timing dependent). On 3G the window is hundreds of ms; the COD total shown follows the wrong quantity.
**Fix:** reuse the card approach: keep a pending quantity per line key, update the UI optimistically, and chain `/cart/change.js` calls (or debounce and send the final absolute quantity once); ignore responses older than the latest request.

### F-03 — Medium — AR section can leave the camera on
**Where:** `assets/oka-screens.js:552-555` (IO start/stop) + `startCamera()` 638-655: the `if (stream) return` guard does not cover a *pending* `getUserMedia`. start → stop → start while the first call is pending produces two calls; when both resolve with `active === true` the first stream is overwritten, never stopped.
**Repro:** `qa/tests/code/t1-ar-camera-leak.js`
```
getUserMedia calls: 2
stream #1 still live after stop(): true
stream #2 still live after stop(): false
BUG REPRODUCED: a camera stream is never stopped (camera light stays on)
```
Realistic path: the permission prompt is up, the shopper scrolls on (stop) and back (start), then taps Allow. Camera indicator stays on until the tab is closed/hidden (the `visibilitychange` handler only stops the tracked stream).
**Fix:** keep the pending promise (`starting`) and return it on re-entry; on resolve, if `stream` already set or `!active`, stop the new tracks.

### F-04 — Medium — Card −/+ missing on page load
**Where:** `assets/oka.js:199-204` `getCart()` sets `cartState` + badges but never dispatches `oka:cart`; `syncCardSteppers()` runs only on `oka:cart`, `oka:lang` and DOM insertions (`oka.js:809-819`). On home/collection/search the boot `getCart()` therefore never converts cards.
**Repro:** `qa/tests/code/t2-card-stepper-initial.js`
```
cart loaded, qty of variant 111 = 2
Add button hidden? false | stepper present? false
BUG REPRODUCED: product is in the cart (qty 2) but its card still shows "Add" instead of − 2 +
after an oka:cart event → Add hidden? true stepper text: 2
```
Effect: the 10-14 feature only works after the first change; a shopper tapping the "Add" they see adds a 3rd unit.
**Fix:** call `syncCardSteppers()` after the boot `getCart()` resolves (or have `getCart` go through `setCart`).

### F-05 — Medium — PDP Add to Cart double submit
**Where:** `assets/oka-screens.js:509-515` (no disabled/in-flight flag; stock "room" computed from the cart before either request lands). Same for plain card "Add" (`oka.js:874`) — acceptable there since each tap is meant to add one.
**Repro:** `qa/tests/code/t8-pdp-double-add.js` → `/cart/add.js calls: 2 quantities: [2,2] → cart gets 4 units for a shopper who chose 2`.
**Fix:** disable `[data-buy]` until the add settles (as the offer buttons already do).

### F-06 — Medium — Edit-order sheet re-creates inputs per keystroke
**Where:** `assets/oka-screens.js:2173-2183` → `render()` 2107-2145 replaces `sheet.innerHTML` on every `input` event in name/phone/area/street fields and in the product search, then re-focuses the new input with the caret forced to the end.
**Repro:** `qa/tests/code/t4-edit-order-typing.js`
```
same <input> element after one keystroke? false | focused element is the new input? true
caret expected at 6, actual at 10 (value length 10)
BUG REPRODUCED: input replaced on each keystroke; caret jumps to the end
```
On Android (Gboard composes every word) and with Arabic keyboards, replacing the focused element mid-composition typically duplicates/drops letters and flickers the keyboard — needs device confirmation.
**Fix:** on field input update only the footer (`.eo-foot`) / validation text; never re-render the form while a field is focused.

### F-07 — Medium — English choice reverts on `/ar/…` URLs
**Where:** `layout/theme.liquid:72-85`. Store locales (Admin API): primary `en`, published alternate `ar`; theme `default_lang` = `ar`. On a non-primary locale URL the script overrides the saved `oka.lang`. All `routes.*` links on an `/ar` page keep the prefix (home, collections, search, cart, login).
**Repro:** `qa/tests/code/t5-lang-on-ar-url.js`
```
/ar/... URL,     shopper chose EN  → ar   <- saved choice ignored
```
A visitor arriving from an Arabic link/Google result can't stay in English: each tap on Home/Categories/Cart flips back.
**Fix:** let the saved choice win (use the URL locale only when nothing is saved), or have the toggle navigate to the other locale's URL (`request.locale`/`localization` form) instead of flipping client-side.

### F-08 — Medium — AR screen hides add-to-cart feedback
**Where:** `.ar-screen{position:fixed;z-index:50}` (`oka.css:1471`) vs `.added-bar` z-index 46 (1293) and `.toast` 45 (1060), both appended to `#app`. The menu handle/top bar are hidden on this template, so nothing shows the cart changed. The rec-sheet (z 30/31) would also open invisibly behind.
**Repro:** `t7-css-playwright.js` part (b): `on the AR screen: added-bar is covered by screen ar-screen | toast is covered by arx-panel`; screenshot `qa/tests/code/out/t7-ar-added-bar.png`.
**Fix:** raise `.added-bar`/`.toast` above 50 (alerts are 50) or give the AR panel its own confirmation state.

### F-09 — Medium — `100vh` fallback cuts off the bottom bars
**Where:** `.app{height:100vh;height:100dvh}` + `body{overflow:hidden}` (`oka.css:45-79`). Without `dvh` (Chrome < 108, iOS < 15.4, Samsung Internet < 21, older WebViews) `100vh` is the *largest* viewport; because the page never scrolls the browser toolbar never retracts, so the bottom ~56–80 px of `.app` sit under the toolbar: the PDP buy bar (`.buy-bar{bottom:8px}`), checkout place bar and toasts are partly hidden. Not reproducible in modern Chromium. → manual device test.
**Fix:** size `.app` with `position:fixed; inset:0` (or JS `--vh = innerHeight`) instead of `100vh`.

### F-10 — Medium — Camera requested on scroll; failure handling generic
**Where:** `oka-screens.js:546-557`, 638-655, 708-714.
- The permission prompt appears without a tap as the snap scroll lands on the AR section (iOS Safari re-asks per visit/page load), which reads as unexpected and leads to permanent denials.
- All `getUserMedia` errors (NotAllowedError, NotFoundError on cameraless desktops, NotReadableError when another app holds the camera, OverconstrainedError) show the same "Camera off — showing 3D"; insecure context/old browsers fall back silently (OK).
- In in-app browsers (FB/IG/TikTok) `mv.canActivateAR` is false, so the AR button says "Real-size AR needs a phone (Android or iPhone)" to someone already on a phone.
**Fix:** start the camera on a tap ("Open camera") in the inline section; map error names to messages; detect in-app browsers and say "open in Chrome/Safari".

### F-11 — Low — Wrong-shaped storage values crash callers
**Where:** `oka.js:20-25` `store.get` returns parsed JSON of any shape; `wishlist.all()` (486), `viewed.list()` (362), `recommend()` (394-395). `oka.lastCheckout`, `oka.rated`, `oka.vouchers` are guarded with `|| {}`/`|| []`, these are not.
**Repro:** `qa/tests/code/t6-corrupt-storage.js`
```
localStorage oka.wishlist = 'null' → ["Cannot read properties of null (reading 'h')", "recommend(): Cannot read properties of null (reading 'x')"]
sessionStorage oka.viewed = '{}' → ['recommend(): object is not iterable ...', 'viewed.add(): viewed.list(...).filter is not a function']
```
With `oka.viewed` corrupt, `product()` throws at line 559, so shipping bar/fee/ETA and related products never paint. Private-mode/quota failures themselves are handled (try/catch).
**Fix:** validate shape in the accessors (`typeof w === 'object' && w ? w : {}`, `Array.isArray(l) ? l : []`).

### F-12 — Low — `:has()` kills product snapping on older browsers
**Where:** `oka.css:1524-1529` — `.story-steps:has(ol)` is one selector in a 6-selector list. Browsers without `:has()` (Chrome < 105, iOS < 15.4, Samsung < 20, Firefox < 121) drop the whole rule, so no section gets `scroll-snap-align`. Also `.story-steps:not(:has(ol))` (1455) and `100svh` (1532, 1540; `min-height:460px` saves the AR section) degrade.
**Fix:** move `.story-steps:has(ol)` into its own rule.

### F-13 — Low — Motion and zoom accessibility
`prefers-reduced-motion` is honoured only for the side menu, swipe-up cue, compare sweep and ribbon. Infinite `.cta.glow`, `.arx-reticle` pulse, screen `okaFadeIn`, badge pop keep running. `<meta name="viewport" … maximum-scale=1>` (theme.liquid:39) blocks pinch-zoom on Android (WCAG 1.4.4). No dark-mode styles (light only; Samsung Internet's forced dark may invert images) — Info. No Arabic webfont: relies on system "SF Arabic"/"Noto Sans Arabic" — fine on iOS/Android, Info.

### F-14 — Low — Locale-unaware hard-coded URLs
`oka.js` cart calls `/cart.js`, `/cart/add.js`, `/cart/change.js`, `/cart/update.js` (work, but Shopify recommends `Shopify.routes.root`); `/products/<h>?view=ar` (oka.js:838); every `/pages/…` link in theme.liquid, account, order-detail, pdp-story; `policies-page.liquid:25` assumes `/ar` is a non-primary locale (true today: en primary). Combined with F-07 this produces the locale ping-pong. **Fix:** prefix with `routes.root_url`/`Shopify.routes.root`.

### F-15 — Low — Raw errors shown to shoppers
- Offline add: `okaAlert('Could not add', 'Failed to fetch')` in English in the Arabic UI (`oka.js:222`).
- 429/500 with HTML body → "HTTP 429" (cartFetch, `oka.js:196`); no retry/backoff anywhere (by design for orders API).
- `ordersApi` final `JSON.parse(text)` (`oka-screens.js:1465`) is unguarded → a non-JSON tool reply surfaces as "Unexpected token …".
- `loadCatalogue` does not check `r.ok`; a 5xx caches nothing and returns empty (OK), but search then shows "No results" instead of an error.

### F-16 — Low — Edge cases
- Guest order (`oka-screens.js:1615-1622, 1671-1674`): item steppers render when `view.canEdit`, but the click only works if the Edit button exists (`view.canCancel`); with `canEdit && !canCancel` the −/+ do nothing.
- Cart Checkout button is replaced by a spinner before navigating (`oka-screens.js:1047-1049`); on Back (bfcache) it stays a spinner (still tappable). Same for checkout review `[data-place]` and `[data-join-guest]`.
- Edit-order quote: a stale response that arrives during the 450 ms debounce of a newer change clears `quoting` and re-enables Save with the old quote; the server's `expectedTotal` check rejects it, so no wrong save — Info.

### F-17 — Info — No variant picker on the PDP
`main-product.liquid` only ever sells `selected_or_first_available_variant`; grid/home cards likewise. Admin API: all 37 active products have only the default variant, so nothing is broken today; adding a multi-variant product would make other variants unbuyable except via the cart "Change" sheet.

### F-18 — Info — 50-product cap per collection
`collection.oka-data.liquid:13`, `live-collections.liquid:21`, `oka-home.liquid:126`, `main-list-collections.liquid:7` iterate `c.products limit: 50` (non-paginated cap). Search, recommendations, edit-order "Add products" and wishlist see only those. Fine at today's catalogue size.

### F-19 — Info — Documentation drift (claim → status)
| Claim (README / CHANGELOG / brief) | Status |
|---|---|
| Offers add straight to cart (10-14) | Implemented (oka.js:840-873) ✓ |
| Cards turn Add into −/+ (10-14) | Partially — not on page load (F-04) |
| Order items −/+ editing (10-14) | Implemented: opens edit sheet with change applied ✓ (typing issue F-06) |
| PDP story AR/EN, video reel, AR screen, live camera, snap scrolling (10-14) | Implemented; story only for 4 hard-coded handle families (pdp-story.liquid:9-18); snapping lost on old browsers (F-12) |
| Side menu, swipe-to-close, Escape, bfcache close | Implemented ✓ |
| Age gate | Implemented ✓ (re-shown every page if localStorage unavailable) |
| Portrait lock "phones only, tablets/desktop normal" | Desktop/tablets are not locked out (430 px column) ✓; keyboard case broken (F-01) |
| README "without the proxy … edit/cancel requests go to WhatsApp" | Stale: code routes only through the orders API (`changesUnavailable()`), commit 95ba864 |
| README "`shopify theme check` must report no offenses" | 4 offenses (2 errors) |
| README page list | Missing `track` (used by order "Track shipment"), `how-to-use`, `about-us`, `contact` templates |
| CHANGELOG | No entries for any work after 2026-10-03 (orders API, guest orders, ratings, PDP/AR) |
| CHANGELOG "cart/PDP shipping estimate read from Shopify delivery profile" | App/server only; the theme uses theme-setting fees (money report) |

### F-20 — Info — Dead / testing code
`openEditSheet()` (oka-screens.js:2280-2383) and `ADDR_LIMITS` are unused; `testLookup()` + `snippets/test-lookup.liquid` ship to production gated by `test_panel` (false live) — see security report.

### F-21 — Info — Minimum browser versions
- **JS (hard floor):** optional chaining / `??` everywhere → Chrome & Android WebView 80, Safari/iOS 13.4, Samsung Internet 13, Firefox 74. Below that both scripts fail to parse: no add-to-cart, and the cart page (fully JS-rendered) is empty → no checkout. No `Array.prototype.at`, `replaceAll`, `structuredClone`, logical assignment used. model-viewer 4.0 (module) needs ~Chrome 90 / iOS 15 for 3D.
- **Layout (soft floor):** `dvh/svh` Chrome 108 / iOS 15.4 / Samsung 21 (F-09); `:has()` Chrome 105 / iOS 15.4 (F-12); `inert` Chrome 102 / iOS 15.5 (closed side menu links stay focusable below that); `aspect-ratio` Chrome 88 / iOS 15; flex `gap` Chrome 84 / iOS 14.1; logical radii Chrome 89 / iOS 15; `backdrop-filter` prefixed ✓; CSS `tan()` guarded by `@supports` ✓.
- Realistic Egyptian traffic (Android 8–10 devices with updated WebView/Chrome, iOS 15+, FB/IG in-app browsers) is above the JS floor; the visible risks are F-01 (WebView keyboard) and F-09 (older Samsung Internet / iOS 15.0–15.3).

## Regression review (last 15 theme commits)
- `51ea1d5` AR auto-camera: introduced F-03 (pending-call race) and F-10; `touch-action` changed none→pan-y (intended, page can scroll over the model).
- `6b0bff9` snap scrolling: introduced F-12 (`:has` in list).
- `8edb662` / `fb496e3` AR screen: introduced F-08 (z-index 50 above feedback layers).
- `f097613` card steppers: introduced F-04 (no initial sync).
- `a7d7a5b` offers to cart: OK; in-view side offer tap pass-through correct.
- `5d5cdf0`, `80efaf4`, `3d3cd87`, `622faa4`, `d1e92a2` orders/guest editing: F-06, F-16; preview diagnostics panel removed cleanly in `3360996` (no leftovers found).

## Scenarios executed
| # | Scenario | Result |
|---|---|---|
| 1 | Theme Check recommended + all | PASS with 4 (+5 size) offenses → file |
| 2 | node --check both assets | PASS |
| 3 | ESLint triage | PASS (warnings only, triaged) |
| 4 | All section schemas parse, ids unique, block limits | PASS |
| 5 | All templates/config/locales parse; section types exist | PASS |
| 6 | Render-scope variable audit of every `{% render %}` | PASS |
| 7 | Nil handling: product without images/description/model/video | PASS (empty gallery div, no dots, desc fallback, JSON-LD omits image) |
| 8 | Nil: collection empty / all products seen | PASS (live-collections hides; collection grid shows empty state) |
| 9 | Nil: customer nil on orders/addresses/loyalty/subs/account | PASS (sign-in notices) |
| 10 | Nil: order without shipping address / hero image | PASS (blank fields, no crash) |
| 11 | AR camera start/stop/start with pending permission | FAIL (F-03) |
| 12 | AR visibilitychange/pagehide stops camera | PASS (code) |
| 13 | Card −/+ appear for in-cart products on load | FAIL (F-04) |
| 14 | Card −/+ rapid taps (serialised chain) | PASS (code) |
| 15 | Cart page rapid +/+ and +/− | FAIL (F-02) |
| 16 | PDP double tap Add to Cart | FAIL (F-05) |
| 17 | Offer / bundle double tap | PASS (disabled while in flight) |
| 18 | Edit-order typing in delivery fields | FAIL (F-06) |
| 19 | Edit-order quote out-of-order responses | PASS w/ note (seq guard + server expectedTotal) |
| 20 | Language persistence on /ar URLs | FAIL (F-07) |
| 21 | Portrait lock: portrait, keyboard open, landscape (Chromium emulation) | FAIL (F-01) |
| 22 | Desktop / landscape tablet not locked out | PASS (media query needs ≤540px height + coarse) |
| 23 | z-index: age gate 40 > top bar 15/handle 20; menu 41; sheets 30/31; alert 50; toast 45; added-bar 46 vs AR 50 | FAIL for AR (F-08), rest PASS |
| 24 | Corrupt localStorage/sessionStorage values | FAIL (F-11) |
| 25 | Storage unavailable (private mode) | PASS (all access wrapped) |
| 26 | Catalogue fetch failure / non-JSON | PASS (empty catalogue, retried next call) |
| 27 | Cart AJAX 422/429/offline messages | PASS functionally, Low wording (F-15) |
| 28 | Orders API non-JSON / HTTP errors | PASS except unguarded final parse (F-15) |
| 29 | Video reel: muted + playsinline, IO play/pause, sound toggle | PASS (code) |
| 30 | Ribbon / compare rAF loops stop off-screen; reduced motion | PASS |
| 31 | History: order list pushState/popstate/back | PASS (code) |
| 32 | bfcache: menu closes on pageshow | PASS; checkout spinner stays (F-16) |
| 33 | RTL: logical properties / heart, swipe, menu mirroring | PASS (physical left/right only with explicit [dir=rtl] overrides) |
| 34 | overflow-x sources (rails are hscroll inside overflow-hidden app) | PASS (static) |
| 35 | Browser API floor audit | Done (F-21) |
| 36 | README/CHANGELOG claim verification | Done (F-19) |
| 37 | Regression diff review, 15 commits | Done |

## Needs manual test on a real device / live preview
1. F-01 on Android in the Facebook/Instagram/TikTok in-app browsers and Samsung Internet: focus the search box and the discount field in portrait — does the shop rotate?
2. F-09 on iOS 15.0–15.3 Safari and an older Samsung Internet: are the PDP "Add to Cart" bar and checkout "Place Order" fully visible?
3. F-06 with Gboard (Arabic and English) on the edit-order sheet: type/correct the name and street.
4. F-03/F-10 on iPhone Safari and Android Chrome: scroll onto the AR section, scroll away before answering the prompt, come back, Allow — does the camera indicator stay on after leaving the section?
5. Real-size AR handoff (Scene Viewer / Quick Look) and the camera feed orientation when the portrait lock rotates the layout.
6. `/ar/` storefront: switch to English and navigate (F-07) on the live preview.
7. Cart −/+ on a throttled 3G profile (F-02) on the live preview.
8. Pages `track`, `checkout-review`, `how-to-use` exist in the store with the right templates (store-data report).

## Artifacts
- `qa/reports/theme-check-correctness.txt` — Theme Check output (recommended + all)
- `qa/tests/lint/eslint.config.mjs`, `qa/tests/lint/eslint-output.txt`
- `qa/tests/code/harness.js`, `t1-ar-camera-leak.js`, `t2-card-stepper-initial.js`, `t3-cart-rapid-steps.js`, `t4-edit-order-typing.js`, `t5-lang-on-ar-url.js`, `t6-corrupt-storage.js`, `t7-css-playwright.js`, `t8-pdp-double-add.js`, `run-theme-check.js`, `run-theme-check-all.js`
- `qa/tests/code/out/t1…t8.txt`, `qa/tests/code/out/t7-ar-added-bar.png`
