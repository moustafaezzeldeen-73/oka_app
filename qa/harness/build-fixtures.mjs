#!/usr/bin/env node
/**
 * Turns the raw, read-only Admin API dumps in qa/fixtures/raw/*.json into the
 * normalised fixtures the renderer uses (qa/fixtures/*.json).
 *
 * The raw dumps were exported with mcp__Shopify__graphql_query (queries only,
 * no mutations) on 2026-10-14. Re-export them the same way and re-run:
 *   node qa/harness/build-fixtures.mjs
 *
 * No customer PII is read or written: the customer + orders fixture is
 * synthetic (see FAKE_CUSTOMER below) and references real variant ids only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.resolve(HERE, '../fixtures');
const RAW = path.join(FIX, 'raw');
const read = (f) => JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8'));
const write = (f, d) => fs.writeFileSync(path.join(FIX, f), JSON.stringify(d, null, 2));
const legacy = (gid) => Number(String(gid).split('/').pop());
const cents = (s) => (s == null || s === '' ? null : Math.round(parseFloat(s) * 100));
const fileName = (url) => decodeURIComponent(String(url).split('?')[0].split('/').pop());

/* ── shop ─────────────────────────────────────────────────────────────── */
const shopRaw = read('shop.json').data;
const policyHandle = { PRIVACY_POLICY: 'privacy-policy', REFUND_POLICY: 'refund-policy', SHIPPING_POLICY: 'shipping-policy', TERMS_OF_SERVICE: 'terms-of-service', CONTACT_INFORMATION: 'contact-information', SUBSCRIPTION_POLICY: 'subscription-policy', LEGAL_NOTICE: 'legal-notice', TERMS_OF_SALE: 'terms-of-sale' };
const shop = {
  name: shopRaw.shop.name,
  email: shopRaw.shop.email,
  description: shopRaw.shop.description,
  domain: shopRaw.shop.primaryDomain.host,
  url: shopRaw.shop.primaryDomain.url,
  permanent_domain: shopRaw.shop.myshopifyDomain,
  currency: shopRaw.shop.currencyCode,
  timezone: shopRaw.shop.ianaTimezone,
  money_format: shopRaw.shop.currencyFormats.moneyFormat,
  money_with_currency_format: shopRaw.shop.currencyFormats.moneyWithCurrencyFormat,
  locales: shopRaw.shopLocales,
  publications: shopRaw.publications.nodes,
  metafields: Object.fromEntries(
    (shopRaw.shop.metafields.nodes || []).map((m) => [m.namespace, {}]),
  ),
  policies: shopRaw.shop.shopPolicies.map((p) => ({
    type: p.type,
    handle: policyHandle[p.type] || p.type.toLowerCase().replace(/_/g, '-'),
    title: p.title,
    body: p.body,
    id: legacy(p.handle),
  })),
  password_message: '',
  theme: { id: 191458214186, name: 'OKA App Theme (test — unpublished)', role: 'unpublished' },
};
for (const m of shopRaw.shop.metafields.nodes || []) shop.metafields[m.namespace][m.key] = { type: m.type, value: m.value };
write('shop.json', shop);

/* ── files (image_picker / video settings: shopify://shop_images/…, shopify://files/videos/…) ── */
const files = {};
for (const f of [...read('files1.json').data.files.nodes, ...read('files2.json').data.files.nodes]) {
  if (f.image) {
    const n = fileName(f.image.url);
    files[n] = { kind: 'image', id: legacy(f.id), src: f.image.url, width: f.image.width, height: f.image.height, alt: f.image.altText || f.alt || '' };
  } else if (f.sources) {
    const n = f.filename;
    files[n] = {
      kind: 'video', id: legacy(f.id), filename: n, duration: f.duration, alt: f.alt || '',
      sources: f.sources.map((s) => ({ url: s.url, format: s.format, mime_type: s.mimeType, width: s.width, height: s.height })),
      preview_image: f.preview?.image ? { src: f.preview.image.url, width: f.preview.image.width, height: f.preview.image.height } : null,
    };
  } else if (f.url) {
    files[fileName(f.url)] = { kind: 'file', id: legacy(f.id), url: f.url, mime_type: f.mimeType };
  }
}
write('files.json', files);

