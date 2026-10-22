// Emit the per-route Markdown matrix (status · lang · axe crit/serious · small targets · overflow) for the report.
import fs from 'node:fs';
const combos = ['root-ar-guest', 'root-ar-cust', 'root-en-guest', 'root-en-cust', 'arurl-ar-guest', 'arurl-ar-cust', 'arurl-en-guest', 'arurl-en-cust'];
const data = Object.fromEntries(combos.map((c) => [c, JSON.parse(fs.readFileSync(`out/matrix-${c}.json`))]));
const widths = fs.readdirSync('out').filter((f) => /^widths-.*json$/.test(f)).flatMap((f) => JSON.parse(fs.readFileSync(`out/${f}`)));
const routes = data['root-ar-guest'].map((r) => r.route);
const lines = ['| Route | ' + combos.join(' | ') + ' | 17 widths × ar/en: doc overflow / off-viewport (excl. rotated landscape) |', '|' + '---|'.repeat(combos.length + 2)];
for (const route of routes) {
  const cells = combos.map((c) => {
    const r = data[c].find((x) => x.route === route);
    if (!r) return '(=/ar route)';
    if (r.skipped) return `${r.status} json`;
    if (r.error) return `ERR`;
    const v = (r.axe || []).filter((a) => a.kind === 'violation');
    const cs = v.filter((a) => a.impact === 'critical' || a.impact === 'serious').length;
    return `${r.status} ${r.probe?.lang || '-'} a${cs}/${v.length}`;
  });
  const w = widths.filter((x) => x.route === route);
  const ov = w.filter((x) => x.docOverflow).length; const oov = w.filter((x) => !x.vp.startsWith('l') && x.outOfViewport?.length).length;
  lines.push(`| \`${route}\` | ${cells.join(' | ')} | ${w.length ? `${ov}/${oov} of ${w.length}` : 'n/a'} |`);
}
fs.writeFileSync('out/matrix-table.md', lines.join('\n') + '\n');
console.log(lines.length);
