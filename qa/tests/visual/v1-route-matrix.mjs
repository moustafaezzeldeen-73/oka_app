// Per-route matrix: every smoke route × {ar, en} × {/ , /ar/} × {guest, customer}
// at iPhone 13 (390×664). axe-core + layout/i18n/RTL probe + covered-control probe.
//   node v1-route-matrix.mjs <comboIndex 0..7>
import { launch, ROUTES, BASE, seedCart, save, probe, coveredProbe, axe } from './lib.mjs';

export const COMBOS = [];
for (const urlLocale of [false, true]) for (const locale of ['ar', 'en']) for (const loggedIn of [false, true]) COMBOS.push({ urlLocale, locale, loggedIn });
const which = process.argv[2] != null ? [Number(process.argv[2])] : COMBOS.map((_, i) => i);

for (const ci of which) {
  const c = COMBOS[ci];
  const tag = `${c.urlLocale ? 'arurl' : 'root'}-${c.locale}-${c.loggedIn ? 'cust' : 'guest'}`;
  const s = await launch({ baseURL: BASE, device: 'iPhone 13', locale: c.locale, urlLocale: c.urlLocale, loggedIn: c.loggedIn, agent: 'visual', externalTimeoutMs: 1500 });
  await seedCart(s);
  const rows = [];
  for (const [route, label] of ROUTES) {
    if (c.urlLocale && route.startsWith('/ar/')) continue;
    s.clearLogs();
    const row = { route, label, combo: tag };
    try {
      const resp = await s.goto(route, { settle: 800 });
      row.status = resp?.status();
      row.template = resp?.headers()['x-qa-template'];
      row.final = new URL(s.page.url()).pathname + new URL(s.page.url()).search;
      const ct = resp?.headers()['content-type'] || '';
      if (!/html/.test(ct)) { row.skipped = 'non-html'; rows.push(row); continue; }
      row.probe = await s.page.evaluate(probe);
      row.axe = await axe(s.page);
      row.covered = await s.page.evaluate(coveredProbe);
      row.pageErrors = s.logs.pageErrors.map((e) => e.message);
      row.consoleErrors = s.logs.console.filter((m) => m.type === 'error').map((m) => m.text.slice(0, 200));
      if (!c.loggedIn) await s.shot(`matrix-${tag}-${route.replace(/^\//, '') || 'home'}`);
    } catch (e) { row.error = e.message.slice(0, 300); }
    rows.push(row);
    process.stdout.write('.');
  }
  save(`matrix-${tag}.json`, rows);
  console.log(`\n${tag}: ${rows.length} rows`);
  await s.close();
}
