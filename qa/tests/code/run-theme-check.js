// Runs Shopify Theme Check (theme-check-node, recommended config) over the theme, read-only.
const { themeCheckRun } = require('@shopify/theme-check-node');
const path = require('path');
const root = path.resolve(__dirname, '../../../theme');
(async () => {
  const { offenses } = await themeCheckRun(root, undefined, (m) => process.stderr.write(m + '\n'));
  const sev = ['ERROR', 'WARNING', 'INFO'];
  offenses.sort((a, b) => a.uri.localeCompare(b.uri) || a.start.line - b.start.line);
  const counts = {};
  for (const o of offenses) {
    counts[o.check] = (counts[o.check] || 0) + 1;
    console.log(`${sev[o.severity] || o.severity}\t${o.uri.replace(/^file:\/\/.*?\/theme\//, '')}:${o.start.line + 1}\t${o.check}\t${o.message}`);
  }
  console.log('\nTotals by check:');
  Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  console.log(`Total offenses: ${offenses.length}`);
})().catch((e) => { console.error(e); process.exit(1); });
