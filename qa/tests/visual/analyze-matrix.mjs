// Summarise out/matrix-*.json → out/matrix-summary.json + console
import fs from 'node:fs';
const files = fs.readdirSync('out').filter((f) => /^matrix-.*\.json$/.test(f) && !f.includes('summary'));
const all = files.flatMap((f) => JSON.parse(fs.readFileSync(`out/${f}`)));
const axeAgg = new Map();
for (const r of all) for (const v of r.axe || []) {
  const k = `${v.kind}|${v.impact}|${v.id}`;
  const a = axeAgg.get(k) || { kind: v.kind, impact: v.impact, id: v.id, help: v.help, pages: new Set(), nodes: 0, targets: new Set(), summary: v.summary };
  a.pages.add(r.route); a.nodes += v.n; v.targets.forEach((t) => a.targets.size < 12 && a.targets.add(t)); axeAgg.set(k, a);
}
const order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
const axeList = [...axeAgg.values()].sort((a, b) => (a.kind > b.kind ? -1 : a.kind < b.kind ? 1 : order[a.impact] - order[b.impact] || b.pages.size - a.pages.size));
console.log('AXE');
for (const a of axeList) console.log(`${a.kind} ${a.impact} ${a.id} pages=${a.pages.size} nodes=${a.nodes} :: ${a.help}\n   ${[...a.targets].slice(0, 6).join(' || ')}\n   ${[...a.pages].slice(0, 8).join(' ')}`);
const agg = (key, f) => { const m = new Map(); for (const r of all) for (const x of (r.probe?.[key] || [])) { const k = f(x); const e = m.get(k) || { k, combos: new Set(), routes: new Set() }; e.combos.add(r.combo); e.routes.add(r.route); m.set(k, e); } return [...m.values()].sort((a, b) => b.routes.size - a.routes.size); };
for (const key of ['outOfViewport', 'clipped', 'latinOnAr', 'arabicOnEn', 'latinDigitsOnAr', 'indicDigitsOnEn', 'tinyTargets', 'englishLabelsOnAr', 'englishAltOnAr']) {
  const l = agg(key, (x) => (typeof x === 'string' ? x : key === 'tinyTargets' ? `${x.sel} ${x.w}x${x.h} "${x.name}"` : key === 'englishLabelsOnAr' ? x.label : key === 'englishAltOnAr' ? x.alt : `${x.sel} "${x.text}"`));
  console.log(`\n${key}: ${l.length} distinct`);
  for (const e of l.slice(0, key.match(/latinOnAr|arabicOnEn/) ? 60 : 25)) console.log(`  [${e.routes.size}r ${[...e.combos].join(',')}] ${e.k.slice(0, 140)}  :: ${[...e.routes].slice(0, 4).join(' ')}`);
}
console.log('\nsmallTargets (<44) count per route (root-ar-guest):');
for (const r of all.filter((r) => r.combo === 'root-ar-guest' && r.probe)) console.log(`  ${r.route} small=${r.probe.smallTargets.length} tiny=${r.probe.tinyTargets.length} nodes=${r.probe.nodes} h=${r.probe.headings.length} h1=${r.probe.headings.filter((h) => h.startsWith('h1')).length} live=${r.probe.landmarks['[aria-live]'] + r.probe.landmarks['[role=status]']} docOv=${r.probe.docOverflow}`);
console.log('\nlang/dir per combo:');
const ld = new Map(); for (const r of all) if (r.probe) { const k = `${r.combo} lang=${r.probe.lang} dir=${r.probe.dir}`; ld.set(k, (ld.get(k) || 0) + 1); } for (const [k, v] of ld) console.log(' ', k, v);
console.log('\ncovered:'); for (const r of all) if (r.covered?.length) console.log(`  ${r.combo} ${r.route}: ${r.covered.map((c) => `${c.el}"${c.text}" by ${c.by}`).slice(0, 4).join(' | ')}`);
console.log('\nerrors/pageErrors:'); for (const r of all) if (r.error || r.pageErrors?.length) console.log(`  ${r.combo} ${r.route}: ${r.error || ''} ${r.pageErrors?.join(' ; ')}`);
console.log('\ninputs (rtl tel/email):'); const inp = new Map(); for (const r of all) for (const i of r.probe?.inputs || []) { if (/tel|email|number/.test(i.type) || /phone|email/i.test(i.name + i.sel)) { const k = `${i.sel} type=${i.type} dir=${i.dir} ta=${i.textAlign} label=${i.label}`; if (r.probe.lang === 'ar') inp.set(k, r.route); } } for (const [k, v] of inp) console.log('  ', k, v);
console.log('\nunlabelled inputs:'); const ul = new Map(); for (const r of all) for (const i of r.probe?.inputs || []) if (!i.label) ul.set(`${i.sel} type=${i.type} ph="${i.placeholder}"`, r.route); for (const [k, v] of ul) console.log('  ', k, v);
fs.writeFileSync('out/matrix-summary.json', JSON.stringify({ axe: axeList.map((a) => ({ ...a, pages: [...a.pages], targets: [...a.targets] })) }, null, 1));
