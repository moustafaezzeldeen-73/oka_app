#!/usr/bin/env node
/**
 * OKA theme — local Shopify storefront emulator for QA.
 *
 *   node qa/harness/server.mjs                # http://localhost:9292
 *   PORT=9301 QA_OUT_DIR=/tmp/run1 node qa/harness/server.mjs
 *
 * See qa/harness/README.md for routes, cookies, mocks and fidelity gaps.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import { Store, SDrop, QA_ROOT, THEME_DIR, THEME_ID, stripHtml } from './lib/model.mjs';
import { Renderer, loadThemeSettingsRaw } from './lib/render.mjs';
import { CartService, CartError, newCart } from './lib/cart.mjs';
import { ExternalMocks } from './lib/mocks.mjs';
import { boxGlb } from './lib/glb.mjs';
import { beginPage, endPage } from './lib/warn.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const PORT = Number(process.env.PORT || 9292);
const OUT = path.resolve(process.env.QA_OUT_DIR || path.join(HERE, 'out'));
const SETTINGS = path.resolve(process.env.QA_SETTINGS || path.join(QA_ROOT, 'settings_data.live.json'));
fs.mkdirSync(OUT, { recursive: true });

const store = new Store();
const renderer = new Renderer(store, { settingsDataPath: SETTINGS });
const carts = new CartService(store);
const settingsNow = () => {
  beginPage({ internal: true });
  try { return loadThemeSettingsRaw(SETTINGS).raw; } finally { endPage(); }
};
const mocks = new ExternalMocks({ store, outDir: OUT, settings: settingsNow });
const GLB = boxGlb();

/* ── sessions (cookie qa_sid) ─────────────────────────────────────────── */
const sessions = new Map();
function session(req, res) {
  let sid = req.cookies.qa_sid;
  if (!sid || !sessions.has(sid)) {
    sid = sid && /^[a-f0-9]{24}$/.test(sid) ? sid : crypto.randomBytes(12).toString('hex');
    sessions.set(sid, { cart: newCart(), customer: null, flash: {} });
    res.cookie('qa_sid', sid, { httpOnly: false, sameSite: 'lax', path: '/' });
  }
  const s = sessions.get(sid);
  s.id = sid;
  const loggedIn = req.cookies.qa_customer === '1' || res.locals.forceLogin;
  if (loggedIn && !s.customer) s.customer = structuredClone(store.customerFixture);
  if (!loggedIn) s.customer = null;
  return s;
}

