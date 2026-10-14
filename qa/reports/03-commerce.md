# 03 — Commerce logic (money correctness) audit

**Theme under test:** "OKA App Theme (test — unpublished)", gid://shopify/OnlineStoreTheme/191458214186, source `theme/`, settings from `qa/settings_data.live.json`.
**Auditor:** commerce-logic QA agent. **Date:** 2026-10-14.

## Scope
Every theme code path that computes, displays or sends money, quantities, fees, discounts, points or COD:
`assets/oka.js` (all 927 lines), `assets/oka-screens.js` (all 3240 lines), `layout/theme.liquid` (window.OKA), `sections/main-cart.liquid`, `oka-checkout.liquid`, `main-product.liquid`, `oka-home.liquid` (offers/bundles), `oka-loyalty.liquid`, `oka-orders.liquid`, `snippets/price|num|ar-digits|order-detail|grid-card|banner-page.liquid`, `templates/collection.oka-data.liquid`.
Reference logic compared: `server/config/zones.js`, `server/config/policy.js`, `server/services/{shipping,loyalty,jobs}.js`, `server/integrations/shopify.js` (editOrder, createVoucher), `app/src/state/store.js`, `docs/commerce-policy.md`.

## Method
1. Full code read of the files above.
2. **Live store, read-only Admin GraphQL** (no mutations): `deliveryProfiles` (zones, provinces, method definitions and TOTAL_PRICE conditions), `discountNodes(status:active)`, all active `productVariants` (price, compare-at, inventory policy), ~100 recent orders (amounts, province codes, shipping lines, discount applications, outstanding — no PII copied).
3. **Executed tests** (node 22, `node:vm` sandbox that loads the real `assets/oka.js` with a DOM stub and a fake Cart AJAX API): `qa/tests/commerce/commerce.test.js` (790 checks) + `qa/tests/commerce/server-zones-compare.mjs` (server resolver on the same inputs). Functions that are not exported (cart screen, subscriptions builder, order-edit diff, Liquid snippets) are transcribed line-for-line in the test and marked TRANSCRIBED.
   Run: `node qa/tests/commerce/commerce.test.js [--verbose]` → **571/790 pass, 219 fail** (failures = the findings below).

### Live store facts used as "expected" (2026-10-14)
| Shopify zone | Provinces | < 300 | ≥ 300 | Exact conditions |
|---|---|---|---|---|
| Cairo and Alexandria | SU, ALX, C, GZ, HU | 60 | 36 | 60: `0 ≤ total ≤ 299.0`; 36: `total ≥ 300` |
| Delta and canal | DK, DT, FYM, IS, KFS, MNF, PTS, KB, SUZ | 70 | 46 | 70: `0 ≤ total ≤ 299.0`; 46: `≥ 300` |
| Delta and canal 2 | SHR, BH, GH | 70 | 46 | same as above |
| North Coast, Sinai, Red sea, upper egypt | ASN, BNS, LX, MT, WAD, SIN, BA, JS | 80 | 56 | 80: `0 ≤ total ≤ **300.0**`; 56: `≥ 300` |
| upper egypt 2 | AST, MN, KN, SHG | 80 | 56 | 80: `0 ≤ total ≤ 299.0`; 56: `≥ 300` |

The theme's `PROVINCES` code→zone table matches all 29 Shopify codes exactly, and the fee settings (60/36, 70/46, 80/56, tier 300) match the rates.
Other profiles ("Shipping with cash on delivery", "Free Shipping") have 0 zones and 0 variants — no effect.
**Active discounts:** no discount codes are active. Automatic: "tong free" (BXGY: spend ≥266 on hookahs/ready-to-smoke-bowls → Tongs 100% off), "Valentines" (BXGY: buy 2 OKA hookahs → up to 3 bowls/tongs 24 off each), "The Trio Party" (−30 on ≥3 hookahs), "The Hexa Party" (−180 on ≥6 hookahs). None combine with each other or with shipping discounts.
**Prices:** all 37 active variants have whole-EGP prices (5…774), so the cart's merchandise total is a whole number unless a percentage discount applies. Compare-at is set on 3 variants (Cobra+base 357/409, Trio 447/507, Hexa 774/1014). Almost all variants are `CONTINUE` with negative stock; the coal and foil variants are `DENY` with 0 in stock.

