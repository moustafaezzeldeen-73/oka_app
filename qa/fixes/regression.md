# Regression test — fixed theme (/home/user/oka_fix/theme) vs original (/home/user/oka_app/theme)

## Verdict: **GO** for upload to the unpublished QA-fixes theme (with 3 notes for the owner, none blocking)

No functional regression found. Every behaviour difference between the original and the fixed theme traces to a fix ID in the fixer reports (intended), or to my own test scripts expecting the old behaviour. No new console errors or page errors anywhere: smoke 0/0 on both, chaos 0 page errors, e2e session logs clean.

### Regression list
**No functional regressions.** Items that changed in a way someone might notice (all intended or test-only):
1. **Test-automation hook changed (Low, not user-facing):** the AR screen Back link and the screen-header icon buttons lost their English-only `aria-label="Back"`/`"Menu"`/`"Close"`; the names are now visually hidden bilingual text (V-06, commits d7ca2e7 / 40c549d). `qa/tests/ar/03-camera-leaks.mjs` (selector `.arx-top a[aria-label="Back"]`) times out until the selector is updated (`.arx-top a.arx-circle` works). Any other automation keyed on those labels must be updated. Also, `innerText` of headers now starts with the hidden "Back/رجوع" text.
2. **AR page camera no longer auto-opens on first visit or after Back (intended AR-05, ad6c612, `oka-screens.js` `productAr`).** The camera starts by itself only if permission is already *granted* and the page wasn't reached by Back/Forward. Otherwise the shopper sees the 3D model and taps "Open camera / افتح الكاميرا". On browsers without `navigator.permissions.query({name:'camera'})` (older iOS Safari) it never auto-starts. This is a deliberate product change: confirm the owner is happy with it.
3. **Desktop PDP no longer snaps (intended AR-08, 761b386):** wheel and trackpad scroll freely (before, the desktop PDP could not be scrolled with a mouse wheel at all). PageDown now moves 724 px instead of a full 838 px "page". Phones keep one page per swipe.

### Still open after the fixes (not regressions; the same on both themes)
- E2E-02 (06 OR-7): an order cancelled on the site shows active again after reload (`oka.cancelled` is never written).
- F-08 remainder (code t7): `.toast` on the AR screen is still under `.arx-panel` (the added-bar is fixed).
- SI-02 on the feed: hookahs/hoses/coal/bowls are still not home-feed pages (catalogue and search fixed; feed dedupe kept on purpose).
- COM-04 is partial: a free-shipping code shows "Calculated at checkout" rather than "Free".
- E2E-05 (filters persist across collections) and E2E-04 (spaced code shows "Apply") are unchanged.
- PDP transfer size +64 KB (510→575 KB). Info.

Servers: fixed on :9610 (`QA_THEME_DIR=/home/user/oka_fix/theme QA_NO_CACHE=1`, logs `/home/user/oka_fix/out-regress`), original on :9611 (logs `/home/user/oka_fix/out-regress-orig`). Test copies live in the scratchpad (`rg/{orig,fixed}/qa/tests`), so nothing under /home/user/oka_app is modified.

## 1. Smoke (58 routes × guest/customer × ar/en = 232 page loads per theme, iPhone 13)
- HTTP status: identical on all 232.
- Final URL / redirects: identical.
- Console errors and page errors: 0 on fixed, 0 on original.
- Failed requests: identical.
- Render warnings: fixed 0, original 8. The original's one `theme-suspect` warning on `/` and `/ar/` (`shop.contact_information`, not a Shopify property) is gone: an intended fix, f79ea91 SI-07 "contact-information policy row".
- **Verdict: no worse than original.**

