/**
 * The Shopify object model (Liquid "drops") over the fixtures.
 *
 * A View is built per request (host, locale, customer, cart) and creates
 * drops lazily. Every drop records reads of properties it doesn't define
 * (see SDrop.liquidMethodMissing) into the page's warnings log.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Drop } from 'liquidjs';
import { warn } from './warn.mjs';
import { KNOWN, UNCERTAIN } from './known.mjs';

export const QA_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
export const APP_ROOT = path.resolve(QA_ROOT, '..');
export const THEME_DIR = process.env.QA_THEME_DIR || path.join(APP_ROOT, 'theme');
export const FIX_DIR = path.join(QA_ROOT, 'fixtures');
export const THEME_ID = 191458214186;

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

/* ── base drop ───────────────────────────────────────────────────────── */
export class SDrop extends Drop {
  constructor(type, props = {}) {
    super();
    Object.defineProperty(this, '__type', { value: type, enumerable: false });
    Object.assign(this, props);
  }
  liquidMethodMissing(key) {
    const k = String(key);
    if (/^\d+$/.test(k)) return undefined;
    const t = this.__type;
    let cls = 'theme-suspect';
    let msg = `${t}.${k} — not a documented Shopify ${t} property (Shopify returns nil)`;
    if (UNCERTAIN[t]?.has(k)) { cls = 'uncertain'; msg = `${t}.${k} — unverified Shopify property; harness returns nil (verify on live preview)`; }
    else if (KNOWN[t]?.has(k)) { cls = 'harness-gap'; msg = `${t}.${k} — Shopify supports it, harness doesn't`; }
    else if (!KNOWN[t]) { cls = 'harness-gap'; msg = `${t}.${k} — unknown property on harness object type '${t}'`; }
    warn('missing-property', msg, cls);
    return undefined;
  }
}
/** A drop whose keys are free-form (settings, metafields): missing keys are nil, not warnings unless `strictKeys`. */
export class MapDrop extends Drop {
  constructor(type, props = {}, { strictKeys = false, onMissing } = {}) {
    super();
    Object.defineProperty(this, '__type', { value: type, enumerable: false });
    Object.defineProperty(this, '__strict', { value: strictKeys, enumerable: false });
    Object.defineProperty(this, '__onMissing', { value: onMissing, enumerable: false });
    Object.assign(this, props);
  }
  liquidMethodMissing(key) {
    if (this.__onMissing) return this.__onMissing(String(key));
    if (this.__strict) warn('missing-setting', `${this.__type}.${key} — no such setting in the schema (Shopify returns nil)`, 'theme-suspect');
    return undefined;
  }
  toJSON() { return { ...this }; }
}

/* ── fixtures ────────────────────────────────────────────────────────── */
export class Store {
  constructor() { this.reload(); }
  reload() {
    this.shop = readJson(path.join(FIX_DIR, 'shop.json'));
    this.products = readJson(path.join(FIX_DIR, 'products.json'));
    this.collections = readJson(path.join(FIX_DIR, 'collections.json'));
    this.pages = readJson(path.join(FIX_DIR, 'pages.json'));
    this.menus = readJson(path.join(FIX_DIR, 'menus.json'));
    this.files = readJson(path.join(FIX_DIR, 'files.json'));
    this.discounts = readJson(path.join(FIX_DIR, 'discounts.json'));
    this.customerFixture = readJson(path.join(FIX_DIR, 'customer.json'));
    this.byHandle = new Map(this.products.map((p) => [p.handle, p]));
    this.byId = new Map(this.products.map((p) => [p.id, p]));
    this.variantIndex = new Map();
    for (const p of this.products) for (const v of p.variants) this.variantIndex.set(v.id, { product: p, variant: v });
    this.collByHandle = new Map(this.collections.map((c) => [c.handle, c]));
    this.pageByHandle = new Map(this.pages.map((p) => [p.handle, p]));
    // Image dimension index for the placeholder server: file name → {width,height}
    this.imageDims = new Map();
    const addDims = (url, w, h) => { if (url && w && h) this.imageDims.set(decodeURIComponent(String(url).split('?')[0].split('/').pop()), { width: w, height: h }); };
    for (const p of this.products) {
      for (const m of p.media) { addDims(m.src, m.width, m.height); if (m.preview_image) addDims(m.preview_image.src, m.preview_image.width, m.preview_image.height); }
    }
    for (const c of this.collections) if (c.image) addDims(c.image.src, c.image.width, c.image.height);
    for (const f of Object.values(this.files)) { if (f.kind === 'image') addDims(f.src, f.width, f.height); if (f.preview_image) addDims(f.preview_image.src, f.preview_image.width, f.preview_image.height); }
  }
  /** Storefront-visible: ACTIVE and published to the Online Store. */
  isLive(p) { return p && p.status === 'ACTIVE' && p.published_on_online_store; }
  liveProducts() { return this.products.filter((p) => this.isLive(p)); }
  collectionProducts(c) {
    if (c.handle === 'all') return this.liveProducts();
    return c.product_handles.map((h) => this.byHandle.get(h)).filter((p) => this.isLive(p));
  }
}

