/**
 * Playwright helpers for driving the local OKA storefront.
 *
 *   import { launch, startServer } from './pw.mjs';
 *   const srv = await startServer({ port: 9310 });          // or run server.mjs yourself
 *   const s = await launch({ baseURL: srv.url, device: 'iPhone 13', locale: 'ar', loggedIn: true,
 *                            cameraPermission: 'granted', mocks: 'customer_get_order:error500', agent: 'cart-tester' });
 *   await s.goto('/products/oka-cobra');
 *   await s.shot('pdp');                                    // qa/reports/screenshots/cart-tester/pdp.png
 *   console.log(s.logs.console, s.logs.pageErrors, s.logs.requestFailed, s.logs.external);
 *   await s.close(); await srv.stop();
 *
 * Every request to a non-local host is intercepted: logged by the server to
 * out/external-calls.jsonl and answered from lib/mocks.mjs. Nothing reaches the internet.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const HERE = path.dirname(new URL(import.meta.url).pathname);
export const QA_ROOT = path.resolve(HERE, '..');

async function loadPlaywright() {
  try { return await import('playwright'); } catch (e) { /* fall through */ }
  const candidates = [process.env.PLAYWRIGHT_MODULE, '/opt/node22/lib/node_modules/playwright'].filter(Boolean);
  for (const c of candidates) {
    try { return createRequire(import.meta.url)(c); } catch (e) { /* next */ }
  }
  throw new Error('playwright not found (expected the preinstalled global module)');
}