### What was / wasn't covered
Covered: zone mapping (29 codes + 108 free-text spellings), the fee at and around the threshold for every province, cents→EGP, rounding, the PDP/cart/checkout fee basis, guest vs signed-in quoting, card −/+ against a fake cart API (fast taps, a second tab), bundle partial failure, discount-code "Applied" logic (code review), free-shipping display, loyalty earn/redeem math, subscription math against the server job, order-detail COD, order-edit diff display, Arabic-Indic digits, minimum order.
**Not covered / blocked:** the live storefront and checkout can't be reached from this container (network policy). The orders API's `customer_quote_order` / `customer_update_order` code isn't in this repo (`/home/user/jt-mcp-server` doesn't implement them), so repricing during order edits couldn't be verified. Liquid's runtime meaning of `order.total_price` after edits, and of `store_credit_account.balance`, couldn't be run. All of these are listed under "Needs manual test".

## Findings

| ID | Severity | Area | Title |
|---|---|---|---|
| COM-01 | Critical | Shipping fee | The cart quotes the Cairo fee to every guest (and to any unmatched address): 10–20 EGP too low for 24 of 29 governorates |
| COM-02 | High | Shipping config | Shopify has no rate for totals 299.01–299.99 in 4 of 5 zones (checkout blocked), but the theme shows 60/70/80 |
| COM-03 | High | Zone mapping | Free-text governorate matching misses 39 of 108 common spellings, and some land in the wrong zone (±10–20 EGP) |
| COM-04 | High | Discounts | Free-shipping discounts are never shown: the shipping row, total and COD amount still include the fee |
| COM-05 | High | COD / order detail | "Pay the courier" shows `order.total_price`, ignoring amounts already paid (store credit) and edits; live orders already show `total ≠ outstanding` |
| COM-06 | Medium | Discounts | An invalid code removes a valid code that was already applied |
| COM-07 | Medium | PDP | The product page's fee uses the pre-discount subtotal, so it shows 36 where the cart shows 60 (live "tong free" offer) |
| COM-08 | Medium | Subscriptions | The Subscribe & Save total doesn't match the order the server creates (rounding, fee basis, 150 minimum) |
| COM-09 | Medium | Cart sync | The cart is never refreshed across tabs, after Back, or on focus, so the −/+ steppers show stale quantities |
| COM-10 | Medium | Loyalty / policy | The "20 off over 300" voucher makes a 300 basket cost 4 EGP more, and "Free delivery (80 off)" is mislabelled |
| COM-11 | Low | Shipping config | Far zone at exactly 300: Shopify offers both 80 and 56 |
| COM-12 | Low | Rounding | Rounded rows don't add up with fractional amounts; 299.99 shows as "300" next to the under-300 fee |
| COM-13 | Low | Order edit | A difference under 0.5 shows "EGP 0 more than before" |
| COM-14 | Low | Arabic digits | No thousands grouping, Latin decimal point, unguarded NaN, "-" sign not bidi-isolated |
| COM-15 | Info | Threshold basis | The theme applies the 300 tier after discounts — consistent with the server; Shopify's basis still needs a live check |
| COM-16 | Info | Dead code | `openEditSheet` reprices shipping on the client, but the edit endpoint never changes shipping |
| COM-17 | Info | Min order | Theme `min_order` 0 vs server/docs 150; at 0 the note never shows (correct) |
| COM-18 | Info | Live data | Live orders whose shipping doesn't match the zone table (app channel / edited orders) |

---

### COM-01 — Critical — The cart quotes the Cairo fee to every guest (and to any unmatched address)
**Refs:** `assets/oka.js:162-169` (`zoneFees(addr = selectedAddress())` → `provinceOf(addr)?.zone || 'metro'`), `oka.js:154-158` (a guest has no addresses → `null`), `assets/oka-screens.js:766-769, 833-834` (the cart's shipping row and grand total), `oka-screens.js:1041-1049` (the cart's Checkout button goes straight to `/checkout`, skipping the review page that carries the "estimate" note).
**Repro:** As a guest, add a hookah for 189 and a bowl for 49 (merch 238), open the cart, then check out with an address in Aswan.
**Expected (Shopify charges):** shipping 80, total 318. Delta governorates: 70 / 308.
**Actual (theme shows):** "Shipping ٦٠ ج.م", "Total ٢٩٨ ج.م", with no hint that it's an estimate. At merch ≥ 300 it shows 36 where Shopify charges 46 (delta) or 56 (far).
**Evidence:** test group `guest`: **72 of 87 cases fail** (only the 5 metro codes pass). For example `guest in ASN, merch 200: expected 80 actual 60`, `guest in DK, merch 300: expected 46 actual 36`. The same 60/36 fallback is used for any address the theme can't map (group `unknown`, 5/5).
**Fix:** for guests and unknown governorates, show a range ("60–80 ج.م depending on governorate") or ask for the governorate in the cart, and label the line as an estimate. Don't default to the cheapest zone without saying so (the server comment in `config/zones.js:tableFee` makes that choice explicitly, but the website then shows a firm number).

