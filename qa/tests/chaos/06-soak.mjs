// Scenario 7 — long-session soak. One page, a loop of random navigation + cart ops for N minutes.
// Measures JS heap, DOM node count, listener count (CDP), and active timers over time to spot leaks.
// Local only. Usage: node qa/tests/chaos/06-soak.mjs [baseURL] [minutes]
import fs from 'node:fs';
import path from 'node:path';
import { launch } from '../../harness/pw.mjs';

const BASE = process.argv[2] || 'http://localhost:9440';
const MINUTES = Number(process.argv[3] || 15);
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'out');
fs.mkdirSync(OUT, { recursive: true });

const ROUTES = ['/', '/collections/hookahs', '/collections/all', '/products/oka-cobra', '/products/tobacco-bowls-mint-12g', '/search?q=oka', '/cart', '/pages/orders', '/products/oka-cobra?view=ar', '/collections/bowls'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const s = await launch({ baseURL: BASE, device: 'Pixel 7', locale: 'en', agent: 'chaos', mocks: 'success' });
await s.page.addInitScript(() => { try { localStorage.setItem('oka.age', 'true'); localStorage.setItem('__qa_seeded', '1'); } catch {} });
const client = await s.context.newCDPSession(s.page);
await client.send('Performance.enable').catch(() => {});

async function sample(label) {
  const perf = await client.send('Performance.getMetrics').catch(() => ({ metrics: [] }));
  const m = Object.fromEntries((perf.metrics || []).map((x) => [x.name, x.value]));
  let heap = 0; try { heap = await s.page.evaluate(() => performance.memory ? performance.memory.usedJSHeapSize : 0); } catch {}
  const dom = await s.page.evaluate(() => document.getElementsByTagName('*').length).catch(() => 0);
  // listener count on document + window + #app via getEventListeners is devtools-only; use CDP DOMDebugger via Runtime
  return { label, t: new Date().toISOString(), jsHeapCDP: m.JSHeapUsedSize || 0, jsHeapPerfMemory: heap, domNodesCDP: m.Nodes || 0, domNodesCount: dom, jsListenersCDP: m.JSEventListeners || 0, documentsCDP: m.Documents || 0, layoutCount: m.LayoutCount || 0 };
}

const samples = [];
await s.goto('/', { settle: 600 });
samples.push(await sample('start'));
const end = Date.now() + MINUTES * 60 * 1000;
let i = 0;
const errorsSeen = [];
while (Date.now() < end) {
  i++;
  const route = pick(ROUTES);
  try {
    await s.goto(route, { settle: 250 });
    // random interactions
    await s.page.evaluate(() => {
      const click = (sel) => { const el = document.querySelector(sel); if (el) el.click(); };
      click('[data-add]'); click('[data-heart]'); click('[data-menu-open]'); click('[data-menu-close]');
      const inc = document.querySelector('[data-step="1"]'); if (inc) inc.click();
      window.dispatchEvent(new Event('resize'));
    }).catch(() => {});
    await s.page.waitForTimeout(60);
    if (i % 2 === 0) { await s.page.keyboard.press('Escape').catch(() => {}); }
    if (i % 5 === 0) { await s.page.goBack({ waitUntil: 'load' }).catch(() => {}); }
  } catch (e) { errorsSeen.push(e.message); }
  if (i % 40 === 0) { samples.push(await sample(`iter${i}`)); if (global.gc) {} }
}
samples.push(await sample('end'));
// force GC via CDP then sample to separate real leak from uncollected garbage
await client.send('HeapProfiler.enable').catch(() => {});
await client.send('HeapProfiler.collectGarbage').catch(() => {});
await s.page.waitForTimeout(500);
samples.push(await sample('after-gc'));

const report = { base: BASE, minutes: MINUTES, iterations: i, pageErrors: s.logs.pageErrors.map((e) => e.message).slice(0, 10), navErrors: errorsSeen.slice(0, 10), samples };
fs.writeFileSync(path.join(OUT, '06-soak.json'), JSON.stringify(report, null, 1));
const first = samples[0], last = samples[samples.length - 1];
const growth = (a, b, k) => b[k] && a[k] ? `${(a[k] / 1e6).toFixed(1)}→${(b[k] / 1e6).toFixed(1)}MB` : `${a[k]}→${b[k]}`;
console.log(`soak ${MINUTES}min, ${i} navigations; pageErrors=${report.pageErrors.length} navErrors=${report.navErrors.length}`);
console.log(`heap(CDP):   ${growth(first, last, 'jsHeapCDP')}`);
console.log(`DOM nodes:   ${first.domNodesCount} -> ${last.domNodesCount} (CDP ${first.domNodesCDP}->${last.domNodesCDP})`);
console.log(`listeners:   ${first.jsListenersCDP} -> ${last.jsListenersCDP}`);
console.log(`documents:   ${first.documentsCDP} -> ${last.documentsCDP}`);
for (const s2 of samples) console.log(`  ${s2.label.padEnd(8)} heap=${(s2.jsHeapCDP / 1e6).toFixed(1)}MB dom=${s2.domNodesCount} listeners=${s2.jsListenersCDP} docs=${s2.documentsCDP}`);
await s.close();
