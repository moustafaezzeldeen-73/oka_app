# OKA Warehouse App

Shopify orders in, Bosta AWBs out — with the data-quality audit, the COD-aware
risk split, and the guard rails that keep a re-run from double-shipping.

```
Shopify unfulfilled orders
        │
        ├─ audit ......... phone, address, city/province, shipping fee, duplicates
        ├─ correct ....... safe fixes written back + logged to the order note
        ├─ ship .......... Bosta delivery per order (COD = order total)
        ├─ classify ...... No Risk / Risk from the Bosta ranking + COD formula
        └─ print ......... A6 AWB labels per batch
```

## Setup

```bash
npm install
cp .env.example .env    # fill in the four values below
npm start               # http://localhost:3000
```

| Variable | Where it comes from |
|---|---|
| `SHOPIFY_SHOP` | Store handle only, e.g. `oka-egypt` |
| `SHOPIFY_ACCESS_TOKEN` | Shopify admin → Settings → Apps → Develop apps → Admin API token (`shpat_…`) |
| `BOSTA_API_KEY` | Bosta dashboard → Settings → Integrations → API key |
| `BOSTA_PICKUP_LOCATION_ID` | `GET /api/reference/pickup-locations` once the key is in |

Shopify scopes needed: `read_orders`, `write_orders`, `read_customers`,
`write_customers`, `read_products`, `read_fulfillments`, `write_fulfillments`,
`read_shipping`.

**No credentials are committed to this repo.** `.env` is gitignored, and the
app reports exactly which variables are missing on `/api/health` instead of
failing halfway through a request.

## The three guard rails

Creating a Bosta delivery is a real, billable pickup. There is no sandbox on
the production base URL, so the safety is in this app:

1. **`BOSTA_LIVE_SHIPMENTS=false` forces dry run**, whatever the request asks
   for. A dry run returns the exact payload that would have been sent.
2. **The shipment ledger blocks re-shipping.** Every AWB is appended to
   `data/shipments.jsonl` the moment it is created. An order that already has
   a real tracking number is skipped unless the caller passes `force`. This is
   the app's own record, independent of Shopify tags, so it still works when
   tags are ignored.
3. **Audit errors block shipping.** An order with an unresolvable province, a
   missing phone, or a phone number sitting in the city field is never handed
   to Bosta.

## API

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/health` | Credential status + current risk thresholds |
| `GET` | `/api/orders?windowDays=2` | Unfulfilled orders, each with its audit verdict and any existing AWB |
| `GET` | `/api/orders/audit?apply=true&commit=true` | `apply` computes fixes, `commit` writes them |
| `POST` | `/api/shipments` | `{ orderIds?, dryRun, force, fulfill }` — batch, returns the two risk batches |
| `POST` | `/api/shipments/:orderId` | One order |
| `POST` | `/api/awb` | `{ trackingNumbers, awbType }` → base64 PDF, chunked at Bosta's 50 limit |
| `GET` | `/api/tracking/:trackingNumber` | Live delivery state |
| `GET` | `/api/risk/:trackingNumber` | Receiver ranking + Bosta's own address signals |
| `GET` | `/api/ledger/shipments` | Everything this app has ever shipped |
| `GET` | `/api/reference/provinces` | Zone/fee table |
| `GET` | `/api/reference/shipping-zones` | Live pull from Shopify — the source of truth the table mirrors |

## What the audit checks

- **Phone** — missing, not phone-like, landline where Bosta needs a mobile.
  Repairs the two faults the storefront actually produces: a dropped leading
  zero (`1012345678`) and a country-code prefix (`+201012345678`).
- **Address fields** — a phone number typed into the city/zip/company field,
  or an `address1` too short to route.
- **City/province mismatch** — the storefront's city field is free text, so
  customers type a governorate there while the province stays on the theme
  default. Arabic text is normalized (hamza forms, `ة`/`ه`, `ى`/`ي`) so
  `الإسكندرية` and `الاسكندريه` both resolve. A province is only corrected
  when the city resolves confidently; an unrecognised city is reported, never
  guessed at.
- **Shipping fee** — against the zone table, decided on the **net** amount
  excluding shipping. Comparing against the order total would be
  self-referential, since the total already contains the fee being checked.
- **Duplicates** — matching phone or email anywhere in the window. The
  highest-value order is the survivor; the rest are flagged for review.

## Risk classification

An order is **No Risk** if either:

- the customer has a Bosta ranking, `ranking > 70`, **and**
  `(ranking/100) × COD > shippingFee × 2.0`, or
- the customer has no ranking yet **and** the address is in Cairo/Giza (OKA's
  home turf) or matches a premium area.

It's an expected-value test: ranking stands in for delivery success
probability, so `(ranking/100) × COD` estimates the cash likely to be
collected, and it has to clear a multiple of the shipping fee.

Two things worth knowing:

- **A null ranking means "no history yet", not zero.** Treating it as 0 would
  push every first-time customer into the Risk batch.
- **`isBadAddress` is not part of the formula.** It can co-occur with a
  ranking of 100, so a flagged address can sit inside the No Risk batch. Those
  orders are listed separately in every run summary rather than silently
  reclassified.

Thresholds live in `data/risk_params.json` and can be hand-edited. The premium
area list in `src/domain/risk.js` is a **starter list that hasn't been reviewed
against real OKA outcomes** — a Risk verdict on an obviously safe address may
just mean the compound isn't listed yet.

## Notes on the two upstreams

**Shopify.** `variant.image.url` is null on every line item in this store —
the product photo lives on `variant.product.featuredImage.url`, and the client
falls through automatically. `shippingAddress` and `note` are full-object
overwrites, so both are read-merge-written rather than patched. GraphQL errors
arrive inside an HTTP 200, and `userErrors` on a mutation are not HTTP errors
at all; both are raised explicitly.

**Bosta.** The API key goes in `Authorization` **without** a `Bearer` prefix.
Risk fields are flat on the response (`receiver_ranking`, not
`receiver.ranking`). `allowToOpenPackage` is sent explicitly as `false` on
every order because Bosta's own default is `true` — this also flips
`flexShippingInfo.isOrderEligible` to false, which is expected. AWB printing
caps at 50 tracking numbers per call and **does not preserve input order**, so
anything mapping pages back to orders must read the tracking number off the
page.

## Tests

```bash
npm test
```

Covers phone normalization, Arabic province resolution, fee tiers, every
worked example from the risk spec, the audit findings, and the Bosta spec
mapping. No network calls — the domain layer is pure.

## Status

The integration layer is complete and tested. `public/index.html` is a
**working reference UI, not the final one** — it is due to be replaced with a
pixel-for-pixel port of the existing `OKA Warehouse App - Standalone` HTML,
wired to these endpoints. See the PR description for what's needed.
