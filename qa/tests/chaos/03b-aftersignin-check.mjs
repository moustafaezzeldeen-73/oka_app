// Re-check of oka.afterSignIn corruption with a ONE-SHOT seed (03 re-seeded on every load).
import { launch } from '../../harness/pw.mjs';
const BASE = process.argv[2] || 'http://localhost:9440';
for (const bad of ['{}', '"a string"', '"//example.invalid/x"', '"/pages/orders"']) {
  const s = await launch({ baseURL: BASE, device: 'Pixel 7', locale: 'en', loggedIn: true, agent: 'chaos' });
  await s.page.addInitScript((bad) => { try { if (!sessionStorage.getItem('__once')) { sessionStorage.setItem('__once', '1'); localStorage.setItem('oka.afterSignIn', bad); } } catch {} }, bad);
  const navs = [];
  s.page.on('framenavigated', (f) => { if (f === s.page.mainFrame()) navs.push(f.url()); });
  try { await s.goto('/pages/account', { settle: 1500 }); } catch (e) { navs.push('ERR ' + e.message.split('\n')[0]); }
  console.log(JSON.stringify({ bad, finalUrl: s.page.url(), navigations: navs.length, path: navs.map((u) => u.replace(BASE, '')) }));
  await s.close();
}
