# OKA Shopify theme

The OKA app's screens, design and behaviour on the website. Every size,
colour, shadow, icon and animation timing comes from `app/src`.

## Install

1. Upload `dist/oka-theme.zip` (Online Store → Themes → Add theme → Upload zip),
   or import it with `themeCreate`.
2. Create these pages, each with its template:

   | Page handle | Template |
   | --- | --- |
   | `account` | `page.oka-account` |
   | `orders` | `page.oka-orders` |
   | `addresses` | `page.oka-addresses` |
   | `loyalty` | `page.oka-loyalty` |
   | `subscriptions` | `page.oka-subscriptions` |
   | `wishlist` | `page.oka-wishlist` |
   | `support` | `page.oka-support` |
   | `checkout-review` | `page.oka-checkout` |

3. Theme settings: collections (the app's categories), fees, minimum order,
   loyalty rates, WhatsApp number, courier tracking page.

## Live J&T tracking, courier call, edit, cancel, points, subscriptions

These run on the order service (`server/`), the same one the app uses. The
website reaches it through a Shopify **App Proxy**:

1. Deploy `server/` (`render.yaml` at the repo root is a Render blueprint).
   Set `SHOPIFY_APP_PROXY_SECRET` to the Shopify app's API secret key.
2. In the Shopify app's settings → **App proxy**: prefix `apps`, subpath `oka`,
   proxy URL `https://<order service>/proxy`.
3. Theme settings → **OKA order service** → App proxy path: `/apps/oka`.

**Tracking through OKA's J&T connector (GCP).** Set `JT_CONNECTOR_URL` (the
connector's address, with or without `/mcp`) and `JT_CONNECTOR_TOKEN` (its
`CONNECTOR_AUTH_TOKEN`) on the order service, and tracking goes through the
connector instead of J&T directly. Never put that token in the theme: it can
create and cancel shipments, and anything in a theme is public.

Shopify signs every proxied request and adds the signed-in storefront
customer; `server/auth/appProxy.js` verifies it and runs the request as that
customer, so a shopper only ever sees their own orders. Guests (not signed in)
keep the Shopify-only features: tracking number and the courier's tracking page.

Without the proxy, the website still works on Shopify alone: catalogue, cart,
discount codes, checkout, orders, invoices, tracking numbers, addresses,
store-credit points, AR — and edit/cancel requests go to WhatsApp.

## Develop

`shopify theme check --path theme` must report no offenses. Rebuild the
package with `cd theme && zip -qr ../dist/oka-theme.zip layout templates sections snippets assets config locales`.

## Home feed

- **Offers** (`Offer` blocks): a banner and a button. With *Bundle variant
  IDs* set, the button adds all of them at once — the website's bundle offers.
- **Banners** (`Banner` blocks): a graphic banner as a page of its own, just
  before the collection picked in *Show before collection*; a banner whose
  collection isn't in the feed follows the Offers page.
- **Menu**: the side menu in `layout/theme.liquid` replaced the bottom tab bar.
