# OKA test theme — QA team brief (read fully before starting)

## Target
- Shopify store: OKA egypt (756009.myshopify.com, primary www.okaegypt.com), Basic plan, EGP, Egypt. Default language Arabic (RTL).
- Theme under test: **"OKA App Theme (test — unpublished)"**, gid://shopify/OnlineStoreTheme/191458214186 (preview_theme_id=191458214186).
  The LIVE (MAIN) theme is a different Dawn theme — do not touch it.
- Source: `/home/user/oka_app/theme/` — verified byte-identical to the deployed test theme for all files,
  EXCEPT `config/settings_data.json`: the live values are in `/home/user/oka_app/qa/settings_data.live.json`
  (two API keys redacted there; the live store has a real 48-hex key in BOTH `jt_tracking_key` and `orders_api_key`,
  pointing at `https://website-app-649584328410.europe-west1.run.app/mcp`).
- The theme ports an Expo app (`/home/user/oka_app/app/src`) to the web; the backing order service is `/home/user/oka_app/server/`.
  The J&T connector likely behind that run.app URL is in `/home/user/jt-mcp-server/`.
  Docs: `/home/user/oka_app/theme/README.md`, `/home/user/oka_app/docs/*.md`, `/home/user/oka_app/CHANGELOG.md`.
  Recent work (2026-10-14): PDP story AR/EN, video reel, dedicated AR screen with live camera, snap scrolling,
  offers add straight to cart, cards turn Add into −/+, order item −/+ editing.

## Environment constraints
- The container's network policy BLOCKS www.okaegypt.com, *.myshopify.com, cdn.shopify.com, shopify.dev and most of the web.
  You cannot load the live storefront. registry.npmjs.org and pypi ARE reachable (npm install works).
- Chromium + Playwright 1.56.1 are preinstalled (global `playwright`, PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers). Never run `playwright install`.
- The Shopify Admin API is available to you via the `mcp__Shopify__*` tools (load with ToolSearch, e.g. `select:mcp__Shopify__graphql_query,mcp__Shopify__graphql_schema`).

## HARD SAFETY RULES (non-negotiable)
1. READ-ONLY against every live system. Never call any Shopify mutation (no graphql_mutation, update-product, set-inventory,
   create-discount, theme writes, orders, customers). Never publish or edit any theme.
2. Never call J&T / Bosta / Salestrail / Gmail / Render tools or the run.app endpoint in a way that creates, cancels, edits or sends anything.
3. Never write a real secret/key value into any file under /home/user/oka_app (reports get committed). Refer to keys by setting name.
4. Customer PII from the Admin API (names, phones, addresses): don't copy it into reports; use order numbers / masked values.
5. Don't modify files under /home/user/oka_app/theme, app, server. Your outputs go only to the paths named in your task.
6. Don't fabricate results. If something can't be tested here, say so explicitly and list it under "Needs manual test on device".

## Report format (Markdown, at the path given in your task)
- Header: scope, method, what was / wasn't covered.
- Findings table, then one section per finding:
  `ID | Severity (Blocker/Critical/High/Medium/Low/Info) | Area | Title`
  then: file:line refs, exact repro steps, expected vs actual, evidence (command output / screenshot path / code excerpt), suggested fix.
- A "Scenarios executed" checklist (every scenario you tried, PASS/FAIL/BLOCKED) — be exhaustive; this is the coverage record.
- A "Needs manual test on a real device / live preview" list.
Severity guide: Blocker = breaks buying or leaks secrets/PII; Critical = wrong money (price/fee/discount/COD) or data of another customer; High = a main flow broken for many users; Medium = a flow broken in an edge case / bad UX; Low = cosmetic; Info = note.
