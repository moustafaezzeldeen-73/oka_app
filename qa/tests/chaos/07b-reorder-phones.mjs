// Follow-up to 07: (a) visible "Order again" tapped 3x quickly by a real pointer; (b) Egyptian phone
// formats through the real add-address form submit (the theme's own validation message).
import fs from 'node:fs';
import { launch } from '../../harness/pw.mjs';
const BASE = process.argv[2] || 'http://localhost:9440';
const seed = () => { try { localStorage.setItem('oka.age', 'true'); localStorage.setItem('__qa_seeded', '1'); } catch {} };
const cookieHdr = async (s) => (await s.context.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
const out = {};
{
  const s = await launch({ baseURL: BASE, device: 'Pixel 7', locale: 'en', agent: 'chaos', loggedIn: true });
  await s.page.addInitScript(seed);
  await s.goto('/pages/orders?order=%239000105', { settle: 900 });
  const btn = s.page.locator('[data-order-detail]:not([hidden]) [data-reorder]').first();
  const visible = await btn.isVisible().catch(() => false);
  if (visible) { await btn.click({ noWaitAfter: true }); await btn.click({ noWaitAfter: true, force: true }).catch(() => {}); await btn.click({ noWaitAfter: true, force: true }).catch(() => {}); }
  await s.page.waitForTimeout(2500);
  const cart = await (await fetch(BASE + '/cart.js', { headers: { cookie: await cookieHdr(s) } })).json();
  const lines = await s.page.evaluate(() => JSON.parse(document.querySelector('[data-order-detail="#9000105"]')?.dataset.lines || '[]'));
  out.reorder = { order: '#9000105', reorderVisible: visible, orderLines: lines.map((l) => [l.handle, l.quantity]), cartAfter3Taps: (cart.items || []).map((i) => [i.handle, i.quantity]), url: s.page.url() };
  await s.close();
}
{
  const phones = ['01012345678', '+201012345678', '00201012345678', '٠١٠١٢٣٤٥٦٧٨', '0100 123 4567', '0100-123-4567', '  01012345678  ', '+20 100 123 4567', '0101234567', '01912345678'];
  const s = await launch({ baseURL: BASE, device: 'Pixel 7', locale: 'en', agent: 'chaos', loggedIn: true });
  await s.page.addInitScript(seed);
  out.phones = [];
  for (const p of phones) {
    await s.goto('/pages/addresses?view=oka-add-address', { settle: 500 });
    const r = await s.page.evaluate((p) => {
      const f = (k) => document.querySelector(`[data-f="${k}"]`);
      const set = (k, v) => { const el = f(k); if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } return Boolean(el); };
      const got = { street: set('street', '12 Example Street'), city: set('city', 'Nasr City'), phone: set('phone', p) };
      document.querySelector('[data-province], [data-prov]')?.click();
      const form = document.querySelector('form');
      form?.requestSubmit?.();
      const alert = document.querySelector('.alert')?.innerText || '';
      document.querySelectorAll('.alert-btn').forEach((b) => b.click());
      return { fieldsFound: got, alert: alert.replace(/\s+/g, ' ').slice(0, 160) };
    }, p);
    out.phones.push({ phone: p, phoneRejected: /mobile/i.test(r.alert), alert: r.alert, fieldsFound: r.fieldsFound });
  }
  await s.close();
}
fs.writeFileSync('qa/tests/chaos/out/07b-reorder-phones.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.reorder));
for (const p of out.phones) console.log(JSON.stringify(p.phone).padEnd(22), p.phoneRejected ? 'REJECTED' : 'accepted', '|', p.alert, JSON.stringify(p.fieldsFound));