/* ── render warnings log ──────────────────────────────────────────────── */
const WARN_FILE = path.join(OUT, 'render-warnings.json');
const warnLog = {};
let lastWarnings = [];
function recordWarnings(key, info, warnings) {
  lastWarnings = warnings;
  warnLog[key] = { ...info, at: new Date().toISOString(), counted: warnings.filter((w) => w.class !== 'info').length, warnings: warnings.map(({ key: k, ...w }) => w) };
  let disk = {};
  try { disk = JSON.parse(fs.readFileSync(WARN_FILE, 'utf8')); } catch { disk = {}; }
  disk[key] = warnLog[key];
  const tmp = `${WARN_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(disk, null, 1));
  fs.renameSync(tmp, WARN_FILE);
}

/* ── app ──────────────────────────────────────────────────────────────── */
const app = express();
app.disable('x-powered-by');
app.set('etag', false);
app.use(cookieParser());
app.use(express.json({ type: ['application/json', 'text/plain'], limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Locale prefix (/ar/…) and ?locale=, mock-mode cookie via ?qa_mock=
app.use((req, res, next) => {
  res.locals.locale = 'en';
  const m = /^\/ar(\/|$|\?)/.exec(req.url);
  if (m) { res.locals.locale = 'ar'; req.url = req.url.slice(3) || '/'; if (req.url[0] !== '/') req.url = `/${req.url}`; }
  else if (req.query.locale === 'ar') res.locals.locale = 'ar';
  if (req.query.qa_mock) { res.cookie('qa_mock', String(req.query.qa_mock), { path: '/' }); req.cookies.qa_mock = String(req.query.qa_mock); }
  if (req.query.qa_customer != null) { const v = String(req.query.qa_customer) === '1' ? '1' : '0'; res.cookie('qa_customer', v, { path: '/' }); req.cookies.qa_customer = v; }
  res.setHeader('x-qa-harness', 'oka-theme');
  next();
});

const pfx = (res) => (res.locals.locale === 'ar' ? '/ar' : '');
function baseCtx(req, res, s) {
  const view = renderer.makeView({ host: req.get('host'), proto: req.protocol, locale: res.locals.locale, customer: s.customer, query: req.query });
  const query = { ...req.query };
  const pathOnly = `${pfx(res)}${req.path}`;
  return {
    host: req.get('host'), proto: req.protocol, locale: res.locals.locale, query, path: req.originalUrl, pathOnly,
    customer: s.customer, cartJson: carts.toJSON(s.cart, view), flash: s.flash,
  };
}

/** Render an HTML page (handles ?sections= / ?section_id= too). */
function page(req, res, s, opts) {
  const ctx = { ...baseCtx(req, res, s), ...opts };
  if (req.query.view) ctx.suffix = String(req.query.view);
  if (req.query.sections || req.query.section_id) {
    const ids = String(req.query.sections || req.query.section_id).split(',').map((x) => x.trim()).filter(Boolean);
    const out = renderer.renderSectionsApi(ctx, ids);
    recordWarnings(`SECTIONS ${req.originalUrl} [${ctx.locale}${s.customer ? ',customer' : ''}]`, { url: req.originalUrl, sectionsApi: ids }, out.warnings);
    if (req.query.section_id) {
      const html = out.sections[ids[0]];
      return html == null ? res.status(404).send('') : res.type('html').send(html);
    }
    return res.json(out.sections);
  }
  const { html, warnings, templateKey } = renderer.render(ctx);
  s.flash = {};
  const counted = warnings.filter((w) => w.class !== 'info').length;
  recordWarnings(`GET ${req.originalUrl} [${ctx.locale}${s.customer ? ',customer' : ''}]`, { url: req.originalUrl, template: templateKey, locale: ctx.locale, loggedIn: Boolean(s.customer), status: opts.status || 200 }, warnings);
  res.setHeader('x-qa-template', templateKey || '');
  res.setHeader('x-qa-render-warnings', String(counted));
  res.status(opts.status || 200).type('html').send(html);
}
const notFound = (req, res, s) => page(req, res, s, { templateType: '404', pageType: '404', title: '404 Not Found', status: 404 });

const S = (fn) => (req, res, next) => { try { const s = session(req, res); return fn(req, res, s, next); } catch (e) { next(e); } };

/* ── QA control endpoints ─────────────────────────────────────────────── */
app.get('/__qa/health', (req, res) => res.json({ ok: true, port: PORT, out: OUT, theme: THEME_DIR, settings: SETTINGS, products: store.products.length }));
app.get('/__qa/warnings', (req, res) => res.json(req.query.all ? warnLog : lastWarnings));
app.get('/__qa/mock', (req, res) => { res.cookie('qa_mock', String(req.query.mode || 'success'), { path: '/' }); res.json({ mock: req.query.mode || 'success' }); });
app.get('/__qa/login', (req, res) => { res.cookie('qa_customer', '1', { path: '/' }); res.redirect(String(req.query.return_to || '/account')); });
app.get('/__qa/logout', (req, res) => { res.cookie('qa_customer', '0', { path: '/' }); res.redirect('/'); });
app.get('/__qa/session', S((req, res, s) => res.json({ sid: s.id, loggedIn: Boolean(s.customer), cart: s.cart, customer: s.customer && { addresses: s.customer.addresses, default_address_id: s.customer.default_address_id } })));
app.post('/__qa/reset', S((req, res, s) => { s.cart = newCart(); s.flash = {}; if (s.customer) s.customer = structuredClone(store.customerFixture); res.json({ ok: true }); }));
/** Playwright forwards every non-local request here: logged + answered from mocks (never forwarded). */
app.post('/__qa/external', (req, res) => {
  const { method, url, headers, body, spec, source } = req.body || {};
  const out = mocks.handle({ method, url, headers, body, spec: spec || req.cookies.qa_mock, source: source || 'playwright' });
  res.json(out);
});

/* ── CDN: theme assets, image placeholders, video/3D stand-ins ───────── */
app.get(`/cdn/shop/t/:tid/assets/:file`, (req, res) => {
  const f = path.join(THEME_DIR, 'assets', path.basename(req.params.file));
  if (!fs.existsSync(f)) return res.status(404).send('asset not found');
  res.setHeader('cache-control', 'no-cache');
  res.sendFile(f);
});
const PALETTE = ['#d9d4cc', '#cfd8dc', '#d7ccc8', '#c8e6c9', '#ffe0b2', '#e1bee7', '#bbdefb'];
app.get(/^\/cdn\/shop\/(.+)$/, (req, res) => {
  const name = decodeURIComponent(req.params[0].split('/').pop());
  const dims = store.imageDims.get(name);
  let w = parseInt(req.query.width, 10) || dims?.width || 800;
  let h = parseInt(req.query.height, 10) || (dims ? Math.round((w * dims.height) / dims.width) : w);
  if (dims && !req.query.height && w > dims.width) { w = dims.width; h = dims.height; }
  const color = PALETTE[parseInt(crypto.createHash('md5').update(name).digest('hex').slice(0, 2), 16) % PALETTE.length];
  const fs1 = Math.max(10, Math.round(Math.min(w, h) / 14));
  const label = name.replace(/[<>&"]/g, '').slice(0, 48);
  res.setHeader('x-qa-placeholder', dims ? 'known-dimensions' : 'unknown-dimensions');
  res.setHeader('cache-control', 'max-age=3600');
  res.type('image/svg+xml').send(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="${color}"/><path d="M0 0L${w} ${h}M${w} 0L0 ${h}" stroke="#fff" stroke-opacity=".5"/><text x="50%" y="50%" font-family="sans-serif" font-size="${fs1}" text-anchor="middle" fill="#555">${label}</text><text x="50%" y="${50 + (fs1 * 140) / h}%" font-family="sans-serif" font-size="${Math.round(fs1 * 0.8)}" text-anchor="middle" fill="#777">${dims ? `${dims.width}×${dims.height}` : '?'} → ${w}×${h}</text></svg>`);
});
app.get(/^\/cdn\/shopifycloud-mirror\/(.+)$/, (req, res) => {
  const p = req.params[0];
  mocks.log({ source: 'server', method: 'GET', url: `https://cdn.shopify.com/${p}`, host: 'cdn.shopify.com', mode: 'local-stand-in' });
  if (/\.glb$/i.test(p)) return res.type('model/gltf-binary').send(GLB);
  if (/\.usdz$/i.test(p)) return res.status(404).type('text/plain').send('usdz not emulated');
  if (/\.(mp4|m3u8)$/i.test(p)) return res.status(200).type(p.endsWith('m3u8') ? 'application/x-mpegURL' : 'video/mp4').send(Buffer.alloc(0));
  return res.status(404).send('not mirrored');
});
// The Google-hosted <model-viewer> the theme loads, served from npm (@google/model-viewer@4.0.0).
app.get('/__qa/vendor/model-viewer.min.js', (req, res) => res.type('application/javascript').sendFile(path.join(HERE, 'node_modules/@google/model-viewer/dist/model-viewer.min.js')));

