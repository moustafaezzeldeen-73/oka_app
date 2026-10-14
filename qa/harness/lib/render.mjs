/**
 * Page rendering: template resolution (JSON + liquid, ?view= / template_suffix),
 * section rendering with schema defaults + typed settings, layout wrapping,
 * Shopify globals, and the section rendering API.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createEngine, escapeHtml, rubyJson } from './engine.mjs';
import { SDrop, MapDrop, View, THEME_DIR, THEME_ID, stripHtml } from './model.mjs';
import { beginPage, endPage, warn, pushFile, popFile } from './warn.mjs';

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

/* ── theme settings: settings_schema defaults ← qa/settings_data.live.json ── */
export function loadThemeSettingsRaw(settingsDataPath) {
  const schema = readJson(path.join(THEME_DIR, 'config/settings_schema.json'));
  const defs = {};
  for (const group of schema) for (const s of group.settings || []) if (s.id) defs[s.id] = s;
  const data = readJson(settingsDataPath);
  const current = typeof data.current === 'string' ? data.presets[data.current] : data.current;
  const raw = {};
  for (const [id, d] of Object.entries(defs)) raw[id] = d.default !== undefined ? d.default : (d.type === 'checkbox' ? false : null);
  for (const [id, v] of Object.entries(current || {})) {
    if (!defs[id]) warn('settings-data', `settings_data has '${id}' which is not in settings_schema`, 'theme-suspect');
    raw[id] = v;
  }
  return { defs, raw };
}

/* ── section schema cache ── */
const schemaCache = new Map();
export function sectionSchema(type) {
  const f = path.join(THEME_DIR, 'sections', `${type}.liquid`);
  const mtime = fs.existsSync(f) ? fs.statSync(f).mtimeMs : 0;
  const hit = schemaCache.get(type);
  if (hit && hit.mtime === mtime) return hit.schema;
  let schema = {};
  if (mtime) {
    const m = /\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/.exec(fs.readFileSync(f, 'utf8'));
    if (m) { try { schema = JSON.parse(m[1]); } catch (e) { schema = {}; } }
  }
  schemaCache.set(type, { mtime, schema });
  return schema;
}

export class Renderer {
  constructor(store, { settingsDataPath }) {
    this.store = store;
    this.settingsDataPath = settingsDataPath;
    this.state = null;
    this.engine = createEngine({ getState: () => this.state });
    this.locales = {};
    for (const f of fs.readdirSync(path.join(THEME_DIR, 'locales'))) if (f.endsWith('.json') && !f.includes('schema')) this.locales[f.replace(/(\.default)?\.json$/, '')] = readJson(path.join(THEME_DIR, 'locales', f));
  }