### COM-02 — High — Shopify has no rate for totals 299.01–299.99 in four zones
**Refs:** store delivery profile (above). The theme's `oka.js:168` (`merch >= CFG.tier ? over : under`) assumes a continuous tier.
**Repro:** Any cart whose total after discounts lands in (299, 300) — e.g. a 10 % code on 333 = 299.70 — shipped to C/GZ/ALX/SU/HU, any delta province, or AST/MN/KN/SHG.
**Expected:** a rate (60/70/80).
**Actual:** Shopify's under-tier rate stops at `≤ 299.0` and the over-tier rate starts at `≥ 300`, so checkout offers **no shipping method** ("This store can't ship to your address"). The theme meanwhile shows 60/70/80 and a "add ١ ج.م more" bar.
**Evidence:** test group `threshold`: 63 failures, all at 299.01 / 299.5 / 299.99, e.g. `C merch=299.99: Shopify offers [] expected "NO RATE" actual 60`. Not reachable today (whole-EGP prices, no percentage discounts active), but any percentage code, voucher or price like 149.50 would trigger it.
**Fix (store config):** set the under-tier maximum to 299.99 in the four zones, as the far zone already does (≤ 300.0). Optionally the theme could warn when merch isn't a whole number.

### COM-03 — High — Free-text governorate matching is weaker than the server's and sometimes picks the wrong zone
**Refs:** `assets/oka.js:135-148` (`fold` + `provinceOf`: plain substring match against only the English and Arabic names, first hit in table order). The server's `server/config/zones.js:120-170` adds aliases, strips the "ال" article and punctuation, matches whole words and tries the longest match first.
**Used by:** signed-in addresses with no `province_code` (`theme.liquid:188-189`), GPS fill (`oka-screens.js:2586`), and `etaFor`.
**Expected vs actual (fee at merch 200):**
| Input (province / city) | Real governorate (Shopify fee) | Theme |
|---|---|---|
| "" / "القناطر الخيرية" | Qalyubia (70) | **Qena, 80** (because "قنا" is a substring of "القناطر") |
| "Sharqia" / "Minya al Qamh" | Sharqia (70) | **Minya, 80** |
| "Beheira" / "Alexandria Desert Road" | Beheira (70) | **Alexandria, 60** |
| "Sharqia", "Sharkia", "Kafr El Sheikh", "Menoufia", "Fayoum", "Qaliubiya", "بور سعيد", "Portsaid" | delta (70) | unknown → 60 |
| "Assiut", "Bani Sweif", "Minia", "Marsa Matruh", "شمال سينا", Hurghada, الغردقة, Arish, Sharm El Sheikh, Alamein | far (80) | unknown → 60 |
| "قاهرة", "جيزة", "اسكندرية", "Alex", "October", "Nasr City", "Sheikh Zayed" | metro (60) | unknown → 60 (right fee by accident; ETA wrong) |

**Evidence:** `text-zones` 39/108 fail, `text-fees` 26/108 fail. `server-zones-compare.mjs` resolves 25 of the 28 failing inputs correctly, so the theme is a regression from the server's logic. Note that Nominatim's English state names ("Sharqia", "Kafr El Sheikh", "Menoufia"…) are exactly the ones that fail.
**Fix:** port `fold`/`resolveProvince`/aliases from `server/config/zones.js` (whole-word, longest first, "ال" stripped). Never fall back to metro silently.

