# 07 — Visual / RTL / i18n / Accessibility / Performance basics

**Tester:** visual/RTL/i18n/a11y agent · **Date:** 2026-10-14/15 · **Theme:** OKA App Theme (test — unpublished), source `theme/` · **Harness:** local server on port 9420 (`QA_OUT_DIR=qa/harness/out-visual`), Playwright 1.56.1 Chromium, `qa/harness/pw.mjs`.

## Scope and method

- **Routes:** all 58 routes of `qa/reports/smoke.md`.
- **Locale × URL × customer matrix (8 combinations):** `{ar, en}` chosen language (`localStorage['oka.lang']`) × `{/…, /ar/…}` URL form × `{guest, logged in}`, at iPhone 13 (390×664). For each page I ran **axe-core 4.10.2** (WCAG 2.0/2.1/2.2 A+AA + best practice) plus a DOM probe: html `lang`/`dir`, horizontal overflow, elements outside the viewport, clipped text, visible text by script (Latin left on Arabic pages and the reverse), digit systems, input direction, touch targets, accessible names, headings and landmarks, and controls covered by fixed bars (`v1-route-matrix.mjs`, `analyze-matrix.mjs`, `matrix-table.mjs`).
- **Layout sweep:** every HTML route in ar and en at **17 viewports**:
  - portrait phones 320/360/375/390/412/430;
  - landscape phones 667×375, 844×390, 932×430;
  - tablets 768×1024, 820×1180, 1024×768 (touch), 1180×820 (touch);
  - desktop 1024/1280/1440/1920.

  That is 1,938 page loads (`v2-widths.mjs`, `run-widths.sh`).
- **Keyboard and dialogs:** tab order, focus visibility, focus obscured, the side menu, age gate, variant sheet, alert dialog, add-to-cart feedback and reel controls. Reduced motion was checked with `emulateMedia` (`v3-keyboard.mjs`).
- **RTL and i18n:** language persistence, the catalogue `sessionStorage` cache across `/` ↔ `/ar`, bidi visual order (measured from character positions), input direction and RTL carousels (`v4-rtl-i18n.mjs`).
- **Display modes:** computed text contrast, `prefers-color-scheme: dark`, Chrome auto-dark, forced colours, 200 % zoom (equivalent to a 195-px-wide phone and a 640-px desktop), 200 % text scaling, the browser default font size, and fonts in use (`v5-modes.mjs`).
- **Performance:** none / Slow-4G / 3G, each with 4× CPU on the home page and two product pages (`v6-perf.mjs`).
- **Portrait lock and overlay stacking:**
  - landscape phone at device angles 90° and 270°;
  - soft-keyboard simulation (390×844 → 390×300 and 1180×820 → 1180×450 with an input focused);
  - tablet and desktop;
  - z-index of age gate, menu, toast, sheet and alert.

  Script: `v7-lock-zindex.mjs`.
- **Long strings:** toasts and long titles/prices at 320 px (`v8-long-text.mjs`).
- **Locations:** scripts in `qa/tests/visual/`; raw JSON in `qa/tests/visual/out/`; screenshots in `qa/reports/screenshots/visual/` (504 PNG).

**Not covered here:**
- real devices, iOS Safari/WebKit, Samsung Internet or Android WebViews (Chromium only);
- real screen readers (TalkBack/VoiceOver; semantics were checked in the DOM);
- real fonts: the container renders Arabic with DejaVu Sans, so glyph metrics differ from SF Arabic / Noto Sans Arabic;
- real images and videos (harness placeholders and empty mp4s, so video autoplay and LCP image weight are not representative);
- the Shopify CDN (no gzip/brotli or HTTP/2 in the harness);
- checkout (stub).

**Harness quirk:** `pw.mjs` only adds `/ar` when `locale = 'ar'`. My first `/ar` + EN run was therefore really a second `/` run. It was re-run with an explicit `/ar` prefix, and the matrix below uses the corrected data.

## Findings

| ID | Severity | Area | Title |
|---|---|---|---|
| V-01 | Medium | Layout / CSS | Toasts are never centred: the fade-in animation removes `translateX(-50%)`, so every toast starts mid-screen and runs off the edge. The start of Arabic sentences is cut off |
| V-02 | Medium | i18n | The catalogue `sessionStorage` cache is not locale-keyed: after any `/ar/` page, the English UI on `/` shows Arabic product titles and `/ar/` links for 60 s |
| V-03 | Medium | A11y / dialogs | Age gate, side menu, variant sheet, edit sheets and alerts are not modal for keyboard or screen-reader users: no focus move, no trap, no Escape (sheets and alerts), background not inert |
| V-04 | Medium | A11y | "Added to cart", toasts and cart updates are not announced: the theme has no live region (except one on search) |
| V-05 | Medium | A11y / contrast | Secondary text (shipping fee, COD note, subtotal labels, stock, ETA, counts) is 1.8–2.8 : 1. Green reward text is 3.8 : 1 at 10–12 px |
| V-06 | Medium | A11y / i18n | Every icon-button `aria-label` is English-only (Menu, Back, Less/More, Share, Wishlist, Remove, Sound, Search, Full screen, Cart). Product image `alt` is English on Arabic pages |
| V-07 | Medium | A11y | Image-only links have no accessible name: banners, offer cards, cart line images, recommendations, cross-sell (axe `link-name`, 10 routes) |
| V-08 | Medium | A11y / zoom | Pinch-zoom is blocked (`maximum-scale=1`, axe critical on 54 routes). At 200 % zoom or text size, Add buttons, the PDP buy button and cart line totals are pushed off-screen. All font sizes are in px |
| V-09 | Medium | A11y / touch | Undersized touch targets: cart remove ✕ 14×19 px, address Delete / Make-default 16 px tall, checkout-review cart chevron 16×16, story links 16 px tall. Many controls are < 44 px |
| V-10 | Low | A11y / keyboard | Keyboard focus lands on controls hidden under the fixed PDP buy bar (Focus Not Obscured, WCAG 2.4.11) |
| V-11 | Low | Forms / RTL | Add-address fields, the discount code and classic login/register fields have no programmatic label. The contact form's email input is RTL in Arabic |
| V-12 | Low | A11y / motion | Reduced motion is still only partial: PDP buy-button glow loops forever, video reel autoplays regardless, and the reel can't be paused from the keyboard |
| V-13 | Low | A11y / structure | 31 of 58 routes have no `<h1>` (screen titles are `<div>`s, home has none). Address cards are `role=button` with nested buttons. Gallery and policy scrollers aren't keyboard-reachable |
| V-14 | Low | Overlays / z-index | The side menu (z 41) opens above the 18+ age gate (z 40) from the keyboard, so the store can be browsed with the gate up |
| V-15 | Low | i18n / digits | Mixed digit systems in Arabic: Latin digits in Arabic product titles ("12 جرام") next to Arabic-Indic prices, raw ISO timestamps in J&T scan lists, "٣D · AR" |
| V-16 | Low | A11y / forced colours | In forced-colours mode the selected sort/filter chip looks like the others (selection is shown only by background). No `forced-colors` rules exist |
| V-17 | Info | Layout | No horizontal overflow or clipping on any route at 17 viewports in ar and en. Desktop and tablet show the 430-px app column by design |
| V-18 | Info | RTL / bidi | Phone numbers, AWBs, order numbers, prices and carousels render correctly in RTL (measured, not eyeballed) |
| V-19 | Info | Portrait lock | Landscape phones are counter-rotated correctly at both angles and taps hit their targets. F-01 (keyboard) reproduced, and it also triggers on **landscape tablets** with the keyboard open |
| V-20 | Info | Dark mode / fonts | No dark-mode styles. Chrome auto-dark output is readable. No web fonts are loaded (system stack only) |
| V-21 | Info | Performance | JS 227 KB raw (~67 KB gzip) loaded on every page. Startup long task 560–700 ms on Slow-4G + 4× CPU. CLS ≈ 0. 3G: FCP 2.9–4.0 s, LCP 5.4–6.3 s |

