# OKA Warehouse — mobile

A pixel-for-pixel React Native port of the `OKA Warehouse App — Standalone`
design, wired to Shopify and Bosta. Expo SDK 54 — runs in Expo Go on both
Android and iOS.

## Run it

```bash
cd mobile
npm install
cp .env.example .env      # optional — it runs on sample data without this
npx expo start
```

Scan the QR with Expo Go on the phone. Both devices must be on the same wifi.
If the tunnel is blocked on your network, `npx expo start --tunnel` works
through it.

### iOS

The same command and QR work with Expo Go on iPhone — every dependency here
(`react-native-svg`, `react-native-safe-area-context`, `expo-font`, the Google
Fonts packages) is cross-platform, and there is no native module that Expo Go
does not already bundle. Shadows carry both the iOS `shadow*` properties and
Android's `elevation`, so the scan button's green glow and the toast render on
both.

Two iOS-only things worth knowing when testing:

- **`tel:` does nothing in the iOS Simulator** — there is no Phone app there.
  Tapping Call opens the in-call screen but no dialer. Use a real iPhone to
  test that path.
- **WhatsApp opens via the web fallback.** Expo Go ships its own Info.plist, so
  the `LSApplicationQueriesSchemes` entry added to `app.json` only takes effect
  in a real build. Inside Expo Go, `canOpenURL("whatsapp://")` returns false and
  the code falls through to `https://wa.me/...`, which still lands in WhatsApp —
  just via Safari for a moment.

## How the design maps onto the two APIs

Every value the screens show is sourced deliberately:

| What the UI shows | Comes from |
|---|---|
| Order number (`#2615321`) | Shopify `order.name` |
| Customer name, phone, address, city | Shopify `shippingAddress` + `customer` |
| Line items, SKUs, unit prices, photos | Shopify `lineItems` (product `featuredImage`) |
| Subtotal, shipping, COD total | Shopify price sets — COD is the order total |
| AWB number + barcode | Bosta `trackingNumber` |
| Tracking timeline (5 steps) | Bosta delivery `state`, folded onto the design's phases |
| Courier name + phone | Bosta `star` / `courier` |
| Customer ranking tile | Bosta `receiver_ranking` |
| Address clarity tile | Bosta `addressClarityScore` |
| "Bad address" chip | Bosta `isBadAddress`, or a low clarity score |
| Contact history | Local only — that log is Salestrail's, and is not faked here |

`src/api/repository.js` is the single place this mapping happens. Live orders
are adapted into the mockup's own data shape, so the screens are identical for
sample and live data.

## Three modes

Set `EXPO_PUBLIC_MODE`:

- **`backend`** (default, recommended) — the app calls the Node service at the
  repo root. Credentials stay on the server.
- **`direct`** — the phone calls Shopify and Bosta itself. No server needed,
  but **the Shopify admin token is embedded in the app bundle** and anyone with
  the APK or IPA can extract it. Only reasonable on warehouse-owned devices.
- **unset** — bundled sample data, so the whole UI is explorable with no
  credentials at all. The list screen shows an amber "not connected" note.

If a live load fails the app falls back to sample data rather than an empty
screen, and says so.

## Pixel fidelity

The design is drawn on a 390 × 848 frame. Android `dp` and iOS `pt` both
coincide with CSS `px` at that width, so on a 390-wide phone every number in
`src/theme.js` is literally the number from the source markup. (390pt is the
iPhone 12/13/14/15/16 logical width, so those render the design exactly.) `s()` scales proportionally on other widths, so
the layout keeps its proportions instead of reflowing.

Colours, radii, font weights, and the 28-bar barcode sequence are copied
verbatim. Both language tables are the original Arabic and English strings.

Three deliberate departures, each because the mockup was a picture of a phone
rather than a phone:

1. **No painted status bar.** The mockup draws its own "14:22" and battery
   glyphs. The OS draws that band itself on both platforms, so reproducing it
   would stack two status bars. The safe-area inset takes the slot the design
   reserved — which is also what keeps it clear of the iPhone notch.
2. **No phone bezel.** The dark rounded frame around the mockup is the device
   in the picture. The app *is* the device.
3. **`text-align: end` resolved explicitly.** React Native only understands
   left/right, so it is computed from the active language.

The tracking timeline deliberately has **no connector line between dots** —
that matches the source, which renders an empty element there.

## Arabic

The language toggle switches labels and flips layout via `direction: "rtl"` on
the root, which is the same mechanism as the original's `dir` attribute. It
takes effect immediately, with no app reload — unlike `I18nManager.forceRTL`.

## What is wired vs. what is local

Wired to live data: the order list, order detail, tracking, courier, ranking
and clarity, shipping-status search, and "mark ready" (persisted in backend
mode).

Local-only state, matching the mockup: quantity edits, added catalog items,
address edits, attached photos, scanned-truck list, and cancellations. These
are UI state; committing them to Shopify is order-editing work that belongs in
the backend's audited path, not fire-and-forget from a warehouse phone.

Scanning uses the mockup's tap-to-advance stub. `expo-camera` is in Expo Go and
drops into `onScan` in `src/screens/Scan.js` without touching the layout.