export const DEVICES = {
  'Desktop 1440': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false, userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36' },
  'Desktop 1024': { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  'Small 320': { viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36' },
};

/** Start a server.mjs child on `port` (own out dir by default) and wait for /__qa/health. */
export async function startServer({ port = 9292 + Math.floor(Math.random() * 500) + 1, outDir, env = {} } = {}) {
  const out = outDir || path.join(HERE, 'out');
  const child = spawn(process.execPath, [path.join(HERE, 'server.mjs')], { env: { ...process.env, PORT: String(port), QA_OUT_DIR: out, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  const url = `http://localhost:${port}`;
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(`${url}/__qa/health`); if (r.ok) break; } catch (e) { /* not yet */ }
    if (child.exitCode != null) throw new Error(`server exited: ${log}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  return { url, port, child, log: () => log, stop: () => new Promise((r) => { child.once('exit', r); child.kill(); }) };
}

/**
 * @param {object} o
 * @param {string} [o.baseURL='http://localhost:9292']
 * @param {string} [o.device='iPhone 13']   any Playwright device name, or 'Desktop 1440' | 'Desktop 1024' | 'Small 320'
 * @param {'ar'|'en'} [o.locale='ar']      the theme's language (localStorage oka.lang, seeded once) + Accept-Language
 * @param {boolean} [o.urlLocale=false]    also prefix goto() paths with /ar (Shopify's alternate-locale URLs)
 * @param {boolean} [o.loggedIn=false]     fake customer (cookie qa_customer=1)
 * @param {'granted'|'denied'|'none'} [o.cameraPermission='granted']
 * @param {string} [o.mocks='success']     mock spec for external calls (see lib/mocks.mjs)
 * @param {boolean} [o.ageConfirmed=true]  pre-answer the 18+ gate
 * @param {string} [o.agent='harness']     screenshots go to qa/reports/screenshots/<agent>/
 * @param {boolean} [o.headless=true]
 * @param {number} [o.externalTimeoutMs=8000]  how long a 'timeout' mock hangs before aborting
 */
export async function launch(o = {}) {
  const { chromium, devices } = await loadPlaywright();
  const baseURL = o.baseURL || `http://localhost:${process.env.PORT || 9292}`;
  const base = new URL(baseURL);
  const deviceName = o.device || 'iPhone 13';
  const descriptor = DEVICES[deviceName] || devices[deviceName];
  if (!descriptor) throw new Error(`unknown device '${deviceName}'`);
  const { defaultBrowserType, ...dev } = descriptor;
  const locale = o.locale || 'ar';
  const cam = o.cameraPermission || 'granted';
  const args = cam === 'granted' ? ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] : [];
  const browser = await chromium.launch({ headless: o.headless !== false, args });
  const context = await browser.newContext({ ...dev, baseURL, locale: locale === 'ar' ? 'ar-EG' : 'en-US', timezoneId: 'Africa/Cairo', geolocation: { latitude: 30.0561, longitude: 31.3302 }, permissions: ['geolocation', ...(cam === 'granted' ? ['camera', 'microphone'] : [])] });
  const cookies = [{ name: 'qa_customer', value: o.loggedIn ? '1' : '0', url: baseURL }];
  if (o.mocks) cookies.push({ name: 'qa_mock', value: String(o.mocks), url: baseURL });
  await context.addCookies(cookies);

  await context.addInitScript(({ lang, age, cam }) => {
    try {
      if (!localStorage.getItem('__qa_seeded')) {
        localStorage.setItem('oka.lang', lang);
        if (age) localStorage.setItem('oka.age', 'true');
        localStorage.setItem('__qa_seeded', '1');
      }
    } catch (e) { /* storage blocked */ }
    if (cam !== 'granted' && navigator.mediaDevices) {
      // Simulated: 'denied' → NotAllowedError, 'none' → no camera device at all.
      const err = () => new DOMException(cam === 'none' ? 'Requested device not found' : 'Permission denied', cam === 'none' ? 'NotFoundError' : 'NotAllowedError');
      navigator.mediaDevices.getUserMedia = () => Promise.reject(err());
      if (cam === 'none') navigator.mediaDevices.enumerateDevices = () => Promise.resolve([]);
      if (navigator.permissions?.query) { const q = navigator.permissions.query.bind(navigator.permissions); navigator.permissions.query = (d) => (d && d.name === 'camera' ? Promise.resolve({ state: cam === 'none' ? 'prompt' : 'denied', onchange: null }) : q(d)); }
    }
  }, { lang: locale, age: o.ageConfirmed !== false, cam });

  const logs = { console: [], pageErrors: [], requestFailed: [], external: [], httpErrors: [], documents: [] };
  const extTimeout = o.externalTimeoutMs ?? 8000;
  await context.route('**/*', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (!/^https?:$/.test(u.protocol) || (u.hostname === base.hostname && u.port === base.port) || (['localhost', '127.0.0.1'].includes(u.hostname) && u.port === base.port)) return route.continue();
    // Google-hosted <model-viewer>: serve the same version from npm.
    if (u.hostname === 'ajax.googleapis.com' && /model-viewer/.test(u.pathname)) {
      logs.external.push({ method: req.method(), url: req.url(), mode: 'local-copy' });
      await fetch(`${baseURL}/__qa/external`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method: req.method(), url: req.url(), headers: req.headers(), body: null, source: 'playwright:model-viewer-local' }) }).catch(() => {});
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(path.join(HERE, 'node_modules/@google/model-viewer/dist/model-viewer.min.js')) });
    }
    // Shopify CDN URLs that slipped through (e.g. hard-coded) → local placeholder/mirror.
    if (u.hostname === 'cdn.shopify.com') {
      const p = u.pathname.replace(/^\/s\/files\/\d+\/\d+\/\d+\/\d+\//, '/cdn/shop/');
      const local = p.startsWith('/cdn/shop/') ? p : `/cdn/shopifycloud-mirror${u.pathname}`;
      const r = await fetch(`${baseURL}${local}${u.search}`);
      return route.fulfill({ status: r.status, headers: Object.fromEntries(r.headers), body: Buffer.from(await r.arrayBuffer()) });
    }
    let mock;
    try {
      const r = await fetch(`${baseURL}/__qa/external`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: `qa_mock=${encodeURIComponent((await context.cookies(baseURL)).find((c) => c.name === 'qa_mock')?.value || '')}` }, body: JSON.stringify({ method: req.method(), url: req.url(), headers: req.headers(), body: req.postData(), source: `playwright:${req.resourceType()}` }) });
      mock = await r.json();
    } catch (e) { mock = { status: 502, headers: {}, body: `harness error: ${e.message}` }; }
    logs.external.push({ method: req.method(), url: req.url(), status: mock.status, timeout: Boolean(mock.timeout), resourceType: req.resourceType() });
    if (mock.timeout) { await new Promise((r) => setTimeout(r, extTimeout)); return route.abort('timedout').catch(() => {}); }
    return route.fulfill({ status: mock.status, headers: mock.headers, body: mock.body }).catch(() => {});
  });

  const page = await context.newPage();
  const attach = (pg) => {
    pg.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.console.push({ type: m.type(), text: m.text(), url: pg.url(), location: m.location() }); });
    pg.on('pageerror', (e) => logs.pageErrors.push({ message: e.message, stack: e.stack, url: pg.url() }));
    pg.on('requestfailed', (r) => logs.requestFailed.push({ url: r.url(), failure: r.failure()?.errorText, method: r.method(), resourceType: r.resourceType(), page: pg.url() }));
    pg.on('response', async (r) => {
      if (r.status() >= 400) logs.httpErrors.push({ url: r.url(), status: r.status(), resourceType: r.request().resourceType() });
      if (r.request().resourceType() === 'document') logs.documents.push({ url: r.url(), status: r.status(), template: r.headers()['x-qa-template'], renderWarnings: Number(r.headers()['x-qa-render-warnings'] || 0) });
    });
  };
  attach(page);
  context.on('page', attach);

  const agent = o.agent || 'harness';
  const shotDir = path.join(QA_ROOT, 'reports', 'screenshots', agent);
  return {
    browser, context, page, baseURL, logs, device: deviceName, locale,
    /** goto a storefront path (adds /ar when urlLocale) and wait for the theme scripts. */
    async goto(p, opts = {}) {
      const target = o.urlLocale && locale === 'ar' && p.startsWith('/') && !p.startsWith('/ar') ? `/ar${p}` : p;
      const resp = await page.goto(target, { waitUntil: 'load', ...opts });
      await page.waitForTimeout(opts.settle ?? 400);
      return resp;
    },
    /** Full-page or viewport screenshot to qa/reports/screenshots/<agent>/<name>.png */
    async shot(name, opts = {}) {
      fs.mkdirSync(shotDir, { recursive: true });
      const file = path.join(shotDir, `${name.replace(/[^\w.-]+/g, '_')}.png`);
      await page.screenshot({ path: file, fullPage: Boolean(opts.fullPage), ...opts });
      return file;
    },
    /** Render warnings the server recorded for the last page it rendered. */
    async renderWarnings() { const r = await fetch(`${baseURL}/__qa/warnings`); return r.json(); },
    /** Switch external-call mock mode for subsequent requests. */
    async setMocks(spec) { await context.addCookies([{ name: 'qa_mock', value: String(spec), url: baseURL }]); },
    async setLoggedIn(v) { await context.addCookies([{ name: 'qa_customer', value: v ? '1' : '0', url: baseURL }]); },
    clearLogs() { for (const k of Object.keys(logs)) logs[k].length = 0; },
    async close() { await context.close().catch(() => {}); await browser.close().catch(() => {}); },
  };
}

export const screenshotDir = (agent) => path.join(QA_ROOT, 'reports', 'screenshots', agent);