/* ── storefront pages ─────────────────────────────────────────────────── */
app.get('/', S((req, res, s) => page(req, res, s, { templateType: 'index', pageType: 'index', title: store.shop.name, description: store.shop.description })));
app.get('/collections', S((req, res, s) => page(req, res, s, { templateType: 'list-collections', pageType: 'list-collections', title: 'Collections' })));

function collectionFilters(q) { const f = {}; for (const [k, v] of Object.entries(q)) if (k.startsWith('filter.')) f[k] = v; return f; }
app.get('/collections/:handle/products.json', S((req, res, s) => {
  const c = req.params.handle === 'all' ? { handle: 'all', product_handles: [] } : store.collByHandle.get(req.params.handle);
  if (!c) return res.status(404).json({ errors: 'Not Found' });
  const view = renderer.makeView({ host: req.get('host'), locale: res.locals.locale, query: req.query });
  const list = store.collectionProducts(c);
  const limit = Math.min(250, parseInt(req.query.limit, 10) || 30);
  const pageN = Math.max(1, parseInt(req.query.page, 10) || 1);
  res.json({ products: list.slice((pageN - 1) * limit, pageN * limit).map((p) => { const j = view.productJsonAdmin(p); j.tags = p.tags; j.variants.forEach((v, i) => { v.available = p.variants[i].available; }); return j; }) });
}));
app.get('/collections/:handle', S((req, res, s) => {
  const h = req.params.handle;
  const view = renderer.makeView({ host: req.get('host'), locale: res.locals.locale, customer: s.customer, query: req.query });
  const sortBy = req.query.sort_by ? String(req.query.sort_by) : undefined;
  const filters = collectionFilters(req.query);
  let c;
  if (h === 'all') c = view.allCollection({ sortBy, filters });
  else { const raw = store.collByHandle.get(h); if (!raw || !raw.published) return notFound(req, res, s); c = view.collection(raw, { sortBy, filters }); }
  // carry the same View into render: objects are bound to a host/locale, so build them in-render instead
  page(req, res, s, { templateType: 'collection', suffix: h === 'all' ? null : store.collByHandle.get(h)?.template_suffix, pageType: 'collection', title: c.title, description: stripHtml(c.description || '').slice(0, 320), lazyObjects: { kind: 'collection', handle: h, sortBy, filters } });
}));
app.get('/collections/:c/products/:handle', S((req, res, s) => productPage(req, res, s)));

function productPage(req, res, s) {
  const h = req.params.handle;
  const p = store.byHandle.get(h);
  if (!p || !store.isLive(p)) return notFound(req, res, s);
  if (req.query.variant && !p.variants.some((v) => String(v.id) === String(req.query.variant))) {
    // Shopify ignores an unknown ?variant= and renders the default.
  }
  page(req, res, s, { templateType: 'product', suffix: p.template_suffix, pageType: 'product', title: p.title, description: (p.seo?.description || stripHtml(p.body_html)).slice(0, 320), lazyObjects: { kind: 'product', handle: h } });
}
app.get('/products/:handle.js', S((req, res, s) => { const p = store.byHandle.get(req.params.handle); if (!p || !store.isLive(p)) return res.status(404).json({ status: 404, message: 'Not Found', description: 'Not Found' }); res.json(renderer.makeView({ host: req.get('host'), locale: res.locals.locale, query: {} }).productAjax(p)); }));
app.get('/products/:handle.json', S((req, res, s) => { const p = store.byHandle.get(req.params.handle); if (!p || !store.isLive(p)) return res.status(404).json({ errors: 'Not Found' }); res.json({ product: renderer.makeView({ host: req.get('host'), locale: res.locals.locale, query: {} }).productJsonAdmin(p) }); }));
app.get('/products/:handle.oembed', S((req, res, s) => { const p = store.byHandle.get(req.params.handle); if (!p) return res.status(404).end(); res.json({ type: 'link', version: '1.0', title: p.title, provider: store.shop.name }); }));
app.get('/products/:handle', S(productPage));
app.get('/products', S((req, res) => res.redirect(`${pfx(res)}/collections/all`)));

