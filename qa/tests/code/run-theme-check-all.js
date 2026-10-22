const { themeCheckRun } = require('@shopify/theme-check-node');
const path = require('path');
(async () => {
  const { offenses } = await themeCheckRun(path.resolve(__dirname, '../../../theme'), path.resolve(__dirname, 'theme-check-all.yml'), () => {});
  const sev = ['ERROR', 'WARNING', 'INFO'];
  offenses.sort((a, b) => a.uri.localeCompare(b.uri) || a.start.line - b.start.line);
  const counts = {};
  for (const o of offenses) { counts[o.check] = (counts[o.check] || 0) + 1; console.log(`${sev[o.severity]}\t${o.uri.replace(/^file:\/\/.*?\/theme\//, '')}:${o.start.line + 1}\t${o.check}\t${o.message}`); }
  console.log('\nTotals by check:'); Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  console.log(`Total offenses: ${offenses.length}`);
})().catch((e) => { console.error(e); process.exit(1); });