## 3a. Code unit repros (qa/tests/code t1–t8, jsdom / Chromium; theme files loaded from each copy)
| Test | Original | Fixed | Class |
|---|---|---|---|
| t1 AR camera leak | BUG: stream #1 still live after stop() | getUserMedia calls 0, "no leak" (camera only on tap now) | INTENDED FIX F-03/F-10 (ad6c612) |
| t2 card stepper on load | BUG: Add shown though qty 2 in cart | stepper "2" on load | INTENDED FIX F-04 (198bc56/79671b7) |
| t3 cart rapid steps | BUG: sends [2,2] → one tap lost; overlapping calls | sends [3] (coalesced), and [2] in scenario B (net result correct) | INTENDED FIX F-02/CH-07 (198bc56, 7f825ab) |
| t4 edit-order typing | BUG: input replaced per keystroke, caret 10 | same input, caret 6 | INTENDED FIX F-06 (17baaae) |
| t5 lang on /ar URL | prints BUG | prints BUG (static first-paint check only). The fixer kept the URL-wins first paint on purpose and made the switch go to the primary-locale URL; verified in the browser in e2e LG-1 below | INTENDED FIX F-07 (198bc56), test not applicable |
| t6 corrupt storage | crashes (TypeError in wishlist/recs) | falls back to [] for bad values | INTENDED FIX F-11/CH-04 |
| t7 CSS (Chromium) | keyboard-open viewport rotates the app; AR added-bar covered; toast covered by arx-panel | keyboard-open: no rotation; real landscape still rotated; AR added-bar visible; **toast still covered by `.arx-panel`** | INTENDED FIX F-01, F-08 (a7a81ad). **F-08 only partly fixed** for `.toast` (not a regression: same as original) |
| t8 PDP double add | 2 add.js calls → 4 units | 1 call → 2 units | INTENDED FIX F-05 (7f825ab) |

## 3b. Commerce logic (qa/tests/commerce/commerce.test.js)
- Plain run (sandbox loads only oka.js): original 571/790, fixed 571/790, identical per section. The fixes for COM-01/03/04/07 live in oka-screens.js, which this sandbox doesn't load. Test copy note: the fixed oka.js reads `document.documentElement.dataset.root`, and the sandbox's fake `<html>` lacked `dataset`. I added it in the scratchpad copy; a real browser always has it, so this is not a regression.
- With oka-screens.js's governorate resolver installed (as the browser does): fixed **636/790**. text-zones 69→**108/108**, text-fees 82→**108/108**. Original unchanged at 571. INTENDED FIX COM-03 (e2f91ba, 542ff33). No section got worse.

## 2a. Targeted checks of new behaviour (`rg/extra.mjs`, iPhone 13 + Pixel 7, both themes)
| Check | Original | Fixed | Class |
|---|---|---|---|
| `/ar/collections/oka-cobra` → tap EN | stays on `/ar/…` with lang=en; the next `/ar` link flips back to Arabic | goes to `/collections/oka-cobra`, lang=en; `/cart` stays en | INTENDED FIX F-07 (198bc56) |
| Age gate "No, I'm under 18" | no such button | blocked "adults only" message, nothing stored, menu can't open behind, gate again after reload, "wrong button" → back to the question → Yes dismisses | INTENDED FIX AG-2/AG-3/V-14 (198bc56, a7a81ad) |
| PDP AR section scrolled into view | camera starts by itself (live track) | no camera; "Open camera" → live; tap again → ended | INTENDED FIX F-10/AR-05/F-03 (ad6c612, 6d12276) |
| `?view=ar` Add to cart feedback | added-bar hidden under `arx-cam` | added-bar on top and visible | INTENDED FIX F-08 (a7a81ad) |
| `?view=ar` camera with permission granted | starts | starts (unchanged by design on the AR screen) | same |

