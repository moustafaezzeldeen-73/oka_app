// Shared helpers for the AR / camera / media QA scripts (agent 'ar').
import { launch } from '../../harness/pw.mjs';
export const BASE = process.env.QA_BASE || 'http://localhost:9430';
export const MODEL_PRODUCTS = ['oka-cloud-white-hookah', 'oka-carbon-black-hookah', 'oka-victoria-pink-hookah', 'oka-cobra', 'oka-black-tobacco-plate'];
export const NO_MODEL = ['oka-black-tobacco', 'trio-party', 'tongs', 'oka-cobra-oka-base'];

/**
 * gum: how getUserMedia behaves (on top of pw.mjs' cameraPermission):
 *  'real' (fake device stream), 'NotReadableError' | 'OverconstrainedError' | 'NotFoundError' | 'NotAllowedError' | 'AbortError',
 *  'undefined' (no mediaDevices.getUserMedia), 'pending' (never resolves), 'delay:<ms>' (resolve with a real stream after ms)
 * Every call / stream / track is recorded in window.__cam.
 */
export function camInit(gum = 'real') {
  return ({ gum }) => {
    const cam = (window.__cam = { calls: 0, resolved: 0, rejected: [], streams: [], log: [] });
    const t0 = performance.now();
    const md = navigator.mediaDevices;
    if (gum === 'undefined') {
      try { if (md) Object.defineProperty(md, 'getUserMedia', { value: undefined, configurable: true }); } catch (e) {}
      try { Object.defineProperty(MediaDevices.prototype, 'getUserMedia', { value: undefined, configurable: true }); } catch (e) {}
      return;
    }
    if (!md) return;
    const orig = md.getUserMedia.bind(md);
    let pendingResolvers = (window.__camPending = []);
    md.getUserMedia = function (c) {
      cam.calls++;
      cam.log.push({ t: Math.round(performance.now() - t0), ev: 'call', c: JSON.stringify(c) });
      let p;
      if (/Error$/.test(gum)) p = Promise.reject(new DOMException('simulated ' + gum, gum));
      else if (gum === 'pending') p = new Promise((res, rej) => pendingResolvers.push({ res: () => orig(c).then(res, rej), rej }));
      else if (gum.startsWith('delay:')) p = new Promise((r) => setTimeout(r, Number(gum.slice(6)))).then(() => orig(c));
      else p = orig(c);
      return p.then((s) => {
        cam.resolved++;
        cam.streams.push(s);
        cam.log.push({ t: Math.round(performance.now() - t0), ev: 'resolve', id: s.id });
        return s;
      }, (e) => { cam.rejected.push(e.name); cam.log.push({ t: Math.round(performance.now() - t0), ev: 'reject', name: e.name }); throw e; });
    };
    window.__camLive = () => cam.streams.reduce((n, s) => n + s.getTracks().filter((t) => t.readyState === 'live').length, 0);
    window.__camReleasePending = () => { const l = pendingResolvers.splice(0); l.forEach((x) => x.res()); return l.length; };
  };
}

export async function open({ gum = 'real', cameraPermission = 'granted', device = 'iPhone 13', locale = 'en', extraInit, ...rest } = {}) {
  const s = await launch({ baseURL: BASE, device, locale, cameraPermission, agent: 'ar', ...rest });
  await s.context.addInitScript(camInit(gum), { gum });
  if (extraInit) await s.context.addInitScript(extraInit);
  return s;
}

export const camState = (page) => page.evaluate(() => {
  const c = window.__cam || {};
  return { calls: c.calls, resolved: c.resolved, rejected: c.rejected, live: window.__camLive ? window.__camLive() : null, streams: (c.streams || []).length };
}).catch((e) => ({ error: e.message }));

export const arInfo = (page, sel = '[data-ar-view], [data-screen="product-ar"]') => page.evaluate((sel) => {
  const r = document.querySelector(sel);
  if (!r) return null;
  const mv = r.querySelector('model-viewer');
  const vid = r.querySelector('[data-ar-cam]');
  return {
    cls: r.className, status: r.querySelector('[data-ar-status-text]')?.textContent.trim(), state: r.querySelector('[data-ar-status]')?.dataset.state,
    loading: r.querySelector('[data-ar-loading]') ? { hidden: r.querySelector('[data-ar-loading]').hidden, text: r.querySelector('[data-ar-loading]').textContent.trim() } : null,
    photoHidden: r.querySelector('[data-ar-photo]')?.hidden,
    camHidden: vid?.hidden, camHasStream: !!vid?.srcObject,
    mv: mv ? Object.fromEntries([...mv.attributes].map((a) => [a.name, a.value])) : null,
    mvLoaded: mv ? mv.loaded : null, canActivateAR: mv ? mv.canActivateAR : null,
  };
}, sel);

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const out = (...a) => console.log(...a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))));