---

### V-01 — Medium — Toasts are off-centre and clipped (Arabic loses the start of the sentence)

**Where:** `theme/assets/oka.css:1059-1066`:
- `.toast { left: 50%; transform: translateX(-50%); animation: okaFadeIn .25s var(--ease) both; }`
- `@keyframes okaFadeIn { … to { opacity: 1; transform: none; } }` (`oka.css:117`)

Fill-mode `both` keeps `transform: none`, which overrides `translateX(-50%)`. The toast's left edge therefore sits at 50 % of the app and it grows to the right. `white-space: nowrap` stops it wrapping, and `.app { overflow: hidden }` clips the overflow.

**Repro:** run `node qa/tests/visual/v8-long-text.mjs`, which uses Small 320 at `/collections/all` and calls `Oka.toast(...)` with the theme's own strings.

| Locale | Theme string | Toast left → right (px), viewport 320 |
|---|---|---|
| ar | AWB-copied toast | 160 → 561 |
| ar | `oka.js:851` offer failure | 160 → 489 |
| en | "Saved to your wishlist" (`oka.js:516`) | 160 → 331 (clipped) |

At 390 px the long toasts are still clipped. In Arabic the clipped part is the *beginning* of the sentence, because the text runs right-to-left.

**Expected:** a centred toast that wraps on narrow screens. **Actual:** off-centre, and the first words are lost.

**Evidence:** `screenshots/visual/long-toast-320-ar.png`, `long-toast-320-en.png`, `out/long-text.json`.

**Fix:** give the toast its own keyframes that keep the centring (`from { transform: translate(-50%, 10px) } to { transform: translate(-50%, 0) }`), or centre it with `left: 12px; right: 12px; margin-inline: auto; width: max-content; max-width: calc(100% - 24px)`. Also allow wrapping (`white-space: normal; text-align: center`). (`.swipe-up` already does this correctly with its own keyframes.)

### V-02 — Medium — Catalogue cache mixes languages between `/` and `/ar/` (confirms the harness note)

**Where:** `theme/assets/oka.js:317-334` (`loadCatalogue`). The key `oka.catalogue` in `sessionStorage` is reused for 60 s whatever URL locale it came from. On `/ar/…`, `templates/collection.oka-data.liquid` emits the translated `p.title`/`c.title` into `titleEn`/`en` and `/ar/…` URLs. For example `cats[0].en = " شيشة اوكا المتميزة "` and `products[0].titleEn = "أوكا فوشيا"`, `url = "/ar/products/…"`.

**Repro:** `v4-rtl-i18n.mjs` §2. In a context with English chosen:
1. Open `/ar/` and wait 2.5 s; the catalogue is cached.
2. Go to `/cart`; the page is `lang=en`.
3. The cart line titles and the cross-sell rail show Arabic: `line-title: أوكا ابيض`, `cs-title: كماشة فحم`, …
4. The rail links point to `/ar/products/…`. Following one forces the page back to Arabic (F-07).
5. `/search?q=cobra` likewise shows `gcard-title: أوكا كوبرا`.

A fresh context that never visited `/ar` shows no Arabic (control).

**Evidence:** `screenshots/visual/i18n-cart-en-after-ar-catalogue-cache.png`, `i18n-search-en-after-ar-catalogue-cache.png`, `out/rtl-i18n.json` (`cacheAfterArVisit`, `cartEnAfterAr`, `cartEnControl`).

**Related:** with EN toggled *on* an `/ar/` page, the server-rendered `.l-en` spans already hold the translated title (`أوكا كوبرا` on `/ar/products/oka-cobra`; `i18n-en-toggled-on-ar-url-pdp.png`).

**Fix:**
- Key the cache by `Shopify.locale` / `request.locale.iso_code`, e.g. `oka.catalogue.<locale>`.
- In `collection.oka-data.liquid`, emit the untranslated English title for `titleEn`. On non-primary locales the Liquid `title` is the translation, so use a metafield or a primary-locale fetch.
- Emit locale-free `url`s (or strip `request.locale` prefixes on the client).

### V-03 — Medium — Overlays aren't modal for keyboard or screen-reader users

**Repro:** `v3-keyboard.mjs`, Desktop 1440 en and iPhone 13 ar. Results are in `out/keyboard.json`.

**Side menu** (`oka.js:697-742`):
- Opening it with Enter moves focus to the `<nav>` (good) and Escape closes it and returns focus (good).
- After the 11 menu items, Tab moves to `body` and then to the **page behind** (top bar, banners) while the menu stays open. `#content` is not `inert` or `aria-hidden` while the menu is open (`menuBackgroundInert: {contentInert:false}`).

**Age gate** (`oka.js:657-669`):
- A plain `div.overlay.age-gate` with no `role="dialog"` or `aria-modal`, and focus is not moved to it.
- Its buttons come last in the DOM, so a keyboard user tabs through ~60 page controls hidden under the gate first. All of them report `obscured by div.overlay.age-gate`.
- Screen readers read the whole store behind it.

**Variant sheet** (`oka-screens.js:969-1000`, cart "Change") and the edit-order sheets (`oka-screens.js:2114`, `2309`):
- No role, label or `aria-modal`.
- Focus stays on the trigger button.
- Escape does nothing: `sheetAfterEsc.stillOpen = true`.
- Tab walks the cart behind the sheet (`sheetTabs` all `[OUT]`).

