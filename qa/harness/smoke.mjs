#!/usr/bin/env node
/**
 * Smoke: every template/route × {guest, logged-in} × {ar, en}.
 * Writes qa/reports/smoke.md + qa/reports/smoke.json and screenshots to
 * qa/reports/screenshots/harness-smoke/.
 *
 *   node qa/harness/smoke.mjs                 # starts its own server on a free port
 *   SMOKE_BASE=http://localhost:9292 node qa/harness/smoke.mjs   # use a running server
 *   SMOKE_ONLY=/products node qa/harness/smoke.mjs                # filter routes
 */
import fs from 'node:fs';
import path from 'node:path';
import { launch, startServer, QA_ROOT } from './pw.mjs';

export const ROUTES = [
  ['/', 'index (home feed)'],
  ['/collections', 'list-collections'],
  ['/collections/oka-cobra', 'collection'],
  ['/collections/ready-to-smoke-bowls?sort_by=price-ascending', 'collection sort_by'],
  ['/collections/all?filter.v.availability=1', 'collection all + filter'],
  ['/collections/hookahs?page=2', 'collection page beyond last'],
  ['/collections/all?view=oka-data', 'collection.oka-data (catalogue JSON)'],
  ['/collections/does-not-exist', '404 collection'],
  ['/products/oka-cloud-white-hookah', 'product (3D model + video + story)'],
  ['/products/oka-cobra', 'product (model, cobra story)'],
  ['/products/oka-black-tobacco', 'product (video, black story)'],
  ['/products/oka-cobra-oka-base', 'product (compare-at price)'],
  ['/products/1-pcs-of-foil', 'product (sold out, deny policy)'],
  ['/products/tongs?variant=46037718303018', 'product ?variant='],
  ['/products/oka-cloud-white-hookah?view=ar', 'product.ar (AR screen)'],
  ['/products/tongs?view=ar', 'product.ar without model'],
  ['/products/foil', 'draft product → 404'],
  ['/pages/account', 'page.oka-account'],
  ['/pages/orders', 'page.oka-orders'],
  ['/pages/orders?order=%239000101', 'page.oka-orders ?order='],
  ['/pages/addresses', 'page.oka-addresses'],
  ['/pages/addresses?view=oka-add-address', 'page.oka-add-address'],
  ['/pages/loyalty', 'page.oka-loyalty'],
  ['/pages/subscriptions', 'page.oka-subscriptions'],
  ['/pages/subscriptions?view=oka-subscribe', 'page.oka-subscribe'],
  ['/pages/wishlist', 'page.oka-wishlist'],
  ['/pages/support', 'page.oka-support'],
  ['/pages/checkout-review', 'page.oka-checkout'],
  ['/pages/track?awb=JEGQA0000000002&order=%239000103', 'page.oka-track'],
  ['/pages/about-us', 'page.about-us'],
  ['/pages/how-to-use', 'page.how-to-use'],
  ['/pages/contact', 'page.contact'],
  ['/pages/faq', 'page (suffix faq missing → page)'],
  ['/pages/online-store', 'page.online-store'],
  ['/search', 'search (empty)'],
  ['/search?q=%D8%B4%D9%8A%D8%B4%D9%87', 'search Arabic'],
  ['/search?q=hookah', 'search English'],
  ['/cart', 'cart (2 items)'],
  ['/account', 'customers/account'],
  ['/account/login', 'customers/login'],
  ['/account/register', 'customers/register'],
  ['/account/addresses', 'customers/addresses'],
  ['/account/orders/9100000003', 'customers/order'],
  ['/account/reset/9000000000001/qatoken', 'customers/reset_password'],
  ['/account/activate/9000000000001/qatoken', 'customers/activate_account'],
  ['/policies/refund-policy', 'policy'],
  ['/policies/privacy-policy', 'policy'],
  ['/policies/shipping-policy', 'policy'],
  ['/policies/terms-of-service', 'policy'],
  ['/policies/contact-information', 'policy (contact)'],
  ['/password', 'password'],
  ['/gift_cards/qa12345678', 'gift_card'],
  ['/nope-404', '404'],
  ['/ar/', 'index under /ar'],
  ['/ar/products/oka-cobra', 'product under /ar (translated)'],
  ['/ar/collections/hookahs', 'collection under /ar'],
  ['/ar/pages/support', 'page under /ar'],
  ['/checkout', 'checkout stub'],
];

const COMBOS = [
  { locale: 'ar', loggedIn: false }, { locale: 'ar', loggedIn: true },
  { locale: 'en', loggedIn: false }, { locale: 'en', loggedIn: true },
];

