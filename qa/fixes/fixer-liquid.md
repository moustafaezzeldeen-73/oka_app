# FIXER-LIQUID report

Scope: `theme/sections/`, `snippets/`, `templates/`, `locales/`, `config/settings_schema.json` only. Every fix has its own commit in `/home/user/oka_fix`.

## How it was verified
- **Two harnesses**: fixed theme on :9540 and the `baseline` commit (exported to scratch) on :9541, same live settings.
- **Render comparison**: 32 routes × en/`/ar` × guest/customer = 128 renders. Status codes and templates are unchanged, except that `product-oka` products now resolve to `product.product-oka` and `/pages/faq` to `page.faq`. Non-info render warnings went from 4 (baseline) to 0 (fixed), and no page went up. The 4 removed warnings were the `shop.contact_information` warning (SI-07).
- **Chaos XSS** (`qa/tests/chaos/02-hostile-data.mjs`, run with the theme dir and port swapped): routes where the canary executed went from **9 of 13 (baseline) to 0 of 13 (fixed)**.
- **Double-escape check**: a mirror fixture used a product title with `&`, both quote types, `<b>` and Arabic. Each renders escaped exactly once. No `&amp;amp;`/`&amp;lt;` appears on the home, PDP, story, order or support pages.
- **Theme check** (`@shopify/theme-check-node`, recommended config, the engine `shopify theme check` uses): 4 offenses → **0**.
- **Playwright** (Pixel 7, en/ar, guest/customer): 0 page errors on 13 changed routes. Add-address JS still wires up (29 governorate chips). Axe subset over 10 routes × 2 languages:
  - `page-has-heading-one`: 6 → 0
  - `link-name`: 14 → 6 (the 6 left are JS `.rcard-img`)
  - `label`: 0
- **Layout**: bounding boxes of every touched control are unchanged (hdr-title, circle-38, step-btn, cart-btn, heart-btn, banner/offer links, `.arx-fallback`). Horizontal overflow is 0.

## Summary

