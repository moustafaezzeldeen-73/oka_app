// Scenario 1 (hostile data) + SEC-04 (address XSS) runtime proof.
// Builds an isolated harness whose SYNTHETIC customer orders + addresses, and one product,
// carry XSS canaries / RTL / zero-width / emoji / oversize / wrong-type values, then drives
// the logged-in order pages, guest-order path, edit sheet and mocked-API renders in Chromium.
// Local only; external calls are mocked.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { launch } from '../../harness/pw.mjs';
import { buildMirror, canaryInit, imgCanary, attrBreak, RLO, ZW, EMOJI, big } from './lib-hostile.mjs';

const QA = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'out');
fs.mkdirSync(OUT, { recursive: true });
const DIR = '/tmp/oka-chaos-hostile';
const PORT = 9441;

buildMirror(DIR, QA, (open) => {
  const { data: cust, save } = open('customer.json');
  // Poison every order's shipping address + top-level fields (SEC-04 target: order-detail.liquid).
  cust.orders.forEach((o, i) => {
    o.address.first_name = imgCanary('addr.first_name.' + i);
    o.address.last_name = RLO + 'evil';
    o.address.address1 = imgCanary('addr.address1.' + i);
    o.address.address2 = attrBreak('addr.address2.' + i);
    o.address.city = imgCanary('addr.city.' + i) + ZW;
    o.address.company = EMOJI;
  });
  // First order: oversize line-item title + emoji/RTL product title for layout stress.
  cust.orders[0].line_items[0].title = big(10000);
  cust.first_name = imgCanary('customer.first_name');
  save();
  // Poison one live product title/body (reflected in cards, PDP, JSON-LD, oka-data).
  const { data: products, save: saveP } = open('products.json');
  const p = products.find((x) => x.handle === 'oka-cobra');
  if (p) {
    p.title = imgCanary('product.title');
    p.body_html = imgCanary('product.body');
    p.metafields = p.metafields || {};
    p.metafields.oka = p.metafields.oka || {};
    p.metafields.oka.title_ar = { type: 'single_line_text_field', value: imgCanary('product.title_ar') };
    saveP();
  }
});

const child = spawn(process.execPath, [path.join(DIR, 'qa/harness/server.mjs')], {
  env: { ...process.env, PORT: String(PORT), QA_OUT_DIR: path.join(OUT, 'hostile-srv'), QA_THEME_DIR: path.join(QA, '..', 'theme') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let slog = '';
child.stdout.on('data', (d) => { slog += d; });
child.stderr.on('data', (d) => { slog += d; });
const base = `http://localhost:${PORT}`;
for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/__qa/health')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }

const report = { base, routes: [] };
async function run(agent, loggedIn, routes, extra) {
  const s = await launch({ baseURL: base, device: 'Pixel 7', locale: 'en', loggedIn, agent, mocks: 'success' });
  await s.page.addInitScript(canaryInit);
  for (const r of routes) {
    try {
      await s.goto(r.url, { settle: r.settle ?? 700 });
      if (r.act) await r.act(s);
      const hits = await s.page.evaluate(() => window.__xssHits || []);
      const overflow = await s.page.evaluate(() => { const d = document.documentElement; return { scrollW: d.scrollWidth, clientW: d.clientWidth, overflow: d.scrollWidth - d.clientWidth }; });
      report.routes.push({ agent, loggedIn, url: r.url, xssHits: hits, pageErrors: s.logs.pageErrors.map((e) => e.message).slice(0, 5), horizOverflowPx: overflow.overflow });
      s.clearLogs();
    } catch (e) { report.routes.push({ agent, loggedIn, url: r.url, error: e.message }); }
  }
  await s.close();
}

// Logged-in: order list + each order detail (SEC-04 server-rendered address block).
await run('chaos', true, [
  { url: '/pages/orders' },
  { url: '/pages/orders?order=%239000101' },
  { url: '/pages/orders?order=%239000102' },
  { url: '/pages/orders?order=%239000105' },
  { url: '/pages/account' },
  { url: '/pages/addresses' },
  // open the edit-order sheet (JS render of poisoned address via esc())
  { url: '/pages/orders?order=%239000101', settle: 900, act: async (s) => { await s.page.evaluate(() => document.querySelector('[data-edit-order]')?.click()); await s.page.waitForTimeout(900); } },
]);

// Guest: hostile product reflected on storefront (cards / PDP / search / JSON-LD).
await run('chaos', false, [
  { url: '/products/oka-cobra' },
  { url: '/products/oka-cobra?view=ar' },
  { url: '/collections/hookahs' },
  { url: '/search?q=oka' },
  { url: '/collections/all?view=oka-data', settle: 300 },
  { url: '/' },
]);

child.kill();
fs.writeFileSync(path.join(OUT, '02-hostile-data.json'), JSON.stringify(report, null, 1));
const executed = report.routes.filter((r) => r.xssHits && r.xssHits.length);
console.log(`routes driven: ${report.routes.length}; routes with XSS canary execution: ${executed.length}`);
for (const r of report.routes) console.log(`${r.loggedIn ? 'IN ' : 'OUT'} ${String(r.url).padEnd(42)} xss=${JSON.stringify(r.xssHits || r.error)} overflow=${r.horizOverflowPx}px err=${(r.pageErrors || []).length}`);
