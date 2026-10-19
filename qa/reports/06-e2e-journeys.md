# 06 — E2E shopper journeys (runtime) — IN PROGRESS

Status: work in progress; sections are appended as each journey group completes. Final version replaces this header.

## Progress log
- 01 Age gate / side menu / language: done (results in qa/tests/e2e/results/01-agegate-menu.json)
- 02 Home feed: iPhone 13 done; all devices running
- 02 Home feed: done, all devices (results/02-home.json). SI-02 confirmed, F-04 confirmed.
- 03 Collections & search: done (results/03-collections-search.json). Search XSS: no execution; filters persist across collections.
- 04 PDP + AR: iPhone done (F-05 confirmed, COM-07 confirmed, F-08 confirmed, F-10 confirmed, F-03 not reproduced); all devices running.
- 04 PDP + AR: done, all devices (results/04-pdp.json). F-05, COM-07, F-08, F-10 confirmed; F-03 not reproduced.
- 05 Cart / codes / fees / checkout: iPhone done (COM-01, COM-04, COM-06 confirmed; F-02 not reproduced without latency). Full-device rerun with a latency variant of F-02 is running (container restarted 2026-10-19; server restarted on 9410).
