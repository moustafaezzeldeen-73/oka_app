# OKA theme fix team: brief (read fully first)

## Goal
Fix the QA findings in the copy of the theme at `/home/user/oka_fix/theme/`. It's a git repo with a `baseline` commit that matches the deployed theme byte-for-byte. It will be uploaded to the unpublished Shopify theme
"OKA App Theme – QA fixes copy (19 Oct 2026)". The owner's rule: **apply the fixes without affecting the functionality of the theme in a bad way.**

Findings: `/home/user/oka_app/qa/reports/02-security.md` … `09-adversarial-chaos.md` (IDs like SEC-04, COM-01, F-02, V-01, AR-01, CH-06, SI-02), plus the summary `00-summary.html`.
Each finding has file:line refs, repro, and a suggested fix. Note: line numbers in the reports refer to an older snapshot. The current theme has one newer commit
("Product page: one full-screen page per swipe; tap anywhere for real AR; product stays put in the room"), which touched oka-screens.js, oka.css, main-product.liquid, oka-ar.liquid and pdp-story.liquid. Re-locate code by searching, not by line number. Some AR/PDP findings may already be changed by that commit: re-check before fixing.

## Rules
1. **File ownership.** Edit ONLY the files your task assigns to you. Other agents are editing the other files in parallel. If a fix needs a change in a file you don't own, don't touch it: append a precise request to `/home/user/oka_fix/HANDOFF.md` (owner file, exact code to add/change, why, finding ID). Keep your side compatible whether or not the other side lands (feature-detect, no hard dependency).
2. **No functional regressions.** Every existing feature must keep working: browsing, cart, discounts, checkout hand-off, orders (guest and signed-in), tracking, AR, video, language switch, loyalty, subscriptions, wishlist. Make the smallest correct change. Don't redesign, rename public hooks, change visual design beyond what the finding needs, or remove features. When a "fix" would remove a feature someone relies on, gate it or soften it instead and say so.
3. **Out of scope (do NOT attempt):**
   - Removing the API keys from `window.OKA` (SEC-01/02/03). The orders/tracking features need a backend change first; leave key rendering as is.
   - Server or connector changes (SEC-03, SEC-08).
   - Shopify store data or settings: shipping rates COM-02/COM-11, policies SI-06, metafields SI-10/SI-12, pages SI-04, settings_data values SI-08/SI-09.
   - Never edit `config/settings_data.json`.
4. **Liquid escaping:** watch for double-escaping. Values that are already escaped or that intentionally contain HTML (`descriptionHtml`) must keep working. Test both a normal title with `&` / quotes / Arabic and a `<img onerror>` payload.
5. **Bilingual:** any new user-facing text needs both Arabic and English, using the theme's existing pattern (look at how existing strings switch language).
6. **Verify as you go**, using the local harness: `PORT=<your port> QA_THEME_DIR=/home/user/oka_fix/theme QA_NO_CACHE=1 QA_OUT_DIR=/home/user/oka_fix/out-<you> node /home/user/oka_app/qa/harness/server.mjs`. See `/home/user/oka_app/qa/harness/README.md` and `pw.mjs` (pass the same env when using `startServer`). Existing repro scripts are in `/home/user/oka_app/qa/tests/{code,commerce,e2e,chaos,visual,ar}`: re-run the ones for your findings against the fixed theme and show they now pass. Run `node --check` on JS. Don't modify anything under /home/user/oka_app.
7. Commit in `/home/user/oka_fix` after each logical fix: `git -c user.email=qa@local -c user.name=qa commit -m "<ID>: <what>" -- <your files>`. Only commit your own files. Concurrent commits by others are fine, but if git's index lock is busy, retry.
8. Never put real secrets in files. Read-only on all live systems.

## Report
Write `/home/user/oka_fix/reports/<your-agent>.md` with a table: ID | status (FIXED / PARTIAL / NOT FIXED / ALREADY FIXED / HANDOFF) | file(s) | what changed | how verified. For anything not fixed, say why (risk to functionality, needs backend, needs another file).
