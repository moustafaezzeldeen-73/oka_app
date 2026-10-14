/**
 * Mock responses for every external host the theme talks to. NOTHING is ever
 * forwarded to the real internet. Every call is logged (method/url/headers/body)
 * to qa/harness/out/external-calls.jsonl, with API keys masked.
 *
 * Mode selection (first match wins):
 *   1. cookie  qa_mock=<spec>   (set by visiting any page with ?qa_mock=<spec>, or pw.mjs launch({mocks}))
 *   2. env     QA_MOCK_MODE=<spec>
 *   3. 'success'
 * <spec> is a mode, or comma-separated `tool:mode` overrides plus an optional default,
 * e.g.  "error500"   "customer_get_order:timeout,track_delivery:malformed,success"
 *
 * Modes: success | sse (success as text/event-stream) | error401 | error500 | timeout |
 *        malformed (invalid JSON) | rpc-error (JSON-RPC error) | tool-error (result.isError) |
 *        not-found ("couldn't find an order") | shipped ("already been shipped") | empty |
 *        cors (reply without Access-Control-Allow-Origin → browser blocks it, like a wrong origin)
 */
import fs from 'node:fs';
import path from 'node:path';

export const MODES = ['success', 'sse', 'cors', 'error401', 'error500', 'timeout', 'malformed', 'rpc-error', 'tool-error', 'not-found', 'shipped', 'empty'];

