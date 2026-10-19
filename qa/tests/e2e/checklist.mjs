// Turns qa/tests/e2e/results/*.json into the "Scenarios executed" checklist (markdown on stdout).
// Rows are grouped by scenario; contexts (device/lang/guest|customer) folded into one line per status.
import fs from 'node:fs';
import path from 'node:path';
const dir = path.join(path.dirname(new URL(import.meta.url).pathname), 'results');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
let out = '';
let tot = { PASS: 0, FAIL: 0, ERROR: 0, BLOCKED: 0, INFO: 0 };
for (const f of files) {
  const rows = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  out += `\n#### ${f.replace('.json', '')}\n\n| ID | Scenario | Result | Contexts | Evidence (first) |\n|---|---|---|---|---|\n`;
  const groups = new Map();
  for (const r of rows) {
    const k = `${r.id}|${r.scenario}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
    tot[r.status] = (tot[r.status] || 0) + 1;
  }
  for (const [k, rs] of groups) {
    const [id, sc] = k.split('|');
    const by = {};
    rs.forEach((r) => { (by[r.status] ||= []).push(r.ctx); });
    const res = Object.entries(by).map(([st, c]) => `${st}×${c.length}`).join(' ');
    const ctxs = Object.entries(by).map(([st, c]) => `${st}: ${[...new Set(c)].join(', ')}`).join('; ');
    const ev = (rs.find((r) => r.status !== 'PASS') || rs[0]).note || '';
    out += `| ${id} | ${sc.replace(/\|/g, '\\|')} | ${res} | ${ctxs.replace(/\|/g, '/')} | ${ev.replace(/\|/g, '/').replace(/\n/g, ' ').slice(0, 260)} |\n`;
  }
}
console.log(`Totals: ${JSON.stringify(tot)}\n${out}`);
