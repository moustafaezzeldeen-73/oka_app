/**
 * Shared bits for the E2E journey scripts (qa/tests/e2e/*.mjs).
 * Expects a harness server already running (default http://localhost:9410, override with E2E_BASE).
 *   PORT=9410 QA_OUT_DIR=qa/harness/out-e2e node qa/harness/server.mjs
 * Each script records scenario results into qa/tests/e2e/results/<script>.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { launch } from '../../harness/pw.mjs';

export const BASE = process.env.E2E_BASE || 'http://localhost:9410';
export const OUT = process.env.E2E_OUT || '/home/user/oka_app/qa/harness/out-e2e';
const HERE = path.dirname(new URL(import.meta.url).pathname);

export const MOBILES = ['iPhone 13', 'Pixel 7'];
export const ALL_DEVICES = ['iPhone 13', 'Pixel 7', 'Desktop 1440'];

// Variant ids from the fixtures
export const V = {
  cloud: '47026198217002', pink: '49371416363306', carbon: '49371416330538',
  cobra: '50678215508266', cobraBase: '50678225207594', trio: '51548874604842', hexa: '51548875587882',
  blackTobacco: '50684697018666', blueberry: '49400093081898', icedLemon: '49400060805418', mint: '49399990976810',
  tongs: '46037718303018', foil: '47207342506282', coal: '47207340015914', stem: '46037717025066', hoseBowl: '46037716730154',
  premiumHose: '46037717123370', bowlGlazed: '46037718106410',
};

export function recorder(name) {
  const results = [];
  const file = path.join(HERE, 'results', `${name}.json`);
  const rec = {
    results,
    add(r) {
      const row = { ...r, at: new Date().toISOString() };
      results.push(row);
      const tag = row.status.padEnd(7);
      console.log(`${tag} ${row.id || ''} ${row.scenario} [${row.ctx || ''}] ${row.note || ''}`);
      fs.writeFileSync(file, JSON.stringify(results, null, 2));
    },
    save() { fs.writeFileSync(file, JSON.stringify(results, null, 2)); },
  };
  return rec;
}

export async function session(o = {}) {
  const s = await launch({ baseURL: BASE, agent: 'e2e', device: 'iPhone 13', locale: 'ar', ...o });
  s.ctx = `${s.device}/${s.locale}/${o.loggedIn ? 'customer' : 'guest'}`;
  return s;
}

/** Console errors + page errors + failed requests + http errors, minus expected 404s for the page itself. */
export function problems(s, { allow = [] } = {}) {
  const ok = (t) => allow.some((re) => re.test(t));
  return {
    consoleErrors: s.logs.console.filter((m) => m.type === 'error' && !ok(m.text)).map((m) => `${m.text} @${m.url}`),
    pageErrors: s.logs.pageErrors.filter((e) => !ok(e.message)).map((e) => `${e.message} @${e.url}`),
    requestFailed: s.logs.requestFailed.filter((r) => !ok(r.url)).map((r) => `${r.method} ${r.url} ${r.failure}`),
    httpErrors: s.logs.httpErrors.filter((r) => !ok(r.url)).map((r) => `${r.status} ${r.url}`),
  };
}
export const hasProblems = (p) => p.consoleErrors.length + p.pageErrors.length > 0;

export async function cartJs(s) {
  return s.page.evaluate(async () => (await fetch('/cart.js')).json());
}
export async function clearCart(s) {
  await s.page.evaluate(async () => fetch('/cart/clear.js', { method: 'POST' }));
}
export async function addVia(s, items) {
  return s.page.evaluate(async (items) => (await fetch('/cart/add.js', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items }) })).json(), items);
}
export function readJsonl(file) {
  try { return fs.readFileSync(path.join(OUT, file), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch (e) { return []; }
}
export async function textOf(s, sel) { return s.page.locator(sel).first().innerText().catch(() => null); }
export async function visible(s, sel) { return s.page.locator(sel).first().isVisible().catch(() => false); }
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Run fn, record PASS/FAIL from its boolean/obj return, never throw. */
export async function step(rec, meta, fn) {
  try {
    const r = await fn();
    const status = r === true ? 'PASS' : r === false ? 'FAIL' : (r && r.status) || 'PASS';
    rec.add({ ...meta, status, note: (r && r.note) || meta.note || '', data: r && r.data });
  } catch (e) {
    rec.add({ ...meta, status: 'ERROR', note: String(e && e.message || e).slice(0, 400) });
  }
}