async function main() {
  const only = process.env.SMOKE_ONLY;
  const routes = ROUTES.filter(([r]) => !only || r.includes(only));
  const srv = process.env.SMOKE_BASE ? null : await startServer({ port: Number(process.env.SMOKE_PORT || 9391) });
  const baseURL = process.env.SMOKE_BASE || srv.url;
  const rows = [];
  try {
    for (const combo of COMBOS) {
      const s = await launch({ baseURL, device: 'iPhone 13', locale: combo.locale, loggedIn: combo.loggedIn, cameraPermission: 'granted', agent: 'harness-smoke', externalTimeoutMs: 1500 });
      // seed a cart: a hookah + 2 bowls (through the AJAX API, as the theme does)
      await s.goto('/__qa/health');
      await s.page.evaluate(() => fetch('/cart/add.js', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [{ id: 47026198217002, quantity: 1 }, { id: 49400093081898, quantity: 2 }] }) }).then((r) => r.status));
      for (const [route, label] of routes) {
        s.clearLogs();
        let status = 0; let template = ''; let rw = 0; let err = '';
        try {
          const resp = await s.goto(route, { settle: 700 });
          status = resp?.status() ?? 0;
          template = resp?.headers()['x-qa-template'] || '';
          rw = Number(resp?.headers()['x-qa-render-warnings'] || 0);
        } catch (e) { err = e.message.split('\n')[0]; }
        const name = `${combo.locale}-${combo.loggedIn ? 'customer' : 'guest'}-${route.replace(/^\//, '').replace(/[^\w]+/g, '_') || 'home'}`;
        let shot = '';
        try { shot = path.relative(QA_ROOT, await s.shot(name)); } catch (e) { /* e.g. JSON page */ }
        const consoleErrors = s.logs.console.filter((c) => c.type === 'error');
        rows.push({
          route, label, locale: combo.locale, loggedIn: combo.loggedIn, status, finalUrl: s.page.url().replace(baseURL, ''), template, renderWarnings: rw,
          consoleErrors: consoleErrors.length + s.logs.pageErrors.length,
          consoleErrorSamples: [...consoleErrors.map((c) => c.text), ...s.logs.pageErrors.map((p) => `pageerror: ${p.message}`)].slice(0, 5),
          external: s.logs.external.map((x) => `${x.method} ${x.url}`), requestFailed: s.logs.requestFailed.map((r) => `${r.url} ${r.failure}`).slice(0, 5), error: err, screenshot: shot,
        });
        process.stdout.write(`${combo.locale}/${combo.loggedIn ? 'C' : 'G'} ${String(status).padEnd(4)} rw=${rw} ce=${rows.at(-1).consoleErrors} ${route}\n`);
      }
      await s.close();
    }
  } finally { if (srv) await srv.stop(); }

  const out = path.join(QA_ROOT, 'reports');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'smoke.json'), JSON.stringify(rows, null, 1));
  const md = ['# Harness smoke run', '', `Generated ${new Date().toISOString()} by \`node qa/harness/smoke.mjs\` — device iPhone 13 (Chromium), fake camera granted.`, '',
    'Columns: HTTP status (after redirects: final URL shown when different), render warnings (non-info, from `x-qa-render-warnings`), console errors (console.error + uncaught page errors).', '',
    '| Route | What | ar/guest | ar/customer | en/guest | en/customer | Screenshot (en/guest) |', '|---|---|---|---|---|---|---|'];
  for (const [route, label] of routes) {
    const cell = (loc, li) => { const r = rows.find((x) => x.route === route && x.locale === loc && x.loggedIn === li); if (!r) return '—'; const moved = r.finalUrl && r.finalUrl !== route && !r.finalUrl.startsWith(route) ? ` → ${r.finalUrl}` : ''; return `${r.status || r.error} · rw ${r.renderWarnings} · ce ${r.consoleErrors}${moved}`; };
    const s = rows.find((x) => x.route === route && x.locale === 'en' && !x.loggedIn);
    md.push(`| \`${route}\` | ${label} | ${cell('ar', false)} | ${cell('ar', true)} | ${cell('en', false)} | ${cell('en', true)} | ${s?.screenshot ? `[png](${path.relative(out, path.join(QA_ROOT, s.screenshot))})` : ''} |`);
  }
  const errs = new Map();
  for (const r of rows) for (const e of r.consoleErrorSamples) { const k = e.replace(/https?:\/\/localhost:\d+/g, ''); errs.set(k, (errs.get(k) || []).concat(`${r.route} (${r.locale}/${r.loggedIn ? 'customer' : 'guest'})`)); }
  md.push('', '## Distinct console errors', '');
  if (!errs.size) md.push('None.');
  for (const [k, v] of errs) md.push(`- \`${k.slice(0, 300)}\` — ${v.length}× e.g. ${v.slice(0, 3).join(', ')}`);
  const ext = new Map();
  for (const r of rows) for (const e of r.external) ext.set(e.replace(/\?.*$/, ''), (ext.get(e.replace(/\?.*$/, '')) || 0) + 1);
  md.push('', '## External requests intercepted (mocked, never forwarded)', '');
  if (!ext.size) md.push('None.');
  for (const [k, v] of ext) md.push(`- ${k} — ${v}×`);
  fs.writeFileSync(path.join(out, 'smoke.md'), `${md.join('\n')}\n`);
  console.log(`\nwrote ${path.join(out, 'smoke.md')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