## 3c. Chaos suite (qa/tests/chaos 01–07b; fixed on :9612, original on :9613; diffs of the stdout/JSON)
| Script | Original | Fixed | Class |
|---|---|---|---|
| 01 key exposure | key in every page | identical (key rendering out of scope per FIX_BRIEF) | unchanged (SEC-01 out of scope) |
| 02 hostile data (XSS canaries in addresses/titles) | canary executed on 9 of 13 routes (`/pages/orders*`, `/pages/account`, PDP, AR, home) | **0 of 13** | INTENDED FIX SEC-04/CH-02/CH-03 (949a4c4, 4de6477) |
| 03 storage chaos (90 corrupt values) | 5 crashes (`oka.afterSignIn` object/string hangs navigation, `oka.pendingCode` `{}` → `code.trim`, `oka.wishlist` null) | 0 | INTENDED FIX F-11/CH-04/CH-05 |
| 03b afterSignIn | `{}` → `/pages/[object Object]`; `"//example.invalid/x"` → **off-site redirect** | stays on `/pages/account` | INTENDED FIX CH-05 |
| 04 network chaos (orders/J&T/cart under 500/timeout/cors/malformed/429/502) | guest box falls back to "No orders yet" on any transport error; out-of-order cart change → HTTP 400 | "We couldn’t load your order just now… Try again"; out-of-order change resolves (qty 1), no 400 | INTENDED FIX CH-06, F-02 |
| 04b cart network | double tap under latency → 2 units; offline alert "Failed to fetch" + uncaught page error; out-of-order +/− → server 3 (expected 2) | 1 unit; "You're offline — check your connection and try again."; 0 page errors; server 2 = expected | INTENDED FIX F-05, F-15/CH-08, F-02 |
| 05 guest order | — | identical output | no change |
| 06 soak (15 min random) | 0 page errors; heap after GC 1.6 MB | 0 page errors; heap after GC 1.6 MB. The final-page DOM/doc counts differ only because the random final route differs. A deterministic re-check (40 navigations then GC, ending on `/`, PDP, AR and cart) shows identical documents/frames before and after on both themes, and node counts flat | no leak, no regression |
| 07 interaction chaos | `/pages/orders` rapid "Order again" ×10 → 30 units; PDP triple tap → 3 | 3 units (one reorder); PDP triple tap → 1 | INTENDED FIX CH-10, F-05 |
| 07b reorder/phones | aborts at `page.goto(/pages/addresses?view=oka-add-address)` (navigation race) | same abort at the same step | test flake on both, not a regression |

## 2b. E2E journeys on both themes (my scripts 01–07, `rg/{orig,fixed}/qa/tests/e2e/results/*.json`)
### 01 Age gate / side menu / language (iPhone 13, Pixel 7, Desktop 1440 × ar/en): orig 138 PASS / 14 FAIL → fixed **152 PASS / 0 FAIL**
- AG-2 decline path (6 contexts): INTENDED FIX AG-2 ("No, I'm under 18" / "لأ، سني أقل من ١٨").
- AG-3 focus trap (6): INTENDED FIX AG-3/V-03 (`role=dialog`, 0/6 Tab escapes).
- MN-3b desktop outside click (2): INTENDED FIX (271b848).
- Unchanged: LG-1 still shows `/ar/` deep links opening in Arabic. That is by design (see 2a; the switch itself now goes to the primary URL).
- Every menu link, swipe/Escape/scrim/✕ close, focus return, inert, deep-link gates, blocked storage: identical PASS.

### 02 Home feed (8 contexts): orig 122/16 → fixed **130 PASS / 8 FAIL**
- HM-12 (8): INTENDED FIX F-04 (stepper on load).
- HM-3 still FAIL on both: hoses/coal/bowls/hookahs are not feed pages. Intended: the catalogue `cats` now lists all 10 (a4d933a) and the feed keeps its dedupe (f8e20c6 "dedupe is feed-only").
- Same status, different content (all intended): the guest cart after an offer shows "Shipping 60–80", "Total 327–347" and the governorate note (COM-01, e2f91ba). The discount row uses U+2212 inside isolates (COM-14). The home policies page gains the Contact row (SI-07). Offer totals and items are unchanged (offer 1: 298→267; offer 2: 467→395).

### 03 Collections & search (6 contexts): identical (152 PASS, 12 INFO on both). No change in sort, filters, 14 collections, 16 search queries, XSS probes, grid Add, chips.