  /* typed setting value → Liquid value */
  resolveSetting(def, raw, view) {
    const t = def?.type;
    if (raw === undefined) raw = def && def.default !== undefined ? def.default : (t === 'checkbox' ? false : null);
    if (raw == null) return t === 'collection_list' || t === 'product_list' ? [] : null;
    const imgFromRef = (ref) => {
      const m = /^shopify:\/\/shop_images\/(.+)$/.exec(String(ref));
      if (!m) { warn('setting', `image_picker value '${ref}' not a shopify://shop_images reference`, 'theme-suspect'); return null; }
      const f = this.store.files[m[1]];
      if (!f) { warn('setting-file', `image '${m[1]}' not found in exported store Files (fixture gap or deleted file → nil on Shopify)`, 'harness-gap'); return null; }
      return view.image(f);
    };
    switch (t) {
      case 'image_picker': return raw === '' ? null : imgFromRef(raw);
      case 'video': {
        const m = /^shopify:\/\/files\/videos\/(.+)$/.exec(String(raw));
        const f = m && this.store.files[m[1]];
        if (!f) { warn('setting-file', `video '${raw}' not found in store Files`, 'harness-gap'); return null; }
        return new SDrop('media', { id: f.id, media_type: 'video', alt: f.alt, duration: f.duration, aspect_ratio: f.preview_image ? f.preview_image.width / f.preview_image.height : 1, preview_image: f.preview_image ? view.image(f.preview_image) : null, sources: f.sources.map((s) => new SDrop('media_source', { ...s, url: `//${view.req.host}/cdn/shopifycloud-mirror/${String(s.url).replace(/^https?:\/\/cdn\.shopify\.com\//, '')}` })), position: 1 });
      }
      case 'collection': return raw === '' ? null : (view.collection(this.store.collByHandle.get(raw)) || (warn('setting', `collection setting '${raw}' — no such collection (nil on Shopify)`, 'theme-suspect'), null));
      case 'collection_list': return [].concat(raw).map((h) => this.store.collByHandle.get(h)).filter((c) => {
        if (!c) return false;
        return true;
      }).map((c) => view.collection(c));
      case 'product': { const p = this.store.byHandle.get(raw); return p && this.store.isLive(p) ? view.product(p) : null; }
      case 'product_list': return [].concat(raw).map((h) => this.store.byHandle.get(h)).filter((p) => this.store.isLive(p)).map((p) => view.product(p));
      case 'url': return String(raw).replace(/^shopify:\/\/collections\//, `${view.prefix}/collections/`).replace(/^shopify:\/\/products\//, `${view.prefix}/products/`).replace(/^shopify:\/\/pages\//, `${view.prefix}/pages/`).replace(/^shopify:\/\/policies\//, `${view.prefix}/policies/`);
      case 'checkbox': return Boolean(raw);
      case 'number': case 'range': return raw === '' ? null : Number(raw);
      case 'link_list': return null;
      default: return raw;
    }
  }
  settingsDrop(defs, raw, view, ownerLabel, strict = true, siblingKeys = null) {
    const out = {};
    for (const [id, v] of Object.entries(raw)) out[id] = this.resolveSetting(defs[id], v, view);
    for (const id of Object.keys(defs)) if (!(id in out)) out[id] = this.resolveSetting(defs[id], undefined, view);
    if (siblingKeys) {
      // block.settings.X where X belongs to another block type of the same section: nil on Shopify, harmless.
      return new MapDrop(ownerLabel, out, { onMissing: (k) => { warn('missing-setting', `${ownerLabel}.${k} — not a setting of this block type (nil on Shopify)`, siblingKeys.has(k) ? 'info' : 'theme-suspect'); return undefined; } });
    }
    return new MapDrop(ownerLabel, out, { strictKeys: strict });
  }

  /* ── page render ───────────────────────────────────────────────────── */
  /**
   * @param ctx {object} request context: { host, proto, locale, query, path, pathOnly, customer, cartJson, flash, pageType, templateType, suffix, objects, title, description, image, status }
   */
  render(ctx) {
    const log = beginPage({ path: ctx.path, locale: ctx.locale, loggedIn: Boolean(ctx.customer) });
    let html = '';
    try {
      html = this._render(ctx);
    } catch (e) {
      warn('render-crash', `${e.name}: ${e.message}`, /TypeError|ReferenceError/.test(e.name) || /is not a function|Cannot read/.test(e.message) ? 'harness-gap' : 'theme-suspect');
      html = `<!doctype html><pre>Harness render error: ${escapeHtml(e.stack)}</pre>`;
    }
    const templateKey = this.state?.templateKey || null;
    const res = endPage();
    this.state = null;
    return { html, warnings: res.warnings, templateKey };
  }

  makeView(ctx) {
    return new View(this.store, { host: ctx.host, proto: ctx.proto, locale: ctx.locale, customer: ctx.customer, query: ctx.query, currentProductId: ctx.objects?.product?.id });
  }

  _render(ctx) {
    const view = this.makeView(ctx);
    const { defs, raw } = loadThemeSettingsRaw(this.settingsDataPath);
    const st = {
      store: this.store, view, req: ctx, layout: 'theme', collected: { javascript: [], stylesheet: [] },
      translations: { current: this.locales[ctx.locale] || this.locales.en || {}, fallback: this.locales.en || {} },
      renderStaticSection: (name) => this.renderSectionHtml(name, name, { type: name, settings: {} }, st, `shopify-section-${name}`),
      formDrop: (type) => this.formDrop(type, ctx),
    };
    this.state = st;

    // template resolution
    const { file, key } = this.resolveTemplate(ctx.templateType, ctx.suffix);
    st.templateKey = key;
    beginMeta(key);
    const globals = this.globals(ctx, view, defs, raw, key);
    st.globals = globals;
    this.engine.options.globals = globals;

    let content;
    if (file.endsWith('.json')) {
      const tpl = readJson(file);
      if (tpl.layout !== undefined) st.layout = tpl.layout === false ? null : tpl.layout;
      content = (tpl.order || Object.keys(tpl.sections)).filter((id) => !tpl.sections[id].disabled)
        .map((id) => this.renderSectionHtml(id, tpl.sections[id].type, tpl.sections[id], st, `shopify-section-template--${THEME_ID}__${id}`)).join('\n');
    } else {
      pushFile(path.relative(THEME_DIR, file));
      try { content = this.engine.renderSync(this.engine.parseFileSync(file), {}, { globals }); } finally { popFile(); }
    }
    if (!st.layout) return content;
    const layoutFile = path.join(THEME_DIR, 'layout', `${st.layout}.liquid`);
    if (!fs.existsSync(layoutFile)) { warn('missing-layout', `layout/${st.layout}.liquid missing`, 'theme-suspect'); return content; }
    globals.content_for_layout = content;
    pushFile(`layout/${st.layout}.liquid`);
    try { return this.engine.renderSync(this.engine.parseFileSync(layoutFile), {}, { globals }); } finally { popFile(); }
  }

  resolveTemplate(type, suffix) {
    const dir = path.join(THEME_DIR, 'templates');
    const cands = [];
    if (suffix) cands.push(`${type}.${suffix}`);
    cands.push(type);
    for (const c of cands) for (const ext of ['.json', '.liquid']) {
      const f = path.join(dir, c + ext);
      if (fs.existsSync(f)) {
        if (suffix && c === type) warn('template-fallback', `template '${type}.${suffix}' not in theme → Shopify falls back to '${type}'`, 'info');
        return { file: f, key: c };
      }
    }
    throw new Error(`no template for ${type}`);
  }

  renderSectionHtml(id, type, data, st, domId) {
    const file = path.join(THEME_DIR, 'sections', `${type}.liquid`);
    if (!fs.existsSync(file)) { warn('missing-section', `sections/${type}.liquid missing`, 'theme-suspect'); return ''; }
    const schema = sectionSchema(type);
    const sdefs = Object.fromEntries((schema.settings || []).filter((s) => s.id).map((s) => [s.id, s]));
    for (const k of Object.keys(data.settings || {})) if (!sdefs[k]) warn('section-setting', `${type}: template sets '${k}' not in the section schema (Shopify rejects/ignores it)`, 'theme-suspect');
    const blockDefs = Object.fromEntries((schema.blocks || []).map((b) => [b.type, b]));
    const allBlockKeys = new Set((schema.blocks || []).flatMap((b) => (b.settings || []).map((x) => x.id).filter(Boolean)));
    const order = data.block_order || Object.keys(data.blocks || {});
    const blocks = order.filter((bid) => data.blocks?.[bid] && !data.blocks[bid].disabled).map((bid) => {
      const b = data.blocks[bid];
      const bd = blockDefs[b.type];
      if (!bd && !blockDefs['@app'] && !blockDefs['@theme']) warn('block-type', `${type}: block type '${b.type}' not in schema`, 'theme-suspect');
      const bdefs = Object.fromEntries((bd?.settings || []).filter((s) => s.id).map((s) => [s.id, s]));
      for (const k of Object.keys(b.settings || {})) if (bd && !bdefs[k]) warn('block-setting', `${type}/${b.type}: block sets '${k}' not in schema`, 'theme-suspect');
      return new SDrop('block', { id: bid, type: b.type, settings: this.settingsDrop(bdefs, b.settings || {}, st.view, `block.settings(${type}/${b.type})`, true, allBlockKeys), shopify_attributes: '' });
    });
    const section = new SDrop('section', {
      id: domId.replace(/^shopify-section-/, ''), settings: this.settingsDrop(sdefs, data.settings || {}, st.view, `section.settings(${type})`), blocks,
      index: null, index0: null, location: 'template',
    });
    const tag = schema.tag || 'div';
    const cls = ['shopify-section', schema.class].filter(Boolean).join(' ');
    let inner;
    pushFile(`sections/${type}.liquid`);
    try {
      inner = this.engine.renderSync(this.engine.parseFileSync(file), { section }, { globals: st.globals });
    } catch (e) {
      const ours = /TypeError|ReferenceError/.test(e.name) || /is not a function|Cannot read prop/.test(e.message);
      warn('liquid-error', `sections/${type}.liquid: ${e.message.split('\n')[0]}`, ours ? 'harness-gap' : 'theme-suspect');
      inner = `Liquid error (sections/${type}.liquid): ${escapeHtml(e.message.split('\n')[0])}`;
    } finally { popFile(); }
    return `<${tag} id="${domId}" class="${cls}">${inner}</${tag}>`;
  }

  /** Section rendering API: ?sections=a,b / ?section_id=a — renders in the page's context. */
  renderSectionsApi(ctx, ids) {
    beginPage({ path: ctx.path, sectionApi: ids });
    const out = {};
    try {
      const view = this.makeView(ctx);
      const { defs, raw } = loadThemeSettingsRaw(this.settingsDataPath);
      const st = { store: this.store, view, req: ctx, layout: null, collected: { javascript: [], stylesheet: [] }, translations: { current: this.locales[ctx.locale] || {}, fallback: this.locales.en || {} }, formDrop: (type) => this.formDrop(type, ctx) };
      st.renderStaticSection = (n) => this.renderSectionHtml(n, n, { type: n, settings: {} }, st, `shopify-section-${n}`);
      this.state = st;
      let tpl = null;
      try { const { file } = this.resolveTemplate(ctx.templateType, ctx.suffix); if (file.endsWith('.json')) tpl = readJson(file); } catch (e) { /* none */ }
      st.globals = this.globals(ctx, view, defs, raw, ctx.templateType);
      for (const id of ids) {
        if (tpl?.sections?.[id]) out[id] = this.renderSectionHtml(id, tpl.sections[id].type, tpl.sections[id], st, `shopify-section-template--${THEME_ID}__${id}`);
        else if (fs.existsSync(path.join(THEME_DIR, 'sections', `${id}.liquid`))) out[id] = this.renderSectionHtml(id, id, { type: id, settings: {} }, st, `shopify-section-${id}`);
        else out[id] = null;
      }
    } finally { this.state = null; }
    const res = endPage();
    return { sections: out, warnings: res.warnings };
  }

  formDrop(type, ctx) {
    const f = (ctx.flash && ctx.flash[type]) || {};
    const vals = f.values || {};
    const fields = ['address1', 'address2', 'author', 'body', 'city', 'company', 'country', 'email', 'first_name', 'last_name', 'name', 'phone', 'province', 'zip', 'id', 'password_needed', 'set_as_default_checkbox'];
    const o = { errors: f.errors ? new SDrop('form_errors', { messages: f.errors, size: Object.keys(f.errors).length, toString() { return Object.values(f.errors).join(', '); } }) : null, 'posted_successfully?': Boolean(f.posted) };
    for (const k of fields) o[k] = vals[k] ?? null;
    return new SDrop('form', o);
  }

  globals(ctx, view, defs, raw, templateKey) {
    const store = this.store;
    const pfx = view.prefix;
    const settings = this.settingsDrop(defs, raw, view, 'settings', true);
    const cartJson = ctx.cartJson;
    const cart = new SDrop('cart', {
      item_count: cartJson.item_count, total_price: cartJson.total_price, original_total_price: cartJson.original_total_price, items_subtotal_price: cartJson.items_subtotal_price,
      total_discount: cartJson.total_discount, total_weight: cartJson.total_weight, note: cartJson.note || null, attributes: cartJson.attributes,
      currency: new SDrop('money_currency', { iso_code: 'EGP', name: 'Egyptian Pound', symbol: 'LE' }), requires_shipping: cartJson.requires_shipping,
      'empty?': cartJson.item_count === 0, checkout_charge_amount: cartJson.total_price, taxes_included: true, duties_included: false,
      discount_applications: [], cart_level_discount_applications: cartJson.cart_level_discount_applications,
      items: cartJson.items.map((i) => {
        const hit = store.variantIndex.get(i.variant_id);
        const prod = view.product(hit.product);
        return new SDrop('line_item', { id: i.variant_id, key: i.key, quantity: i.quantity, title: i.title, price: i.price, original_price: i.original_price, final_price: i.final_price, line_price: i.line_price, original_line_price: i.original_line_price, final_line_price: i.final_line_price, line_level_total_discount: i.line_level_total_discount, line_level_discount_allocations: [], discount_allocations: [], product: prod, variant: prod.variants.find((v) => v.id === i.variant_id), variant_id: i.variant_id, product_id: i.product_id, sku: i.sku, url: i.url, image: prod.featured_image, properties: i.properties, vendor: i.vendor, requires_shipping: i.requires_shipping, taxable: i.taxable, gift_card: false, options_with_values: [], unit_price: null, selling_plan_allocation: null, url_to_remove: `${pfx}/cart/change?id=${i.key}&quantity=0`, fulfillment: null, item_components: [] });
      }),
    });
    cart.toJSON = () => cartJson;

    const locale = view.locale(ctx.locale, ctx.locale === 'en');
    const R = (p) => `${pfx}${p}`;
    const routes = new SDrop('routes', {
      root_url: pfx || '/', account_url: R('/account'), account_login_url: R('/account/login'), account_logout_url: R('/account/logout'),
      account_register_url: R('/account/register'), account_addresses_url: R('/account/addresses'), account_recover_url: R('/account/recover'),
      collections_url: R('/collections'), all_products_collection_url: R('/collections/all'), search_url: R('/search'), predictive_search_url: R('/search/suggest'),
      cart_url: R('/cart'), cart_add_url: R('/cart/add'), cart_change_url: R('/cart/change'), cart_clear_url: R('/cart/clear'), cart_update_url: R('/cart/update'),
      product_recommendations_url: R('/recommendations/products'),
      account_profile_url: R('/account'),
      // New customer accounts: Shopify-hosted sign-in that returns to the current storefront page.
      storefront_login_url: `/customer_authentication/login?return_to=${encodeURIComponent(ctx.pathOnly + (ctx.path.includes('?') ? ctx.path.slice(ctx.path.indexOf('?')) : ''))}&locale=${ctx.locale}&ui_hint=full&region_country=EG`,
    });
    const tkey = templateKey;
    const [dirName, rest] = tkey.includes('/') ? tkey.split('/') : [null, tkey];
    const [tname, ...suf] = rest.split('.');
    const template = new SDrop('template', { name: tname, suffix: suf.join('.') || null, directory: dirName, valueOf() { return tkey; }, toString() { return tkey; } });

    const objs = ctx.objects || {};
    const shop = view.shopDrop();
    const g = {
      shop, settings, cart, customer: view.customerDrop(), routes, template,
      theme: new SDrop('theme', { id: THEME_ID, name: store.shop.theme.name, role: 'unpublished' }),
      request: new SDrop('request', { host: ctx.host, origin: `${ctx.proto}://${ctx.host}`, path: ctx.pathOnly, page_type: ctx.pageType, design_mode: false, visual_preview_mode: false, locale }),
      localization: new SDrop('localization', {
        language: locale, available_languages: store.shop.locales.filter((l) => l.published).map((l) => view.locale(l.locale, l.primary)),
        country: new SDrop('country', { iso_code: 'EG', name: 'Egypt', currency: new SDrop('money_currency', { iso_code: 'EGP', name: 'Egyptian Pound', symbol: 'LE' }), unit_system: 'metric', available_languages: [] }),
        available_countries: [], market: new SDrop('market', { id: 1, handle: 'eg', metafields: null }),
      }),
      linklists: new MapDrop('linklists', Object.fromEntries(store.menus.map((m) => [m.handle, new SDrop('linklist', { handle: m.handle, title: m.title, levels: 1, links: m.links.map((l) => new SDrop('link', { title: l.title, url: l.url, type: l.type, active: ctx.pathOnly === l.url, current: ctx.pathOnly === l.url, child_active: false, child_current: false, levels: 0, links: [], handle: l.title.toLowerCase(), object: null })) })]))),
      collections: new MapDrop('collections', {}, { onMissing: (h) => view.collection(store.collByHandle.get(h)) || null }),
      all_products: new MapDrop('all_products', {}, { onMissing: (h) => { const p = store.byHandle.get(h); return store.isLive(p) ? view.product(p) : null; } }),
      pages: new MapDrop('pages', {}, { onMissing: (h) => view.page(store.pageByHandle.get(h)) || null }),
      blogs: new MapDrop('blogs', {}), articles: new MapDrop('articles', {}), metaobjects: new MapDrop('metaobjects', {}),
      images: new MapDrop('images', {}, { onMissing: (n) => (store.files[n]?.kind === 'image' ? view.image(store.files[n]) : null) }),
      canonical_url: `${store.shop.url}${ctx.pathOnly}`,
      page_title: ctx.title || store.shop.name,
      page_description: ctx.description ?? store.shop.description,
      page_image: ctx.image || null,
      handle: objs.product?.handle || objs.collection?.handle || objs.page?.handle || null,
      current_page: parseInt(ctx.query.page, 10) || 1,
      current_tags: null, powered_by_link: '<a target="_blank" rel="nofollow" href="https://www.shopify.com?utm_campaign=poweredby">Powered by Shopify</a>',
      scripts: [], recommendations: new SDrop('recommendations', { performed: false, products: [], products_count: 0, intent: 'related' }),
      predictive_search: new SDrop('predictive_search', { performed: false, resources: new SDrop('resources', { products: [], collections: [], pages: [], articles: [], queries: [] }), terms: '', types: [] }),
      content_for_header: this.contentForHeader(ctx, view),
      content_for_index: '', content_for_layout: '', additional_checkout_buttons: false, content_for_additional_checkout_buttons: '',
    };
    for (const [k, v] of Object.entries(objs)) g[k] = v;
    return g;
  }

  contentForHeader(ctx, view) {
    const s = this.store.shop;
    const shopifyObj = {
      shop: s.permanent_domain, locale: ctx.locale, currency: { active: 'EGP', rate: '1.0' }, country: 'EG',
      theme: { name: s.theme.name, id: THEME_ID, schema_name: 'OKA', schema_version: '1.0.0', theme_store_id: null, role: 'unpublished' },
      cdnHost: `${ctx.host}/cdn`, routes: { root: view.prefix ? `${view.prefix}/` : '/' },
    };
    return [
      `<script>window.Shopify = window.Shopify || {};${Object.entries(shopifyObj).map(([k, v]) => `Shopify.${k} = ${rubyJson(v)};`).join('')}</script>`,
      '<!-- QA harness: content_for_header — Shopify analytics (trekkie, web pixels, monorail), preview bar and checkout prefetch are NOT emulated -->',
      ctx.injectHead || '',
    ].join('\n');
  }
}

function beginMeta(key) { /* placeholder hook for future per-template metadata */ }
export { stripHtml };