/* ── products ─────────────────────────────────────────────────────────── */
const mediaType = { IMAGE: 'image', MODEL_3D: 'model', VIDEO: 'video', EXTERNAL_VIDEO: 'external_video' };
const products = read('products.json').data.products.nodes.map((p) => {
  const media = p.media.nodes.map((m, i) => {
    const base = {
      id: legacy(m.id), media_type: mediaType[m.mediaContentType] || m.mediaContentType.toLowerCase(), alt: m.alt || '', position: i + 1,
      preview_image: m.preview?.image ? { src: m.preview.image.url, width: m.preview.image.width, height: m.preview.image.height, alt: m.preview.image.altText || '' } : null,
    };
    if (m.image) Object.assign(base, { src: m.image.url, width: m.image.width, height: m.image.height });
    if (m.sources) base.sources = m.sources.map((s) => ({ url: s.url, format: s.format, mime_type: s.mimeType, width: s.width || null, height: s.height || null, filesize: s.filesize || null }));
    if (m.embedUrl) Object.assign(base, { host: m.host, embed_url: m.embedUrl, external_id: m.originUrl });
    return base;
  });
  const metafields = {};
  for (const m of p.metafields.nodes) (metafields[m.namespace] ||= {})[m.key] = { type: m.type, value: m.value };
  const tr = {};
  for (const t of p.translations || []) tr[t.key] = t.value;
  return {
    id: Number(p.legacyResourceId), gid: p.id, handle: p.handle, title: p.title,
    body_html: p.descriptionHtml, description_text: p.description,
    vendor: p.vendor, product_type: p.productType, tags: p.tags, status: p.status,
    published: Boolean(p.publishedOnPublication) && p.status === 'ACTIVE',
    published_on_online_store: Boolean(p.publishedOnPublication),
    created_at: p.createdAt, updated_at: p.updatedAt, published_at: p.publishedAt,
    template_suffix: p.templateSuffix || null,
    seo: p.seo,
    options: p.options.map((o) => ({ name: o.name, position: o.position, values: o.values })),
    has_only_default_variant: p.hasOnlyDefaultVariant,
    variants: p.variants.nodes.map((v) => {
      const opts = v.selectedOptions.map((o) => o.value);
      return {
        id: Number(v.legacyResourceId), title: v.title, sku: v.sku || '', barcode: v.barcode || '',
        price: cents(v.price), compare_at_price: cents(v.compareAtPrice) || null,
        available: v.availableForSale, inventory_quantity: v.inventoryQuantity,
        inventory_policy: String(v.inventoryPolicy).toLowerCase(),
        inventory_management: v.inventoryItem?.tracked ? 'shopify' : null,
        requires_shipping: v.inventoryItem?.requiresShipping ?? true, taxable: v.taxable,
        weight: v.inventoryItem?.measurement?.weight?.value ?? 0,
        weight_unit: (v.inventoryItem?.measurement?.weight?.unit || 'KILOGRAMS').toLowerCase(),
        position: v.position, selected_options: v.selectedOptions, option1: opts[0] ?? null, option2: opts[1] ?? null, option3: opts[2] ?? null,
        image: v.image ? { src: v.image.url, width: v.image.width, height: v.image.height, alt: v.image.altText || '' } : null,
      };
    }),
    media, metafields, translations: { ar: tr },
    collections: p.collections.nodes.map((c) => c.handle),
  };
});
write('products.json', products);