### 04 PDP + AR (6 contexts): orig 108 PASS/18 FAIL → fixed **121 PASS / 5 FAIL**
- PD-3 double tap (6): INTENDED FIX F-05 (1 unit).
- AR-1 feedback on the AR screen (6): INTENDED FIX F-08 (added-bar on top).
- AR-4 (2 FAIL on fixed): the PDP AR section no longer opens the camera on scroll. INTENDED FIX F-10/AR-05; the tap-to-open path is verified in 2a.
- PD-10 (3 FAIL on fixed, ar guest only): a **test artifact**. In Arabic the script picks the subtotal row "المجموع قبل الشحن" as the shipping row. The real values match: PDP "٦٠–٨٠ ج.م" = cart "الشحن ٦٠–٨٠ ج.م". In English, signed-in (Cairo): PDP 60 = cart 60 (was PDP 36 vs cart 60) → INTENDED FIX COM-07. Guests now see the 60–80 range on the PDP too → COM-01.
- New cart line (intended, COM-07/COM-15 messaging): "With this discount the order is under EGP 300, so the lower shipping rate no longer applies."
- AR-3 text now starts with a "رجوع/Back" accessible name (V-06), intended.
- Unchanged: all 10 PDPs render, quantity, Add, added-bar links, sold-out 422, wishlist, share (clipboard fallback), reel mute/sound, `?variant=`, related rail, Back.