| ID | Status | File(s) | What changed | How verified |
|---|---|---|---|---|
| SEC-04 / CH-02 | FIXED | snippets/order-detail.liquid, sections/oka-addresses.liquid, sections/oka-account.liquid, sections/oka-orders.liquid, sections/oka-contact.liquid | Added `\| escape` to: shipping name, address1/2, city, phone, province, order name, tracking number/company/url; the address cards; `customer.name` on Account. Contact-form values use `escape_once`. | Chaos 02: all `addr.*` and `customer.first_name` canaries no longer execute. Visible text is identical on normal data. |
| CH-03 | FIXED | snippets/bi.liquid, sections/oka-orders.liquid | `bi` outputs `en`/`ar` with `escape_once`, so `&lt;350 g`, `Food-grade &amp; …` and `strip_html`'d descriptions are not double-escaped. The order-list "+N more" line is escaped too. All callers were audited: none passes markup. | `product.title`/`title_ar` canaries are dead on PDP, AR and home. `&`, quotes and Arabic are escaped once. |
| SEC-05 | FIXED (gated) | sections/oka-orders.liquid, snippets/test-lookup.liquid, config/settings_schema.json | The panel renders only when `settings.test_panel` is on and the signed-in customer is tagged `staff` or `oka-staff`. The gate is in both the caller and the snippet. The schema info text documents this and notes the key still sits in the page source. | Mirror with test_panel on: guest, untagged and `staffer` get no panel; `staff`/`oka-staff` get it. Baseline showed it to everyone. |
| SI-07 | FIXED | snippets/policies-page.liquid | The Contact row links to `/policies/contact-information`; Liquid has no `shop.contact_information`. | 5 rows × 2 languages render; the URL returns 200; the warning is gone. |
| F-14 | FIXED (my files) | policies-page, oka-account, pdp-story, screen-header, order-detail, oka-addresses, gift_card | Language prefixes come from `localization.available_languages[].root_url` instead of a hard-coded `/ar`. Page/product links, the screen-header `back` fallback and the order tracking link stay in the shopper's locale. `data-sign-in` paths are unchanged (JS handles them). | `/ar` pages link to `/ar/pages/…` and `/ar/products/…`; primary-locale pages are unchanged. |
| SI-02 | FIXED | templates/collection.oka-data.liquid, snippets/live-collections.liquid (comment) | Catalogue `cats` uses `dedupe: false`: all setting collections with active products (10, was 6). Empty collections are still skipped. Products keep `cat` and gain an additive `inCats`. The home feed is unchanged (still no duplicate cards). | oka-data JSON: cats 6 → 10, products 37 = 37, valid JSON. |
| SI-03 | FIXED (product, FAQ) | templates/product.product-oka.json, templates/page.faq.json | Copies of product.json / page.json. | `x-qa-template` resolves; 0 warnings, en and ar. |
| SI-03 (blog/article) | NOT FIXED | – | No blog or article sections exist, and `main-page` needs `page`, so a template would render empty. Needs new sections or a redirect for `/blogs/news`. | – |
| SI-01 | FIXED (Liquid side) | sections/oka-addresses.liquid, sections/oka-add-address.liquid | New accounts are detected when `routes.account_url` is absolute (shopify.dev sign-in docs). If that holds **and** no order service is configured: add-address shows a bilingual link to `<account base>/profile`, and the cards drop the classic-only Make default / Delete buttons. Classic accounts or the service path are unchanged. | Classic: text identical. Mirror with an absolute `account_url`: no classic form, Profile link en/ar, 0 warnings. |
| Theme check | FIXED (0) | sections/main-product.liquid, sections/oka-ar.liquid, sections/oka-home.liquid | AR fallback `<img>`: intrinsic `width`/`height` (capped at the source width) plus `height:auto`. Opening banner tracked by `forloop.index` instead of `block.id`. | 4 → 0 offenses. Home markup is identical; image box identical. |
| COM-05 (Liquid) | PARTIAL | snippets/order-detail.liquid | "Pay the courier" = `total_price` − successful `sale`/`capture` transactions (Liquid has no `total_outstanding`). The Total row is unchanged. | Mirror with a 25 EGP store-credit sale: 327 → 302. Other orders unchanged. **Manual**: check whether Liquid `total_price` follows order edits (#2850121). |
| V-07 | FIXED (Liquid) / HANDOFF (JS) | snippets/a11y-name.liquid (new), banner-page, oka-home | Visually hidden bilingual names: banner → target collection, or "See the offer / شوف العرض". Offer card → collection, product, or "All collections / كل الأقسام". | Axe link-name 14 → 6 (the remaining 6 are JS). |
| V-06 | FIXED (Liquid) | main-product, main-collection, oka-ar, heart-btn, screen-header, main-search, compare-page | English `aria-label`s replaced by bilingual hidden text. Glyphs are `aria-hidden`. Search and the compare slider use `aria-labelledby`. | Axe; boxes unchanged. |
| V-11 | FIXED (Liquid) / HANDOFF (discount input) | oka-add-address, main-login, main-register, main-reset-password, oka-contact | `<label for>`/`id` on all fields. Governorate and type are labelled groups. Contact email has `dir="ltr"`. | Axe `label` 0. |
| V-13 | FIXED | screen-header, oka-ar, oka-home, main-password | `.hdr-title` and `.arx-title` became `<h1>` (oka.css resets h1). Home and password pages get a visually hidden h1 with the shop name. | Axe page-has-heading-one 6 → 0; same boxes. |
| SI-19 | FIXED | templates/gift_card.liquid | `lang`/`dir` follow the `/ar` locale or `default_lang`; Arabic text added; link goes to `routes.root_url`. | en/ar render, 0 warnings, `dir=rtl` for ar. |
| AR-05 copy (HANDOFF from SCREENS) | DONE | main-product, oka-ar | Hint: "Tap Open camera to see it in your room". Chip: "3D / ٣D". `role=status` on the chip. | No JS dependency on the old text; smoke 0 errors. |
| AR-13 | NOT FIXED | – | There is no Arabic text to fall back to: it needs `oka.description_ar` store data (SI-10). Showing the description under the story would be a design change. | – |
| V-02 remainder (HANDOFF from CORE) | NOT FIXED | – | On `/ar/`, Shopify translates `p.title`. Liquid can't get the untranslated title without a metafield. CORE's per-locale cache already removes the cross-language leak. | – |

## HANDOFF items (written to HANDOFF.md)
1. **FIXER-SCREENS, V-07**: add names to JS image links `.rcard-img`, `.line-img`, `.cs-card`. The initial `[data-ar-cam-toggle]` render needs an `aria-label` (axe `button-name`).
2. **FIXER-SCREENS, V-11**: add `aria-label` and `dir="ltr"` to the cart discount input.
3. **FIXER-SCREENS, SI-02 (optional)**: group by the new `p.inCats` so the Hoses/Coal/Bowls groups fill.
4. **FIXER-CORE, V-06**: theme.liquid Menu/Close can use `{% render 'a11y-name' %}`. Product `alt` in Arabic would need a JS swap.
5. **FYI, SI-01**: markup changes in hosted-accounts mode; nothing required.