/* ── helpers ─────────────────────────────────────────────────────────── */
export function cdnPath(url) {
  // https://cdn.shopify.com/s/files/1/0812/4881/3354/files/X.png?v=1 → /cdn/shop/files/X.png?v=1
  const u = String(url || '');
  const m = /^https?:\/\/cdn\.shopify\.com\/s\/files\/\d+\/\d+\/\d+\/\d+\/(.*)$/.exec(u);
  if (m) return `/cdn/shop/${m[1]}`;
  const m2 = /^https?:\/\/cdn\.shopify\.com\/(.*)$/.exec(u);
  if (m2) return `/cdn/shopifycloud-mirror/${m2[1]}`;
  return u;
}
export function stripHtml(s) { return String(s || '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>/g, ''); }
export const handleize = (s) => String(s || '').toLowerCase().replace(/['"()[\]]/g, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');

/* ── the per-request view ────────────────────────────────────────────── */
export class View {
  /**
   * @param {Store} store
   * @param {{host:string, locale:'en'|'ar', customer:object|null, cart:object, theme:object, settings:object, pageType:string, path:string, query:object}} req
   */
  constructor(store, req) {
    this.store = store;
    this.req = req;
    this.ar = req.locale === 'ar';
    this.prefix = this.ar ? '/ar' : '';
    this.cache = new Map();
  }
  memo(key, fn) { if (!this.cache.has(key)) this.cache.set(key, fn()); return this.cache.get(key); }
  url(p) { return `${this.prefix}${p}`; }
  tr(obj, key, fallback) { return this.ar && obj.translations?.ar?.[key] ? obj.translations.ar[key] : fallback; }

  /* images: Shopify serves them under the shop's own domain at /cdn/shop/… */
  image(raw, extra = {}) {
    if (!raw) return null;
    const src = `//${this.req.host}${cdnPath(raw.src)}`;
    const w = raw.width || null; const h = raw.height || null;
    return new SDrop('image', {
      id: raw.id || null, src, url: src, width: w, height: h, alt: raw.alt || extra.alt || '',
      aspect_ratio: w && h ? Math.round((w / h) * 1e4) / 1e4 : 1, media_type: 'image', position: raw.position || 1,
      presentation: null, product_id: extra.product_id || null, variants: [], 'attached_to_variant?': false,
      preview_image: null, __raw: raw, toString() { return src; },
    });
  }
  metafields(owner, ownerType) {
    const mf = owner.metafields || {};
    const view = this;
    return new MapDrop('metafields', {}, {
      onMissing(ns) {
        const nsObj = mf[ns];
        if (!nsObj) return new MapDrop('metafield_namespace', {}, { onMissing: () => undefined });
        const entries = {};
        for (const [k, m] of Object.entries(nsObj)) entries[k] = view.metafield(m);
        return new MapDrop('metafield_namespace', entries, { onMissing: () => undefined });
      },
    });
  }
  metafield(m) {
    let value = m.value;
    try {
      if (m.type === 'json' || m.type.startsWith('list.')) value = JSON.parse(m.value);
      else if (m.type === 'number_integer') value = parseInt(m.value, 10);
      else if (m.type === 'number_decimal') value = parseFloat(m.value);
      else if (m.type === 'boolean') value = m.value === 'true';
      else if (m.type === 'file_reference') {
        const id = Number(String(m.value).split('/').pop());
        const f = Object.values(this.store.files).find((x) => x.id === id);
        value = f && f.kind === 'image' ? this.image(f) : null;
      }
    } catch (e) { /* keep string */ }
    return new SDrop('metafield', { value, type: m.type, toString() { return typeof value === 'string' ? value : JSON.stringify(value); } });
  }

  media(p, m) {
    const base = {
      id: m.id, alt: m.alt || p.title, media_type: m.media_type, position: m.position,
      preview_image: m.preview_image ? this.image(m.preview_image) : null,
      aspect_ratio: m.preview_image ? m.preview_image.width / m.preview_image.height : 1,
    };
    if (m.media_type === 'image') return this.image({ ...m, alt: m.alt || p.title }, { product_id: p.id });
    // Real Shopify: sources are absolute cdn.shopify.com URLs (videos, 3D models). The harness rewrites
    // them to the local mirror path so they resolve without the CDN (server.mjs serves stand-ins).
    if (m.sources) base.sources = m.sources.map((s) => new SDrop('media_source', { format: s.format, mime_type: s.mime_type, url: `//${this.req.host}${cdnPath(s.url)}`, width: s.width || null, height: s.height || null }));
    if (m.media_type === 'external_video') Object.assign(base, { host: m.host, external_id: m.external_id, embed_url: m.embed_url });
    if (m.media_type === 'video') base.duration = m.duration || null;
    return new SDrop('media', base);
  }

  product(p) {
    if (!p) return null;
    return this.memo(`p:${p.id}`, () => {
      const view = this;
      const q = this.req.query || {};
      const isCurrent = this.req.currentProductId === p.id;
      const variants = p.variants.map((v) => this.variant(p, v));
      const available = p.variants.some((v) => v.available);
      const prices = p.variants.map((v) => v.price);
      const cmp = p.variants.map((v) => v.compare_at_price || 0);
      const selectedId = isCurrent && q.variant ? Number(q.variant) : null;
      const selected = selectedId ? variants.find((v) => v.id === selectedId) || null : null;
      const firstAvail = variants.find((v) => v.available) || null;
      const images = p.media.filter((m) => m.media_type === 'image').map((m) => this.image({ ...m, alt: m.alt || p.title }, { product_id: p.id }));
      const drop = new SDrop('product', {
        id: p.id, handle: p.handle,
        title: this.tr(p, 'title', p.title),
        description: this.tr(p, 'body_html', p.body_html), content: this.tr(p, 'body_html', p.body_html),
        vendor: p.vendor, type: p.product_type, tags: p.tags,
        url: this.url(`/products/${p.handle}`),
        available, price: Math.min(...prices), price_min: Math.min(...prices), price_max: Math.max(...prices), price_varies: new Set(prices).size > 1,
        compare_at_price: Math.min(...cmp) || null, compare_at_price_min: Math.min(...cmp), compare_at_price_max: Math.max(...cmp), compare_at_price_varies: new Set(cmp).size > 1,
        variants, variants_count: variants.length,
        first_available_variant: firstAvail, selected_variant: selected,
        selected_or_first_available_variant: selected || firstAvail || variants[0],
        has_only_default_variant: p.has_only_default_variant,
        options: p.options.map((o) => o.name),
        options_with_values: p.options.map((o) => new SDrop('product_option', { name: o.name, position: o.position, values: o.values, selected_value: (selected || firstAvail || variants[0])?.[`option${o.position}`] })),
        images, featured_image: images[0] || null,
        media: p.media.map((m) => this.media(p, m)),
        template_suffix: p.template_suffix, created_at: p.created_at, published_at: p.published_at,
        requires_selling_plan: false, selling_plan_groups: [], selected_selling_plan: null,
        selected_selling_plan_allocation: null, selected_or_first_available_selling_plan_allocation: null,
        'gift_card?': false, 'quantity_price_breaks_configured?': false, category: null,
      });
      Object.defineProperty(drop, 'featured_media', { enumerable: true, get() { return drop.media[0] || null; } });
      Object.defineProperty(drop, 'metafields', { enumerable: false, get() { return view.metafields(p, 'product'); } });
      Object.defineProperty(drop, 'collections', { enumerable: false, get() { return p.collections.map((h) => view.collection(view.store.collByHandle.get(h))).filter(Boolean); } });
      Object.defineProperty(drop, 'options_by_name', { enumerable: false, get() { return new MapDrop('options_by_name', Object.fromEntries(drop.options_with_values.map((o) => [o.name.toLowerCase(), o]))); } });
      Object.defineProperty(drop, '__raw', { value: p, enumerable: false });
      drop.toJSON = () => view.productAjax(p);
      for (const v of variants) Object.defineProperty(v, 'product', { enumerable: false, get: () => drop });
      return drop;
    });
  }
  variant(p, v) {
    const view = this;
    const d = new SDrop('variant', {
      id: v.id, title: v.title, sku: v.sku, barcode: v.barcode,
      price: v.price, compare_at_price: v.compare_at_price,
      available: v.available, inventory_quantity: v.inventory_quantity,
      inventory_management: v.inventory_management, inventory_policy: v.inventory_policy,
      option1: v.option1, option2: v.option2, option3: v.option3, options: [v.option1, v.option2, v.option3].filter((x) => x != null),
      requires_shipping: v.requires_shipping, taxable: v.taxable, weight: Math.round(v.weight * (v.weight_unit === 'grams' ? 1 : 1000)), weight_unit: v.weight_unit === 'grams' ? 'g' : 'kg', weight_in_unit: v.weight,
      url: this.url(`/products/${p.handle}?variant=${v.id}`),
      image: v.image ? this.image(v.image) : null, featured_image: v.image ? this.image(v.image) : null, featured_media: null,
      incoming: false, next_incoming_date: null, matched: true, selected: this.req.query?.variant ? Number(this.req.query.variant) === v.id : false,
      requires_selling_plan: false, selling_plan_allocations: [], unit_price: null, unit_price_measurement: null,
      quantity_rule: new SDrop('quantity_rule', { min: 1, max: null, increment: 1 }), quantity_price_breaks: [], 'quantity_price_breaks_configured?': false,
      store_availabilities: [],
    });
    Object.defineProperty(d, 'metafields', { enumerable: false, get() { return view.metafields(v, 'variant'); } });
    d.toJSON = () => view.variantAjax(p, v);
    return d;
  }

  collection(c, { sortBy, filters, all = false } = {}) {
    if (!c) return null;
    return this.memo(`c:${c.handle}:${sortBy || ''}:${JSON.stringify(filters || {})}`, () => {
      const view = this;
      let list = this.store.collectionProducts(c);
      list = applySort(list, sortBy || c.sort_order, c);
      list = applyFilters(list, filters);
      const drop = new SDrop('collection', {
        id: c.id, handle: c.handle, title: this.tr(c, 'title', c.title),
        description: this.tr(c, 'body_html', c.body_html), url: this.url(`/collections/${c.handle}`),
        image: c.image ? this.image(c.image) : null, featured_image: c.image ? this.image(c.image) : null,
        template_suffix: c.template_suffix, published_at: c.updated_at,
        default_sort_by: c.sort_order, sort_by: sortBy || null,
        sort_options: SORT_OPTIONS.map(([value, name]) => new SDrop('sort_option', { value, name })),
        products_count: list.length, all_products_count: this.store.collectionProducts(c).length,
        all_tags: [...new Set(list.flatMap((p) => p.tags))].sort(), tags: [...new Set(list.flatMap((p) => p.tags))].sort(),
        all_types: [...new Set(list.map((p) => p.product_type).filter(Boolean))], all_vendors: [...new Set(list.map((p) => p.vendor).filter(Boolean))],
        current_type: null, current_vendor: null, next_product: null, previous_product: null,
        filters: buildFilters(this.store.collectionProducts(c), filters),
      });
      Object.defineProperty(drop, '__list', { value: list, enumerable: false });
      Object.defineProperty(drop, '__page', { value: { offset: 0, limit: 50 }, enumerable: false, writable: true });
      Object.defineProperty(drop, 'products', { enumerable: false, get() { const pg = drop.__page; return list.slice(pg.offset, pg.offset + pg.limit).map((p) => view.product(p)); } });
      Object.defineProperty(drop, 'metafields', { enumerable: false, get() { return view.metafields(c, 'collection'); } });
      drop.toJSON = () => ({ id: c.id, handle: c.handle, title: drop.title, description: drop.description, published_at: c.updated_at, sort_order: c.sort_order, template_suffix: c.template_suffix, products_count: list.length, image: c.image ? { src: drop.image.src, alt: c.image.alt, width: c.image.width, height: c.image.height } : null });
      return drop;
    });
  }
  allCollection(opts) {
    return this.collection({ id: 0, handle: 'all', title: 'Products', body_html: '', sort_order: 'created-ascending', template_suffix: null, product_handles: [], metafields: {}, translations: {}, image: null, updated_at: null }, opts);
  }

  page(pg) {
    if (!pg) return null;
    const view = this;
    const d = new SDrop('page', {
      id: pg.id, handle: pg.handle, title: this.tr(pg, 'title', pg.title), content: this.tr(pg, 'body_html', pg.body_html),
      url: this.url(`/pages/${pg.handle}`), template_suffix: pg.template_suffix, author: null, published_at: pg.created_at,
    });
    Object.defineProperty(d, 'metafields', { enumerable: false, get() { return view.metafields(pg, 'page'); } });
    return d;
  }

  policy(pol) {
    if (!pol) return null;
    return new SDrop('policy', { id: pol.id, title: pol.title, body: pol.body, url: this.url(`/policies/${pol.handle}`) });
  }
  shopDrop() {
    return this.memo('shop', () => {
      const s = this.store.shop;
      const pol = (t) => this.policy(s.policies.find((p) => p.type === t));
      const view = this;
      const d = new SDrop('shop', {
        id: 81248813354, name: s.name, email: s.email, description: s.description, domain: s.domain,
        url: `${this.req.proto || 'http'}://${this.req.host}`, secure_url: `https://${this.req.host}`, permanent_domain: s.permanent_domain,
        currency: s.currency, money_format: s.money_format, money_with_currency_format: s.money_with_currency_format,
        password_message: s.password_message, phone: '', customer_accounts_enabled: true, customer_accounts_optional: true,
        enabled_currencies: [new SDrop('money_currency', { iso_code: 'EGP', name: 'Egyptian Pound', symbol: 'LE' })],
        published_locales: s.locales.filter((l) => l.published).map((l) => this.locale(l.locale, l.primary)),
        enabled_locales: s.locales.filter((l) => l.published).map((l) => this.locale(l.locale, l.primary)),
        privacy_policy: pol('PRIVACY_POLICY'), refund_policy: pol('REFUND_POLICY'), shipping_policy: pol('SHIPPING_POLICY'),
        terms_of_service: pol('TERMS_OF_SERVICE'), subscription_policy: pol('SUBSCRIPTION_POLICY'),
        policies: s.policies.filter((p) => p.type !== 'CONTACT_INFORMATION').map((p) => this.policy(p)),
        products_count: this.store.liveProducts().length, collections_count: this.store.collections.length,
        types: [...new Set(this.store.liveProducts().map((p) => p.product_type).filter(Boolean))],
        vendors: [...new Set(this.store.liveProducts().map((p) => p.vendor).filter(Boolean))],
        taxes_included: true, accepts_gift_cards: true, enabled_payment_types: ['cash_on_delivery'], brand: null, address: null, metaobjects: null,
      });
      Object.defineProperty(d, 'metafields', { enumerable: false, get() { return view.metafields(s, 'shop'); } });
      return d;
    });
  }
  locale(iso, primary) {
    return new SDrop('locale', { iso_code: iso, primary: Boolean(primary), name: iso === 'ar' ? 'Arabic' : 'English', endonym_name: iso === 'ar' ? 'العربية' : 'English', root_url: iso === 'ar' ? '/ar' : '/' });
  }

  address(a) {
    if (!a) return null;
    return new SDrop('address', {
      id: a.id, first_name: a.first_name, last_name: a.last_name, name: [a.first_name, a.last_name].filter(Boolean).join(' '),
      address1: a.address1, address2: a.address2, street: [a.address1, a.address2].filter(Boolean).join(', '), city: a.city, company: a.company || '',
      province: a.province, province_code: a.province_code, country: a.country, country_code: a.country_code, zip: a.zip || '', phone: a.phone || '',
      summary: [a.address1, a.city, a.province, a.country].filter(Boolean).join(', '), url: `/account/addresses/${a.id}`,
    });
  }
  order(o) {
    const view = this;
    const shippingAddress = this.address(o.address);
    const items = o.line_items.map((l, i) => {
      const hit = this.store.variantIndex.get(l.variant_id);
      const prod = hit ? this.product(hit.product) : null;
      const img = hit ? hit.product.media.find((m) => m.media_type === 'image') : null;
      const disc = l.discount || 0;
      const fulfilled = o.fulfillment_status === 'fulfilled' || (o.fulfillment_status === 'partial' && l.tracking);
      return new SDrop('line_item', {
        id: o.id * 10 + i, key: `${o.id}-${i}`, title: l.title + (l.variant_title ? ` - ${l.variant_title}` : ''), quantity: l.quantity,
        price: l.price, original_price: l.price, final_price: l.price - Math.round(disc / l.quantity), line_price: l.price * l.quantity - disc,
        original_line_price: l.price * l.quantity, final_line_price: l.price * l.quantity - disc,
        line_level_total_discount: disc, discount_allocations: disc ? [new SDrop('discount_allocation', { amount: disc })] : [], line_level_discount_allocations: [],
        sku: l.sku, variant_id: l.variant_id, product_id: l.product_id, product: prod, variant: prod ? prod.variants.find((v) => v.id === l.variant_id) : null,
        image: img ? this.image({ ...img, alt: l.title }) : null, url: prod ? prod.url : null, vendor: hit?.product.vendor || '', requires_shipping: true, taxable: true,
        properties: [], options_with_values: [], gift_card: false, fulfillment_service: 'manual', successfully_fulfilled_quantity: fulfilled ? l.quantity : 0,
        fulfillment: fulfilled && l.tracking ? new SDrop('fulfillment', {
          tracking_number: l.tracking.number, tracking_numbers: [l.tracking.number], tracking_url: l.tracking.url || null, tracking_urls: l.tracking.url ? [l.tracking.url] : [],
          tracking_company: l.tracking.company || null, created_at: o.created_at, item_count: l.quantity, fulfillment_line_items: [],
        }) : null,
        unit_price: null, unit_price_measurement: null, selling_plan_allocation: null, item_components: [],
      });
    });
    return new SDrop('order', {
      id: o.id, name: o.name, order_number: Number(o.name.replace(/\D/g, '')), created_at: o.created_at,
      cancelled: o.cancelled, cancelled_at: o.cancelled_at || null, cancel_reason: o.cancel_reason || null, cancel_reason_label: o.cancel_reason ? 'Customer changed/cancelled order' : null,
      financial_status: o.financial_status, financial_status_label: o.financial_status[0].toUpperCase() + o.financial_status.slice(1),
      fulfillment_status: o.fulfillment_status || 'unfulfilled', fulfillment_status_label: o.fulfillment_status ? o.fulfillment_status[0].toUpperCase() + o.fulfillment_status.slice(1) : 'Unfulfilled',
      line_items: items, item_count: items.reduce((a, l) => a + l.quantity, 0),
      line_items_subtotal_price: o.line_items.reduce((a, l) => a + l.price * l.quantity, 0) - o.total_discounts,
      subtotal_price: o.subtotal_price, total_price: o.total_price, total_discounts: o.total_discounts, shipping_price: o.shipping_price, tax_price: 0, total_net_amount: o.total_price,
      total_refunded_amount: 0, total_duties: null, tax_lines: [],
      shipping_address: shippingAddress, billing_address: shippingAddress, phone: o.phone, email: o.email, note: null, attributes: {}, tags: [],
      discount_applications: o.total_discounts ? [new SDrop('discount_application', { title: 'tong free', total_allocated_amount: o.total_discounts, type: 'automatic', value_type: 'percentage', value: 100 })] : [],
      cart_level_discount_applications: [], shipping_methods: [new SDrop('shipping_method', { title: 'Standard', price: o.shipping_price, original_price: o.shipping_price })],
      transactions: [], customer_url: `/account/orders/${o.id}`, customer_order_url: `/account/orders/${o.id}`, order_status_url: `https://${this.req.host}/81248813354/orders/qa${o.id}/authenticate?key=qa`,
      'pickup_in_store?': false, metafields: new MapDrop('metafields', {}, { onMissing: () => new MapDrop('ns', {}) }),
    });
  }
  customerDrop() {
    const c = this.req.customer;
    if (!c) return null;
    return this.memo('customer', () => {
      const view = this;
      const addresses = c.addresses.map((a) => this.address(a));
      const orders = [...c.orders].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((o) => this.order(o));
      const d = new SDrop('customer', {
        id: c.id, email: c.email, first_name: c.first_name, last_name: c.last_name, name: `${c.first_name} ${c.last_name}`.trim(), phone: c.phone,
        accepts_marketing: c.accepts_marketing, tags: c.tags, has_account: true, tax_exempt: false, 'b2b?': false, 'has_avatar?': false,
        addresses, addresses_count: addresses.length,
        default_address: addresses.find((a) => a.id === c.default_address_id) || addresses[0] || null,
        orders_count: orders.length, last_order: orders[0] || null,
        total_spent: c.orders.filter((o) => !o.cancelled).reduce((a, o) => a + o.total_price, 0),
        // NOTE: on real Shopify `balance` is a money object; printed raw it shows the amount in cents
        // in most contexts. The harness models it as an integer in cents (see README fidelity gaps).
        store_credit_account: c.store_credit_cents != null ? new SDrop('store_credit_account', { balance: c.store_credit_cents }) : null,
        new_address: new SDrop('address', { id: null, first_name: '', last_name: '', name: '', address1: '', address2: '', city: '', province: '', province_code: '', country: 'Egypt', country_code: 'EG', zip: '', phone: '', company: '', street: '', summary: '', url: '/account/addresses' }),
        payment_methods: [], current_company: null, current_location: null, company_available_locations: [], company_available_locations_count: 0,
        metafields: new MapDrop('metafields', {}, { onMissing: () => new MapDrop('ns', {}) }),
      });
      Object.defineProperty(d, 'orders', { enumerable: false, get() { const pg = d.__page || { offset: 0, limit: 1e9 }; return orders.slice(pg.offset, pg.offset + pg.limit); } });
      Object.defineProperty(d, '__orders_all', { value: orders, enumerable: false });
      Object.defineProperty(d, '__page', { value: null, writable: true, enumerable: false });
      return d;
    });
  }

  /* ── AJAX JSON shapes (as /products/x.js and /cart.js return them) ── */
  imgCdn(raw) { return raw ? `//${this.req.host}${cdnPath(raw.src)}` : null; }
  variantAjax(p, v) {
    const img = v.image ? { ...v.image } : null;
    return {
      id: v.id, title: v.title, option1: v.option1, option2: v.option2, option3: v.option3, sku: v.sku, requires_shipping: v.requires_shipping, taxable: v.taxable,
      featured_image: img ? { id: null, product_id: p.id, position: 1, alt: img.alt, width: img.width, height: img.height, src: this.imgCdn(img) } : null,
      available: v.available, name: p.title + (p.has_only_default_variant ? '' : ` - ${v.title}`), public_title: p.has_only_default_variant ? null : v.title,
      options: [v.option1, v.option2, v.option3].filter((x) => x != null), price: v.price, weight: Math.round(v.weight * (v.weight_unit === 'grams' ? 1 : 1000)),
      compare_at_price: v.compare_at_price, inventory_management: v.inventory_management, barcode: v.barcode,
      quantity_rule: { min: 1, max: null, increment: 1 }, quantity_price_breaks: [], requires_selling_plan: false, selling_plan_allocations: [],
    };
  }
  productAjax(p) {
    const imgs = p.media.filter((m) => m.media_type === 'image');
    const prices = p.variants.map((v) => v.price);
    const cmp = p.variants.map((v) => v.compare_at_price || 0);
    return {
      id: p.id, title: this.tr(p, 'title', p.title), handle: p.handle, description: this.tr(p, 'body_html', p.body_html), published_at: p.published_at, created_at: p.created_at,
      vendor: p.vendor, type: p.product_type, tags: p.tags, price: Math.min(...prices), price_min: Math.min(...prices), price_max: Math.max(...prices),
      available: p.variants.some((v) => v.available), price_varies: new Set(prices).size > 1,
      compare_at_price: Math.min(...cmp) || null, compare_at_price_min: Math.min(...cmp), compare_at_price_max: Math.max(...cmp), compare_at_price_varies: new Set(cmp).size > 1,
      variants: p.variants.map((v) => this.variantAjax(p, v)),
      images: imgs.map((m) => this.imgCdn(m)), featured_image: imgs[0] ? this.imgCdn(imgs[0]) : null,
      options: p.options.map((o) => ({ name: o.name, position: o.position, values: o.values })),
      url: this.url(`/products/${p.handle}`),
      media: p.media.map((m) => ({ alt: m.alt || null, id: m.id, position: m.position, preview_image: m.preview_image ? { aspect_ratio: m.preview_image.width / m.preview_image.height, height: m.preview_image.height, width: m.preview_image.width, src: this.imgCdn(m.preview_image) } : null, media_type: m.media_type, ...(m.media_type === 'image' ? { aspect_ratio: m.width / m.height, height: m.height, width: m.width, src: this.imgCdn(m) } : {}), ...(m.sources ? { sources: m.sources.map((s) => ({ ...s, url: this.imgCdn({ src: s.url }) })) } : {}) })),
      requires_selling_plan: false, selling_plan_groups: [],
    };
  }
  productJsonAdmin(p) {
    const imgs = p.media.filter((m) => m.media_type === 'image');
    const money = (c) => (c == null ? null : (c / 100).toFixed(2));
    return {
      id: p.id, title: this.tr(p, 'title', p.title), body_html: this.tr(p, 'body_html', p.body_html), vendor: p.vendor, product_type: p.product_type,
      created_at: p.created_at, handle: p.handle, updated_at: p.updated_at, published_at: p.published_at, template_suffix: p.template_suffix || '',
      published_scope: 'web', tags: p.tags.join(', '),
      variants: p.variants.map((v) => ({ id: v.id, product_id: p.id, title: v.title, price: money(v.price), sku: v.sku, position: v.position, compare_at_price: money(v.compare_at_price), fulfillment_service: 'manual', inventory_management: v.inventory_management, option1: v.option1, option2: v.option2, option3: v.option3, created_at: p.created_at, updated_at: p.updated_at, taxable: v.taxable, barcode: v.barcode, grams: Math.round(v.weight * 1000), image_id: null, weight: v.weight, weight_unit: v.weight_unit === 'grams' ? 'g' : 'kg', requires_shipping: v.requires_shipping, price_currency: 'EGP', compare_at_price_currency: v.compare_at_price ? 'EGP' : '' })),
      options: p.options.map((o, i) => ({ id: p.id * 10 + i, product_id: p.id, name: o.name, position: o.position, values: o.values })),
      images: imgs.map((m, i) => ({ id: m.id, product_id: p.id, position: i + 1, created_at: p.created_at, updated_at: p.updated_at, alt: m.alt || null, width: m.width, height: m.height, src: `https://${this.req.host}${cdnPath(m.src)}`, variant_ids: [] })),
      image: imgs[0] ? { id: imgs[0].id, product_id: p.id, position: 1, alt: imgs[0].alt || null, width: imgs[0].width, height: imgs[0].height, src: `https://${this.req.host}${cdnPath(imgs[0].src)}`, variant_ids: [] } : null,
    };
  }
}

/* ── sorting & filtering (collection ?sort_by / ?filter.*) ───────────── */
export const SORT_OPTIONS = [
  ['manual', 'Featured'], ['best-selling', 'Best selling'], ['title-ascending', 'Alphabetically, A-Z'], ['title-descending', 'Alphabetically, Z-A'],
  ['price-ascending', 'Price, low to high'], ['price-descending', 'Price, high to low'], ['created-ascending', 'Date, old to new'], ['created-descending', 'Date, new to old'],
];
function applySort(list, sortBy, c) {
  const minPrice = (p) => Math.min(...p.variants.map((v) => v.price));
  const l = [...list];
  switch (sortBy) {
    case 'title-ascending': return l.sort((a, b) => a.title.localeCompare(b.title));
    case 'title-descending': return l.sort((a, b) => b.title.localeCompare(a.title));
    case 'price-ascending': return l.sort((a, b) => minPrice(a) - minPrice(b));
    case 'price-descending': return l.sort((a, b) => minPrice(b) - minPrice(a));
    case 'created-ascending': return l.sort((a, b) => a.created_at.localeCompare(b.created_at));
    case 'created-descending': return l.sort((a, b) => b.created_at.localeCompare(a.created_at));
    // manual / best-selling: the Admin API's COLLECTION_DEFAULT order (best-selling data isn't exported; admin order used).
    default: return l;
  }
}
function applyFilters(list, f) {
  if (!f || !Object.keys(f).length) return list;
  return list.filter((p) => {
    if (f['filter.v.availability'] != null) {
      const want = [].concat(f['filter.v.availability']).map(String);
      const av = p.variants.some((v) => v.available) ? '1' : '0';
      if (!want.includes(av)) return false;
    }
    const price = Math.min(...p.variants.map((v) => v.price)) / 100;
    if (f['filter.v.price.gte'] != null && f['filter.v.price.gte'] !== '' && price < Number(f['filter.v.price.gte'])) return false;
    if (f['filter.v.price.lte'] != null && f['filter.v.price.lte'] !== '' && price > Number(f['filter.v.price.lte'])) return false;
    if (f['filter.p.product_type'] && ![].concat(f['filter.p.product_type']).includes(p.product_type)) return false;
    if (f['filter.p.vendor'] && ![].concat(f['filter.p.vendor']).includes(p.vendor)) return false;
    if (f['filter.p.tag'] && ![].concat(f['filter.p.tag']).some((t) => p.tags.includes(t))) return false;
    return true;
  });
}
function buildFilters(list, active = {}) {
  const avail = list.filter((p) => p.variants.some((v) => v.available)).length;
  return [
    new SDrop('filter', { label: 'Availability', param_name: 'filter.v.availability', type: 'list', values: [
      new SDrop('filter_value', { label: 'In stock', value: '1', count: avail, active: [].concat(active['filter.v.availability'] || []).includes('1'), param_name: 'filter.v.availability' }),
      new SDrop('filter_value', { label: 'Out of stock', value: '0', count: list.length - avail, active: [].concat(active['filter.v.availability'] || []).includes('0'), param_name: 'filter.v.availability' }),
    ], active_values: [] }),
    new SDrop('filter', { label: 'Price', param_name: 'filter.v.price', type: 'price_range', values: [], active_values: [], range_max: Math.max(0, ...list.map((p) => Math.max(...p.variants.map((v) => v.price)))) }),
  ];
}

export const sha = (s) => crypto.createHash('sha1').update(String(s)).digest('hex');
