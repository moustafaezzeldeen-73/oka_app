// Long strings: toasts (white-space: nowrap) and long product titles at 320 px.
import { launch, BASE, seedCart, save } from './lib.mjs';
const out = {};
for (const locale of ['ar', 'en']) {
  const s = await launch({ baseURL: BASE, device: 'Small 320', locale, agent: 'visual' });
  await seedCart(s);
  await s.goto('/collections/all', { settle: 1200 });
  const toasts = locale === 'ar'
    ? ['اتنسخ رقم الشحنة JEGQA0000000002 — الصقه في صفحة التتبع', 'معرفناش نضيف العرض — ممكن حاجة منه تكون خلصت', 'اتحفظ في المفضلة']
    : ['AWB JEGQA0000000002 copied — paste it on the tracking page', "Couldn't add this offer — part of it may be sold out", 'Saved to your wishlist'];
  out[`toast-${locale}`] = [];
  for (const [i, t] of toasts.entries()) {
    await s.page.evaluate((t) => window.Oka.toast(t), t);
    await s.page.waitForTimeout(300);
    out[`toast-${locale}`].push(await s.page.evaluate(() => { const r = document.querySelector('.toast').getBoundingClientRect(); const a = document.querySelector('#app').getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), vw: innerWidth, clippedByApp: r.left < a.left || r.right > a.right }; }));
    if (i === 0) await s.shot(`long-toast-320-${locale}`);
  }
  // long titles: overwrite the first grid card title with a 90-char title (real titles reach ~60)
  await s.page.evaluate((locale) => { const t = document.querySelector('.gcard-title'); t.querySelector(locale === 'ar' ? '.l-ar' : '.l-en').textContent = locale === 'ar' ? 'شيشة أوكا كوبرا الجديدة بالقاعدة المضيئة القابلة للشحن مع لي سيليكون وراس سيراميك هدية ١٢ جرام' : 'OKA Cobra Hookah with rechargeable LED wooden base, silicone hose and free ceramic bowl 12g'; const p = document.querySelector('.gcard-price'); p.querySelector(locale === 'ar' ? '.l-ar' : '.l-en').textContent = locale === 'ar' ? '١٢٬٣٤٥ ج.م' : 'EGP 12345'; }, locale);
  await s.page.waitForTimeout(200);
  out[`longTitle-${locale}`] = await s.page.evaluate(() => { const c = document.querySelector('.gcard'); const res = []; for (const el of c.querySelectorAll('*')) { const r = el.getBoundingClientRect(); const cr = c.getBoundingClientRect(); if (r.width && (r.right > cr.right + 1 || r.left < cr.left - 1 || el.scrollWidth > el.clientWidth + 1)) res.push({ cls: el.className.toString(), sw: el.scrollWidth, cw: el.clientWidth, r: Math.round(r.right), cr: Math.round(cr.right) }); } return { overflow: res, title: getComputedStyle(c.querySelector('.gcard-title')).webkitLineClamp, priceRow: c.querySelector('.gcard-row').getBoundingClientRect().width }; });
  await s.page.locator('.gcard').first().screenshot({ path: `/home/user/oka_app/qa/reports/screenshots/visual/long-title-gcard-320-${locale}.png` });
  await s.close();
}
save('long-text.json', out);
console.log(JSON.stringify(out, null, 0));
