/*
 * Loads theme/assets/oka.js (and optionally oka-screens.js) into a node:vm sandbox
 * with a minimal DOM stub, so the pure money functions on window.Oka can be
 * exercised without a browser. Read-only: nothing here talks to the network
 * except the stubbed fetch, which serves a fake Shopify Cart AJAX API.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const THEME = path.resolve(__dirname, '../../../theme');

// Live theme settings (qa/settings_data.live.json) rendered the way layout/theme.liquid renders window.OKA.
const LIVE_CFG = {
  minOrder: 0,
  tier: 300,
  zones: { metro: { under: 60, over: 36 }, delta: { under: 70, over: 46 }, far: { under: 80, over: 56 } },
  pointsPerEgp: 10,
  earnPointsPerEgp: 1,
  subscriptionDiscount: 5,
  routes: { cart: '/cart', checkout: '/checkout', root: '/', login: '/account/login' },
  catalogueUrl: '/collections/all?view=oka-data',
};

function el() {
  return {
    dataset: {}, style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {}, hasAttribute() { return false; },
    addEventListener() {}, appendChild() {}, append() {}, remove() {}, querySelector() { return null; },
    querySelectorAll() { return []; }, insertAdjacentHTML() {}, closest() { return null; }, matches() { return false; },
    focus() {}, innerHTML: '', textContent: '',
  };
}

/**
 * @param {object} opts
 *   lang     'ar' | 'en'
 *   cfg      overrides for window.OKA
 *   cart     initial cart.js payload (cents, as Shopify returns it)
 *   cartApi  function(url, body) -> json, to emulate /cart/*.js
 */
function load({ lang = 'ar', cfg = {}, customer = null, cartApi = null } = {}) {
  const ls = new Map();
  const listeners = {};
  const documentElement = { lang, dir: lang === 'ar' ? 'rtl' : 'ltr' };
  const document = {
    documentElement,
    readyState: 'complete',
    referrer: '',
    body: el(),
    head: el(),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => el(),
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    dispatchEvent: (e) => { (listeners[e.type] || []).forEach((fn) => fn(e)); return true; },
  };
  const calls = [];
  const fetch = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, body });
    const res = cartApi ? await cartApi(url, body) : { status: 200, json: {} };
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      json: async () => res.json,
      text: async () => JSON.stringify(res.json),
    };
  };
  class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } }
  class MutationObserver { observe() {} }
  const window = {
    OKA: { ...LIVE_CFG, ...cfg, customer },
    addEventListener() {},
    location: { pathname: '/', search: '', href: '/', origin: 'https://example.test' },
    history: { length: 1 },
  };
  const sandbox = {
    window, document, fetch, CustomEvent, MutationObserver, console,
    navigator: {},
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    performance: { getEntriesByType: () => [], now: () => Date.now() },
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    setTimeout, clearTimeout, URL, URLSearchParams, Promise, JSON, Math, Date, Number, String, Array, Object, Map, Set,
  };
  sandbox.globalThis = sandbox;
  sandbox.location = window.location;
  sandbox.history = window.history;
  sandbox.Element = function Element() {};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(THEME, 'assets/oka.js'), 'utf8'), sandbox, { filename: 'oka.js' });
  return { Oka: window.Oka, sandbox, calls, documentElement, ls };
}

module.exports = { load, LIVE_CFG, THEME };