**`okaAlert`** (`oka.js:631-655`):
- `role="alertdialog" aria-modal="true"` but no `aria-labelledby`/`aria-describedby`.
- Focus is not moved into it (it stays on the page's `step-btn`).
- Escape does not close it, and Tab moves to background controls.

**Evidence:** `kb-*-menu-open-tabbing.png`, `kb-*-cart-variant-sheet.png`, `agegate-ar.png`.

**Fix:** use one shared modal helper:
- set `role="dialog"` with `aria-modal` and `aria-labelledby` on the title;
- move focus to the first control (or the dialog itself);
- trap Tab and close on Escape (except the age gate);
- set `inert` on `#content`, `.top-bar` and `.menu-handle` while open, and return focus on close.

Native `<dialog>` with `showModal()` gives most of this for free.

### V-04 — Medium — Add-to-cart and other confirmations are silent for screen readers

**Where:** `oka.js:292-313`. `.added-bar` and `.toast` are injected with no `role="status"` or `aria-live`. The only live region in the theme is on the search results count.

**Repro:**
1. Open `/products/oka-cobra` and focus the buy button.
2. Press Enter.

`.added-bar` appears, but `liveRegions: []` and focus stays on the button (`pdpAfterAdd`). The card −/+ quantity span has `aria-live="polite"` (`oka.js:779`), but it only exists after the first add.

**Fix:** add a persistent visually-hidden `<div role="status" aria-live="polite">` to `#app` and write each toast or added-bar message into it. Optionally move focus to the "View cart" link in the bar.

### V-05 — Medium — Low-contrast secondary text

**Where:** `oka.css:10-19`:

| Token | Value | Blended on white | Contrast |
|---|---|---|---|
| `--muted` | `rgba(110,110,115,0.45)` | — | ≈ 1.8 : 1 |
| `--ink-soft` | `rgba(110,110,115,0.7)` | ≈ `#9a9a9d` | 2.6–2.8 : 1 |
| `--ink-softer` | `rgba(110,110,115,0.5)` | — | ≈ 2.0 : 1 |
| `--green` (`#1f8f4e`) | — | on white | 3.8 : 1 |

**Measured** (`v5-modes.mjs` computed-contrast probe, `out/modes.json`; same results in ar and en):

| Text | Ratio | Size |
|---|---|---|
| "كاش عند الاستلام / Cash on delivery" (PDP) | 1.84 | 11.5 px |
| PDP shipping fee "٣٦ ج.م" | 1.99 | — |
| "متوفر / In stock" | 1.99 | — |
| Collection count "٣ منتج" | 1.95 | — |
| ETA "١-٢ يوم" | 2.33 | — |
| Cart "Subtotal" | 2.69 | — |
| Shipping hint "ضيف ٣٣ ج.م كمان…" | 2.52 | — |
| Order "No AWB has been issued…" | 2.56 | — |
| Rewards "هتاخد ٢٦٧ نقطة" | 3.8 | 12 px |
| "Often bought together" | 3.78 | 10.5 px |

axe confirmed `color-contrast` violations on `.line-variant b` (cart "غيّر/Change") and `.wa` (track page). It left a further 3,243 nodes on 56 routes as "incomplete", because the text sits on alpha or gradient backgrounds.

Several of these lines carry money information (fee, COD, totals). WCAG 1.4.3 needs 4.5 : 1.

**Fix:** use opaque greys ≥ `#6e6e73` (4.6 : 1 on white) for secondary text and `#177a41` or darker for green text. Keep the alpha tints only for decoration.

### V-06 — Medium — English-only accessible names on Arabic pages

**Where:** hard-coded `aria-label`s:
- `layout/theme.liquid:223` (`Menu`), `238`, `246` (`Close`)
- `snippets/heart-btn.liquid` (`Save to wishlist`)
- `snippets/screen-header.liquid` (`Back`)
- `sections/main-product.liquid:153` (`Sound`)
- `oka-screens.js:988`, `2115`, `2310` (`Close`), `1174` (`Cart`)
- PDP `Share`/`Wishlist`/`Less`/`More`/`Full screen`, cart `Remove`, search `aria-label="Search"`

The card steppers in `oka.js:779` do use `L()`, which shows the fix pattern.

**Measured in the matrix (Arabic pages):**
- "Menu" and "OKA egypt" on 52 routes, "Back" on 42, Less/More/Share/Wishlist/Cart on every PDP.
- Product `<img alt>` holds the English product title on Arabic pages at root URLs: 52 distinct alts such as "Tobacco Bowls- Mint - 12g" and "OKA Cobra" (`englishAltOnAr`).
- The language toggle's name is just "EN" / "ع".

A TalkBack/VoiceOver user in Arabic hears English (or mispronounced) labels.

**Fix:** render both names (`aria-label` can't hold two spans), for example `data-label-en`/`data-label-ar` swapped in `applyAttrs()` the way placeholders already are (`oka.js:51-55`). Use `title_ar` for the `alt` in Arabic, and label the toggle "English / العربية".

### V-07 — Medium — Image-only links without a name

**Evidence:** axe `link-name` (serious), 504 nodes across 10 routes.

| Link | Source |
|---|---|
| Home banners `.banner-fill` | `snippets/banner-page.liquid:44` |
| Offer cards `.offer-card` | `sections/oka-home.liquid:79` |
| PDP recommendation images `.rcard-img` | `oka-screens.js:572` |
| Cart line images `.line-img` | `oka-screens.js:807` |
| Cart cross-sell `.cs-card` | `oka-screens.js:841` |

The JS helper `img(src, alt = '')` (`oka-screens.js:36`) is always called without an alt. Keyboard tab order on home includes three unnamed links before the first named product control (`kb-en-home-after-30-tabs.png`).

**Fix:** pass the product or banner title as `alt`, or `aria-label` the link. Alternatively mark the duplicate image link `tabindex="-1" aria-hidden="true"` when a titled link to the same URL follows.

### V-08 — Medium — Zoom: pinch blocked; 200 % zoom or text pushes buttons off-screen

**Where:** `layout/theme.liquid:39` sets `maximum-scale=1` (axe `meta-viewport`, **critical**, 54 routes); this **confirms F-13**. `oka.css` has 293 `font-size: …px` rules and 0 rem/em rules.

**Repro:** `v5-modes.mjs` §5.

- **200 % page zoom** (a 390-px phone at 200 % = 195 CSS px wide), in Arabic:
  - `/collections/oka-cobra` and `/search?q=hookah`: `.gcard-add` "عبيلي فالشنطة" spans x = −34…78, i.e. off the left edge;
  - `/products/oka-cobra`: the buy CTA spans x = −15…113;
  - `/cart`: line totals spans x = −19…2, i.e. invisible.
  - English shows the same on the PDP stepper and the cart totals.
- **200 % text** (computed sizes doubled): the Add buttons overflow the cards (`textscale200-ar-_collections_oka_cobra.png`).
- **Browser default font size of 32 px:** product titles stay at 21 px, because px sizes ignore the setting.

**Evidence:** `zoom-zoom200-phone-ar-*.png`, `out/modes.json`.

**Fix:** drop `maximum-scale=1`. Let the card action row wrap (`flex-wrap: wrap`, `min-width: 0`, buttons `max-width: 100%`, text wrapping). Consider rem for body text.

**Note:** iOS Safari ignores `maximum-scale` for pinch, but Android Chrome honours it unless the user enabled "Force enable zoom".

### V-09 — Medium — Touch targets too small

**Measured** (iPhone 13; `tinyTargets` are < 24 px, below the WCAG 2.5.8 minimum):

| Control | Size | Source |
|---|---|---|
| Cart remove ✕ `.line-remove` | 14×19 | `oka.css:696` (`padding: 2px; font-size: 12px`) |
| Address `Delete` / `Make default` `.addr-action` | 29–80 × 15–16 | `oka.css:859`; axe `target-size` serious |
| Checkout-review hero cart chevron link | 16×16 | `oka-screens.js:1174` |
| Story links "How to prepare it →" | 16 px tall | — |
| Track "Also see it on the J&T website" | 16 px tall | — |
| Cart "Change" | 22 px tall | — |
| Add-address "Make this my default address" row | 20 px tall | — |

The 44 px guideline is missed by 79 controls on home, 113 on `/collections/all` and 21 on each PDP (hearts, chips, steppers 34–38 px).

The cart ✕ sits next to the stepper, so mis-taps delete lines.

**Fix:** pad these to at least 44×44 (or 24×24 with spacing). Use `::after` hit-area expansion where the visual must stay small.

### V-10 — Low — Focus hidden under the fixed buy bar

**Repro:** on iPhone 13 (ar), Tab through `/products/oka-cobra`. Recommendation titles get focus while sitting under `.buy-bar` / `button.cta.glow` (`pdpTabs`: `[obsc:div.buy-bar]`, `[obsc:button.cta.glow]`). The screen doesn't scroll them clear.

**Fix:** `scroll-padding-bottom` on the PDP scroller equal to the buy-bar height (plus `scroll-padding-top` for the floating top bar).

### V-11 — Low — Form labels and input direction

- **Unlabelled inputs:** the add-address inputs use visual labels that aren't `<label for>` (`sections/oka-add-address.liquid`). The cart discount input has only a placeholder. Classic `/account/login|register|reset|activate` inputs have no labels (axe `label`, critical, on 3 routes; these templates are dead per SI-01).
- **Direction:** `contact[email]` (and the name) is `direction: rtl` in Arabic (`sections/oka-contact.liquid:13`); emails should be `dir="ltr"`. Phone inputs are already LTR (good), and a typed `+201001234567` stays in order (`rtl-add-address-phone-typed.png`).
- **Empty-submit errors:** the error behaviour of add-address on empty submit could not be exercised here, because the form only renders for a signed-in customer and the keyboard run was a guest. Covered by the forms testers.

**Fix:**
- Wrap each visual label in `<label for>`, or add `aria-labelledby`.
- Give the discount input `aria-label` = its placeholder.
- Add `dir="ltr"` to email, code and AWB inputs.

### V-12 — Low — Reduced motion only partly honoured (confirms and extends F-13)

`emulateMedia({reducedMotion:'reduce'})`:

| Where | What still runs / happens |
|---|---|
| Home | Everything stops (swipe-up cue, ribbon spin, compare sweep; menu transitions become 0 s) ✔ |
| PDP | `okaGlow` keeps looping infinitely on `.cta.glow.buy-cta` (`out/keyboard.json` `motion-reduce`) |
| Video reel (`oka-screens.js:518-544`) | Autoplays muted on scroll-in without checking `prefers-reduced-motion` |
| Reel `<video>` controls | Removed by the code |
| Reel play/pause | Only a click on the non-focusable `.reel-item` div (`tabIndex -1`, no role), so keyboard users can't pause looping video (WCAG 2.2.2) |
| Reel sound button | No `aria-pressed` |

Autoplay itself could not be observed, because harness videos are empty files; the reel rows are from code review.

**Fix:**
- Wrap `.glow` and the screen fade-ins in `@media (prefers-reduced-motion: no-preference)`.
- Skip `play()` when reduced motion is set.
- Add a focusable play/pause button per reel item and `aria-pressed` on the sound button.

### V-13 — Low — Heading structure, nesting, scrollers

- **No `<h1>`:** axe `page-has-heading-one` on 31 routes, including home, orders detail, addresses, loyalty, support, checkout-review, search, contact and the 404 pages. `snippets/screen-header.liquid` renders the title as `<div class="hdr-title">`.
- **Nested interactive:** address cards are `div role="button" tabindex="0"` containing Delete / Make-default buttons (`sections/oka-addresses.liquid:14`; axe `nested-interactive`).
- **Unreachable scrollers:** `.pdp-gallery` (on `oka-cobra-oka-base`) and the policy container aren't focusable scroll regions (axe `scrollable-region-focusable`).
- **Policy content:** `/policies/shipping-policy` skips heading levels and the privacy policy has empty `<h2>`s.

**Fix:** make `.hdr-title` an `<h1>` (home: a visually-hidden `<h1>`). Make the address card's select action a real button beside the others.

### V-14 — Low — Side menu opens above the age gate

**Where:** `.age-gate` z-index 40 (`oka.css:980`) vs `.menu-scrim` 40 and `.side-menu` 41 (`oka.css:165-170`).

**Repro:** `v7-lock-zindex.mjs` §4.
1. Load with the gate up.
2. Tab to the top-bar Menu button behind the gate.
3. Press Enter.

`menuOpen: true`, and the hit test over the menu returns `side-menu` (`z-menu-over-agegate.png`). Every link works. The gate reappears on the next page because nothing was stored, so this is a nuisance more than a bypass.

**Fix:** put the gate above everything (z ≥ 60) and make the rest `inert` while it shows (see V-03).

### V-15 — Low — Digit systems mixed in Arabic

- **Prices and counts** use Arabic-Indic digits (`snippets/price.liquid`, `num.liquid`).
- **Product data:** Arabic product titles from `oka.title_ar` contain Latin digits ("السما الزرقا - حجر جاهز للشرب- 12 جرام", "سعة 15جرام"; 66 distinct strings across 14+ routes). A card therefore reads "١٨٩ ج.م" under "12 جرام".
- **J&T scan times** are shown raw as `2026-10-13 09:15:00` in Latin digits. On the order detail (`oka-screens.js:1864`) they are not even isolated. In RTL the date and time swap places visually (time left, date right); the track page wraps them in `.nums` (`:1394`).
- **Hard-coded:** "٣D · AR" (`main-product.liquid:53`) mixes systems.
- **Order numbers** (#9000101) and phones stay Latin. That is acceptable and consistent.

**Fix:** run titles through `arDigits` when shown in Arabic (or fix the metafield data). Format scan times with `Intl.DateTimeFormat('ar-EG')`. Use "3D" or "ثلاثي الأبعاد".

### V-16 — Low — Forced colours: selection state lost

With `forcedColors: 'active'`, `.chip.dark` (the selected sort) and the plain `.chip`s all render with a transparent background and the same 1 px border (`out/modes.json` `forcedColors`). The same applies to the side menu's active link. Icon SVGs use `currentColor`, so they stay visible ✔.

**Evidence:** `mode-forced-colors-_collections_oka_cobra.png`.

**Fix:** add `@media (forced-colors: active) { .chip.dark, .side-link.active { border: 2px solid Highlight; } }` or `aria-pressed` with an outline.

### V-17 — Info — Layout sweep clean

There is no document-level horizontal overflow, no element beyond the viewport, and no hard-clipped text on any route at 17 viewports in ar and en (`out/widths-*.json`). Long titles are line-clamped to 2 lines by design (ellipsis). A 90-character title or a 5-digit price at 320 px leaves only a 6-px overflow in the ar price row, which `.gcard-row` hides.

**Probe noise:**
- The rotated landscape-phone layout reports off-viewport boxes; that is a measurement artefact of the rotation.
- "Covered by `.top-bar`" hits are content scrolled beneath the glass bar, which can be scrolled clear. That is intended.

Desktop and tablet show the 430-px app column centred on grey; the side menu and handle stay inside the column.

### V-18 — Info — RTL and bidi verified

- **`lang`/`dir`:** correct on every theme route for `/` in ar and en, and for `/ar/` in ar. `/ar/` with EN chosen renders `lang=ar` on all 51 theme routes (see F-07 below). The checkout stub and `gift_card` are `lang=en` with no `dir` (SI-19).
- **Visual order** (from glyph x-positions in `out/rtl-i18n.json` `bidi`):
  - phones `+2010…` render in correct order on 11 occurrences (`.nums` isolate);
  - AWBs and `#9000101` are correct;
  - `EGP 300` is correct in en;
  - Arabic ranges "١-٢ يوم" read correctly right-to-left.
- **Chevrons and arrows:** the `.flip` class mirrors them, and `story-cross b` is mirrored in Arabic.
- **RTL carousels:** rails scroll with negative `scrollLeft`, and the active slot advances correctly in both directions (`rails`).
- **Language toggle:** persists across navigation and reload on root URLs (`langPersistence`).

### V-19 — Info — Portrait lock behaviour (F-01 confirmed and extended)

**Landscape phone, 844×390:**

| Device angle | `--rot` | `.app` transform |
|---|---|---|
| 90° | −90° | `matrix(0,-1,1,0,…)` |
| 270° | +90° | `matrix(0,1,-1,0,…)` |

Taps on visible controls hit them (`hit.ok: true`), and the side menu slides in along the rotated start edge (`lock-phone-land-*.png`).

**Never locked:** desktop 1280 and a 1180×820 touch tablet.

**Keyboard simulation** (viewport height shrinks with an input focused):
- **Phone, 390×844 → 390×300:** the lock media query turns on and the whole UI rotates while typing. The focused cart discount input and contact textarea end up **off-screen** (`visible:false`). This **confirms F-01**.
- **Landscape tablet, 1180×820 → 1180×450** (keyboard open on an Android tablet WebView or older Chrome): the tablet **also rotates**, because `max-height: 540px` matches. The CSS comment says tablets lay out normally, so this extends F-01's scope to tablets.

**Evidence:** `lock-keyboard-*.png`. Same fix as F-01.

### V-20 — Info — Dark mode and fonts

- **`prefers-color-scheme: dark`:** nothing changes (`body` stays `rgb(245,245,247)`, no `color-scheme`). This **confirms the F-13 Info item**.
- **Chrome auto-dark** (`--enable-features=WebContentsForceDark`): stays readable. The glass top bar becomes black and the logo is inverted (`mode-forcedark-*.png`).
- **Web fonts:** none are requested (0 font requests). The stack is system fonts (`-apple-system … "SF Arabic" … "Noto Sans Arabic" … sans-serif`), so "web font fails" can't happen. Arabic in screenshots renders with DejaVu Sans (a container limitation).

### V-21 — Info — Performance basics (harness, not CDN)

Pixel 7, ar, cache disabled (`out/perf.json`):

| Profile | Page | load (ms) | FCP | LCP | `window.Oka` ready | Long tasks (ms) | CLS | DOM nodes |
|---|---|---|---|---|---|---|---|---|
| none | / | 465 | 284 | 324 | 633 | 84 | 0 | 982 |
| none | /products/oka-cobra | 336 | 312 | 608 | 439 | 114 | 0 | 372 |
| none | /pages/orders?order=#9000101 | 454 | 268 | 492 | 587 | 116,110 | 0 | **1,383** |
| Slow-4G + 4×CPU | / | 2,795 | 2,284 | 2,368 | 2,949 | **698**,57,57 | 0 | 982 |
| Slow-4G + 4×CPU | /products/oka-cobra | 2,466 | 1,980 | 2,608 | 2,805 | **562**,134,91,140,62 | 0.001 | 372 |
| Slow-4G + 4×CPU | /products/oka-cloud-white-hookah | 2,931 | 2,136 | 2,700 | 3,178 | **641**,… | 0.0005 | 432 |
| 3G + 4×CPU | / | 6,607 | 4,036 | 5,372 | 6,760 | 480,453,… | 0 | 982 |
| 3G + 4×CPU | /products/oka-cobra | 5,903 | 2,892 | 6,136 | 6,171 | 260,253 | 0.0009 | 372 |

**Transfer per page:**
- JS 227 KB (`oka-screens.js` 185 KB + `oka.js` 47 KB, unminified; gzip ≈ 51 + 16 KB);
- CSS 103 KB (gzip ≈ 21 KB) — `oka.css` is the only render-blocking resource;
- catalogue JSON 79–84 KB fetched on every page unless cached (60 s);
- images are placeholders, so their weight is not meaningful.

**Images:**
- Server-rendered images all carry width/height, and grids are lazy-loaded (home: 57 of 64 lazy).
- JS-rendered images (`.rcard-img`, `.line-img`, `.cs-card`, `.arx-fallback`, reel) have no dimensions: 7–12 per PDP or cart. CLS is still ≈ 0 because the containers are fixed-size.
- The order-detail page loads all 26 images eagerly.

**Suggestions:**
- Minify the JS, and split `oka-screens.js` per template (each page runs one screen).
- Defer catalogue warm-up on pages that don't use it.
- Add `loading="lazy"` on order-detail images.

**Note:** real CDN compression, HTTP/2 and real images will change these numbers. The ~0.6 s startup long task on a mid-range phone is the part to watch.

## Confirm / refute of related items from reports 02–05

| Item | Verdict | Evidence |
|---|---|---|
| F-01 portrait lock + keyboard | **Confirmed**, and extended to landscape tablets (V-19) | `out/lock-zindex.json` `keyboard-*` |
| F-07 EN doesn't stick on `/ar/` URLs | **Confirmed** on all 51 theme routes, guest and customer: `lang=ar` despite `oka.lang=en`. The side-menu Home link on `/ar` pages is `/ar`, so it stays Arabic. Toggling EN on an `/ar` page shows translated (Arabic) titles in the EN spans | `matrix-arurl-en-*.json`, `langPersistence` |
| F-08 toast / added-bar behind the AR screen | **Confirmed** by CSS stacking (toast 45, added-bar 46 < `.ar-screen` 50). Toast vs side menu is fine (toast 45 > menu 41) | `oka.css:1061,1293,1471`; `z-toast-over-menu.png` |
| F-09 `100vh` fallback | **Not testable** in modern Chromium (dvh supported) → device list | — |
| F-13 reduced motion / `maximum-scale` / no dark mode | **Confirmed**: axe critical `meta-viewport` on 54 routes; `okaGlow` loops under reduce; no dark styles. **Partly refuted:** on home, *all* animations do stop under reduce (swipe-up, ribbon, compare, menu) | `out/keyboard.json` `motion-*` |
| SI-06 policies not translated | **Confirmed**: English policy bodies on Arabic pages (privacy, terms, refund, shipping, contact) | `latinOnAr` |
| SI-10 missing `description_ar` | **Confirmed**: the English tongs description shows on Arabic `/products/tongs` | `latinOnAr` |
| SI-19 gift card English/LTR | **Confirmed**: `lang=en`, no `dir` | matrix |
| Harness note: catalogue cache mixes languages | **Confirmed** (V-02) | `out/rtl-i18n.json` |
| COM-14 "-" sign not bidi-isolated | **Not reproduced**: no negative amounts were rendered on the routes tested. Neutral | — |

**Tally:**

| Verdict | Count | Items |
|---|---|---|
| Confirmed | 8 | F-01 (extended to tablets), F-07, F-08, F-13, SI-06, SI-10, SI-19, harness catalogue-cache note |
| Partly refuted | 1 | F-13 reduced motion: home animations do stop |
| Fully refuted | 0 | — |
| Not testable / not reproduced here | 2 | F-09, COM-14 |

## Per-route matrix

Each cell is `HTTP status · rendered html lang · a<critical+serious axe violation rules>/<all violation rules>`, measured at iPhone 13 (390×664). The last column gives, across 17 viewports × ar/en, *routes with document overflow / routes with elements beyond the viewport*, excluding the rotated landscape layout.

`root-*` means the route is loaded as-is. `arurl-*` means it is prefixed with `/ar` (the explicit `/ar/…` routes are covered in the `root-*` columns). The two axe rules present everywhere are `meta-viewport` (critical) and, where image links exist, `link-name` (serious).

`/collections/all?view=oka-data` is JSON; axe ran on Chromium's JSON viewer, so it is not meaningful.

| Route | root-ar-guest | root-ar-cust | root-en-guest | root-en-cust | arurl-ar-guest | arurl-ar-cust | arurl-en-guest | arurl-en-cust | 17 widths × ar/en: doc overflow / off-viewport (excl. rotated landscape) |
|---|---|---|---|---|---|---|---|---|---|
| `/` | 200 ar a2/2 | 200 ar a2/2 | 200 en a2/2 | 200 en a2/2 | 200 ar a2/2 | 200 ar a2/2 | 200 ar a2/2 | 200 ar a2/2 | 0/0 of 34 |
| `/collections` | 200 ar a1/1 | 200 ar a1/1 | 200 en a1/1 | 200 en a1/1 | 200 ar a1/1 | 200 ar a1/1 | 200 ar a1/1 | 200 ar a1/1 | 0/0 of 34 |
| `/collections/oka-cobra` | 200 ar a1/1 | 200 ar a1/1 | 200 en a1/1 | 200 en a1/1 | 200 ar a1/1 | 200 ar a1/1 | 200 ar a1/1 | 200 ar a1/1 | 0/0 of 34 |
| `/collections/ready-to-smoke-bowls?sort_by=price-ascending` | 200 ar a1/1 | 200 ar a1/1 | 200 en a1/1 | 200 en a1/1 | 200 ar a1/1 | 200 ar a1/1 | 200 ar a1/1 | 200 ar a1/1 | 0/0 of 34 |
| `/collections/all?filter.v.availability=1` | 200 ar a1/1 | 200 ar a1/1 | 200 en a1/1 | 200 en a1/1 | 200 ar a1/1 | 200 ar a1/1 | 200 ar a1/1 | 200 ar a1/1 | 0/0 of 34 |
| `/collections/hookahs?page=2` | 200 ar a1/1 | 200 ar a1/1 | 200 en a1/1 | 200 en a1/1 | 200 ar a1/1 | 200 ar a1/1 | 200 ar a1/1 | 200 ar a1/1 | 0/0 of 34 |
| `/collections/all?view=oka-data` | 200 - a2/4 | 200 - a2/4 | 200 - a2/4 | 200 - a2/4 | 200 - a2/4 | 200 - a2/4 | 200 - a2/4 | 200 - a2/4 | n/a |
| `/collections/does-not-exist` | 404 ar a1/2 | 404 ar a1/2 | 404 en a1/2 | 404 en a1/2 | 404 ar a1/2 | 404 ar a1/2 | 404 ar a1/2 | 404 ar a1/2 | 0/0 of 34 |
| `/products/oka-cloud-white-hookah` | 200 ar a3/3 | 200 ar a3/3 | 200 en a3/3 | 200 en a3/3 | 200 ar a3/3 | 200 ar a3/3 | 200 ar a3/3 | 200 ar a3/3 | 0/0 of 34 |
| `/products/oka-cobra` | 200 ar a2/2 | 200 ar a2/2 | 200 en a2/2 | 200 en a2/2 | 200 ar a2/2 | 200 ar a2/2 | 200 ar a2/2 | 200 ar a2/2 | 0/0 of 34 |
| `/products/oka-black-tobacco` | 200 ar a3/3 | 200 ar a3/3 | 200 en a3/3 | 200 en a3/3 | 200 ar a3/3 | 200 ar a3/3 | 200 ar a3/3 | 200 ar a3/3 | 0/0 of 34 |
| `/products/oka-cobra-oka-base` | 200 ar a3/3 | 200 ar a3/3 | 200 en a3/3 | 200 en a3/3 | 200 ar a3/3 | 200 ar a3/3 | 200 ar a3/3 | 200 ar a3/3 | 0/0 of 34 |
| `/products/1-pcs-of-foil` | 200 ar a2/2 | 200 ar a2/2 | 200 en a2/2 | 200 en a2/2 | 200 ar a2/2 | 200 ar a2/2 | 200 ar a2/2 | 200 ar a2/2 | 0/0 of 34 |
| `/products/tongs?variant=46037718303018` | 200 ar a2/2 | 200 ar a2/2 | 200 en a2/2 | 200 en a2/2 | 200 ar a2/2 | 200 ar a2/2 | 200 ar a2/2 | 200 ar a2/2 | 0/0 of 34 |
| `/products/oka-cloud-white-hookah?view=ar` | 200 ar a1/1 | 200 ar a1/1 | 200 en a1/1 | 200 en a1/1 | 200 ar a1/1 | 200 ar a1/1 | 200 ar a1/1 | 200 ar a1/1 | 0/0 of 34 |
| `/products/tongs?view=ar` | 200 ar a1/1 | 200 ar a1/1 | 200 en a1/1 | 200 en a1/1 | 200 ar a1/1 | 200 ar a1/1 | 200 ar a1/1 | 200 ar a1/1 | 0/0 of 34 |
| `/products/foil` | 404 ar a1/2 | 404 ar a1/2 | 404 en a1/2 | 404 en a1/2 | 404 ar a1/2 | 404 ar a1/2 | 404 ar a1/2 | 404 ar a1/2 | 0/0 of 34 |
| `/pages/account` | 200 ar a1/1 | 200 ar a1/1 | 200 en a1/1 | 200 en a1/1 | 200 ar a1/1 | 200 ar a1/1 | 200 ar a1/1 | 200 ar a1/1 | 0/0 of 34 |
| `/pages/orders` | 200 ar a1/1 | 200 ar a1/1 | 200 en a1/1 | 200 en a1/1 | 200 ar a1/1 | 200 ar a1/1 | 200 ar a1/1 | 200 ar a1/1 | 0/0 of 34 |
| `/pages/orders?order=%239000101` | 200 ar a1/1 | 200 ar a1/2 | 200 en a1/1 | 200 en a1/2 | 200 ar a1/1 | 200 ar a1/2 | 200 ar a1/1 | 200 ar a1/2 | 0/0 of 34 |
| `/pages/addresses` | 200 ar a1/2 | 200 ar a3/4 | 200 en a1/2 | 200 en a3/4 | 200 ar a1/2 | 200 ar a3/4 | 200 ar a1/2 | 200 ar a3/4 | 0/0 of 34 |
| `/pages/addresses?view=oka-add-address` | 200 ar a1/2 | 200 ar a1/2 | 200 en a1/2 | 200 en a1/2 | 200 ar a1/2 | 200 ar a1/2 | 200 ar a1/2 | 200 ar a1/2 | 0/0 of 34 |
| `/pages/loyalty` | 200 ar a1/2 | 200 ar a1/2 | 200 en a1/2 | 200 en a1/2 | 200 ar a1/2 | 200 ar a1/2 | 200 ar a1/2 | 200 ar a1/2 | 0/0 of 34 |
| `/pages/subscriptions` | 200 ar a1/2 | 200 ar a1/2 | 200 en a1/2 | 200 en a1/2 | 200 ar a1/2 | 200 ar a1/2 | 200 ar a1/2 | 200 ar a1/2 | 0/0 of 34 |
| `/pages/subscriptions?view=oka-subscribe` | 200 ar a1/2 | 200 ar a1/2 | 200 en a1/2 | 200 en a1/2 | 200 ar a1/2 | 200 ar a1/2 | 200 ar a1/2 | 200 ar a1/2 | 0/0 of 34 |
| `/pages/wishlist` | 200 ar a1/2 | 200 ar a1/2 | 200 en a1/2 | 200 en a1/2 | 200 ar a1/2 | 200 ar a1/2 | 200 ar a1/2 | 200 ar a1/2 | 0/0 of 34 |
| `/pages/support` | 200 ar a1/2 | 200 ar a1/2 | 200 en a1/2 | 200 en a1/2 | 200 ar a1/2 | 200 ar a1/2 | 200 ar a1/2 | 200 ar a1/2 | 0/0 of 34 |
| `/pages/checkout-review` | 200 ar a1/2 | 200 ar a1/2 | 200 en a1/2 | 200 en a1/2 | 200 ar a1/2 | 200 ar a1/2 | 200 ar a1/2 | 200 ar a1/2 | 0/0 of 34 |
| `/pages/track?awb=JEGQA0000000002&order=%239000103` | 200 ar a1/2 | 200 ar a1/2 | 200 en a2/3 | 200 en a2/3 | 200 ar a1/2 | 200 ar a1/2 | 200 ar a1/2 | 200 ar a1/2 | 0/0 of 34 |
| `/pages/about-us` | 200 ar a1/2 | 200 ar a1/2 | 200 en a1/2 | 200 en a1/2 | 200 ar a1/2 | 200 ar a1/2 | 200 ar a1/2 | 200 ar a1/2 | 0/0 of 34 |
| `/pages/how-to-use` | 200 ar a2/3 | 200 ar a2/3 | 200 en a2/3 | 200 en a2/3 | 200 ar a2/3 | 200 ar a2/3 | 200 ar a2/3 | 200 ar a2/3 | 0/0 of 34 |
| `/pages/contact` | 200 ar a1/2 | 200 ar a1/2 | 200 en a1/2 | 200 en a1/2 | 200 ar a1/2 | 200 ar a1/2 | 200 ar a1/2 | 200 ar a1/2 | 0/0 of 34 |
| `/pages/faq` | 200 ar a1/2 | 200 ar a1/2 | 200 en a1/2 | 200 en a1/2 | 200 ar a1/2 | 200 ar a1/2 | 200 ar a1/2 | 200 ar a1/2 | 0/0 of 34 |
| `/pages/online-store` | 200 ar a1/1 | 200 ar a1/1 | 200 en a1/1 | 200 en a1/1 | 200 ar a1/1 | 200 ar a1/1 | 200 ar a1/1 | 200 ar a1/1 | 0/0 of 34 |
| `/search` | 200 ar a1/2 | 200 ar a1/2 | 200 en a1/2 | 200 en a1/2 | 200 ar a1/2 | 200 ar a1/2 | 200 ar a1/2 | 200 ar a1/2 | 0/0 of 34 |
| `/search?q=%D8%B4%D9%8A%D8%B4%D9%87` | 200 ar a1/2 | 200 ar a1/2 | 200 en a1/2 | 200 en a1/2 | 200 ar a1/2 | 200 ar a1/2 | 200 ar a1/2 | 200 ar a1/2 | 0/0 of 34 |
| `/search?q=hookah` | 200 ar a1/2 | 200 ar a1/2 | 200 en a1/2 | 200 en a1/2 | 200 ar a1/2 | 200 ar a1/2 | 200 ar a1/2 | 200 ar a1/2 | 0/0 of 34 |
| `/cart` | 200 ar a2/2 | 200 ar a2/2 | 200 en a3/3 | 200 en a3/3 | 200 ar a2/2 | 200 ar a2/2 | 200 ar a2/2 | 200 ar a2/2 | 0/0 of 34 |
| `/account` | 200 ar a1/2 | 200 ar a1/1 | 200 en a1/2 | 200 en a1/1 | 200 ar a1/2 | 200 ar a1/1 | 200 ar a1/2 | 200 ar a1/1 | 0/0 of 34 |
| `/account/login` | 200 ar a1/2 | 200 ar a1/1 | 200 en a1/2 | 200 en a1/1 | 200 ar a1/2 | 200 ar a1/1 | 200 ar a1/2 | 200 ar a1/1 | 0/0 of 34 |
| `/account/register` | 200 ar a2/3 | 200 ar a2/3 | 200 en a2/3 | 200 en a2/3 | 200 ar a2/3 | 200 ar a2/3 | 200 ar a2/3 | 200 ar a2/3 | 0/0 of 34 |
| `/account/addresses` | 200 ar a1/2 | 200 ar a3/4 | 200 en a1/2 | 200 en a3/4 | 200 ar a1/2 | 200 ar a3/4 | 200 ar a1/2 | 200 ar a3/4 | 0/0 of 34 |
| `/account/orders/9100000003` | 200 ar a1/2 | 200 ar a1/2 | 200 en a1/2 | 200 en a1/2 | 200 ar a1/2 | 200 ar a1/2 | 200 ar a1/2 | 200 ar a1/2 | 0/0 of 34 |
| `/account/reset/9000000000001/qatoken` | 200 ar a2/3 | 200 ar a2/3 | 200 en a2/3 | 200 en a2/3 | 200 ar a2/3 | 200 ar a2/3 | 200 ar a2/3 | 200 ar a2/3 | 0/0 of 34 |
| `/account/activate/9000000000001/qatoken` | 200 ar a2/3 | 200 ar a2/3 | 200 en a2/3 | 200 en a2/3 | 200 ar a2/3 | 200 ar a2/3 | 200 ar a2/3 | 200 ar a2/3 | 0/0 of 34 |
| `/policies/refund-policy` | 200 ar a1/1 | 200 ar a1/1 | 200 en a1/1 | 200 en a1/1 | 200 ar a1/1 | 200 ar a1/1 | 200 ar a1/1 | 200 ar a1/1 | 0/0 of 34 |
| `/policies/privacy-policy` | 200 ar a1/2 | 200 ar a1/2 | 200 en a1/2 | 200 en a1/2 | 200 ar a1/2 | 200 ar a1/2 | 200 ar a1/2 | 200 ar a1/2 | 0/0 of 34 |
| `/policies/shipping-policy` | 200 ar a2/3 | 200 ar a2/3 | 200 en a2/3 | 200 en a2/3 | 200 ar a2/3 | 200 ar a2/3 | 200 ar a2/3 | 200 ar a2/3 | 0/0 of 34 |
| `/policies/terms-of-service` | 200 ar a1/1 | 200 ar a1/1 | 200 en a1/1 | 200 en a1/1 | 200 ar a1/1 | 200 ar a1/1 | 200 ar a1/1 | 200 ar a1/1 | 0/0 of 34 |
| `/policies/contact-information` | 200 ar a1/1 | 200 ar a1/1 | 200 en a1/1 | 200 en a1/1 | 200 ar a1/1 | 200 ar a1/1 | 200 ar a1/1 | 200 ar a1/1 | 0/0 of 34 |
| `/password` | 200 ar a0/1 | 200 ar a0/1 | 200 ar a0/1 | 200 ar a0/1 | 200 ar a0/1 | 200 ar a0/1 | 200 ar a0/1 | 200 ar a0/1 | 0/0 of 34 |
| `/gift_cards/qa12345678` | 200 en a0/3 | 200 en a0/3 | 200 en a0/3 | 200 en a0/3 | 200 en a0/3 | 200 en a0/3 | 200 en a0/3 | 200 en a0/3 | 0/0 of 34 |
| `/nope-404` | 404 ar a1/2 | 404 ar a1/2 | 404 en a1/2 | 404 en a1/2 | 404 ar a1/2 | 404 ar a1/2 | 404 ar a1/2 | 404 ar a1/2 | 0/0 of 34 |
| `/ar/` | 200 ar a2/2 | 200 ar a2/2 | 200 ar a2/2 | 200 ar a2/2 | (=/ar route) | (=/ar route) | (=/ar route) | (=/ar route) | 0/0 of 34 |
| `/ar/products/oka-cobra` | 200 ar a2/2 | 200 ar a2/2 | 200 ar a2/2 | 200 ar a2/2 | (=/ar route) | (=/ar route) | (=/ar route) | (=/ar route) | 0/0 of 34 |
| `/ar/collections/hookahs` | 200 ar a1/1 | 200 ar a1/1 | 200 ar a1/1 | 200 ar a1/1 | (=/ar route) | (=/ar route) | (=/ar route) | (=/ar route) | 0/0 of 34 |
| `/ar/pages/support` | 200 ar a1/2 | 200 ar a1/2 | 200 ar a1/2 | 200 ar a1/2 | (=/ar route) | (=/ar route) | (=/ar route) | (=/ar route) | 0/0 of 34 |
| `/checkout` | 200 en a0/2 | 200 en a0/2 | 200 en a0/2 | 200 en a0/2 | 200 en a0/2 | 200 en a0/2 | 200 en a0/2 | 200 en a0/2 | 0/0 of 34 |

Raw per-page data, including axe targets, small targets, script and digit findings and input lists: `qa/tests/visual/out/matrix-*.json`. Text summary: `out/matrix-summary.txt`.

## Scenarios executed

**Route matrix**
- [PASS] 58 routes × 8 combinations (ar/en × `/`, `/ar` × guest/customer): 448 page loads, axe + probe, 0 page errors.

**Layout and long text**
- [PASS] Layout sweep at 17 viewports × ar/en × 57 HTML routes (1,938 loads): 0 document overflow, 0 off-viewport (portrait/tablet/desktop), 0 hard-clipped text (V-17).
- [PASS] Long title (90 characters) / 5-digit price in a grid card at 320 px, ar + en (2-line clamp; 6 px hidden overflow in the ar price row).
- [FAIL] Long and short toasts at 320/390 px, ar + en (V-01).

**Portrait lock**
- [PASS] Landscape phone 844×390 at 90° and 270°: rotation, hit testing, side menu.
- [PASS] Desktop 1280 and touch tablet 1180×820: no lock.
- [FAIL] Phone keyboard simulation 390×300 on search/cart/add-address/contact: rotates, focused input off-screen (F-01).
- [FAIL] Tablet keyboard simulation 1180×450: rotates (V-19).

**Language and i18n**
- [PASS] `html lang/dir` per locale on root URLs; [FAIL] EN on `/ar` URLs (F-07).
- [PASS] Language toggle persists across navigation and reload (root URLs).
- [FAIL] Language on `/ar` with EN saved (F-07); side-menu links keep `/ar`.
- [FAIL] Catalogue cache across `/ar/` → `/cart` and `/search` in EN (V-02); [PASS] control without an `/ar` visit.
- [FAIL] Untranslated English on Arabic pages: policies, tongs description, J&T scan texts (mock data — real texts unknown), English `alt`/`aria-label` (V-06).
- [PASS] Arabic leaking into English pages: none, except the checkout stub (harness) and the V-02 cache case.
- [FAIL/Low] Digit consistency (V-15).

**Bidi and RTL**
- [PASS] Bidi order of phones, AWBs, order numbers, EGP amounts, Arabic ranges, ar + en, 16 customer routes.
- [PASS] Phone inputs LTR in RTL; typed `+20…` stays in order.
- [FAIL/Low] Email input RTL on the contact form (V-11).
- [PASS] RTL carousels (6 home rails): direction, snap, active-slot tracking.
- [PASS] Arrows/chevrons mirrored in RTL.

**Accessibility**
- [FAIL] axe on all routes and locales (V-05, V-07, V-08, V-09, V-11, V-13).
- [PASS] Visible focus indicator: Chrome's default ring is shown on all 30 home tab stops in both locales.
- [FAIL] Focus not obscured (V-10).
- [PASS] Side menu Enter opens it, focus moves in, Escape closes it, focus returns.
- [FAIL] Menu focus trap / inert background (V-03).
- [FAIL] Age gate semantics and keyboard (V-03, V-14).
- [FAIL] Variant sheet focus, Escape, trap (V-03).
- [FAIL] Alert dialog focus, label, Escape (V-03).
- [FAIL] Add to cart by keyboard announces nothing (V-04); [PASS] adding works by keyboard.
- [FAIL] Accessible names for icon buttons in Arabic (V-06); [PASS] they exist in English (heart, −/+, share, menu, back, close).
- [FAIL] Touch targets (V-09).
- [FAIL] Reduced motion on PDP and reel (V-12); [PASS] on home.
- [FAIL] Contrast (V-05).
- [FAIL] 200 % zoom (195 px and 640 px) and 200 % text (V-08); [FAIL] pinch zoom blocked.

**Display modes**
- [PASS/Info] `prefers-color-scheme: dark` (no change), Chrome auto-dark readable.
- [FAIL/Low] Forced colours selection state (V-16).
- [PASS] Fonts: no web-font dependency.

**Overlays and z-index**
- [PASS] Toast above the open side menu.
- [PASS] Sheet scrim covers the top bar and menu handle.
- [FAIL] Menu above the age gate (V-14).
- [FAIL] Toast/added-bar under the AR screen (F-08, CSS).

**Performance**
- [PASS/Info] Perf none / Slow-4G / 3G + 4× CPU on home and 2 PDPs; none on collection, cart and order detail (V-21).

**Blocked**
- [BLOCKED] Video reel autoplay and pause behaviour: harness videos are empty files (code review only).
- [BLOCKED] Real AR overlay in camera mode.
- [BLOCKED] Real screen-reader output.
- [BLOCKED] Add-address empty-submit error announcement (guest run; form needs a customer).

## Needs manual test on a real device / live preview

- TalkBack (Arabic) and VoiceOver (Arabic): reading order of the bilingual `l-en`/`l-ar` spans, the English `aria-label`s (V-06), and silent add-to-cart (V-04).
- iOS Safari and Android Chrome, Samsung Internet, and the FB/IG/TikTok in-app browsers:
  - portrait lock with the real keyboard (F-01 / V-19);
  - `100vh` bars (F-09);
  - real pinch zoom with `maximum-scale=1`;
  - the system "Larger text" / font scale (px-only CSS).
- The real Arabic system fonts (SF Arabic, Noto Sans Arabic): line-clamp and button widths with the real glyph widths (container screenshots use DejaVu Sans).
- Real product images and videos on the CDN: LCP, reel autoplay under reduced motion and data-saver, poster sizes.
- Samsung Internet forced dark and Android "dark theme for web pages" with the real logo and images.
- Windows High Contrast on desktop (V-16).
- The real J&T scan texts and time formats in Arabic (V-15; the mock data is English).
- Live preview: whether the toast centring (V-01) and the catalogue cache (V-02) behave the same with Shopify's real `/ar` translations.