/* ── collections ──────────────────────────────────────────────────────── */
const sortMap = { MANUAL: 'manual', BEST_SELLING: 'best-selling', ALPHA_ASC: 'title-ascending', ALPHA_DESC: 'title-descending', PRICE_ASC: 'price-ascending', PRICE_DESC: 'price-descending', CREATED: 'created-ascending', CREATED_DESC: 'created-descending' };
const collections = read('collections.json').data.collections.nodes.map((c) => {
  const metafields = {};
  for (const m of c.metafields.nodes) (metafields[m.namespace] ||= {})[m.key] = { type: m.type, value: m.value };
  const tr = {};
  for (const t of c.translations || []) tr[t.key] = t.value;
  return {
    id: Number(c.legacyResourceId), handle: c.handle, title: c.title, body_html: c.descriptionHtml,
    sort_order: sortMap[c.sortOrder] || c.sortOrder, template_suffix: c.templateSuffix || null,
    published: Boolean(c.publishedOnPublication), updated_at: c.updatedAt,
    image: c.image ? { src: c.image.url, width: c.image.width, height: c.image.height, alt: c.image.altText || '' } : null,
    rules: c.ruleSet ? c.ruleSet.rules : null, disjunctive: c.ruleSet ? c.ruleSet.appliedDisjunctively : false,
    metafields, translations: { ar: tr },
    // Admin order (COLLECTION_DEFAULT) — includes drafts; the storefront filters to published.
    product_handles: c.products.nodes.map((p) => p.handle),
  };
});
write('collections.json', collections);

/* ── pages, menus ─────────────────────────────────────────────────────── */
const pagesRaw = read('pages.json');
write('pages.json', pagesRaw.data.pages.nodes.map((p) => {
  const tr = {};
  for (const t of p.translations || []) tr[t.key] = t.value;
  return { id: legacy(p.id), handle: p.handle, title: p.title, template_suffix: p.templateSuffix || null, body_html: p.body, published: p.isPublished, created_at: p.createdAt, updated_at: p.updatedAt, translations: { ar: tr } };
}));
write('menus.json', pagesRaw.menus.nodes.map((m) => ({
  handle: m.handle, title: m.title,
  links: m.items.map((i) => ({ title: i.title, url: i.url, type: i.type.toLowerCase(), links: (i.items || []).map((j) => ({ title: j.title, url: j.url, links: [] })) })),
})));

/* ── discounts (real automatic discounts + clearly fake QA codes) ─────── */
const d = read('discounts.json');
write('discounts.json', {
  _note: 'automatic: exported read-only from the store (all active, none combine). codes: the store has NO active code discounts; these QA* codes are FAKE, for exercising the cart discount UI only.',
  automatic: d.automaticDiscountNodes.map((n) => ({ id: legacy(n.id), ...n.automaticDiscount })),
  codes: [
    { code: 'QA10', fake: true, type: 'percentage', value: 10, min_subtotal: 0 },
    { code: 'QA50OFF', fake: true, type: 'fixed_amount', value: 5000, min_subtotal: 0 },
    { code: 'QAMIN300', fake: true, type: 'fixed_amount', value: 3000, min_subtotal: 30000 },
    { code: 'QAFREESHIP', fake: true, type: 'free_shipping', value: 0, min_subtotal: 0 },
    { code: 'QAEXPIRED', fake: true, type: 'percentage', value: 20, expired: true },
  ],
});

