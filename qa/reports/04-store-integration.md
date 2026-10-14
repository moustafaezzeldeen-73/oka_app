# 04 — Store integration audit (theme ↔ live OKA store content)

**Scope.** If "OKA App Theme (test — unpublished)" (gid://shopify/OnlineStoreTheme/191458214186) were published on OKA egypt today with the live settings in `qa/settings_data.live.json`, does every collection, page, product, variant, image, video, metafield, menu, locale, policy and account route it depends on exist and is it correct?

**Method.**
- Ran static greps over `/home/user/oka_app/theme` covering routes, `settings.*`, `metafields.*`, `| t`, `shopify://` refs, forms and currency strings.
- Made read-only Shopify Admin GraphQL queries (`graphql_query`, `get-shop-info`, `search_docs_chunks`), pulled on 2026-10-14, covering: shop, shopLocales, publications, the 10 setting collections, all 50 products, all pages, menus, blogs, themes and their template file lists (MAIN vs test), 42 `shopify://` files, discounts, metafield definitions, shop metafield `oka.recs`, policies, and policy translations.
- **No mutations were made.** No storefront loads either, because the network blocks okaegypt.com and cdn.shopify.com.

**Not covered / limits.**
- Nothing was rendered: Liquid behaviour is inferred from the code plus Shopify docs.
- No real-device AR, camera or new-customer-account flows were run (see the manual-test list).
- No WhatsApp, J&T or run.app endpoints were called.

---

## Findings

| ID | Severity | Area | Title |
|---|---|---|---|
| SI-01 | High | Customer accounts | Store uses **new customer accounts**: the add/edit/delete address flows post to classic `/account/addresses` and the classic login/register templates are dead |
| SI-02 | High | Home feed / catalogue | 4 of the 10 setting collections (`hookahs`, `hoses`, `coal`, `bowls`) are dropped from the home feed **and from the app catalogue `cats`** (dedupe skips them) |
| SI-03 | Medium | Templates | 3 live hookah PDPs use `templateSuffix: product-oka` and `/pages/faq` uses `faq`. Neither template exists in the test theme, so both fall back to the default (intended?). The `blog`/`article` templates are missing too, and the main menu links `/blogs/news` |
| SI-04 | Medium | Live site today | The 9 OKA pages (`/pages/account`, `orders`, …) are **already published** on the store, but the MAIN theme has no `page.oka-*` templates, so today they render as empty pages |
| SI-05 | Medium | Locales / checkout | Shop primary locale is **English**, with Arabic published at `/ar`. The theme forces Arabic UI on `/`, yet checkout (`/checkout`) and all `/pages/…` links stay unlocalized, so Arabic shoppers get an English checkout |
| SI-06 | Medium | Policies | Policies on the store are the 2023/2025 versions; the 2026-10-06 rewrite in `docs/policies` is **not published**. Privacy, Terms and Contact have **no Arabic translation**, so the `/ar/policies/…` links show English |
| SI-07 | Low | Policies | The `contact_information` row in `policies-page.liquid` never renders, because the Liquid `shop` object has no such property |
| SI-08 | Medium | Settings | `whatsapp` is empty: the Support WhatsApp button is hidden and there is no WhatsApp fallback for edit/cancel. The setting text promises one |
| SI-09 | Medium | Settings | `proxy_path` and `service_url` are empty: Subscribe & Save, the account subscriptions row, server wishlist sync and the service-backed loyalty/subscription screens are hidden or show "service missing" |
| SI-10 | Medium | Metafields | `oka.description_ar` is missing on 5 live products (tongs, tongs-foil-combo, standard-15-g-bowl-glazed, trio-party, the-hexa-party), so the Arabic description shows English |
| SI-11 | Low | AR | Only 5 live products have a 3D model. The AR screen is reachable from the PDP only when a model exists, but `?view=ar` on any other product shows "coming soon". This works; it is noted for coverage |
| SI-12 | Low | Collections | The `hookahs` collection's Arabic *translation* title is "شيشة اوكا المتميزة" (premium), copied from the premium collection. The theme uses the metafield (correct), but Translate & Adapt / SEO show the wrong name |
| SI-13 | Info | Collections | `oka-basic-hookahs-copy` is the real "OKA Premium Hookahs" collection. The handle is a copy artifact but load-bearing: settings, a banner and 2 automatic discounts reference it. **Do not rename** |
| SI-14 | Low | Catalogue | 2 live products are sold out (`3-coconut-coal-pcs`, `1-pcs-of-foil`: DENY, qty 0). Every other product is CONTINUE with heavily negative inventory, so stock badges read "In stock" |
| SI-15 | Info | Offers | Both bundle offers resolve: all 5 variant IDs exist, are ACTIVE and purchasable. The price shown in the offer image depends on automatic discounts (`tong free`, `Valentines`) and was not verified against the image |
| SI-16 | Info | Currency | Shop is EGP-only (`{{amount}} EGP`). The theme hardcodes `EGP n` / `n ج.م`, whole pounds, which is consistent. Checkout format differs slightly (`189.00 EGP`) |
| SI-17 | Low | Menus | The theme does not use any linklist (the side menu is hardcoded), so About us, How to use, FAQ, Contact and Online Store are unreachable from navigation (how-to-use only via PDP story) |
| SI-18 | Info | Locales | `locales/*.json` contain only `general.note`. **No `| t` key is used anywhere**, so no keys are missing. All UI strings are hardcoded EN/AR pairs via `bi` |
| SI-19 | Low | Gift card | `gift_card.liquid` is English-only and LTR. The store has 0 gift-card products, so it is effectively unused |
| SI-20 | Info | Recs | `shop.metafields.oka.recs` exists (built 2026-10-08, 13,364 orders) but references 3 DRAFT products (barbie, victoria-pink-copy, premium-copy). The client must ignore unknown handles |

---

### SI-01 — New customer accounts make classic address forms and templates dead (High)
**Evidence (Admin API):** `shop.customerAccountsV2 = { customerAccountsVersion: NEW_CUSTOMER_ACCOUNTS, url: https://account.okaegypt.com, loginRequiredAtCheckout:false }`. The menu `customer-account-main-menu` points to `https://account.okaegypt.com/orders`.
**Code:**
- `sections/oka-add-address.liquid:20`: `{% form 'customer_address', customer.new_address %}`, which posts to `/account/addresses`.
- `assets/oka-screens.js:2470,2497,2641`: `postForm('/account/addresses/${id}', {_method:'put'|'delete'})`.
- `templates/customers/{login,register,reset_password,activate_account,addresses,account,order}.json` are classic templates.

Per shopify.dev ("Legacy customer account templates are deprecated… customer accounts now operate independently of themes"), these templates are never rendered with new accounts, and `/account/*` redirects to account.okaegypt.com.

**Expected:** saving, editing or deleting an address from `/pages/addresses` updates the customer record.
**Actual (inferred, needs device test):** the POST to `/account/addresses` is not served on new accounts and will redirect or fail. The README claim that "addresses work on Shopify alone" doesn't hold.
**Still OK:** `theme.liquid:158` uses `routes.storefront_login_url | default: routes.account_login_url`, which is correct for new accounts. Reading `customer.addresses` and `customer.orders` in Liquid should still work when signed in (verify).
**Fix:** route address CRUD through the order service (Customer Account API) or link to `routes.account_addresses_url` (account.okaegypt.com/profile). Drop the dead classic templates, or keep them knowing they are unused.

### SI-02 — Home-feed dedupe hides 4 configured collections (High)
`snippets/live-collections.liquid` with `dedupe: true` (used by `oka-home.liquid:21` and `collection.oka-data.liquid:73`) counts only products not already seen in an earlier collection. Here are the live Online-Store products per collection, in settings order:

| # | Handle | Title | Published to Online Store | Sort | Image | Products (active+published / total) | Unique after dedupe | Feed / catalogue `cats` | Search chips (no dedupe) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | oka-basic-hookahs-copy | OKA Premium Hookahs | yes | MANUAL | yes | 3 / 5 (2 DRAFT copies) | 3 | shown | shown |
| 2 | oka-parties | OKA Parties | yes | BEST_SELLING | yes | 2 / 2 | 2 | shown | shown |
| 3 | oka-cobra | OKA Cobra | yes | MANUAL | yes | 3 / 3 | 3 | shown | shown |
| 4 | dark-tobacco | Dark Tobacco | yes | BEST_SELLING | yes | 2 / 2 | 2 | shown | shown |
| 5 | ready-to-smoke-bowls | Ready to smoke bowls | yes | ALPHA_ASC | yes | 15 / 15 | 15 | shown | shown |
| 6 | oka-parts | OKA Parts | yes | MANUAL | yes | 13 / 14 (1 ARCHIVED) | 12 (LED base seen in cobra) | shown | shown |
| 7 | hookahs | OKA basic Hookahs | yes | MANUAL | yes | 2 / 2 | **0** (white and pink are in #1) | **SKIPPED** | shown |
| 8 | hoses | Hoses | yes | BEST_SELLING | yes | 3 / 3 | **0** (all in #6) | **SKIPPED** | shown |
| 9 | coal | Coal | yes | BEST_SELLING | yes | 4 / 7 (1 DRAFT, 2 ARCHIVED) | **0** (all in #6) | **SKIPPED** | shown |
| 10 | bowls | Bowls | yes | CREATED_DESC | yes | 2 / 7 (2 DRAFT, 3 ARCHIVED) | **0** (both in #6) | **SKIPPED** | shown |

**Impact:**
- The app's CATS list (catalogue `cats`, used by the categories list, edit-order sheet and subscription builder per `settings_schema.json`) loses Hoses, Coal and Bowls, so all accessories are lumped under "OKA Parts".
- Search chips (no dedupe) still list all 10, so the two views are inconsistent.
- Truly empty collections (zero published products): **none right now.**

**Fix:** use dedupe only for rails, not for `cats`. Or reorder settings (specific collections before "OKA Parts"), or remove "OKA Parts"/`hookahs` from settings.
**Note:** `hookahs` contains only white and pink. Carbon Black is only in Premium, so "basic" has nothing of its own.

### SI-03 — Template suffixes in the store vs templates in this theme (Medium)

| Resource | templateSuffix in store | In test theme? | In MAIN theme? | Result on publish |
|---|---|---|---|---|
| products oka-cloud-white-hookah, oka-carbon-black-hookah, oka-victoria-pink-hookah (ACTIVE) | `product-oka` | no | yes (`product.product-oka.json`) | falls back to `product.json` (works, but the main-theme layout is lost) |
| products oka-barbie-pink-hookah, oka-victoria-pink-copy, oka-victoria-pink-premium-copy (DRAFT) | `product-oka` | no | yes | n/a |
| other products | `""`/null | default | default | ok |
| all 10 collections | `""`/null | default | default | ok |
| page contact | `contact` | yes | yes | ok |
| page about-us | `about-us` | yes | yes | ok |
| page how-to-use | `how-to-use` | yes | yes | ok |
| page online-store | `online-store` | yes | yes | ok (renders `main-list-collections`) |
| page faq | `faq` | **no** | yes | falls back to `page.json` (body text shown, FAQ design lost) |
| pages account, orders, addresses, loyalty, subscriptions, wishlist, support, checkout-review, track | `oka-*` | yes | **no** | ok on publish |
| (no page uses) | `product-bundles`, `page.offer-details` | no | yes | unused |
| `product.ar` | not assigned to any product (by design) | yes | — | reached via `?view=ar` (`main-product.liquid:21,48`, `oka.js:838`) |

Also missing from the test theme: `templates/blog.json` and `article.json`. Blog `news` exists (0 articles) and is in `main-menu` → `/blogs/news`. Shopify behaviour without the template needs a live check (likely an error or empty page). The test theme's own menu doesn't link it, but external or old links do.

**Fix:** add `product.product-oka.json` (or clear the suffix), plus `page.faq.json`, `blog.json` and `article.json`, or a redirect.

### SI-04 — OKA pages are live today on the MAIN theme with no template (Medium)
All required pages exist, are published and have the right suffix (see the matrix below). The MAIN theme "Updated Website with new Prices- rev2" lacks every `page.oka-*` template, so `/pages/account`, `/pages/orders`, … currently render as empty "Account"/"Orders" pages on www.okaegypt.com (published 2026-10-02/05).
**Fix:** hide them until launch, or accept. Needs a live check.

### SI-05 — Locale and checkout language mismatch (Medium)
`shopLocales`: `en` primary + published, `ar` published (not primary). The BRIEF says the default language is Arabic, but the store's primary is English.
- `layout/theme.liquid:73-80`: the UI language comes from localStorage, else `settings.default_lang` (`ar`). The URL locale wins only when it is non-primary (`/ar`).
- `theme.liquid:152`: `checkout: '/checkout'` is hardcoded, and every `/pages/…` href is unprefixed. On `/` an Arabic-UI shopper gets checkout, order emails and Shopify-rendered policy pages in English, and moving from `/ar/...` drops back to the English locale.
- Product and collection Arabic comes from `oka.title_ar` / `oka.description_ar` (theme note in `en.default.json`), not from Translate & Adapt. The `ar` translations also exist for most products (title/body_html), but the theme ignores them except in checkout.

**Fix:** make Arabic the primary locale, or send Arabic-UI shoppers to `/ar` routes (`routes.root_url` / `request.locale`) and `/ar/checkout`. Needs a live preview check.

### SI-06 — Policies: outdated content, partial Arabic (Medium)

| Policy | Exists | Last updated (store) | Arabic translation | docs/policies (2026-10-06) | Notes |
|---|---|---|---|---|---|
| Refund | yes | 2025-12-04 | yes | newer version not published | |
| Shipping | yes | 2025-12-04 | yes | newer version not published (fee table 60/36, 70/46, 80/56) | |
| Privacy | yes | 2023-08-15 | **no** | not published | still says "oka-eg.com", dated 6/7/2023 |
| Terms | yes | 2023-08-15 | **no** | not published | |
| Contact | yes | 2023-08-15 | **no** | not published (adds the returns office) | |

The theme links: `oka-support.liquid:58-61` (refund, shipping, privacy, terms), using `shop.*_policy.url`, so all resolve. `snippets/policies-page.liquid` links `/ar/policies/...` for the Arabic UI; for privacy and terms that shows English text.
**Fix:** publish `docs/policies/*.en.html` and `*.ar.html` through Settings → Policies plus Translate & Adapt.

### SI-07 — Contact-information policy row is dead (Low)
`snippets/policies-page.liquid:12,17`: `shop['contact_information']` is not a Liquid shop property (the documented ones are privacy_policy, refund_policy, shipping_policy, subscription_policy, terms_of_service). So the row is always skipped, although the store has the Contact policy at `/policies/contact-information`.
**Fix:** link `/policies/contact-information` directly.

### SI-08 — `whatsapp` = "" (Medium)
- `oka-support.liquid:15`: the WhatsApp chat button is not rendered at all, so the Support screen has no direct contact.
- `oka.js:627`: `whatsappUrl()` would build `https://wa.me/?text=…` (no number), which is only reachable from `support()`, and that is gated, so there's no broken link today.
- `settings_schema.json` (OKA order service paragraph) says that without the proxy, edit/cancel "fall back to WhatsApp". With both empty there is no human fallback. Edit/cancel currently work through `orders_api_key` (set), and lose any fallback if that API fails.

**Fix:** set the number, which is on record in the Contact policy (value not repeated here).

### SI-09 — `proxy_path` = "" and `service_url` = "" (Medium)
- `theme.liquid:254`: the Subscriptions link is removed from the side menu.
- `oka-account.liquid:20,24`: the subscriptions row and the service-only rows are hidden.
- `oka.js:492`: wishlist sync is skipped.
- `oka-screens.js:2731,2800`: the loyalty-redeem and subscription builders render `serviceMissing()`.

The pages `/pages/subscriptions` and `?view=oka-subscribe` still exist and are reachable by URL, and show the "missing" state. Order edit/cancel and J&T tracking go through `orders_api_url` / `jt_tracking_url` (both set), so they are unaffected by the proxy. The empty values are consistent with the README's "Shopify-only" mode; this is a feature-coverage gap, not a crash.

### SI-10 — Product × theme-field coverage matrix (Medium for the AR-description gaps)
The fields the theme reads:
- `product.metafields.oka.title_ar`, `oka.description_ar`
- media `model` (glb/usdz)
- media `video` / `external_video` (reel)
- `pdp-story` handle families
- `featured_image`, `images`
- variant price, compare_at, inventory

Shop: `metafields.oka.recs`. Collections: `metafields.oka.title_ar`.

No metafield definitions exist for `oka.*` (unstructured). They work in Liquid but can't be edited as typed fields in admin.

Legend: Y present, **–** missing, n/a not applicable. All 37 ACTIVE products are published to the Online Store and have ≥1 image and 1 variant.

| Product (ACTIVE) | title_ar | description_ar | 3D model (glb+usdz) | Video reel | pdp-story | templateSuffix | Stock | Price (compare) |
|---|---|---|---|---|---|---|---|---|
| oka-cloud-white-hookah | Y | Y | Y | Y | oka | product-oka | CONTINUE | 169 |
| oka-carbon-black-hookah | Y | Y | Y | – | oka | product-oka | CONTINUE | 189 |
| oka-victoria-pink-hookah | Y | Y | Y | – | oka | product-oka | CONTINUE | 169 |
| oka-cobra | Y | Y | Y | – | cobra | – | CONTINUE | 189 |
| oka-cobra-oka-base | Y | Y | – | – | cobra | – | CONTINUE | 357 (409) |
| oka-cobra-led-rechargeable-base | Y | Y | – | – | base | – | CONTINUE | 189 |
| oka-black-tobacco-plate | Y | Y | Y | Y | black | – | CONTINUE | 209 |
| oka-black-tobacco | Y | Y (typo "أوڤا") | – | Y | black | – | CONTINUE | 199 |
| trio-party | Y | **–** | – | – | – | – | CONTINUE | 447 (507) |
| the-hexa-party | Y | **–** | – | – | – | – | CONTINUE | 774 (1014) |
| 15 × tobacco-bowls-*-12g | Y | Y | – | – | – | – | CONTINUE | 39–49 |
| oka-stem | Y | Y | – | – | – | – | CONTINUE | 110 |
| copy-of-oka-stem-3-pieces (title "OKA-STEM 1 piece") | Y | Y | – | – | – | – | CONTINUE | 59 |
| steel-plate | Y | Y | – | – | – | – | CONTINUE | 39 |
| untitled-sep8_15-46 | Y | Y | – | – | – | – | CONTINUE | 94 |
| oka-gourmets-hose-bowl | Y | Y | – | – | – | – | CONTINUE | 10 |
| premium-1-5-m-hose | Y | Y | – | – | – | – | CONTINUE | 45 |
| standard-1-5-m-hose | Y | Y | – | – | – | – | CONTINUE | 30 |
| standard-15-g-bowl-glazed | Y | **–** | – | – | – | – | CONTINUE | 29 |
| tongs | Y | **–** | – | – | – | – | CONTINUE | 31 |
| tongs-foil-combo | Y | **–** (also no `ar` translations) | – | – | – | – | CONTINUE | 69 |
| 3-coconut-coal-pcs | Y | Y | – | – | – | – | **DENY, 0 → sold out** | 25 |
| 1-pcs-of-foil | Y | Y | – | – | – | – | **DENY, 0 → sold out** | 5 |

Collections: all 10 have `oka.title_ar`; none has `oka.description_ar` (the theme doesn't need it for collections).

Product handles hardcoded in `snippets/pdp-story.liquid:9-17` and the `/products/…` links (`oka-cobra`, `oka-cobra-led-rechargeable-base`) all exist and are ACTIVE.

Without `description_ar`, `main-product.liquid:16` falls back to the English description in Arabic UI. The 5 products without it have no story, so the plain description is what shows.

### SI-11 — AR screen reachability (Low / Info)
- **3D models (live):** oka-cloud-white-hookah, oka-carbon-black-hookah, oka-victoria-pink-hookah, oka-cobra, oka-black-tobacco-plate. Each has both glb and usdz. Two DRAFT copies also have models.
- **Reached by:** the PDP `3D · AR` chip (`main-product.liquid:48`, only if a model exists), the inline AR snap page (if glb), and `data-ar` in `oka.js:838`, all pointing to `/products/<h>?view=ar`.
- **Without a model:** `oka-ar.liquid` shows the photo, a "Photo" chip and "A 3D model for this product is coming soon"; Add to cart still works. Fine.

### SI-12 — Wrong Arabic translation on `hookahs` (Low)
`translations(ar)` for `hookahs` gives title " شيشة اوكا المتميزة " (premium) and a body copied from premium. Its metafield `title_ar` = "شيشة أوكا الأساسية" (correct). The theme uses the metafield, but checkout, SEO and any Translate & Adapt surface show the wrong name.
**Fix:** correct it in Translate & Adapt.

### SI-13 — `oka-basic-hookahs-copy` handle (Info)
It is intended: it is the real Premium collection (5 products, 3 live, MANUAL sort, image, `oka.title_ar` metafield). It is referenced by `oka_collections`, by `index.json` banner `banner-premium.before` (the first banner, which becomes the **opening screen**), and by automatic discounts "The Trio Party" / "The Hexa Party" (collections `hookahs` + `oka-basic-hookahs-copy`). Renaming the handle would break settings and banners, though discounts reference it by ID.
**Recommendation:** leave the handle as is, or rename it and add a URL redirect while re-picking it in theme settings.

### SI-14 — Stock signal (Low)
33 of 35 purchasable variants are CONTINUE with negative inventory, so `main-product.liquid:7-13` gives stock 99 and "In stock". The 2 DENY/0 products show "Out of stock". They still appear in feed rails as `data-soldout`, and are *not* skipped, because live-collections counts sold-out products. That's acceptable, but they take up feed slots.

### SI-15 — Index / about-us / how-to-use content references (Info: all resolve)
- **Bundle variant IDs:** 47026198217002 (OKA white, 169), 49400093081898 (Blue Cloud bowl, 49), 49400060805418 (Iced Lemon Mint bowl, 49), 46037718303018 (Tongs, 31), 49371416363306 (OKA Pink, 169). All are ACTIVE, published, availableForSale, single-variant. Nothing is dead or sold out.
  - Bundle-1 list = 298 EGP. The automatic BXGY "tong free" (spend ≥266 EGP in `hookahs` + `ready-to-smoke-bowls`, get tongs free) gives 267.
  - Bundle-2 = 467 EGP. Two hookahs trigger "Valentines" (buy 2 listed hookahs, get 3 of tongs/bowls at 24 EGP off each), and "tong free" may also apply.
  - Whether the offer image's advertised price matches the cart **could not be verified** because the images are not viewable here. Check on preview.
- **Offer `collection`:** `hookahs` exists (link target only).
- **Banner/compare `before`:** oka-basic-hookahs-copy, oka-parties, oka-cobra, dark-tobacco, ready-to-smoke-bowls, oka-parts all exist and are live, so each banner sits before its collection.
- **`shopify://shop_images/*`:** all 40 image refs in index, about-us and how-to-use exist and are READY, including `6.png` (exact match).
- **`shopify://files/videos/*`:** "25 Bowl prep.mp4" and "35 silicon Bowl prep.mp4" exist and are READY. Both video blocks also carry the **same** YouTube URL (`_9VUPq3SxOc`) for two different guides (Low, content).
- **how-to-use:** blocks b1, b2, b3, b6, b7 and b8 have empty `text_en`/`text_ar` (image + heading only). This is cosmetic.

### SI-16 — Currency
`moneyFormat`/`moneyWithCurrencyFormat` = `{{amount}} EGP`, and EGP is the only presentment currency. The theme's `snippets/price.liquid` and `oka.js:59` hardcode "EGP n" / "n ج.م" with rounding to whole pounds. All live prices are whole numbers, so nothing is lost. No Markets risk today. If a non-EGP market is ever enabled, every theme price would be wrong (they ignore `money`).

### SI-17 — Menus (Low)
Store menus: `main-menu` (Home, Store, How to Use, About us, FAQ, Blog, Refund Policy), `footer` (Search), `customer-account-main-menu`. The theme reads **no** `linklists`: the side menu is hardcoded (`theme.liquid:250-310`). So no handle is missing, but these pages lose all navigation entry points: `/pages/about-us`, `/pages/contact`, `/pages/faq`, `/pages/online-store`, `/blogs/news`. `/pages/how-to-use` is reachable only from PDP story links.

### SI-18 — Locales / translation keys (Info)
`locales/ar.json` (109 B) and `en.default.json` (265 B) contain only `general.note`. A grep for the `| t` filter across all Liquid returns 0 uses, so **0 keys used, 0 keys missing**. Every visible string is an inline EN/AR pair (`snippets/bi.liquid`, `oka.js` STR tables).
Hardcoded English-only strings:
- `main-password.liquid` ("Password", "Enter")
- `gift_card.liquid` ("GIFT CARD", "Continue Shopping", "This gift card is no longer valid.")
- PDP and AR `aria-label`s ("Back", "Share", "Wishlist", "Cart")
- `shop.name` titles

Shopify's own checkout and system strings depend on the request locale (see SI-05).

### SI-19 — Gift card / password / 404 / search
- **Gift card:** 0 gift-card products. The template is English and LTR (`<html lang="en">`), with no Arabic.
- **Password:** uses `settings.default_lang` for `lang`/`dir`, but the labels are English only.
- **404:** bilingual, OK.
- **Search:** results come from the catalogue JSON (`collection.oka-data`), which covers only products in the 10 setting collections. All 37 active products are in at least one of them, so nothing is unsearchable today. Products with no image get `img: null` (none exist), and sold-out products appear with `available:false`.

### Settings schema vs code (item 9) — PASS with notes
Every `settings.*` read in code is defined in `settings_schema.json`:
- logo, default_lang, age_gate, oka_collections
- the 6 fee settings, tier_threshold, min_order
- points_per_egp, earn_points_per_egp, subscription_discount
- whatsapp, tracking_url, proxy_path
- orders_api_url, orders_api_key, order_ratings
- service_url, service_key, jt_tracking_url, jt_tracking_key, test_panel

Block and section settings are defined in their section schemas.

Live values versus defaults:
- `tracking_url` = J&T home, which has no `{number}`, so the button copies the AWB and opens the page (documented behaviour).
- `orders_api_url` live = the website run.app `/mcp`, the same URL as `jt_tracking_url`, while the schema default is `jt-mcp-orders-…run.app`. Confirm that this endpoint accepts the `customer_*` order actions; that is out of scope for this read-only audit.
- `test_panel` = false (good).
- `jt_tracking_key` and `orders_api_key` are populated and rendered into the page (`theme.liquid:125-126`); this is covered by the security auditor.
- Hardcoded text matches the live settings for now, but would drift: "10 points = 1 EGP" (`oka-support.liquid:49`, `oka-screens.js:1112`) and the reward tiers (`oka-screens.js:2657-2660`).

---

## Pages coverage matrix (item 2)

| Route used by theme | Source refs | Page exists | Published | templateSuffix | Template in test theme | Result |
|---|---|---|---|---|---|---|
| /pages/account | theme.liquid:162,288; oka-*.liquid | yes | yes | oka-account | yes | PASS |
| /pages/orders | theme.liquid:163,283; order-detail:52; oka-track:8 | yes | yes | oka-orders | yes | PASS |
| /pages/addresses | theme.liquid:164; oka-account:17 | yes | yes | oka-addresses | yes | PASS (form issue SI-01) |
| /pages/addresses?view=oka-add-address | theme.liquid:165 | (view) | — | — | page.oka-add-address | PASS |
| /pages/checkout-review | theme.liquid:166 | yes | yes | oka-checkout | yes | PASS |
| /pages/loyalty | theme.liquid:167,293 | yes | yes | oka-loyalty | yes | PASS |
| /pages/subscriptions | theme.liquid:168,298 | yes | yes | oka-subscriptions | yes | PASS (hidden w/o proxy) |
| /pages/subscriptions?view=oka-subscribe | theme.liquid:169 | (view) | — | — | page.oka-subscribe | PASS |
| /pages/wishlist | theme.liquid:170,303 | yes | yes | oka-wishlist | yes | PASS |
| /pages/support | theme.liquid:171,308 | yes | yes | oka-support | yes | PASS |
| /pages/track | order-detail:167; oka-screens.js:1409 | yes | yes | oka-track | yes | PASS |
| /pages/how-to-use | pdp-story:57,80,101 | yes | yes | how-to-use | yes | PASS |
| /pages/about-us | (README/menu only) | yes | yes | about-us | yes | PASS (no theme link) |
| /pages/contact | (menu only) | yes | yes | contact | yes | PASS (no theme link) |
| /pages/online-store | — | yes | yes | online-store | yes | PASS |
| /pages/faq | main-menu | yes | yes | faq | **no** | fallback to page.json |
| /collections/all?view=oka-data | theme.liquid:148 | auto `all` (no collection with handle `all`) | — | — | collection.oka-data | PASS |
| /products/oka-cobra, /products/oka-cobra-led-rechargeable-base | pdp-story | yes | ACTIVE | — | — | PASS |
| /checkout, /cart, /search, /collections | routes | — | — | — | — | PASS (locale caveat SI-05) |

## Scenarios executed

- [x] PASS Shop info: EGP, Basic, Egypt; money format `{{amount}} EGP`; single presentment currency
- [x] FAIL Customer accounts version: NEW, so the classic templates and address forms are dead (SI-01)
- [x] PASS shopLocales: ar and en both published (en primary, which conflicts with the "Arabic default" assumption, SI-05)
- [x] PASS Online Store publication identified (Publication/193249542442)
- [x] PASS 10/10 setting collections exist and are published to the Online Store, each with an image and sort order
- [x] FAIL 4/10 collections skipped by the dedupe live-collections logic (SI-02)
- [x] PASS 0/10 collections fully empty
- [x] PASS `oka-basic-hookahs-copy` intent checked: it is the real Premium collection, referenced by discounts and the banner (SI-13)
- [x] PASS All 14 pages fetched; 11 theme-required pages exist, are published and have the correct suffix
- [x] FAIL page `faq` suffix missing in the test theme (SI-03)
- [x] FAIL product suffix `product-oka` (3 live products) missing in the test theme (SI-03)
- [x] PASS collection suffixes all default
- [x] FAIL MAIN theme lacks `page.oka-*`, so the live pages are empty today (SI-04)
- [x] FAIL blog/article templates absent while blog `news` is in the main menu (SI-03)
- [x] PASS 5/5 bundle variant IDs exist, are active and purchasable
- [ ] BLOCKED Offer image price vs cart total (images not viewable)
- [x] PASS 40/40 shop_images and 2/2 file videos exist and are READY
- [x] PASS index banner/compare `before` collections all exist and are live
- [x] PASS pdp-story hardcoded product handles exist and are ACTIVE
- [x] FAIL `oka.description_ar` missing on 5 live products (SI-10)
- [x] PASS `oka.title_ar` present on all 37 active products and all 10 collections
- [x] PASS 3D models: 5 live products with glb+usdz; no-model fallback reviewed (SI-11)
- [x] PASS Video reel media: 3 live products
- [x] PASS shop metafield `oka.recs` present (contains DRAFT handles, SI-20)
- [x] PASS Menus: theme uses no linklists (no missing handle); navigation gap noted (SI-17)
- [x] PASS Locale keys: 0 `| t` uses, 0 missing keys
- [x] FAIL product/collection `ar` translations: `hookahs` translation wrong (SI-12); `tongs-foil-combo` has none
- [x] PASS 5/5 policies exist; theme links resolve
- [x] FAIL privacy/terms/contact lack Arabic; docs/policies rewrite unpublished (SI-06)
- [x] FAIL contact_information row never renders (SI-07)
- [x] PASS settings_schema defines every `settings.*` read
- [x] FAIL whatsapp empty leaves no WA support button and no fallback (SI-08)
- [x] PASS proxy_path empty: subscription/service features hidden gracefully (SI-09)
- [x] PASS Currency hardcoding consistent with the EGP-only shop
- [x] PASS Gift card template: no gift-card products; English only (SI-19)
- [x] PASS 404 bilingual; password page English-only labels
- [x] PASS Search covers all 37 active products; no product lacks an image or price
- [x] PASS Sold-out products: 2, displayed as sold out
- [x] PASS Discounts touching theme flows read (tong free, Valentines, Trio/Hexa Party)
- [x] PASS Safety: no mutations, no secrets or PII copied into this report

## Needs manual test on a real device / live preview
1. With new customer accounts: sign in from `/pages/account` and confirm that `customer`, `customer.orders` and `customer.addresses` populate in Liquid. Then add, edit and delete an address from `/pages/addresses?view=oka-add-address` and confirm whether the POST to `/account/addresses` succeeds (SI-01).
2. Load `/blogs/news` and `/pages/faq` on the theme preview (SI-03). Open a `product-oka` product to confirm the fallback.
3. Arabic UI on `/` → checkout: check which language the checkout renders in (SI-05). Repeat from `/ar/`.
4. Bundle offers 1 and 2: add to cart and compare the cart/checkout total with the price shown in the offer image (SI-15).
5. AR: open `?view=ar` for the 5 model products on iOS (Quick Look/usdz) and Android (Scene Viewer/glb), and for one non-model product (fallback).
6. `/ar/policies/privacy-policy` and `/ar/policies/terms-of-service`: confirm they show English (SI-06).
7. Today on the live MAIN theme: visit `/pages/account` and `/pages/orders` and confirm they are empty (SI-04).