### COM-04 — High — Free-shipping discounts are never shown
**Refs:** `oka-screens.js:767-768, 833-834` (cart), `1155-1156, 1201, 1213, 1219` (checkout review and the COD note). `cartTotals` (`oka.js:272-276`) only sees product discounts — `/cart.js` carries no shipping discount.
**Repro:** Apply a free-shipping code (none active today; the loyalty "ship" reward and any future code), or reach any automatic free-shipping offer.
**Expected:** shipping 0, total = merch, COD note = merch.
**Actual:** shipping 60/70/80 (or 36/46/56), and the total and "Have this amount ready for the courier: …" are overstated by the fee. Shopify's checkout charges 0.
**Fix:** read the code's type (Storefront API `cart.discountCodes` + `deliveryGroups`, or a metafield-listed set of free-shipping codes) and zero the line. At minimum show "Shipping: calculated at checkout" whenever a code is applied that cart.js reports without any cart-level amount.

### COM-05 — High — The COD amount on the order page ignores what's already paid and edits
**Refs:** `snippets/order-detail.liquid:41-45, 71, 96, 99` — "pay the courier `o.total_price`" whenever `financial_status` isn't paid/partially_refunded/refunded.
**Problem:** (a) The theme's own loyalty model spends store credit at Shopify checkout (`oka-screens.js:2731-2738`). Such orders are `partially_paid`, so the theme tells the customer to pay the full total, store credit included. (b) Edited orders: live examples **#2850121, #2849821, #2849721, #2849621** have `totalPrice 259` but `totalOutstanding 70` and `currentTotalPrice 70` (items removed). The page would tell the customer either 259 or 70, depending on whether Liquid's `total_price` follows edits.
**Expected:** the amount the courier collects = outstanding balance (`total_outstanding` / `current_total_price − paid`).
**Fix:** render the outstanding amount (derive it from `order.transactions` — sum of successful non-COD payments — or pass it from the orders API; check whether the Liquid `order` object exposes an outstanding field, which couldn't be verified here) and use it in the hero and the COD line.
**Needs manual:** open #2850121's detail page as its customer in the preview and read the COD line.

### COM-06 — Medium — An invalid code removes a valid code that was already applied
**Refs:** `oka-screens.js:1065-1092` → `oka.js:265-267` (`/cart/update.js {discount: code}` replaces all codes); on an inapplicable code it calls `applyDiscount('')`.
**Repro:** Apply valid code A ("Applied"). Type code B, which doesn't apply to the basket, and press Apply.
**Expected:** B is rejected and A stays.
**Actual:** A is replaced by B, then everything is cleared. The total goes up by A's discount, and the field shows B with an error.
**"Applied" logic otherwise:** it is shown only when cart.js returns `discount_codes[].applicable === true` for that code (case-insensitive). That is the correct source of truth (PASS). Free-shipping codes may report `applicable:false` in cart.js and would then be removed — **needs manual test**.
**Fix:** on rejection, re-apply the previously applied codes (`discount: prev.join(',')`).

### COM-07 — Medium — The product page's fee uses the pre-discount subtotal
**Refs:** `oka-screens.js:495-500` (`O.cartTotals().subtotal + price*qty`). The cart and checkout use `merch` (after discounts) at `oka-screens.js:766-767` and `1154-1155`.
**Repro (live "tong free" BXGY):** In the cart: hookah 189 + 2 bowls 98 + Tongs 31 (free) → original 318, merch 287. Open a 10-EGP product page.
**Expected:** fee 60 (merch 297 < 300), as the cart and checkout show.
**Actual:** PDP shows "Shipping fee ٣٦ ج.م" and "the best rate for your area" (328 ≥ 300).
**Fix:** use `cartTotals().merch`.

### COM-08 — Medium — The Subscribe & Save total doesn't match the order the server creates
**Refs:** theme `oka-screens.js:2897-2900` (one `Math.round(subtotal × 5 %)` for the whole basket; fee on `subtotal − discount`; `minOrder` from theme = 0). Server `services/jobs.js:25-55` (`Math.round(price × 0.95)` per unit; fee from Shopify on **full** prices; `POLICY.minOrder` = 150).
| Basket → governorate | Theme "Each delivery" | Server order | Note |
|---|---|---|---|
| hookah 189 + 3×49 → GZ | 355 | 357 | per-line rounding |
| 7 × 49 → ASN | 382 | 385 | |
| 189+2×49+39 → C | 346 | 347 | |
| 3 × 49 → C | 200 | **rejected every cycle** (141 < 150) → `action_needed` | theme allows it |
| 3 × 31 → C | 148 | rejected (87 < 150) | |
Also, for a basket of 300–315 the theme applies the under-300 fee (e.g. 310 − 16 = 294 → 60) while the server charges 36 on the full price: shown 24 too high.
**Live impact:** none today (`proxy_path`/`service_url` empty → the screen shows "isn't switched on"), but it breaks as soon as the service is connected.
**Fix:** compute exactly as `jobs.js` does (per-unit rounding, fee on the full price), and serve `minOrder` from `/storefront-config`.

### COM-09 — Medium — The cart is never refreshed across tabs, after Back, or on focus
**Refs:** `oka.js:199-204` (`getCart` caches `cartState`; refreshed only on init and after this tab's own calls), `769-807` (`syncCardSteppers`/`cardStep`). There is no `storage`, `visibilitychange` or `pageshow` refresh.
**Repro (executed with the fake cart API):** tab A adds variant 111 and taps + three times quickly → server qty 4 (PASS: fast taps all count). Tab B's `cartQtyOf('111')` is still **0**.
**Expected:** 4. **Actual:** 0. Tab B's card shows "Add" instead of −4+. A "−" there finds no line and does nothing; "+" adds a 5th unit the shopper doesn't see. After Back from the cart (bfcache), cards show quantities from before.
**Also verified (PASS):** "−" never goes below 0 (six "−" taps from 4 → 0, no negative `change.js`); there are no free-text quantity inputs anywhere (quantities come only from ±1 buttons), so 0/negative/NaN/decimal input is not reachable.
**Fix:** `getCart(true)` on `pageshow` (persisted) and `visibilitychange` → visible, then `setCart`.

### COM-10 — Medium — Loyalty rewards vs the 300 tier (policy/UX)
**Refs:** `server/config/policy.js` REWARDS, voucher = an order-level fixed discount (`integrations/shopify.js` createVoucher); `oka-screens.js:2656-2661`.
**Repro:** Cairo, a basket of exactly 300, 200 points redeemed for "20 off over 300".
**Expected:** the customer pays less.
**Actual:** merch 280 → fee 60. Total goes **336 → 340** (pays 4 EGP more and loses 200 points). The theme computes this correctly, but the reward invites it. "Free delivery (80 EGP off) over 800" is really 80 off the order. Over 300 the fee is at most 56, so the label is wrong (it's in the customer's favour).
**Fix:** make the voucher minimum ≥ 320, or warn in the cart when a code pushes merch under 300 ("this code raises shipping by 24").

### COM-11 — Low — Far zone at exactly 300 offers two rates
The far-zone 80 rate is `0 ≤ total ≤ 300.0` and the 56 rate is `≥ 300`, so at exactly 300 checkout lists both (Shopify preselects the cheapest, 56, matching the theme). A shopper can still pick 80. **Fix:** set the under rate's max to 299.99 (also fixes COM-02).

### COM-12 — Low — Rounded rows don't add up with fractional amounts
**Refs:** `oka.js:59` (`fmtPrice` rounds each row on its own).
**Evidence:** subtotal 100.00, discount 0.50 → rows "100", "−1", "60", total "160" (100 − 1 + 60 = 159). Merch 299.99 shows "Subtotal ٣٠٠" next to the under-300 fee 60 and "add ١ ج.م more" — it looks like a bug to the shopper. Points earned: 299. Not reachable with today's whole-EGP prices and no percentage discounts.
**Fix:** show 2 decimals when the amount isn't whole, or derive the total from the rounded rows.

### COM-13 — Low — "EGP 0 more than before" in the order-edit sheet
**Refs:** `oka-screens.js:2066-2071`. When a quote total differs by 0 < |d| < 0.5, `diff !== 0` but `fmtPrice` prints 0 → "EGP 0 more than before". **Fix:** compare `Math.round(diff)`.

### COM-14 — Low — Arabic-Indic number formatting
**Refs:** `oka.js:57-59`, `snippets/ar-digits.liquid`, `price.liquid`.
- PASS: JS `arDigits` and the Liquid `ar-digits` give identical output for 0–10000; `fmtPrice` "١٨٩ ج.م" / "EGP 189"; `fold()` reads Arabic digits back (only to match governorates); `t()` digit substitution works. **No code parses an Arabic-digit string back into a number for money** (all money math uses cents from cart.js or numeric `data-*` attributes) — PASS.
- No thousands separator: 1014 → "١٠١٤ ج.م" / "EGP 1014" (expected "١٬٠١٤").
- Decimal point stays Latin (`٢٩٩.٩٩`, expected `٢٩٩٫٩٩`). Only visible where unrounded numbers are printed.
- `fmtPrice(NaN)` → "NaN ج.م" (unguarded).
- The discount row is built as `-${fmtPrice(31)}` = "-٣١ ج.م" without `<bdi>`/LRM. In RTL it can render as "ج.م ٣١-" — needs a visual check.

### COM-15 — Info — The 300 tier is applied after discounts
The theme uses `merch` = `cart.total_price` (after line- and order-level discounts) in the cart and checkout. The server says the same (`config/zones.js`: "`under` below FEE_TIER_THRESHOLD of products (after discounts)"). Live orders with "tong free" (#2854021: 298 before / 267 after → 80; #2851021: → 60) are consistent but not conclusive, because both totals are under 300. **Needs a live checkout test:** a tong-free cart with a pre-discount total ≥ 300 and an after-discount total < 300 (e.g. hookah 189 + 2 bowls 98 + Tongs 31 = 318 / 287). Expected fee 60; if Shopify charges 36, the theme overstates by 24.

### COM-16 — Info — Dead `openEditSheet` reprices shipping that is never charged
`oka-screens.js:2280-2383` isn't called anywhere. It shows `subtotal + shippingFor(subtotal)` using the shopper's *selected* address rather than the order's. The edit endpoint it posts to (`server/integrations/shopify.js:717-761`, Shopify order edit) never changes shipping lines. Live order #2850121 shows the result of such an edit: all items removed, 70 shipping still owed. Delete the dead code. The live `openEditOrder` relies on the remote `customer_quote_order` for repricing — **not verifiable here** (see manual list).

### COM-17 — Info — Minimum order
Live `min_order` = 0, so `belowMinimum` is always false. Checkout is never blocked and the note never shows (PASS: `0 > 0` is false, no "add −x" text). With 150 configured, 149.99 is blocked and 150 is allowed (PASS). Docs and `server/config/policy.js` default to **150** (the app enforces it), so the website and the app disagree on purpose ("The website has none"). The added-to-cart bar's `merch >= 0` check is always true.

### COM-18 — Info — Live orders whose shipping doesn't match the zone table (not theme bugs)
- #2849521 (source 88312, app channel): SHR, subtotal 456 → shipping **70** (expected 46).
- #2848421 (web): BH → 60 (zone table: 70). #2847521 (web): ASN, subtotal 477 → **36** (expected 56). Probably the address was changed after checkout.
- #2850121 and three similar orders: edited down to 0 items, 70 shipping still outstanding.

These matter for the "order editing repricing" claim: Shopify order edits don't re-rate shipping by themselves.

---

## Scenarios executed

| # | Scenario | Result |
|---|---|---|
| 1 | Shopify delivery zones read (5 zones, 29 province codes) | PASS (theme table identical) |
| 2 | Code → zone for all 29 codes, upper- and lower-case | PASS 58/58 |
| 3 | 108 free-text spellings (AR/EN, hamza, ta marbuta, ya, harakat, tatweel, case, whitespace, district names) | FAIL 39 (COM-03) |
| 4 | Fee for each free-text spelling @200 vs Shopify | FAIL 26 (COM-03) |
| 5 | Unknown/empty/null/"XX" address | FAIL — silent metro 60 (COM-01) |
| 6 | Threshold matrix 29 codes × {0,1,150,298,299,299.01,299.5,299.99,300,300.01,301,1000,100000} | 314 PASS / 63 FAIL (COM-02) |
| 7 | Exactly 300 in the far zone | PASS for the theme (56); Shopify also offers 80 (COM-11) |
| 8 | Guest cart fee vs checkout, 29 codes × {200, 299, 300} | FAIL 72/87 (COM-01) |
| 9 | cents→EGP (30000, 29999, 30), null cart | PASS |
| 10 | BXGY "tong free" cart totals (31800/28700) | PASS (subtotal 318, discount 31, merch 287) |
| 11 | Rounded rows add up (fractional) | FAIL (COM-12) |
| 12 | PDP fee basis with an automatic discount | FAIL (COM-07) |
| 13 | Card + three fast taps | PASS (qty 4) |
| 14 | Card − below zero | PASS (stops at 0) |
| 15 | Second tab sees the cart change | FAIL (COM-09) |
| 16 | Bundle with one sold-out variant (fake API, all-or-nothing) | PASS (nothing added, toast); real Shopify behaviour → manual |
| 17 | PDP buy is capped at stock − in-cart (code review; `CONTINUE` → 99) | PASS |
| 18 | Quantity 0/negative/NaN/decimal inputs | PASS — no free-text quantity input exists; steppers clamp ≥ 0 |
| 19 | Large quantity (cart stepper max = catalogue stock or 50; 99 for `CONTINUE`) | PASS (code review); over-inventory clamp by Shopify → manual |
| 20 | Discount "Applied" only when cart.js says `applicable` | PASS (code review) |
| 21 | Invalid code after a valid one | FAIL (COM-06, code review) |
| 22 | Free-shipping code display | FAIL (COM-04, code review) |
| 23 | Active discount codes in the store | none active (BLOCKED for live code tests) |
| 24 | Loyalty earn floor (299.99→299, 0, −5→0) | PASS |
| 25 | Store credit → points (Liquid integer math) | PASS (transcribed) |
| 26 | Points worth = floor(balance/10) | PASS |
| 27 | Redeem more than balance | PASS — button "Locked", click ignored (`balance < r.points`), server re-checks (409) |
| 28 | Redeem beyond the order total | PASS — vouchers carry `minOrder` ≥ 10× value; Shopify caps fixed discounts at the subtotal |
| 29 | Voucher + 300 tier | FAIL (COM-10) |
| 30 | Voucher + other codes | The theme sends exactly one code per `/cart/update.js {discount}` call (replacing any other), and the live automatic discounts are set to not combine — stacking isn't possible from the theme. PASS (code review) |
| 31 | Subscriptions 5 % math vs server, 5 baskets | FAIL 5/5 (COM-08) |
| 32 | Order detail COD amount vs outstanding | FAIL (COM-05; live data) |
| 33 | Order edit −/+ and "Add products" repricing | BLOCKED (remote API not in repo); diff display FAIL (COM-13) |
| 34 | Arabic digits: integers, decimals, negatives, thousands, NaN | 9 PASS / 3 FAIL (COM-14) |
| 35 | Arabic-digit string parsed back to a number | PASS (none found) |
| 36 | Minimum order at 0 and at 150 | PASS (COM-17 info) |
| 37 | Compare-at savings display | PASS — PDP shows compare-at only when > price (`main-product.liquid:69`); catalogue `compareAtPrice` rounded; the cart shows no compare-at savings (by design) |
| 38 | Catalogue price rounding (`divided_by: 100.0 | round`) | PASS today (all prices whole); would hide .50 prices in the PDP bar/fee math |
| 39 | Server vs theme governorate resolver on the failing inputs | server 25/28, theme 0/28 |

## Needs manual test on a real device / live preview
1. **Threshold basis (COM-15):** preview cart hookah 189 + 2 bowls 49 + Tongs (tong free → 318/287) to Cairo. Record the fee Shopify checkout charges (theme shows 60).
2. **299.xx gap (COM-02):** needs a percentage discount to reproduce. Confirm checkout says no shipping method is available (or fix the config first).
3. **Guest fee (COM-01):** guest cart (shows 60) → checkout with an Aswan / Dakahlia address. Record 80 / 70.
4. **Order detail COD (COM-05):** sign in as the owner of #2850121 (or any edited / store-credit order) and read "pay the courier …" vs Admin outstanding.
5. Liquid `customer.store_credit_account.balance` units (cents vs a money object) for the loyalty points figure (`oka-loyalty.liquid:9`, `theme.liquid:179`).
6. Free-shipping code: does cart.js report `applicable:true`? Does the theme then strip it (COM-04 / COM-06)?
7. `/cart/add.js` with a bundle where one variant is DENY/0 (coal, foil): confirm all-or-nothing and the toast.
8. `/cart/change.js` above available inventory for a DENY variant: confirm Shopify clamps and the stepper re-syncs.
9. Order edit (`customer_quote_order`): change items so the total crosses 300 both ways and change governorate. Compare the quoted shipping with the zone table, and with the saved order's shipping line in Admin (Shopify order edits don't re-rate shipping on their own — see #2850121).
10. RTL rendering of "-٣١ ج.م" discount rows and of mixed "EGP"/Arabic strings in the order-edit diff line.
11. Cross-tab / Back navigation stepper staleness on iOS Safari and Android Chrome (COM-09).