/* ── synthetic customer + orders (NO real PII) ────────────────────────── */
const byHandle = Object.fromEntries(products.map((p) => [p.handle, p]));
const li = (handle, qty, extra = {}) => {
  const p = byHandle[handle];
  const v = p.variants[0];
  return { handle, variant_id: v.id, product_id: p.id, title: p.title, variant_title: v.title === 'Default Title' ? null : v.title, sku: v.sku, quantity: qty, price: v.price, ...extra };
};
const addr = (id, o) => ({ id, country: 'Egypt', country_code: 'EG', zip: '', company: '', ...o });
const A1 = addr(9000000001, { first_name: 'QA', last_name: 'Tester', address1: '1 Test Street', address2: 'Building 1, Floor 2, Apt 3', city: 'Nasr City', province: 'Cairo', province_code: 'C', phone: '+201000000001' });
const A2 = addr(9000000002, { first_name: 'QA', last_name: 'Office', address1: '2 Sample Road', address2: '', city: 'Dokki', province: 'Giza', province_code: 'GZ', phone: '+201000000002' });
const A3 = addr(9000000003, { first_name: 'QA', last_name: 'Far', address1: '3 Example Corniche', address2: 'Villa 4', city: 'Aswan', province: 'Aswan', province_code: 'ASN', phone: '' });
const day = (n) => new Date(Date.UTC(2026, 9, 14 - n, 10, 30)).toISOString();
const orders = [
  { id: 9100000001, name: '#9000101', created_at: day(0), financial_status: 'pending', fulfillment_status: null, cancelled: false, shipping_price: 6000, discount: 0, address: A1,
    line_items: [li('oka-cloud-white-hookah', 1), li('tobacco-bowls-blueberry-12g', 2)] },
  { id: 9100000002, name: '#9000102', created_at: day(2), financial_status: 'pending', fulfillment_status: 'partial', cancelled: false, shipping_price: 3600, discount: 0, address: A1,
    line_items: [li('oka-carbon-black-hookah', 1, { tracking: { number: 'JEGQA0000000001', company: 'J&T Express', url: '' } }), li('steel-plate', 1)] },
  { id: 9100000003, name: '#9000103', created_at: day(5), financial_status: 'pending', fulfillment_status: 'fulfilled', cancelled: false, shipping_price: 6000, discount: 3100, address: A2,
    line_items: [li('oka-cloud-white-hookah', 1, { tracking: { number: 'JEGQA0000000002', company: 'J&T Express', url: '' } }), li('tobacco-bowls-iced-lemon-mint-12g', 1, { tracking: { number: 'JEGQA0000000002', company: 'J&T Express', url: '' } }), li('tobacco-bowls-cola-12g', 1, { tracking: { number: 'JEGQA0000000002', company: 'J&T Express', url: '' } }), li('tongs', 1, { discount: 3100, tracking: { number: 'JEGQA0000000002', company: 'J&T Express', url: '' } })] },
  { id: 9100000004, name: '#9000104', created_at: day(9), financial_status: 'voided', fulfillment_status: null, cancelled: true, cancelled_at: day(8), cancel_reason: 'customer', shipping_price: 8000, discount: 0, address: A3,
    line_items: [li('oka-cobra', 1)] },
  { id: 9100000005, name: '#9000105', created_at: day(20), financial_status: 'paid', fulfillment_status: 'fulfilled', cancelled: false, shipping_price: 0, discount: 0, address: A1,
    line_items: [li('the-hexa-party', 1, { tracking: { number: 'JEGQA0000000003', company: '', url: 'https://www.jtexpress-eg.com/' } })] },
  { id: 9100000006, name: '#9000106', created_at: day(30), financial_status: 'pending', fulfillment_status: null, cancelled: false, shipping_price: 7000, discount: 0, address: A2,
    line_items: [li('1-pcs-of-foil', 3), li('premium-1-5-m-hose', 1)] },
];
for (const o of orders) {
  const sub = o.line_items.reduce((a, l) => a + l.price * l.quantity, 0);
  o.subtotal_price = sub - o.discount;
  o.total_discounts = o.discount;
  o.total_price = sub - o.discount + o.shipping_price;
  o.phone = o.address.phone || null;
  o.email = 'qa.tester@example.com';
}
write('customer.json', {
  _note: 'SYNTHETIC customer for the logged-in state (cookie qa_customer=1). Not a real person; addresses/phones are fake; order numbers #9000101… do not exist in the store.',
  id: 9000000000001, first_name: 'QA', last_name: 'Tester', email: 'qa.tester@example.com', phone: '+201000000000',
  accepts_marketing: false, tags: ['qa'], store_credit_cents: 2500,
  default_address_id: A1.id, addresses: [A1, A2, A3], orders,
});

console.log(`fixtures: ${products.length} products (${products.filter((p) => p.published).length} live), ${collections.length} collections, ${Object.keys(files).length} files, ${orders.length} fake orders`);
