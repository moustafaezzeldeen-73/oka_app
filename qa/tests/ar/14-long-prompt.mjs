// Permission prompt left unanswered for 20 s, then Allow: what does the AR screen / PDP section say meanwhile and after?
import { open, camState, arInfo, out, sleep } from './lib.mjs';
for (const where of ['arpage', 'pdp']) {
  const s = await open({ gum: 'pending' });
  await s.goto(where === 'arpage' ? '/products/oka-cobra?view=ar' : '/products/oka-cobra');
  if (where === 'pdp') await s.page.evaluate(() => { const sc = document.querySelector('.screen[data-screen="product"]'); sc.scrollTo({ top: document.querySelector('[data-ar-view]').offsetTop - 76, behavior: 'instant' }); });
  const seq = [];
  for (const t of [500, 3000, 20000]) { await sleep(t - (seq.length ? [500, 3000, 20000][seq.length - 1] : 0)); const i = await arInfo(s.page); seq.push(`${t}ms:"${i.status}"`); }
  await s.page.evaluate(() => window.__camReleasePending());
  await sleep(6000);
  const i = await arInfo(s.page);
  out(`${where} prompt pending:`, seq.join(' '), '| after Allow:', `"${i.status}"`, i.cls, await camState(s.page));
  await s.shot(`long-prompt-${where}-after-allow`);
  await s.close();
}
