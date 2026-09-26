# OKA

The OKA Egypt shop app. It's an Expo (SDK 57) app for iOS and Android, plus
the order service that connects it to the Shopify store and the couriers
(J&T Express, Bosta).

## Quick start

You need Node 22+ and Expo Go on your phone.

```bash
npm run setup     # once: installs everything, creates app/.env and server/.env
npm run dev       # server + app in one terminal — scan the QR code with Expo Go
```

Add the Shopify Admin token (and J&T credentials) to `server/.env` to use the
live store. To test as a real customer, use the **TESTING** panel on the
sign-in screen with the key `npm run setup` printed. Everything else about
testing is in [docs/testing.md](docs/testing.md).

## Commands

| Command | Does |
| --- | --- |
| `npm run setup` | Install `app/` and `server/`, create `.env` files with development values |
| `npm run dev` | Server and Expo together (`dev:lan` for same-Wi-Fi, `-- --server-tunnel` for another network) |
| `npm run server` / `npm run app` | Just one of them |
| `npm test` | Server tests |
| `npm run lint` | Lint the app |
| `npm run check` | Lint, tests, and build both app bundles |

## What's where

```
oka_app/
├─ README.md            you are here
├─ CHANGELOG.md         every update, newest first
├─ package.json         the commands above
├─ scripts/             setup.mjs, dev.mjs (the one-terminal launcher)
├─ docs/
│  ├─ testing.md          running, test sign-in, what to check, troubleshooting
│  ├─ architecture.md     how app and server fit, routes, jobs, notifications, scopes
│  ├─ commerce-policy.md  shipping, minimum order, loyalty, subscriptions — and why
│  ├─ launch-checklist.md everything to do before real customers
│  └─ design-port.md      animations, RTL and geometry from the prototype
├─ app/                 the Expo app
│  ├─ App.js              screens, overlays, safe-area geometry
│  └─ src/                screens/ overlays/ components/ api/ state/ hooks/ lib/
└─ server/              the order service (holds all secrets)
   ├─ app.js              every route file, in one list
   ├─ routes/             one file per area: store, auth, customer, checkout, orders, …
   ├─ services/           checkout, loyalty, notifications, subscriptions, tracking, jobs
   ├─ integrations/       Shopify, J&T, Bosta
   ├─ config/             commercial policy, governorates and fee table
   ├─ auth/               sessions, one-time codes, testing-only test login
   └─ test/
```

## Where to change common things

| To change | Edit |
| --- | --- |
| Minimum order, loyalty rates, rewards, subscription discount | `server/config/policy.js` (or the matching env vars) |
| Shipping fee estimates and governorates | `server/config/zones.js` (orders always use Shopify's rates) |
| App text (Arabic and English) | `app/src/data.js` (`STR`) |
| Colours, fonts, timings | `app/src/theme.js` |
| A screen | `app/src/screens/<Name>Screen.js` |
| An API route | `server/routes/<area>.js` |
| Notification wording and timing | `server/services/notify.js` |