app.get('/pages/:handle', S((req, res, s) => {
  const pg = store.pageByHandle.get(req.params.handle);
  if (!pg || !pg.published) return notFound(req, res, s);
  page(req, res, s, { templateType: 'page', suffix: pg.template_suffix, pageType: 'page', title: pg.title, description: stripHtml(pg.body_html).slice(0, 320), lazyObjects: { kind: 'page', handle: pg.handle } });
}));

/* search (incl. Arabic folding: ة/ه, ى/ي, أ/إ/آ/ا, diacritics, tatweel, Arabic-Indic digits) */
export function fold(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[ً-ٰٟـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}
function searchProducts(q, locale) {
  const terms = fold(q).split(' ').filter(Boolean);
  if (!terms.length) return [];
  const withMeta = process.env.QA_SEARCH_METAFIELDS !== '0';
  return store.liveProducts().filter((p) => {
    const hay = fold([p.title, p.product_type, p.vendor, p.tags.join(' '), p.variants.map((v) => `${v.title} ${v.sku}`).join(' '), stripHtml(p.body_html), locale === 'ar' ? `${p.translations.ar.title || ''} ${stripHtml(p.translations.ar.body_html || '')}` : '', withMeta ? (p.metafields.oka?.title_ar?.value || '') : ''].join(' '));
    return terms.every((t) => hay.includes(t));
  });
}
app.get(['/search/suggest.json', '/search/suggest'], S((req, res, s) => {
  const q = String(req.query.q || '');
  const view = renderer.makeView({ host: req.get('host'), locale: res.locals.locale, query: {} });
  const limit = parseInt(req.query['resources[limit]'] || req.query.resources?.limit, 10) || 10;
  const products = searchProducts(q, res.locals.locale).slice(0, limit).map((p) => { const a = view.productAjax(p); return { ...a, body: a.description, image: a.featured_image, url: `${a.url}?_pos=1&_psq=${encodeURIComponent(q)}&_ss=e&_v=1.0` }; });
  const collections = store.collections.filter((c) => c.published && fold(`${c.title} ${c.metafields.oka?.title_ar?.value || ''}`).includes(fold(q))).slice(0, limit).map((c) => ({ id: c.id, title: view.tr(c, 'title', c.title), handle: c.handle, url: view.url(`/collections/${c.handle}`), body: c.body_html }));
  res.json({ resources: { results: { products, collections, pages: [], articles: [], queries: q ? [{ text: q, styled_text: `<mark>${q}</mark>`, url: view.url(`/search?q=${encodeURIComponent(q)}`) }] : [] } } });
}));
app.get('/search', S((req, res, s) => {
  const q = String(req.query.q ?? '');
  page(req, res, s, { templateType: 'search', pageType: 'search', title: q ? `Search: ${searchProducts(q, res.locals.locale).length} results found for "${q}"` : 'Search', lazyObjects: { kind: 'search', q } }); // Shopify's English page_title format
}));

app.get(['/recommendations/products.json', '/recommendations/products'], S((req, res, s) => {
  const id = Number(req.query.product_id);
  const p = store.byId.get(id);
  if (!p || !store.isLive(p)) return res.status(404).json({ status: 404, message: 'Not Found', description: 'Product not found' });
  const limit = Math.min(10, parseInt(req.query.limit, 10) || 10);
  const intent = req.query.intent === 'complementary' ? 'complementary' : 'related';
  const pool = [...(store.collByHandle.get('people-also-buy')?.product_handles || []), ...p.collections.flatMap((h) => store.collByHandle.get(h)?.product_handles || [])];
  const recs = [...new Set(pool)].map((h) => store.byHandle.get(h)).filter((x) => x && x.id !== id && store.isLive(x)).slice(0, limit);
  if (req.path.endsWith('.json')) { const view = renderer.makeView({ host: req.get('host'), locale: res.locals.locale, query: {} }); return res.json({ intent, products: recs.map((x) => view.productAjax(x)) }); }
  if (req.query.section_id) return page(req, res, s, { templateType: 'product', pageType: 'product', lazyObjects: { kind: 'recommendations', ids: recs.map((x) => x.id), intent } });
  res.status(400).send('section_id required');
}));

/* ── cart ─────────────────────────────────────────────────────────────── */
const cartView = (req, res, s) => renderer.makeView({ host: req.get('host'), locale: res.locals.locale, customer: s.customer, query: {} });
const cartErr = (res, e) => { if (e instanceof CartError) return res.status(e.status).json(e.body); throw e; };
function itemsFromBody(b) {
  if (b.items) return Array.isArray(b.items) ? b.items : Object.values(b.items);
  if (b.id != null) return [{ id: b.id, quantity: b.quantity, properties: b.properties, selling_plan: b.selling_plan }];
  return [];
}
function withSections(req, res, s, json) {
  const ids = req.body?.sections || req.query.sections;
  if (!ids) return json;
  const list = Array.isArray(ids) ? ids : String(ids).split(',');
  const ctx = { ...baseCtx(req, res, s), templateType: 'cart', pageType: 'cart', pathOnly: req.body?.sections_url || `${pfx(res)}/cart` };
  json.sections = renderer.renderSectionsApi(ctx, list.map((x) => x.trim())).sections;
  return json;
}
app.get(['/cart.js', '/cart.json'], S((req, res, s) => res.json(withSections(req, res, s, carts.toJSON(s.cart, cartView(req, res, s))))));
app.post(['/cart/add.js', '/cart/add.json'], S((req, res, s) => {
  try {
    const keys = carts.add(s.cart, itemsFromBody(req.body || {}));
    const cj = carts.toJSON(s.cart, cartView(req, res, s));
    const lines = keys.map((k) => cj.items.find((i) => i.key === k)).filter(Boolean);
    const single = req.body?.items == null;
    res.json(withSections(req, res, s, single ? { ...lines[0] } : { items: lines }));
  } catch (e) { cartErr(res, e); }
}));
app.post('/cart/add', S((req, res, s) => {
  try { carts.add(s.cart, itemsFromBody(req.body || {})); res.redirect(req.body?.return_to || `${pfx(res)}/cart`); } catch (e) { if (e instanceof CartError) return res.status(e.status).type('html').send(`<h1>Cart Error</h1><p>${e.message}</p>`); throw e; }
}));
app.post(['/cart/change.js', '/cart/change.json'], S((req, res, s) => { try { carts.change(s.cart, { ...req.query, ...(req.body || {}) }); res.json(withSections(req, res, s, carts.toJSON(s.cart, cartView(req, res, s)))); } catch (e) { cartErr(res, e); } }));
app.all('/cart/change', S((req, res, s) => { try { carts.change(s.cart, { ...req.query, ...(req.body || {}) }); } catch (e) { if (!(e instanceof CartError)) throw e; } res.redirect(`${pfx(res)}/cart`); }));
app.post(['/cart/update.js', '/cart/update.json'], S((req, res, s) => { try { carts.update(s.cart, req.body || {}); res.json(withSections(req, res, s, carts.toJSON(s.cart, cartView(req, res, s)))); } catch (e) { cartErr(res, e); } }));
app.post(['/cart/clear.js', '/cart/clear.json'], S((req, res, s) => { carts.clear(s.cart); res.json(withSections(req, res, s, carts.toJSON(s.cart, cartView(req, res, s)))); }));
app.all('/cart/clear', S((req, res, s) => { carts.clear(s.cart); res.redirect(`${pfx(res)}/cart`); }));
app.post(['/cart', '/cart/update'], S((req, res, s) => {
  try { carts.update(s.cart, req.body || {}); } catch (e) { if (!(e instanceof CartError)) throw e; }
  if (req.body?.checkout != null) return res.redirect(`${pfx(res)}/checkout`);
  res.redirect(`${pfx(res)}/cart`);
}));
app.get('/cart', S((req, res, s) => page(req, res, s, { templateType: 'cart', pageType: 'cart', title: 'Your Shopping Cart' })));
// Cart permalinks: /cart/VARIANT:QTY,VARIANT:QTY → straight to checkout
app.get(/^\/cart\/(\d+:\d+(,\d+:\d+)*)$/, S((req, res, s) => {
  const cart = newCart();
  try { carts.add(cart, req.params[0].split(',').map((x) => { const [id, q] = x.split(':'); return { id, quantity: q }; })); } catch (e) { return cartErr(res, e); }
  return checkout(req, res, s, cart, 'cart-permalink');
}));
app.get('/discount/:code', S((req, res, s) => {
  const code = decodeURIComponent(req.params.code);
  carts.update(s.cart, { discount: [...new Set([...s.cart.codes, code])].join(',') });
  res.cookie('discount_code', code, { path: '/' });
  res.redirect(String(req.query.redirect || `${pfx(res)}/`));
}));

/* checkout stub — records exactly what would be sent to Shopify's checkout */
function checkout(req, res, s, cart, source) {
  const view = cartView(req, res, s);
  const cj = carts.toJSON(cart, view);
  const rec = {
    at: new Date().toISOString(), source, session: s.id, locale: res.locals.locale, loggedIn: Boolean(s.customer), customerId: s.customer?.id || null,
    cart_token: cj.token, item_count: cj.item_count, original_total_price: cj.original_total_price, total_discount: cj.total_discount, total_price: cj.total_price,
    items: cj.items.map((i) => ({ variant_id: i.variant_id, handle: i.handle, title: i.title, quantity: i.quantity, price: i.price, line_price: i.line_price, discounts: i.discounts, properties: i.properties })),
    note: cj.note, attributes: cj.attributes, discount_codes: cj.discount_codes, cart_level_discount_applications: cj.cart_level_discount_applications,
    query: req.query, referer: req.get('referer') || null,
  };
  fs.appendFileSync(path.join(OUT, 'checkouts.jsonl'), `${JSON.stringify(rec)}\n`);
  const money = (c) => `${(c / 100).toFixed(2)} EGP`;
  res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Checkout (QA stub)</title>
<style>body{font:15px system-ui;margin:0;padding:20px;background:#fafafa}table{width:100%;border-collapse:collapse}td{padding:6px;border-bottom:1px solid #ddd}.tot{font-weight:700}</style></head>
<body data-qa-checkout-stub><h1>Shopify checkout — QA stub</h1><p>Shopify's real checkout is NOT emulated. This is what the storefront handed to checkout (logged to <code>out/checkouts.jsonl</code>).</p>
<table data-qa-checkout-items>${cj.items.map((i) => `<tr data-variant="${i.variant_id}"><td>${i.title}</td><td>× ${i.quantity}</td><td>${money(i.line_price)}</td></tr>`).join('')}</table>
<p>Subtotal: <span data-qa-subtotal>${money(cj.original_total_price)}</span><br>Discount: <span data-qa-discount>${money(cj.total_discount)}</span><br><span class="tot">Total (before shipping): <span data-qa-total>${money(cj.total_price)}</span></span></p>
<p>Codes: <span data-qa-codes>${cj.discount_codes.map((d) => `${d.code}${d.applicable ? '' : ' (not applicable)'}`).join(', ') || '—'}</span> · Note: <span data-qa-note>${(cj.note || '—').replace(/</g, '&lt;')}</span></p>
<pre data-qa-attributes>${JSON.stringify(cj.attributes, null, 1).replace(/</g, '&lt;')}</pre><a href="${pfx(res)}/cart">Back to cart</a></body></html>`);
}
app.all(['/checkout', '/cart/checkout', /^\/checkouts\/.*/], S((req, res, s) => {
  if (req.method === 'POST' && req.body && (req.body.updates || req.body.note != null)) { try { carts.update(s.cart, req.body); } catch (e) { if (!(e instanceof CartError)) throw e; } }
  checkout(req, res, s, s.cart, req.path);
}));

/* ── customer accounts (classic) ──────────────────────────────────────── */
const needLogin = (fn) => S((req, res, s) => (s.customer ? fn(req, res, s) : res.redirect(`${pfx(res)}/account/login?return_url=${encodeURIComponent(req.originalUrl)}`)));
app.get('/account', needLogin((req, res, s) => page(req, res, s, { templateType: 'customers/account', pageType: 'customers/account', title: 'Account' })));
app.get('/account/login', S((req, res, s) => (s.customer ? res.redirect(`${pfx(res)}/account`) : page(req, res, s, { templateType: 'customers/login', pageType: 'customers/login', title: 'Account' }))));
app.get('/account/register', S((req, res, s) => page(req, res, s, { templateType: 'customers/register', pageType: 'customers/register', title: 'Create Account' })));
app.get('/account/addresses', needLogin((req, res, s) => page(req, res, s, { templateType: 'customers/addresses', pageType: 'customers/addresses', title: 'Addresses' })));
app.get('/account/orders/:id', needLogin((req, res, s) => {
  const o = s.customer.orders.find((x) => String(x.id) === req.params.id || x.name.replace('#', '') === req.params.id);
  if (!o) return notFound(req, res, s);
  page(req, res, s, { templateType: 'customers/order', pageType: 'customers/order', title: `Order ${o.name}`, lazyObjects: { kind: 'order', id: o.id } });
}));
app.get('/account/reset/:id/:token', S((req, res, s) => page(req, res, s, { templateType: 'customers/reset_password', pageType: 'customers/reset_password', title: 'Reset account', resetId: req.params.id, resetToken: req.params.token })));
app.get('/account/activate/:id/:token', S((req, res, s) => page(req, res, s, { templateType: 'customers/activate_account', pageType: 'customers/activate_account', title: 'Activate Account', resetId: req.params.id, resetToken: req.params.token })));
/* New customer accounts (the store's menu links to account.okaegypt.com): Shopify-hosted sign-in, stubbed. */
app.get('/customer_authentication/login', S((req, res, s) => {
  const back = String(req.query.return_to || '/');
  formLog({ form: 'customer_authentication', return_to: back });
  res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in (QA stub of Shopify-hosted login)</title></head><body data-qa-hosted-login style="font:16px system-ui;padding:24px"><h1>Shopify customer accounts — QA stub</h1><p>The real sign-in (email one-time code) is hosted by Shopify and not emulated.</p><a id="qa-sign-in" href="/__qa/login?return_to=${encodeURIComponent(back)}">Continue as QA Tester (fake customer)</a> · <a id="qa-cancel" href="${back.replace(/"/g, '')}">Cancel</a></body></html>`);
}));
app.get('/account/logout', S((req, res, s) => { res.cookie('qa_customer', '0', { path: '/' }); s.customer = null; res.redirect(`${pfx(res)}/`); }));
const formLog = (rec) => fs.appendFileSync(path.join(OUT, 'forms.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), ...rec })}\n`);
app.post('/account/login', S((req, res, s) => {
  const email = req.body?.customer?.email; const pw = req.body?.customer?.password;
  formLog({ form: 'customer_login', email: email ? '(provided)' : null });
  if (!email || !pw || pw === 'wrong') { s.flash.customer_login = { errors: { form: 'Incorrect email or password.' }, values: { email } }; return res.redirect(`${pfx(res)}/account/login`); }
  res.cookie('qa_customer', '1', { path: '/' });
  res.redirect(req.body?.return_to || req.query.return_url || `${pfx(res)}/account`);
}));
app.post('/account', S((req, res, s) => {
  const c = req.body?.customer || {};
  formLog({ form: 'create_customer', fields: Object.keys(c) });
  if (!c.email || !c.password) { s.flash.create_customer = { errors: { email: !c.email ? "Email can't be blank." : undefined, password: !c.password ? "Password can't be blank." : undefined }, values: c }; return res.redirect(`${pfx(res)}/account/register`); }
  if (String(c.email).toLowerCase() === store.customerFixture.email) { s.flash.create_customer = { errors: { email: 'This email address is already associated with an account.' }, values: c }; return res.redirect(`${pfx(res)}/account/register`); }
  res.cookie('qa_customer', '1', { path: '/' });
  res.redirect(`${pfx(res)}/`);
}));
app.post('/account/recover', S((req, res, s) => { formLog({ form: 'recover_customer_password' }); s.flash.recover_customer_password = req.body?.email ? { posted: true } : { errors: { form: 'No account found with that email.' } }; res.redirect(`${pfx(res)}/account/login#recover`); }));
for (const kind of ['reset', 'activate']) {
  app.post(`/account/${kind}`, S((req, res, s) => {
    const c = req.body?.customer || {};
    const type = kind === 'reset' ? 'reset_customer_password' : 'activate_customer_password';
    if (!c.password || c.password !== c.password_confirmation) { s.flash[type] = { errors: { password_confirmation: "Password confirmation doesn't match Password." } }; return res.redirect(req.get('referer') || `${pfx(res)}/account/login`); }
    res.cookie('qa_customer', '1', { path: '/' }); res.redirect(`${pfx(res)}/account`);
  }));
}
app.post('/account/addresses', needLogin((req, res, s) => {
  const a = req.body?.address || {};
  formLog({ form: 'customer_address', action: 'create', province: a.province, fields: Object.keys(a) });
  const errs = {};
  if (!a.address1) errs.address1 = "Address1 can't be blank.";
  if (!a.city) errs.city = "City can't be blank.";
  if (Object.keys(errs).length) { s.flash.customer_address = { errors: errs, values: a }; return res.redirect(req.get('referer') || `${pfx(res)}/account/addresses`); }
  const id = 9000000100 + s.customer.addresses.length + Math.floor(Math.random() * 1000);
  const PROV = { Cairo: 'C', Giza: 'GZ', Alexandria: 'ALX' };
  s.customer.addresses.push({ id, first_name: a.first_name || '', last_name: a.last_name || '', address1: a.address1, address2: a.address2 || '', city: a.city, province: a.province || '', province_code: PROV[a.province] || a.province_code || '', country: a.country || 'Egypt', country_code: 'EG', phone: a.phone || '', zip: a.zip || '', company: a.company || '' });
  if (String(a.default) === '1' || s.customer.addresses.length === 1) s.customer.default_address_id = id;
  res.redirect(req.body?.return_to || `${pfx(res)}/account/addresses`);
}));
app.post('/account/addresses/:id', needLogin((req, res, s) => {
  const id = Number(req.params.id);
  const method = String(req.body?._method || 'put').toLowerCase();
  formLog({ form: 'customer_address', action: method, id });
  if (method === 'delete') {
    s.customer.addresses = s.customer.addresses.filter((a) => a.id !== id);
    if (s.customer.default_address_id === id) s.customer.default_address_id = s.customer.addresses[0]?.id || null;
  } else {
    const a = s.customer.addresses.find((x) => x.id === id);
    if (a) Object.assign(a, req.body?.address || {});
    if (String(req.body?.address?.default) === '1') s.customer.default_address_id = id;
  }
  if (req.xhr || /json/.test(req.get('accept') || '')) return res.json({ ok: true });
  res.redirect(`${pfx(res)}/account/addresses`);
}));
app.post('/contact', S((req, res, s) => {
  const c = req.body?.contact || {};
  formLog({ form: req.body?.form_type || 'contact', fields: Object.keys(c), bodyLength: String(c.body || '').length });
  const back = (req.get('referer') || `${pfx(res)}/pages/contact`).split('#')[0].split('?')[0];
  if (!c.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email)) { s.flash.contact = { errors: { email: 'Email is invalid.' }, values: c }; return res.redirect(`${back}#contact_form`); }
  s.flash.contact = { posted: true };
  res.redirect(`${back}?contact_posted=true#contact_form`);
}));
app.post('/localization', S((req, res) => { const lang = req.body?.language_code || req.body?.locale_code; res.redirect(lang === 'ar' ? '/ar/' : '/'); }));

/* policies: Shopify renders these itself, inside the theme layout */
app.get('/policies/:handle', S((req, res, s) => {
  const pol = store.shop.policies.find((p) => p.handle === req.params.handle);
  if (!pol) return notFound(req, res, s);
  page(req, res, s, { templateType: '__policy', pageType: 'policy', title: pol.title, policy: pol });
}));
app.get('/password', S((req, res, s) => page(req, res, s, { templateType: 'password', pageType: 'password', title: store.shop.name })));
app.post('/password', S((req, res, s) => { if (req.body?.password === 'qa') { res.cookie('storefront_digest', 'qa', { path: '/' }); return res.redirect('/'); } s.flash.storefront_password = { errors: { form: 'Password incorrect' } }; res.redirect('/password'); }));
app.get('/gift_cards/:code', S((req, res, s) => page(req, res, s, { templateType: 'gift_card', pageType: 'gift_card', title: 'Gift card', lazyObjects: { kind: 'gift_card', code: req.params.code } })));

/* App proxy (/apps/oka/…) → order-service mock (theme setting proxy_path) */
app.all(/^\/apps\/oka(\/.*)?$/, S(async (req, res, s) => {
  const r = mocks.proxy({ method: req.method, url: req.originalUrl, headers: req.headers, body: req.body, spec: req.cookies.qa_mock });
  if (r.timeout) return setTimeout(() => res.status(504).end(), Number(process.env.QA_TIMEOUT_MS || 15000));
  if (r.raw) return res.status(r.status).type('html').send(r.raw);
  res.status(r.status).json(r.body);
}));

app.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /cart\nDisallow: /checkout\nDisallow: /account\n'));
app.get('/sitemap.xml', (req, res) => res.type('application/xml').send(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${store.liveProducts().map((p) => `<url><loc>${req.protocol}://${req.get('host')}/products/${p.handle}</loc></url>`).join('')}</urlset>`));
app.get('/favicon.ico', (req, res) => res.status(404).end());
app.use(S((req, res, s) => notFound(req, res, s)));
app.use((err, req, res, next) => { console.error(err); res.status(500).type('text/plain').send(`Harness error: ${err.stack}`); });

/* ── lazy objects: built inside the render so they share the page's View ── */
const origGlobals = renderer.globals.bind(renderer);
renderer.globals = function (ctx, view, defs, raw, key) {
  const lo = ctx.lazyObjects;
  ctx.objects = ctx.objects || {};
  if (lo?.kind === 'product') { const p = store.byHandle.get(lo.handle); ctx.objects.product = view.product(p); ctx.image = ctx.objects.product.featured_image; }
  if (lo?.kind === 'recommendations') { const prods = lo.ids.map((id) => view.product(store.byId.get(id))); ctx.objects.recommendations = new SDrop('recommendations', { performed: true, products: prods, products_count: prods.length, intent: lo.intent }); }
  if (lo?.kind === 'collection') ctx.objects.collection = lo.handle === 'all' ? view.allCollection({ sortBy: lo.sortBy, filters: lo.filters }) : view.collection(store.collByHandle.get(lo.handle), { sortBy: lo.sortBy, filters: lo.filters });
  if (lo?.kind === 'page') ctx.objects.page = view.page(store.pageByHandle.get(lo.handle));
  if (lo?.kind === 'order') ctx.objects.order = view.order(ctx.customer.orders.find((o) => o.id === lo.id));
  if (lo?.kind === 'search') {
    const results = lo.q ? searchProducts(lo.q, ctx.locale).map((p) => view.product(p)) : [];
    const sd = new SDrop('search', { performed: Boolean(lo.q), terms: lo.q, results, results_count: results.length, types: ['product', 'page', 'article'], filters: [], sort_by: 'relevance', default_sort_by: 'relevance', sort_options: [] });
    Object.defineProperty(sd, '__results', { value: results });
    ctx.objects.search = sd;
  }
  if (lo?.kind === 'gift_card') ctx.objects.gift_card = new SDrop('gift_card', { balance: 10000, initial_value: 10000, code: `QA${lo.code}`.toUpperCase().padEnd(16, '0'), last_four_characters: String(lo.code).slice(-4), currency: 'EGP', enabled: true, expired: false, expires_on: null, customer: null, product: null, properties: {}, pass_url: '#', qr_identifier: lo.code, template_suffix: null, url: `/gift_cards/${lo.code}` });
  return origGlobals(ctx, view, defs, raw, key);
};
// Shopify-rendered policy pages (no theme template exists for them)
const origResolve = renderer.resolveTemplate.bind(renderer);
renderer.resolveTemplate = function (type, suffix) {
  if (type === '__policy') {
    const f = path.join(OUT, '.policy-template.liquid');
    fs.writeFileSync(f, '<div class="shopify-policy__container"><div class="shopify-policy__title"><h1>{{ qa_policy.title }}</h1></div><div class="shopify-policy__body"><div class="rte">{{ qa_policy.body }}</div></div></div>');
    return { file: f, key: 'policy' };
  }
  return origResolve(type, suffix);
};
const origGlobals2 = renderer.globals;
renderer.globals = function (ctx, ...rest) { const g = origGlobals2.call(this, ctx, ...rest); if (ctx.policy) g.qa_policy = ctx.policy; return g; };

const server = app.listen(PORT, () => console.log(`OKA QA storefront on http://localhost:${PORT}  (theme: ${THEME_DIR}, out: ${OUT})`));
export default server;