## 3d. AR / camera / media suite (qa/tests/ar 01–14; fixed :9612 vs original :9613)
| Script | Original | Fixed | Class |
|---|---|---|---|
| 01 PDP layout | snap y mandatory on all devices | same on phones; Desktop 1440 `scroll-snap-type: none` | INTENDED FIX AR-08 (761b386) |
| 02 PDP camera modes (granted/denied/none/NotReadable/Overconstrained/Abort/pending) | scrolling to the AR section calls getUserMedia in every mode | 0 calls on scroll in every mode (camera only on the "Open camera" tap) | INTENDED FIX F-10/AR-05/AR-01 (ad6c612) |
| 03 camera leaks | live tracks left after scrolling (C wheel: 1 live); D2 3 live after hide/show; E PDP camera live again after Back | 0 calls/0 live in every PDP case; AR screen 1 stream that ends on hide | INTENDED FIX F-03/AR-02/AR-03. Test copy: the selector `.arx-top a[aria-label="Back"]` no longer matches because the Back link's English-only `aria-label` became bilingual hidden text (V-06, d7ca2e7/40c549d). Re-run with `.arx-top a.arx-circle`: passes, and the chevron still goes to the PDP. **Not a functional regression, but any external automation keyed on `aria-label="Back"` needs updating.** |
| 04 AR page | errors all say "3D · drag to turn it"; failures (glb 404/corrupt, no WebGL, CDN abort) keep "Loading 3D…"/"Opening camera…" forever; AR add feedback covered (`coveredBy arx-cam`) | specific messages ("Camera is busy in another app", "No camera found — showing 3D", "Waiting for camera permission…", "3D unavailable" + photo fallback); added-bar z 56 visible on top; rec sheet on top | INTENDED FIX AR-06/AR-09/AR-10/F-08. A CDN hang still blocks the load event for 12 s on one of the two AR-page cases, as on the original (the original hung on both) |
| 04 AR double tap | 3 units | 3 units | same (AR `.arx-add` is per-tap by design, fixer note AR-18) |
| 05 visibility | PDP camera restarts after hide/show | PDP no camera; AR page stream stops on hide | INTENDED FIX AR-03 |
| 06 race | LEAK 1 live track at delays 300/1500/4000; live camera in a hidden tab | 0 calls, ok | INTENDED FIX AR-01/AR-02 |
| 07 hidden pending | Allow while hidden → live; 2 streams | PDP 0; AR page: stream resolved while hidden is stopped (live 0) | INTENDED FIX AR-03 |
| 08 reel | attributes | identical | — |
| 09 snap (desktop) | wheel 20×120px: scrollTop stuck at 0 (desktop users couldn't scroll the PDP) | 120…2400; PageDown moves 724 px instead of 838 (no snapping) | INTENDED FIX AR-08 |
| 10 wheel / 11 model-viewer wheel | wheel over the model trapped (5 defaultPrevented, page stays at 826) | page scrolls 826→1826, 0 prevented | INTENDED FIX AR-07 (99bc892) |
| 12 intents | identical | identical | — |
| 13 story/perf | long text overflows horizontally (pageHScroll true); camera on after scroll and after Back | no horizontal scroll; camera 0 unless tapped. PDP transfer +64 KB (510→575 KB, bigger JS/CSS), long tasks similar | INTENDED FIX AR-15, F-10. Size increase: Info |
| 14 long prompt | PDP shows "Opening camera…"→"3D…" while a permission prompt is pending | AR page shows "Waiting for camera permission…" the whole time; PDP no prompt | INTENDED FIX AR-09 |

**AR behaviour change worth knowing (intended, AR-05, `oka-screens.js` `productAr`, ad6c612):** the full-screen AR page (`?view=ar`) now opens the camera by itself only when the browser already has camera permission and the visit is not a Back/Forward navigation. A first-time visitor (permission "prompt"), or someone returning with Back, sees the 3D model and an "Open camera / افتح الكاميرا" button. Before, the camera prompt appeared at once. Reproduced: `?view=ar` → `/collections/all` → Back → tracks `[]`, chip "3D · drag to turn it", button "Open camera"; reload → camera live. On browsers without `navigator.permissions.query({name:'camera'})` (older iOS Safari) the AR page never auto-opens the camera. Tapping still works. This is by design per AR-05, not a regression, but the owner should know.

### 05 Cart / codes / fees / checkout hand-off (iPhone 13 + Pixel 7 × ar/en × guest/customer + Desktop guest): orig 238 PASS/32 FAIL → fixed 230 PASS/40 FAIL. Every status change is intended:
- CT-4b fast −/+ with 400–900 ms latency (6): 5 taps → cart 6, 3 taps → 3 (was 3 / 2). INTENDED FIX F-02.
- DC-3 invalid code after a valid one (10): QA10 kept (total 270, codes `["QA10:true"]`, error shown). INTENDED FIX COM-06 (7f825ab).
- DC-1 QAFREESHIP (10): shipping row "Calculated at checkout / هيتحسب وانت بتكمّل الطلب", total = merchandise (was "Shipping 36", total 336). INTENDED, COM-04 PARTIAL per fixer-screens (the theme zeroes or defers the fee only when cart.js reports a shipping-line discount).
- DC-1 NOPE123/QAEXPIRED/`<b>x</b>` (22 now FAIL): my script clears the items between scenarios, but the cart keeps its discount codes (as Shopify's `/cart/clear.js` does). Because a refused code now restores the previous one (COM-06), QAFREESHIP from the previous scenario is still applied. The rejection message itself is correct and escaped. **Expected consequence of COM-06, not a regression.**
- FE-1 299/300/301 (18, guests only) and FE-3 (6): guests now see a range ("60–80", "36–56") plus "Shipping depends on your governorate — the exact fee shows at checkout". Signed-in users still get the exact zone fee: FE-2 Cairo/Giza 60→36, Aswan 80→56 in cart and checkout-review, identical to the original. INTENDED FIX COM-01 (e2f91ba).
- Same status, new text (intended): under-300-after-discount note (COM-07/COM-15), U+2212 minus in isolates (COM-14). The checkout-review COD amount now shows exact piastres "٢٣٠٫١٠ ج.م" for 189×0.9+60 (was rounded "٢٣٠"), INTENDED COM-12.
- Unchanged PASS: empty cart rail, multi-line, single −/+, ✕, swipe delete/save, Change sheet, 422 alert, 99 cap, QA10/qa10/" QA10 "/QA50OFF, QAMIN300 299/300, code survives reload, tong-free, checkout hand-off (`checkouts.jsonl` items/code/token match), Back from checkout, checkout-review guest/customer + Place, sign-in hand-off, permalink.

### 06 Signed-in account: orders, tracking, edit, cancel, addresses, loyalty, subscriptions, wishlist, support, contact, track, plus the guest view of account pages (iPhone 13 + Pixel 7 × ar/en): **identical** — 172 PASS / 4 FAIL / 4 INFO on both
- Every scenario has the same status, and the evidence text matches except for the new visually hidden "Back / رجوع" button names in the screen headers (46 rows; V-06, intended).
- Covered identically on both: orders list → detail via pushState and Back/Forward; tracking under 10 mock modes (success/sse/empty/401/500/timeout/malformed/rpc-error/tool-error/cors); edit sheet via item −/+ with save → `customer_update_order`; Add-products picker; 6 `customer_get_order` error modes with friendly alerts; quote error; cancel Back/confirm; cancel shipped/500; cancelled/fulfilled orders make no API calls; reorder; the SEC-04 payload in the API reply stays escaped; account links; address default/delete/add (+ GPS via the Nominatim mock); loyalty (250 points, redeem, voucher → cart code applied); subscriptions "not switched on"; wishlist; support (no WhatsApp, SI-08 data); contact form posted; 7 track-page cases.
- The 4 FAILs on both are OR-7, my E2E-02 (the cancelled state is lost on reload; `oka.cancelled` is never written). **Still present in fixed (not fixed, not a regression).**
- Harness note: the harness uses a relative `routes.account_url`, so the fixed theme's SI-01 "new customer accounts" path (link to the hosted Profile) is not exercised here; the classic forms still work exactly as before.

### 07 Guest last order, misc pages, multi-tab, back/forward, reload, offline (iPhone 13 + Pixel 7 × ar/en): orig 51 PASS/24 FAIL → fixed **59 PASS / 16 FAIL**
- GO-7 (2): guest order with `canEdit && !canCancel` no longer shows dead −/+ steppers. INTENDED FIX F-16.
- GO-6 (2, now FAIL in my script): after a `customer_get_order` timeout the guest box stays visible with "We couldn’t load your order just now… Try again" plus "Not your order? Forget it on this device". The original fell back to "No orders yet". INTENDED FIX CH-06 + SEC-06 softening; my script expected the old empty state.
- OF-1/OF-5 (8): offline alerts are bilingual and human ("You're offline — check your connection and try again" / "مفيش إنترنت — اتأكد من الاتصال وجرّب تاني"). The original showed "Failed to fetch". INTENDED FIX F-15/CH-08.
- MT-1 (still FAIL, but different): tab A now picks up tab B's change made through the theme (mint 1→2 via the storage ping/focus refresh). "+" in tab A gives 3, so B's change is kept; the original overwrote it (2). An item added in tab B *outside the theme* (a raw `/cart/add.js`, no ping) still isn't shown until the next refresh (focus refresh is throttled to once per 2 s). INTENDED FIX COM-09 (198bc56/aac9562), good enough for real shoppers.
- GO-5 SEC-06: the guest snapshot (name/phone/address) is still shown on a shared browser, but now with "Forget it on this device" and a 30-day expiry (fixer: softened, feature kept). INTENDED (partial) SEC-06/CH-12.
- Unchanged: guest empty state, guest checkout → last order via cart token, guest edit sheet + save, guest cancel, 12 misc pages (404 ×3, password, gift card, 5 policies + `/ar/` policies), bfcache badge, Back/Forward through the funnel, reload mid-flow, offline steppers/checkout/tracking.
- Accidental extra hostile-data evidence: this group ran while the harness fixtures contained XSS canaries (see the incident note at the end). With the same poisoned data, the original **executed** the canary on `/`, `/collections/oka-cobra`, `/products/oka-cobra` and `/checkout`. The fixed theme executed it only on `/checkout`, which is the harness's own checkout stub, not theme code. This is consistent with chaos 02 → SEC-04 fixed.


## 4. Classification summary
| Area | Original → Fixed | Differences | Intended fix | Regression |
|---|---|---|---|---|
| Smoke 232 loads | 0 errors → 0 errors; 8 → 0 render warnings | 8 | SI-07 | 0 |
| e2e 01 gate/menu/lang | 14 FAIL → 0 | 14 | AG-2, AG-3/V-03, MN-3b | 0 |
| e2e 02 home | 16 → 8 | 8 status + text | F-04, COM-01, COM-14, SI-07 | 0 |
| e2e 03 collections/search | identical | 0 | — | 0 |
| e2e 04 PDP/AR | 18 → 5 | 13 status (+3 ar-guest test artifact) | F-05, F-08, F-10, COM-07, COM-01 | 0 |
| e2e 05 cart | 32 → 40 FAIL | 40 status | F-02, COM-06, COM-04 (partial), COM-01, COM-12/14 | 0 (8 extra FAILs are my script expecting old texts/codes) |
| e2e 06 account/orders | identical | header "Back" names only | V-06 | 0 |
| e2e 07 guest/misc/offline | 24 → 16 | 10 | F-16, CH-06, F-15, COM-09, SEC-06 (soft) | 0 |
| code t1–t8 | 7 bugs → 0 (t5 static check n/a) | 7 | F-03, F-04, F-02, F-06, F-11, F-01/F-08, F-05 | 0 |
| commerce | 571/790 → 571/790 (oka.js only); 636/790 with the screens' resolver | COM-03 | COM-03 | 0 |
| chaos 01–07b | XSS 9 routes → 0, 5 storage crashes → 0, open redirect → none, … | many | SEC-04, F-11, CH-05, CH-06, F-02, F-05, F-15, CH-10 | 0 (07b aborts identically on both) |
| AR 01–14 | camera leaks/auto-start → none | many | F-03, F-10, AR-01…AR-15 | 0 (1 test-selector break, item 1) |

## 5. Needs manual test on a real device / live preview before publishing
1. AR-05 change on real iOS Safari 15/16/17 and Android Chrome: first visit to `?view=ar` (prompt), Back to `?view=ar`, "Open camera" tap → Allow/Deny, Quick Look/Scene Viewer hand-off.
2. iOS: no zoom on focus (16 px inputs, V-08), and the portrait lock with the keyboard open (F-01). Real rotation can't be emulated here.
3. New customer accounts (SI-01): the addresses screens link to the hosted Profile. The harness uses relative `routes.account_url`, so that path was not exercised.
4. Real checkout: guest fee range vs the actual rate per governorate; QAFREESHIP-like codes ("Calculated at checkout"); COD amount with piastres (٢٣٠٫١٠).
5. Cross-tab cart sync on real devices (storage ping + focus refresh).
6. Screen readers: the age-gate dialog, alert Escape/Tab trap, bilingual hidden names (V-03/V-06), live-region announcements (V-04).

## 6. Incident during this run (please read)
While running chaos `02-hostile-data.mjs` from my scratchpad copy, its `buildMirror()` copied `qa/fixtures` **as a symlink** (my copy linked it to `/home/user/oka_app/qa/fixtures`). Its XSS-canary mutation was therefore written into the real `/home/user/oka_app/qa/fixtures/customer.json` and `products.json` (2026-10-22 04:44:55 UTC).
- I rebuilt both files from the untouched `qa/fixtures/raw/*.json` with `qa/harness/build-fixtures.mjs` in a scratch directory and verified that the rebuilt files are the exact originals: re-applying the chaos mutation to them reproduces the corrupted files exactly (JSON-equal), and the 6 other fixture files the same build produces are byte-identical to the originals. I then restored them (11:53 UTC).
- Effect on results: the harness loads fixtures at start-up. All servers used for sections 1–3 and e2e 01–06 were started before 04:44 and used clean data. Only the e2e 07 re-run (servers restarted after the container restart) ran on the poisoned fixtures, on both themes equally, so the comparison stands (and gave extra SEC-04 evidence).
- **Any other agent that started a harness server on /home/user/oka_app between 04:44 and 11:53 UTC on 2026-10-22 ran on poisoned customer/product data and should re-run.**
- All my harness servers are now stopped (PIDs 230 and 231 for :9610/:9611; :9612/:9613 had already died in the container restart). No other processes were touched.
