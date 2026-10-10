# Testing

## Start everything

```bash
npm run setup     # once: installs app/ and server/, creates both .env files
npm run dev       # every time: server + Expo in one terminal
```

`npm run setup` fills `server/.env` with development values: a session
secret, a **test sign-in key** (printed at the end), a staff debug key, and
`OTP_PROVIDER=console` so phone sign-in codes appear in the server log. Add
the Shopify Admin token (and J&T credentials for tracking) to `server/.env`
before testing against the live store.

`npm run dev` starts the server (restarting on file changes, logs prefixed
`[server]`), waits for it to answer, then starts Expo with the app pointed at
the server. Scan the QR code with Expo Go. Ctrl+C stops both.

| Where you are | Command | How the phone reaches the server |
| --- | --- | --- |
| Laptop, phone on the same Wi-Fi | `npm run dev:lan` | The laptop's local address (fastest) |
| Laptop, phone on another network | `npm run dev -- --server-tunnel` | A public cloudflared URL ([install cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)) |
| GitHub Codespaces | `npm run dev` | The Codespace's forwarded URL (port made public automatically) |
| A deployed server | `npm run dev -- --app-only --server-url=https://…` | That URL |

Other commands:

| Command | Does |
| --- | --- |
| `npm run server` | Only the server |
| `npm run app` | Only Expo (reads `app/.env`) |
| `npm test` | Server tests (pricing, sessions, ownership, notifications, test login) |
| `npm run lint` | Lints the app |
| `npm run check` | Lint + tests + builds the iOS and Android bundles |

## Sign in as a real customer (testing only)

1. Open **Account → Sign in**.
2. In the red dashed **TESTING** panel, enter the customer's phone
   (`+2010…`) or email and the test sign-in key from `server/.env`
   (`TEST_LOGIN_KEY`).
3. You're in as that customer — their real orders, addresses, loyalty and
   subscriptions. Account shows "Test sign-in". Every use is logged by the
   server.

The panel only shows when the app has `EXPO_PUBLIC_TEST_LOGIN=1` and the
server has a `TEST_LOGIN_KEY`, and the server refuses it when
`NODE_ENV=production`. See the [launch checklist](launch-checklist.md) to
remove it.

To test phone sign-in instead, type any Egyptian mobile on the sign-in screen;
with `OTP_PROVIDER=console` the code appears in the `[server]` log lines.

> Orders placed while testing are **real Shopify orders** (cash on delivery,
> unpaid). Cancel them from the Orders tab, or in Shopify admin.

## What to check

- **Browse**: home feed, categories, search (try Arabic spellings like
  "شيشه"), sort and filters on a collection, product page gallery and share.
- **Cart**: quantities stop at stock; a discount code only shows Applied if
  Shopify accepts it; the minimum-order note under 150 EGP.
- **Checkout**: needs sign-in and a saved address; the shipping fee matches
  what the website charges for that governorate and basket; a failed order
  keeps the cart and says why.
- **Orders**: live J&T/Bosta timeline, edit and cancel before fulfilment,
  change address, Order again.
- **Addresses**: add with a governorate, make default, delete.
- **Loyalty**: balance, redeem a reward, copy the code or apply it to the cart.
- **Subscriptions**: create, pause, resume, cancel.
- **Notifications**: see the requirements below; then place an order and
  accept the prompt on the confirmation screen.
- **Language**: switch Arabic/English from the home header; everything flips.
- **Restart the app**: cart, language and sign-in are still there.

## Notifications on a phone

- Run `eas init` once (adds `extra.eas.projectId` to `app/app.json`).
- iPhone: Expo Go works. Android: Expo Go has no remote notifications since
  SDK 53 — use a development build (`eas build --profile development`).
- The server sends them every 30 minutes for orders placed in the app.

## When something doesn't work

| Symptom | Fix |
| --- | --- |
| "service returned non-JSON (is the port public?)" | In Codespaces, set the server port to Public in the Ports tab |
| App shows the bundled catalogue, not the live one | The phone can't reach the server — check the URL `npm run dev` printed, or use `--server-tunnel` |
| Sign-in says phone sign-in isn't switched on | `OTP_PROVIDER` is empty in `server/.env` (setup sets it to `console`) |
| No TESTING panel | `EXPO_PUBLIC_TEST_LOGIN=1` in `app/.env`, and `TEST_LOGIN_KEY` in `server/.env`; restart `npm run dev` |
| `[jobs] paused` | Expected until the Shopify credentials are in `server/.env` |
| Expo tunnel fails to start | Use `npm run dev:lan` on the same Wi-Fi |