export function parseSpec(spec) {
  const out = { default: 'success', tools: {} };
  for (const part of String(spec || '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const [a, b] = part.split(':');
    if (b) out.tools[a] = b; else out.default = a;
  }
  return out;
}

const mask = (v) => (typeof v === 'string' && v.length > 8 ? `${v.slice(0, 4)}…(${v.length} chars, masked)` : v);
export function maskHeaders(h = {}) {
  const o = {};
  for (const [k, v] of Object.entries(h)) o[k] = /key|auth|token|cookie/i.test(k) ? mask(v) : v;
  return o;
}

export class ExternalMocks {
  constructor({ store, outDir, settings }) {
    this.store = store;
    this.logFile = path.join(outDir, 'external-calls.jsonl');
    this.settings = settings;
    this.state = new Map(); // per-order mutable mock state (cancelled etc.)
  }
  log(entry) {
    fs.appendFileSync(this.logFile, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
  }

  /** @returns {{status:number, headers:object, body:string, timeout?:boolean, delayMs?:number}} */
  handle({ method, url, headers, body, spec, source }) {
    const u = new URL(url);
    let parsed = null;
    try { parsed = body ? JSON.parse(body) : null; } catch { parsed = null; }
    const tool = parsed?.params?.name || null;
    const cfg = parseSpec(spec || process.env.QA_MOCK_MODE);
    const mode = (tool && cfg.tools[tool]) || cfg.tools[u.hostname] || cfg.default;
    const res = this.respond(u, method, parsed, tool, mode);
    this.log({ source, method, url, host: u.hostname, tool, mode, headers: maskHeaders(headers), body: parsed ? maskBody(parsed) : (body ? String(body).slice(0, 2000) : null), response: { status: res.status, timeout: Boolean(res.timeout), body: res.body ? String(res.body).slice(0, 500) : '' } });
    return res;
  }

  respond(u, method, rpc, tool, mode) {
    const json = (status, obj, extra = {}) => ({ status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', ...extra }, body: typeof obj === 'string' ? obj : JSON.stringify(obj) });
    if (method === 'OPTIONS') return { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' }, body: '' };
    if (mode === 'timeout') return { timeout: true, status: 0, headers: {}, body: '' };
    const host = u.hostname;

    // ── JSON-RPC MCP endpoints (orders API + J&T website tracking, *.run.app/mcp) ──
    if (/\.run\.app$/.test(host) || u.pathname.endsWith('/mcp')) {
      // 'cors': the real API only allows the shop's own origins; from any other origin the browser blocks the reply.
      if (mode === 'cors') return { status: 200, headers: { 'content-type': 'application/json' }, body: '{"blocked":"no Access-Control-Allow-Origin"}' };
      if (mode === 'error401') return json(401, { error: 'unauthorized' });
      if (mode === 'error500') return json(500, { error: 'internal error' });
      if (mode === 'malformed') return { status: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: '{"jsonrpc":"2.0","result":{"content":[{"type":"text","text":"{not json' };
      const id = rpc?.id ?? 1;
      if (mode === 'rpc-error') return json(200, { jsonrpc: '2.0', id, error: { code: -32602, message: 'MCP error -32602: Invalid arguments' } });
      const text = (obj, isError = false) => ({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj) }], ...(isError ? { isError: true } : {}) } });
      if (mode === 'tool-error') return json(200, text('Something failed on the server.', true));
      if (mode === 'not-found') return json(200, text("We couldn't find an order with that order number and phone number.", true));
      if (mode === 'shipped') return json(200, text('This order has already been shipped, so it can no longer be changed.', true));
      const payload = this.toolResult(tool, rpc?.params?.arguments || {}, mode);
      const msg = text(payload);
      if (mode === 'sse') return { status: 200, headers: { 'content-type': 'text/event-stream', 'access-control-allow-origin': '*' }, body: `event: message\ndata: ${JSON.stringify(msg)}\n\n` };
      return json(200, msg);
    }
    if (host === 'nominatim.openstreetmap.org') {
      if (mode === 'error500') return json(500, { error: 'mock' });
      if (mode === 'malformed') return json(200, '{oops');
      return json(200, { place_id: 1, lat: '30.0561', lon: '31.3302', display_name: 'QA Street, Nasr City, Cairo Governorate, Egypt', address: { road: 'QA Street', house_number: '1', suburb: 'Nasr City', city: 'Cairo', state: 'Cairo Governorate', country: 'Egypt', country_code: 'eg' } });
    }
    if (host === 'wa.me' || host === 'api.whatsapp.com') return { status: 200, headers: { 'content-type': 'text/html' }, body: `<!doctype html><title>WhatsApp (QA stub)</title><h1>WhatsApp stub</h1><p data-qa-wa>${escape(u.href)}</p>` };
    if (/jtexpress/.test(host)) return { status: 200, headers: { 'content-type': 'text/html' }, body: `<!doctype html><title>J&T (QA stub)</title><h1>J&amp;T Express stub</h1><p>${escape(u.href)}</p>` };
    if (host === 'checkout.shopify.com' || host === 'shop.app' || /myshopify\.com$/.test(host) || /okaegypt\.com$/.test(host)) return { status: 200, headers: { 'content-type': 'text/html' }, body: `<!doctype html><title>External Shopify host (QA stub)</title><p>${escape(u.href)}</p>` };
    if (/youtube\.com|vimeo\.com|ytimg\.com/.test(host)) return { status: 200, headers: { 'content-type': 'text/html' }, body: '<!doctype html><body style="background:#000;color:#fff">video embed stub</body>' };
    if (/google-analytics|googletagmanager|facebook|fbcdn|tiktok|doubleclick|clarity\.ms|hotjar/.test(host)) return { status: 204, headers: {}, body: '' };
    return { status: 404, headers: { 'content-type': 'text/plain' }, body: `QA harness: no mock for ${host} (request blocked, never forwarded)` };
  }

  /* Realistic tool payloads, shaped after the theme's own consumers in assets/oka-screens.js
     (the real orders-API contract is not available in this sandbox). */
  toolResult(tool, args, mode) {
    const cust = this.store.customerFixture;
    const findOrder = () => {
      const n = String(args.orderNumber || '').replace(/\D/g, '');
      return cust.orders.find((o) => o.name.replace(/\D/g, '') === n) || (args.session ? cust.orders[0] : null);
    };
    const zoneFee = (code, merch) => {
      const s = this.settings();
      const metro = ['C', 'GZ', 'ALX', 'SU'];
      const delta = ['GH', 'KFS', 'DK', 'BH', 'SHR', 'MNF', 'KB', 'DT', 'IS', 'PTS', 'SUZ'];
      const z = metro.includes(code) ? 'metro' : delta.includes(code) ? 'delta' : 'far';
      return (merch >= (s.tier_threshold || 300) ? s[`fee_${z}_over`] : s[`fee_${z}_under`]) ?? 60;
    };
    const viewOf = (o, itemsOverride, addrOverride) => {
      const st = this.state.get(o.name) || {};
      const items = (itemsOverride || o.line_items.map((l) => ({ variantId: l.variant_id, quantity: l.quantity }))).map((it) => {
        const hit = this.store.variantIndex.get(Number(it.variantId));
        return { variantId: String(it.variantId), quantity: it.quantity, title: hit?.product.title || 'Unknown', variant: hit && hit.variant.title !== 'Default Title' ? hit.variant.title : '', image: null, unitPrice: hit ? hit.variant.price / 100 : 0, options: [] };
      });
      const itemsTotal = items.reduce((a, i) => a + i.unitPrice * i.quantity, 0);
      const address = { name: `${o.address.first_name} ${o.address.last_name}`, provinceCode: o.address.province_code, province: o.address.province, city: o.address.city, address1: o.address.address1, address2: o.address.address2, phone: o.address.phone, ...(addrOverride || {}) };
      const discount = itemsOverride ? 0 : o.total_discounts / 100;
      const shipping = zoneFee(address.provinceCode, itemsTotal - discount);
      const cancelled = Boolean(st.cancelled || o.cancelled);
      const shipped = Boolean(o.fulfillment_status);
      return {
        orderNumber: o.name, placedAt: o.created_at, status: cancelled ? 'cancelled' : shipped ? 'shipped' : 'processing', cancelled,
        canCancel: !cancelled && !shipped, canEdit: !cancelled && !shipped && o.financial_status !== 'paid',
        items, address, phone: address.phone || cust.phone, itemsTotal, subtotal: itemsTotal, discount, shipping, total: itemsTotal - discount + shipping, lostCodes: [],
      };
    };
    switch (tool) {
      case 'track_delivery': {
        if (mode === 'empty') return { code: 1, msg: 'success', data: [] };
        return { code: 1, msg: 'success', data: (args.billCodes || []).map((b, i) => ({ billCode: b, details: [
          { scanTime: '2026-10-12 10:05:00', scanType: 'Pickup scan', scanTypeCode: 10, desc: 'Your parcel has been picked up by J&T courier' },
          { scanTime: '2026-10-12 18:40:00', scanType: 'Sending scan', scanTypeCode: 50, desc: 'Parcel sent from Cairo hub' },
          { scanTime: '2026-10-13 09:15:00', scanType: 'Delivery scan', scanTypeCode: 94, desc: 'Out for delivery with courier QA Courier (01000000009)' },
          ...(i % 2 ? [{ scanTime: '2026-10-13 15:30:00', scanType: 'Signing scan', scanTypeCode: 100, desc: 'Delivered, signed by customer' }] : []),
        ] })) };
      }
      case 'track_by_phone':
        return { shipments: mode === 'empty' ? [] : [{ billCode: 'JEGQA0000000001', createdAt: '2026-10-12 09:00:00', status: 'out_for_delivery', order: '#9000102', scans: [{ time: '2026-10-12 10:05:00', type: 'Pickup scan', description: 'Picked up' }, { time: '2026-10-13 09:15:00', type: 'Delivery scan', description: 'Out for delivery with courier QA Courier (01000000009)' }] }] };
      case 'customer_get_order': {
        const o = findOrder();
        if (!o) return { error: 'not found' };
        return viewOf(o);
      }
      case 'customer_quote_order': {
        const o = findOrder();
        if (!o) return { error: 'not found' };
        return viewOf(o, args.items, args.address);
      }
      case 'customer_update_order': {
        const o = findOrder();
        if (!o) return { error: 'not found' };
        return { ...viewOf(o, args.items, args.address), updated: true };
      }
      case 'customer_cancel_order': {
        const o = findOrder();
        if (o) this.state.set(o.name, { ...(this.state.get(o.name) || {}), cancelled: true });
        return { ok: true, orderNumber: o?.name || args.orderNumber, status: 'cancelled' };
      }
      case 'customer_rate_order': return { ok: true };
      default: return { ok: true, note: `QA mock: unknown tool '${tool}'` };
    }
  }

  /** App proxy (/apps/oka/*) — same-origin order-service mock. */
  proxy({ method, url, headers, body, spec }) {
    const u = new URL(url, 'http://local');
    const cfg = parseSpec(spec || process.env.QA_MOCK_MODE);
    const mode = cfg.tools.proxy || cfg.default;
    let res;
    if (mode === 'timeout') res = { timeout: true };
    else if (mode === 'error401') res = { status: 401, body: { error: 'not signed in', code: 'unauthorized' } };
    else if (mode === 'error500') res = { status: 500, body: { error: 'internal error' } };
    else if (mode === 'malformed') res = { status: 200, raw: '<html>oops' };
    else {
      const p = u.pathname.replace(/^\/(ar\/)?apps\/oka/, '');
      const map = {
        '/loyalty': { balance: 250, points: 250, rewards: [{ id: 'r1', points: 100, egp: 10 }], vouchers: [] },
        '/subscriptions': { subscriptions: [] },
        '/subscription-frequencies': { frequencies: [{ id: 'monthly', en: 'Every month', ar: 'كل شهر', discountPct: 5 }] },
        '/customer/wishlist': { handles: [] },
      };
      res = { status: 200, body: map[p] || { ok: true } };
    }
    this.log({ source: 'app-proxy', method, url: u.pathname + u.search, host: 'app-proxy', mode, headers: maskHeaders(headers), body: body || null, response: { status: res.status || 0, timeout: Boolean(res.timeout) } });
    return res;
  }
}

function maskBody(b) {
  const s = JSON.stringify(b);
  return JSON.parse(s.replace(/("(?:key|token|apiKey|x-api-key)"\s*:\s*")([^"]{9,})"/gi, (_, a, v) => `${a}${v.slice(0, 4)}…masked"`));
}
const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
