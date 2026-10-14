# Harness smoke run

Generated 2026-10-14T21:24:31.714Z by `node qa/harness/smoke.mjs` — device iPhone 13 (Chromium), fake camera granted.

Columns: HTTP status (after redirects: final URL shown when different), render warnings (non-info, from `x-qa-render-warnings`), console errors (console.error + uncaught page errors).

| Route | What | ar/guest | ar/customer | en/guest | en/customer | Screenshot (en/guest) |
|---|---|---|---|---|---|---|
| `/` | index (home feed) | 200 · rw 1 · ce 0 | 200 · rw 1 · ce 0 | 200 · rw 1 · ce 0 | 200 · rw 1 · ce 0 | [png](screenshots/harness-smoke/en-guest-home.png) |
| `/collections` | list-collections | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-collections.png) |
| `/collections/oka-cobra` | collection | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-collections_oka_cobra.png) |
| `/collections/ready-to-smoke-bowls?sort_by=price-ascending` | collection sort_by | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-collections_ready_to_smoke_bowls_sort_by_price_ascending.png) |
| `/collections/all?filter.v.availability=1` | collection all + filter | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-collections_all_filter_v_availability_1.png) |
| `/collections/hookahs?page=2` | collection page beyond last | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-collections_hookahs_page_2.png) |
| `/collections/all?view=oka-data` | collection.oka-data (catalogue JSON) | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-collections_all_view_oka_data.png) |
| `/collections/does-not-exist` | 404 collection | 404 · rw 0 · ce 1 | 404 · rw 0 · ce 1 | 404 · rw 0 · ce 1 | 404 · rw 0 · ce 1 | [png](screenshots/harness-smoke/en-guest-collections_does_not_exist.png) |
| `/products/oka-cloud-white-hookah` | product (3D model + video + story) | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-products_oka_cloud_white_hookah.png) |
| `/products/oka-cobra` | product (model, cobra story) | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-products_oka_cobra.png) |
| `/products/oka-black-tobacco` | product (video, black story) | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-products_oka_black_tobacco.png) |
| `/products/oka-cobra-oka-base` | product (compare-at price) | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-products_oka_cobra_oka_base.png) |
| `/products/1-pcs-of-foil` | product (sold out, deny policy) | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-products_1_pcs_of_foil.png) |
| `/products/tongs?variant=46037718303018` | product ?variant= | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-products_tongs_variant_46037718303018.png) |
| `/products/oka-cloud-white-hookah?view=ar` | product.ar (AR screen) | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-products_oka_cloud_white_hookah_view_ar.png) |
| `/products/tongs?view=ar` | product.ar without model | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-products_tongs_view_ar.png) |
| `/products/foil` | draft product → 404 | 404 · rw 0 · ce 1 | 404 · rw 0 · ce 1 | 404 · rw 0 · ce 1 | 404 · rw 0 · ce 1 | [png](screenshots/harness-smoke/en-guest-products_foil.png) |
| `/pages/account` | page.oka-account | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-pages_account.png) |
| `/pages/orders` | page.oka-orders | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-pages_orders.png) |
| `/pages/orders?order=%239000101` | page.oka-orders ?order= | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-pages_orders_order_239000101.png) |
| `/pages/addresses` | page.oka-addresses | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-pages_addresses.png) |
| `/pages/addresses?view=oka-add-address` | page.oka-add-address | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-pages_addresses_view_oka_add_address.png) |
| `/pages/loyalty` | page.oka-loyalty | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-pages_loyalty.png) |
| `/pages/subscriptions` | page.oka-subscriptions | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-pages_subscriptions.png) |
| `/pages/subscriptions?view=oka-subscribe` | page.oka-subscribe | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-pages_subscriptions_view_oka_subscribe.png) |
| `/pages/wishlist` | page.oka-wishlist | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-pages_wishlist.png) |
| `/pages/support` | page.oka-support | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-pages_support.png) |
| `/pages/checkout-review` | page.oka-checkout | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-pages_checkout_review.png) |
| `/pages/track?awb=JEGQA0000000002&order=%239000103` | page.oka-track | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-pages_track_awb_JEGQA0000000002_order_239000103.png) |
| `/pages/about-us` | page.about-us | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-pages_about_us.png) |
| `/pages/how-to-use` | page.how-to-use | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-pages_how_to_use.png) |
| `/pages/contact` | page.contact | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-pages_contact.png) |
| `/pages/faq` | page (suffix faq missing → page) | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-pages_faq.png) |
| `/pages/online-store` | page.online-store | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-pages_online_store.png) |
| `/search` | search (empty) | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-search.png) |
| `/search?q=%D8%B4%D9%8A%D8%B4%D9%87` | search Arabic | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-search_q_D8_B4_D9_8A_D8_B4_D9_87.png) |
| `/search?q=hookah` | search English | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-search_q_hookah.png) |
| `/cart` | cart (2 items) | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-cart.png) |
| `/account` | customers/account | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-account.png) |
| `/account/login` | customers/login | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 → /account | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 → /account | [png](screenshots/harness-smoke/en-guest-account_login.png) |
| `/account/register` | customers/register | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-account_register.png) |
| `/account/addresses` | customers/addresses | 200 · rw 0 · ce 0 → /account/login?return_url=%2Faccount%2Faddresses | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 → /account/login?return_url=%2Faccount%2Faddresses | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-account_addresses.png) |
| `/account/orders/9100000003` | customers/order | 200 · rw 0 · ce 0 → /account/login?return_url=%2Faccount%2Forders%2F9100000003 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 → /account/login?return_url=%2Faccount%2Forders%2F9100000003 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-account_orders_9100000003.png) |
| `/account/reset/9000000000001/qatoken` | customers/reset_password | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-account_reset_9000000000001_qatoken.png) |
| `/account/activate/9000000000001/qatoken` | customers/activate_account | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-account_activate_9000000000001_qatoken.png) |
| `/policies/refund-policy` | policy | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-policies_refund_policy.png) |
| `/policies/privacy-policy` | policy | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-policies_privacy_policy.png) |
| `/policies/shipping-policy` | policy | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-policies_shipping_policy.png) |
| `/policies/terms-of-service` | policy | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-policies_terms_of_service.png) |
| `/policies/contact-information` | policy (contact) | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-policies_contact_information.png) |
| `/password` | password | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-password.png) |
| `/gift_cards/qa12345678` | gift_card | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-gift_cards_qa12345678.png) |
| `/nope-404` | 404 | 404 · rw 0 · ce 1 | 404 · rw 0 · ce 1 | 404 · rw 0 · ce 1 | 404 · rw 0 · ce 1 | [png](screenshots/harness-smoke/en-guest-nope_404.png) |
| `/ar/` | index under /ar | 200 · rw 1 · ce 0 | 200 · rw 1 · ce 0 | 200 · rw 1 · ce 0 | 200 · rw 1 · ce 0 | [png](screenshots/harness-smoke/en-guest-ar_.png) |
| `/ar/products/oka-cobra` | product under /ar (translated) | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-ar_products_oka_cobra.png) |
| `/ar/collections/hookahs` | collection under /ar | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-ar_collections_hookahs.png) |
| `/ar/pages/support` | page under /ar | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-ar_pages_support.png) |
| `/checkout` | checkout stub | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | 200 · rw 0 · ce 0 | [png](screenshots/harness-smoke/en-guest-checkout.png) |

## Distinct console errors

- `Failed to load resource: the server responded with a status of 404 (Not Found)` — 12× e.g. /collections/does-not-exist (ar/guest), /products/foil (ar/guest), /nope-404 (ar/guest)

## External requests intercepted (mocked, never forwarded)

- GET https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js — 4×
- POST https://website-app-649584328410.europe-west1.run.app/mcp — 14×
