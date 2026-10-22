/**
 * liquidjs configured to behave like Shopify Liquid for this theme:
 * Shopify filters, tags (render/section/form/paginate/schema/style/…),
 * Ruby number semantics where they matter, and STRICT bookkeeping —
 * unknown filters/tags/variables/properties go to the page warnings log.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Liquid, Tag, Drop, Context, RenderTag, Hash, evalToken, toValue, TypeGuards } from 'liquidjs';
import { warn, pushFile, popFile, currentFile } from './warn.mjs';
import { SDrop, MapDrop, THEME_DIR, THEME_ID, cdnPath, stripHtml, handleize } from './model.mjs';

/* ── Shopify global object names (a nil here is legit Shopify behaviour) ── */
const SHOPIFY_GLOBALS = new Set(`additional_checkout_buttons all_country_option_tags all_products app article articles block blog blogs canonical_url cart checkout collection collections comment content_for_additional_checkout_buttons content_for_header content_for_index content_for_layout country_option_tags current_page current_tags customer form forloop gift_card handle images linklists localization metaobjects order page page_description page_image page_title pages paginate powered_by_link predictive_search product recommendations request routes scripts search section settings shop tablerowloop template theme`.split(/\s+/));

/* Every filter Shopify documents (to classify an unknown filter). */
const SHOPIFY_FILTERS = new Set(`abs append at_least at_most base64_decode base64_encode base64_url_safe_decode base64_url_safe_encode brightness_difference camelize camelcase capitalize ceil color_brightness color_contrast color_darken color_desaturate color_difference color_extract color_lighten color_mix color_modify color_saturate color_to_hex color_to_hsl color_to_oklch color_to_rgb compact concat currency_selector customer_login_link customer_logout_link customer_register_link date default default_errors default_pagination divided_by downcase escape escape_once external_video_tag external_video_url file_img_url file_url find find_index first floor font_face font_modify font_url format_address handle handleize has hmac_sha1 hmac_sha256 highlight highlight_active_tag image_tag image_url img_tag img_url inline_asset_content join json last link_to link_to_add_tag link_to_remove_tag link_to_tag link_to_type link_to_vendor lstrip map md5 media_tag metafield_tag metafield_text minus model_viewer_tag modulo money money_with_currency money_without_currency money_without_trailing_zeros newline_to_br payment_terms payment_type_img_url payment_type_svg_tag placeholder_svg_tag pluralize plus preload_tag prepend product_img_url reject remove remove_first remove_last replace replace_first replace_last reverse round rstrip script_tag sha1 sha256 shopify_asset_url size slice sort sort_by sort_natural split strip strip_html strip_newlines structured_data stylesheet_tag sum t time_tag times truncate truncatewords uniq upcase url_decode url_encode url_escape url_for_type url_for_vendor url_param_escape video_tag weight_with_unit where within asset_url asset_img_url global_asset_url collection_img_url article_img_url avatar login_button item_count_for_variant line_items_for`.split(/\s+/));

/* ── the image_url result: a string that remembers its image (for image_tag) ── */
class ImageUrl extends Drop {
  constructor(url, img, width, height) { super(); this.url = url; this.img = img; this.w = width; this.h = height; }
  valueOf() { return this.url; }
  toString() { return this.url; }
  toJSON() { return this.url; }
}

const escapeHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const kw = (args) => {
  // liquidjs passes keyword args as [key, value] tuples
  const out = {}; const pos = [];
  for (const a of args) { if (Array.isArray(a) && a.length === 2 && typeof a[0] === 'string') out[a[0]] = a[1]; else pos.push(a); }
  return { kw: out, pos };
};
const fileMtime = (f) => { try { return Math.floor(fs.statSync(f).mtimeMs / 1000); } catch { return 0; } };

/** Ruby-style JSON: like ActiveSupport, escapes <, >, & so it's safe inside <script>. */
export function rubyJson(v) {
  const s = JSON.stringify(v === undefined ? null : v);
  return (s === undefined ? 'null' : s).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function moneyFmt(cents, format) {
  if (cents == null || cents === '') return '';
  const n = Number(toValue(cents));
  if (Number.isNaN(n)) return '';
  const amount = n / 100;
  const delim = (num, dec, th, d) => {
    const fixed = Math.abs(num).toFixed(dec);
    let [i, f] = fixed.split('.');
    i = i.replace(/\B(?=(\d{3})+(?!\d))/g, th);
    return (num < 0 ? '-' : '') + (f ? `${i}${d}${f}` : i);
  };
  return format.replace(/\{\{\s*(\w+)\s*\}\}/, (_, k) => {
    switch (k) {
      case 'amount': return delim(amount, 2, ',', '.');
      case 'amount_no_decimals': return delim(Math.round(amount), 0, ',', '.');
      case 'amount_with_comma_separator': return delim(amount, 2, '.', ',');
      case 'amount_no_decimals_with_comma_separator': return delim(Math.round(amount), 0, '.', ',');
      case 'amount_with_apostrophe_separator': return delim(amount, 2, "'", '.');
      case 'amount_with_period_and_space_separator': return delim(amount, 2, ' ', '.');
      default: return delim(amount, 2, ',', '.');
    }
  });
}

/** Resolves a theme snippet/section/layout file. */
const themeFile = (...p) => path.join(THEME_DIR, ...p);

/**
 * Source preprocessing that keeps Shopify semantics liquidjs lacks:
 *  - `divided_by: 100.0` (float literal) → float division; integer/integer stays Ruby integer division.
 */
function preprocess(src) {
  return src.replace(/divided_by\s*:\s*(\d+\.\d+)/g, 'divided_by_float: $1');
}

export function createEngine({ getState }) {
  const liquid = new Liquid({
    root: [themeFile('snippets'), themeFile('sections'), themeFile('layout'), themeFile('templates')],
    partials: [themeFile('snippets')],
    extname: '.liquid',
    dynamicPartials: true,
    strictFilters: false,
    strictVariables: false,
    lenientIf: true,
    ownPropertyOnly: false,
    jsTruthy: false,
    cache: process.env.QA_NO_CACHE ? false : true,
    timezoneOffset: 'Africa/Cairo',
    preserveTimezones: false,
    keyValueSeparator: ':',
    relativeReference: false,
    fs: {
      readFileSync: (f) => preprocess(fs.readFileSync(f, 'utf8')),
      readFile: async (f) => preprocess(fs.readFileSync(f, 'utf8')),
      existsSync: (f) => fs.existsSync(f),
      exists: async (f) => fs.existsSync(f),
      contains: () => true,
      resolve: (root, file, ext) => path.resolve(root, file.endsWith(ext) ? file : file + ext),
      fallback: () => undefined,
      dirname: (f) => path.dirname(f),
      sep: path.sep,
    },
  });
  const S = () => getState();

  /* ── undefined top-level variables ──────────────────────────────────── */
  const origGet = Context.prototype._get;
  Context.prototype._get = function* qaGet(paths) {
    const k = paths[0];
    if (typeof k === 'string') {
      const scope = this.findScope(k);
      if (!(k in scope) && !(this.globals && k in this.globals)) {
        const file = currentFile() || '';
        if (SHOPIFY_GLOBALS.has(k)) warn('undefined-variable', `'${k}' is nil on this page type (Shopify: nil as well)`, 'info');
        else if (file.startsWith('snippets/')) warn('undefined-variable', `'${k}' not passed to ${file} (optional render param?)`, 'info');
        else warn('undefined-variable', `'${k}' is undefined (not a Shopify global, never assigned)`, 'theme-suspect');
      }
    }
    return yield* origGet.call(this, paths);
  };

  /* ── unknown filters: identity, logged loudly ───────────────────────── */
  const filters = liquid.filters;
  liquid.filters = new Proxy(filters, {
    get(t, name) {
      if (name in t || typeof name !== 'string') return t[name];
      return function unknownFilter(v) {
        warn('unknown-filter', `| ${name}`, SHOPIFY_FILTERS.has(name) ? 'harness-gap' : 'theme-suspect');
        return v;
      };
    },
  });
  const F = (name, fn) => liquid.registerFilter(name, fn);

  /* ── Ruby numbers ───────────────────────────────────────────────────── */
  F('divided_by', (a, b) => {
    a = Number(toValue(a)); b = Number(toValue(b));
    if (b === 0) { warn('liquid-error', 'divided by 0', 'theme-suspect'); return null; }
    if (Number.isInteger(a) && Number.isInteger(b)) return Math.floor(a / b);
    return a / b;
  });
  F('divided_by_float', (a, b) => { a = Number(toValue(a)); b = Number(toValue(b)); if (b === 0) { warn('liquid-error', 'divided by 0', 'theme-suspect'); return null; } return a / b; });
  F('round', (v, d = 0) => { const n = Number(toValue(v)); if (Number.isNaN(n)) return 0; const p = 10 ** d; return Math.sign(n) * Math.round(Math.abs(n) * p) / p; }); // Ruby rounds half away from zero
  F('json', (v) => rubyJson(toJsonable(toValue(v))));
  F('default', function (v, def, ...rest) {
    const { kw: o } = kw(rest);
    v = toValue(v);
    const allowFalse = o.allow_false;
    if (v === false && allowFalse) return v;
    if (v == null || v === false || v === '' || (Array.isArray(v) && !v.length) || (v instanceof MapDrop && !Object.keys(v).length && !v.__onMissing)) return def;
    return v;
  });

  /* ── money ─────────────────────────────────────────────────────────── */
  F('money', (c) => moneyFmt(c, S().store.shop.money_format));
  F('money_with_currency', (c) => moneyFmt(c, S().store.shop.money_with_currency_format));
  F('money_without_currency', (c) => moneyFmt(c, '{{amount}}'));
  F('money_without_trailing_zeros', (c) => moneyFmt(c, S().store.shop.money_format).replace(/\.00(?=\D|$)/, ''));

  /* ── urls & assets ─────────────────────────────────────────────────── */
  const assetUrl = (name) => {
    const f = themeFile('assets', String(name));
    if (!fs.existsSync(f)) warn('missing-asset', `asset_url '${name}' — file not in theme/assets (404 on Shopify too)`, 'theme-suspect');
    return `//${S().req.host}/cdn/shop/t/${THEME_ID}/assets/${name}?v=${fileMtime(f)}`;
  };
  F('asset_url', (n) => assetUrl(toValue(n)));
  F('asset_img_url', (n, size) => assetUrl(toValue(n)) + (size ? `&width=${parseInt(size, 10) || ''}` : ''));
  F('global_asset_url', (n) => `//${S().req.host}/cdn/s/global/${n}`);
  F('shopify_asset_url', (n) => `//${S().req.host}/cdn/shopifycloud/shopify/assets/${n}`);
  F('file_url', (n) => { const f = S().store.files[String(toValue(n))]; if (!f) warn('missing-file', `file_url '${n}' not found in store Files`, 'theme-suspect'); return `//${S().req.host}/cdn/shop/files/${toValue(n)}`; });
  F('file_img_url', (n, size) => `//${S().req.host}/cdn/shop/files/${toValue(n)}${size ? `?width=${parseInt(size, 10)}` : ''}`);
  F('stylesheet_tag', (url, ...rest) => { const { kw: o } = kw(rest); return `<link href="${toValue(url)}" rel="stylesheet" type="text/css" media="${o.media || 'all'}" />`; });
  F('script_tag', (url) => `<script src="${toValue(url)}" type="text/javascript"></script>`);
  F('preload_tag', (url, ...rest) => { const { kw: o } = kw(rest); return `<link href="${toValue(url)}" rel="preload" as="${o.as || 'style'}">`; });
  F('url_encode', (s) => encodeURIComponent(String(toValue(s) ?? '')).replace(/%20/g, '+').replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`));
  F('url_decode', (s) => decodeURIComponent(String(toValue(s) ?? '').replace(/\+/g, ' ')));
  F('url_escape', (s) => encodeURI(String(toValue(s) ?? '')).replace(/[&]/g, '%26'));
  F('url_param_escape', (s) => encodeURIComponent(String(toValue(s) ?? '')));
  F('link_to', (text, url, title) => `<a href="${toValue(url)}"${title ? ` title="${escapeHtml(title)}"` : ''}>${toValue(text)}</a>`);
  F('within', (url, coll) => (coll && coll.handle ? `${S().view.prefix}/collections/${coll.handle}${String(toValue(url)).replace(S().view.prefix, '')}` : toValue(url)));
  F('url_for_type', (t) => `${S().view.prefix}/collections/types?q=${encodeURIComponent(t)}`);
  F('url_for_vendor', (t) => `${S().view.prefix}/collections/vendors?q=${encodeURIComponent(t)}`);
  F('customer_login_link', (t) => `<a href="${S().view.prefix}/account/login" id="customer_login_link">${t}</a>`);
  F('customer_logout_link', (t) => `<a href="${S().view.prefix}/account/logout" id="customer_logout_link">${t}</a>`);
  F('customer_register_link', (t) => `<a href="${S().view.prefix}/account/register" id="customer_register_link">${t}</a>`);

  /* ── images ────────────────────────────────────────────────────────── */
  const imageOf = (input) => {
    const v = toValue(input);
    if (v == null || v === '') return null;
    if (v instanceof ImageUrl) return v.img;
    if (v instanceof SDrop) {
      if (v.__type === 'image') return v;
      if (v.__type === 'media') return v.preview_image;
      if (v.__type === 'product') return v.featured_image;
      if (v.__type === 'variant') return v.featured_image || v.image || v.product?.featured_image;
      if (v.__type === 'collection') return v.image || v.featured_image;
      if (v.__type === 'video_file') return v.preview_image;
    }
    if (typeof v === 'string') return { src: v.startsWith('//') || v.startsWith('http') ? v : `//${S().req.host}/cdn/shop/files/${v}`, width: null, height: null, alt: '' };
    warn('filter-input', `image_url got unsupported input (${v?.__type || typeof v})`, 'theme-suspect');
    return null;
  };
  F('image_url', (input, ...rest) => {
    const { kw: o } = kw(rest);
    const img = imageOf(input);
    if (!img) { warn('filter-input', 'image_url on nil (Shopify renders an error/empty string)', 'theme-suspect'); return ''; }
    if (!o.width && !o.height) warn('image_url-no-size', 'image_url without width/height (Shopify: full size; theme-check warns)', 'info');
    const base = String(img.src);
    const params = [];
    if (o.width) params.push(`width=${o.width}`);
    if (o.height) params.push(`height=${o.height}`);
    if (o.crop) params.push(`crop=${o.crop}`);
    if (o.format) params.push(`format=${o.format}`);
    const url = params.length ? `${base}${base.includes('?') ? '&' : '?'}${params.join('&')}` : base;
    let w = o.width ? Number(o.width) : img.width; let h = o.height ? Number(o.height) : null;
    if (img.width && img.height) {
      if (w && w > img.width) w = img.width;
      if (!h) h = w ? Math.round((w * img.height) / img.width) : img.height;
    }
    return new ImageUrl(url, img, w, h);
  });
  F('img_url', (input, size = 'master') => {
    const img = imageOf(input);
    if (!img) return '';
    const m = /^(\d*)x(\d*)$/.exec(String(size));
    const base = String(img.src);
    return m ? `${base}${base.includes('?') ? '&' : '?'}${m[1] ? `width=${m[1]}` : ''}${m[1] && m[2] ? '&' : ''}${m[2] ? `height=${m[2]}` : ''}` : base;
  });
  F('product_img_url', (input, size) => liquid.filters.img_url(input, size));
  F('collection_img_url', (input, size) => liquid.filters.img_url(input, size));
  F('image_tag', (input, ...rest) => {
    const { kw: o } = kw(rest);
    const v = toValue(input);
    let url = String(v ?? ''); let img = null; let w = null; let h = null;
    if (input instanceof ImageUrl) { url = input.url; img = input.img; w = input.w; h = input.h; }
    else if (v instanceof SDrop) { const r = liquid.filters.image_url(v); url = r.url; img = r.img; w = r.w; h = r.h; }
    if (!url) { warn('filter-input', 'image_tag on empty input', 'theme-suspect'); return ''; }
    const attrs = { src: url, alt: o.alt != null ? o.alt : (img?.alt || '') };
    const baseSrc = url.replace(/([?&])(width|height)=\d+/g, '$1').replace(/[?&]+$/, '').replace(/\?&/, '?');
    const sep = baseSrc.includes('?') ? '&' : '?';
    const maxW = img?.width || w || 0;
    let widths = o.widths != null ? String(o.widths).split(',').map((x) => parseInt(x, 10)).filter(Boolean) : [352, 832, 1200, 1920, 2560, 3840].filter((x) => !maxW || x <= maxW);
    if (o.widths == null && w) widths = widths.filter((x) => x <= w).concat(widths.includes(w) ? [] : [w]).sort((a, b) => a - b);
    if (o.srcset !== null && widths.length) attrs.srcset = widths.map((x) => `${baseSrc}${sep}width=${x} ${x}w`).join(', ');
    if (w) attrs.width = o.width || w;
    if (h) attrs.height = o.height || h;
    for (const [k, val] of Object.entries(o)) if (!['alt', 'widths', 'srcset', 'width', 'height', 'preload'].includes(k) && val != null) attrs[k] = val;
    return `<img ${Object.entries(attrs).map(([k, val]) => `${k}="${escapeHtml(val)}"`).join(' ')}>`;
  });
  F('img_tag', (url, alt = '', cls = '') => `<img src="${toValue(url)}" alt="${escapeHtml(alt)}"${cls ? ` class="${cls}"` : ''} />`);
  F('placeholder_svg_tag', (name, cls) => `<svg class="${cls || ''}" data-qa-placeholder="${name}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 525 525"><rect width="525" height="525" fill="#e5e5e5"/></svg>`);
  F('payment_type_svg_tag', (type, ...rest) => { const { kw: o } = kw(rest); return `<svg class="${o.class || ''}" data-qa-payment="${type}" viewBox="0 0 38 24" width="38" height="24"><rect width="38" height="24" rx="3" fill="#ddd"/></svg>`; });
  F('payment_type_img_url', (type) => `//${S().req.host}/cdn/shopifycloud/payment_icons/${type}.svg`);
  F('video_tag', (input, ...rest) => {
    const { kw: o } = kw(rest);
    const v = toValue(input);
    if (!v || !v.sources) { warn('filter-input', 'video_tag on a value without sources', 'theme-suspect'); return ''; }
    const poster = v.preview_image ? liquid.filters.image_url(v.preview_image, ['width', parseInt(o.image_size, 10) || v.preview_image.width]).url : '';
    const bool = (k) => (o[k] === true ? ` ${k}="${k}"` : '');
    const extra = Object.entries(o).filter(([k]) => !['autoplay', 'loop', 'muted', 'controls', 'playsinline', 'image_size'].includes(k)).map(([k, val]) => ` ${k}="${escapeHtml(val)}"`).join('');
    const srcs = v.sources.filter((s) => s.format !== 'm3u8').map((s) => `<source src="${s.url}" type="${s.mime_type}">`).join('');
    return `<video${bool('playsinline')}${bool('autoplay')}${bool('loop')}${bool('muted')}${bool('controls')}${extra} poster="${poster}">${srcs}<img src="${poster}"></video>`;
  });
  F('external_video_tag', (input, ...rest) => {
    const v = toValue(input);
    const src = v?.host === 'vimeo' ? `https://player.vimeo.com/video/${v.external_id}` : `https://www.youtube.com/embed/${v?.external_id}?controls=1&enablejsapi=1&modestbranding=1&playsinline=1&rel=0`;
    return `<iframe frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen="allowfullscreen" src="${src}" title="${escapeHtml(v?.alt || '')}"></iframe>`;
  });
  F('external_video_url', (input) => { const v = toValue(input); return `https://www.youtube.com/embed/${v?.external_id}`; });
  F('media_tag', (input, ...rest) => {
    const v = toValue(input);
    if (!v) return '';
    if (v.media_type === 'image' || v.__type === 'image') return liquid.filters.image_tag(liquid.filters.image_url(v, ['width', 1100]));
    if (v.media_type === 'video') return liquid.filters.video_tag(v, ...rest);
    if (v.media_type === 'external_video') return liquid.filters.external_video_tag(v);
    if (v.media_type === 'model') return liquid.filters.model_viewer_tag(v);
    return '';
  });
  F('model_viewer_tag', (input) => { const v = toValue(input); const glb = (v?.sources || []).find((s) => s.format === 'glb'); return `<model-viewer src="${glb?.url || ''}" camera-controls ar alt="${escapeHtml(v?.alt || '')}"></model-viewer>`; });

  /* ── text & misc ───────────────────────────────────────────────────── */
  F('handleize', (s) => handleize(toValue(s)));
  F('handle', (s) => handleize(toValue(s)));
  F('camelize', (s) => String(toValue(s)).replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : '')).replace(/^./, (c) => c.toUpperCase()));
  F('camelcase', (s) => liquid.filters.camelize(s));
  F('pluralize', (n, one, many) => (Number(toValue(n)) === 1 ? one : many));
  F('strip_html', (s) => stripHtml(toValue(s)));
  F('highlight', (s, terms) => String(toValue(s)).replace(new RegExp(`(${String(terms).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<strong class="highlight">$1</strong>'));
  F('format_code', (s) => String(toValue(s) ?? '').replace(/\s+/g, '').replace(/(.{4})(?=.)/g, '$1 '));
  F('hmac_sha256', (s, key) => crypto.createHmac('sha256', String(key ?? '')).update(String(toValue(s) ?? '')).digest('hex'));
  F('hmac_sha1', (s, key) => crypto.createHmac('sha1', String(key ?? '')).update(String(toValue(s) ?? '')).digest('hex'));
  F('sha256', (s) => crypto.createHash('sha256').update(String(toValue(s) ?? '')).digest('hex'));
  F('sha1', (s) => crypto.createHash('sha1').update(String(toValue(s) ?? '')).digest('hex'));
  F('md5', (s) => crypto.createHash('md5').update(String(toValue(s) ?? '')).digest('hex'));
  F('base64_encode', (s) => Buffer.from(String(toValue(s) ?? '')).toString('base64'));
  F('base64_decode', (s) => Buffer.from(String(toValue(s) ?? ''), 'base64').toString());
  F('default_errors', (errs) => {
    const e = toValue(errs);
    if (!e) return '';
    const msgs = e.messages ? Object.values(e.messages) : [].concat(e);
    return `<div class="errors"><ul>${msgs.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul></div>`;
  });
  F('weight_with_unit', (g, unit) => `${(Number(toValue(g)) / 1000).toFixed(2).replace(/\.?0+$/, '')} ${unit || 'kg'}`);
  F('structured_data', (v) => `<script type="application/ld+json">${rubyJson(toJsonable(toValue(v)))}</script>`);
  F('time_tag', (d, fmt) => `<time datetime="${new Date(toValue(d)).toISOString()}">${liquid.filters.date(d, fmt || '%b %d, %Y')}</time>`);
  F('t', (key, ...rest) => {
    const { kw: o } = kw(rest);
    const loc = S().translations;
    const k = String(toValue(key));
    let val = k.split('.').reduce((a, p) => (a == null ? a : a[p]), loc.current);
    if (val == null) val = k.split('.').reduce((a, p) => (a == null ? a : a[p]), loc.fallback);
    if (val == null) { warn('missing-translation', `t: '${k}' not in locales/${S().req.locale}.json or en.default.json`, 'theme-suspect'); return `translation missing: ${S().req.locale}.${k}`; }
    if (typeof val === 'object' && o.count != null) val = Number(o.count) === 1 ? val.one : val.other;
    return String(val).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, n) => (o[n] != null ? o[n] : ''));
  });
  F('font_url', (f) => { warn('font', 'font_url used (fonts not emulated)', 'harness-gap'); return ''; });
  F('font_face', () => { warn('font', 'font_face used (fonts not emulated)', 'harness-gap'); return ''; });
  F('font_modify', (f) => f);
  F('sort_natural', (arr, prop) => [...(toValue(arr) || [])].sort((a, b) => String(prop ? a?.[prop] : a).localeCompare(String(prop ? b?.[prop] : b), undefined, { sensitivity: 'base', numeric: true })));
  F('inline_asset_content', (n) => { try { return fs.readFileSync(themeFile('assets', String(n)), 'utf8'); } catch { warn('missing-asset', `inline_asset_content '${n}'`, 'theme-suspect'); return ''; } });
  F('item_count_for_variant', (cart, id) => (toValue(cart)?.items || []).filter((i) => i.variant_id === Number(id)).reduce((a, i) => a + i.quantity, 0));
  F('default_pagination', (p) => { const pg = toValue(p); if (!pg || pg.pages <= 1) return ''; return `<span class="page current">${pg.current_page}</span>`; });

  /* ── tags ──────────────────────────────────────────────────────────── */
  // {% render %}: built-in semantics (isolated scope) + file tracking for the warnings log.
  class QARender extends RenderTag {
    *render(ctx, emitter) {
      const name = typeof this.file === 'string' ? this.file : (this.file?.getText?.() || '?').replace(/['"]/g, '');
      if (!fs.existsSync(themeFile('snippets', `${name}.liquid`))) {
        warn('missing-snippet', `render '${name}' — snippets/${name}.liquid does not exist (Shopify: "Liquid error: Could not find asset")`, 'theme-suspect');
        emitter.write(`Liquid error (snippets/${name}): Could not find asset snippets/${name}.liquid`);
        return;
      }
      pushFile(`snippets/${name}.liquid`);
      try { yield* super.render(ctx, emitter); } finally { popFile(); }
    }
  }
  liquid.registerTag('render', QARender);
  const origInclude = liquid.tags.include;
  liquid.registerTag('include', class extends origInclude {
    *render(ctx, emitter) { warn('deprecated-tag', '{% include %} is deprecated in Shopify (use render)', 'theme-suspect'); yield* super.render(ctx, emitter); }
  });

  // Raw-body tags: schema / javascript / stylesheet are stripped from section output.
  const rawTag = (name, keep) => liquid.registerTag(name, class extends Tag {
    constructor(token, remain, l) {
      super(token, remain, l);
      this.body = '';
      while (remain.length) {
        const t = remain.shift();
        if (TypeGuards.isTagToken(t) && t.name === `end${name}`) return;
        this.body += t.getText();
      }
      throw new Error(`tag ${token.getText()} not closed`);
    }
    render() {
      if (name === 'schema') { try { JSON.parse(this.body); } catch (e) { warn('schema-json', `invalid {% schema %} JSON: ${e.message}`, 'theme-suspect'); } }
      if (keep) S().collected[name].push(this.body);
      return '';
    }
  });
  rawTag('schema');
  rawTag('javascript', true);
  rawTag('stylesheet', true);

  // {% style %} → <style data-shopify>
  liquid.registerTag('style', class extends Tag {
    constructor(token, remain, l) { super(token, remain, l); this.tpls = []; const s = l.parser.parseStream(remain).on('tag:endstyle', () => s.stop()).on('template', (t) => this.tpls.push(t)).on('end', () => { throw new Error('style not closed'); }); s.start(); }
    *render(ctx, emitter) { emitter.write('<style data-shopify>'); yield this.liquid.renderer.renderTemplates(this.tpls, ctx, emitter); emitter.write('</style>'); }
  });

  // {% layout 'x' %} / {% layout none %}
  liquid.registerTag('layout', class extends Tag {
    constructor(token, remain, l) { super(token, remain, l); this.arg = token.args.trim().replace(/^['"]|['"]$/g, ''); }
    render(ctx) { S().layout = this.arg === 'none' ? null : this.arg; return ''; }
  });

  // {% section 'name' %} — static section
  liquid.registerTag('section', class extends Tag {
    constructor(token, remain, l) { super(token, remain, l); this.name = token.args.trim().replace(/^['"]|['"]$/g, ''); }
    *render(ctx, emitter) { emitter.write(S().renderStaticSection(this.name)); }
  });
  liquid.registerTag('sections', class extends Tag {
    constructor(token, remain, l) { super(token, remain, l); this.name = token.args.trim().replace(/^['"]|['"]$/g, ''); }
    render() { warn('section-group', `{% sections '${this.name}' %} — section groups not present/emulated`, 'harness-gap'); return ''; }
  });
  liquid.registerTag('content_for', class extends Tag {
    constructor(token, remain, l) { super(token, remain, l); this.args = token.args; }
    render() { warn('content_for', `{% content_for ${this.args} %} (theme blocks) not emulated`, 'harness-gap'); return ''; }
  });

  // {% form 'type', object, key: value %}
  liquid.registerTag('form', class extends Tag {
    constructor(token, remain, l) {
      super(token, remain, l);
      const tk = this.tokenizer;
      this.type = tk.readValue();
      tk.skipBlank(); if (tk.peek() === ',') tk.advance();
      tk.skipBlank();
      // optional positional object (not "key:")
      const save = tk.p;
      const ident = tk.readIdentifier();
      tk.skipBlank();
      if (ident.content && tk.peek() !== ':') { tk.p = save; this.obj = tk.readValue(); tk.skipBlank(); if (tk.peek() === ',') tk.advance(); } else tk.p = save;
      this.hash = new Hash(tk, ':');
      this.tpls = [];
      const s = l.parser.parseStream(remain).on('tag:endform', () => s.stop()).on('template', (t) => this.tpls.push(t)).on('end', () => { throw new Error('form not closed'); });
      s.start();
    }
    *render(ctx, emitter) {
      const type = yield evalToken(this.type, ctx);
      const obj = this.obj ? yield evalToken(this.obj, ctx) : null;
      const attrs = yield this.hash.render(ctx);
      const st = S();
      const def = FORM_TYPES[type];
      if (!def) warn('unknown-form', `{% form '${type}' %} — not a Shopify form type`, 'theme-suspect');
      const { action, id, extra } = def ? def(obj, st) : { action: '#', id: type, extra: '' };
      const formDrop = st.formDrop(type, obj);
      const returnTo = attrs.return_to; delete attrs.return_to;
      const attrStr = Object.entries({ id: attrs.id || id, ...attrs }).filter(([k]) => k !== 'id' || true).map(([k, v]) => (v === '' || v === true ? ` ${k}` : ` ${k}="${escapeHtml(v)}"`)).join('');
      emitter.write(`<form method="post" action="${st.view.prefix}${action}" accept-charset="UTF-8"${attrStr.replace(/ id="[^"]*"/, '')} id="${escapeHtml(attrs.id || id)}"${type === 'product' ? ' enctype="multipart/form-data"' : ''}><input type="hidden" name="form_type" value="${type}" /><input type="hidden" name="utf8" value="✓" />${returnTo ? `<input type="hidden" name="return_to" value="${escapeHtml(returnTo)}" />` : ''}${extra || ''}`);
      ctx.push({ form: formDrop });
      try { yield this.liquid.renderer.renderTemplates(this.tpls, ctx, emitter); } finally { ctx.pop(); }
      emitter.write('</form>');
    }
  });

  // {% paginate collection.products by 12 %}
  liquid.registerTag('paginate', class extends Tag {
    constructor(token, remain, l) {
      super(token, remain, l);
      const m = /^\s*([\w.\[\]'"]+)\s+by\s+([\w.]+)(.*)$/.exec(token.args);
      if (!m) throw new Error(`bad paginate: ${token.args}`);
      this.path = m[1]; this.by = m[2]; this.rest = m[3];
      this.tpls = [];
      const s = l.parser.parseStream(remain).on('tag:endpaginate', () => s.stop()).on('template', (t) => this.tpls.push(t)).on('end', () => { throw new Error('paginate not closed'); });
      s.start();
    }
    *render(ctx, emitter) {
      const parts = this.path.split('.');
      const key = parts.pop();
      const parent = parts.length ? yield ctx._get(parts) : null;
      const size = Math.min(250, Number(/^\d+$/.test(this.by) ? this.by : yield ctx._get(this.by.split('.'))) || 50);
      const st = S();
      let total = 0;
      if (parent?.__list && key === 'products') total = parent.__list.length;
      else if (parent?.__orders_all && key === 'orders') total = parent.__orders_all.length;
      else if (parent?.__results && key === 'results') total = parent.__results.length;
      else warn('paginate', `paginate over '${this.path}' not emulated`, 'harness-gap');
      const pages = Math.max(1, Math.ceil(total / size));
      const cur = Math.max(1, parseInt(st.req.query.page, 10) || 1);
      const offset = (cur - 1) * size;
      const prev = parent ? parent.__page : null;
      if (parent) parent.__page = { offset, limit: size };
      const pageUrl = (n) => { const q = new URLSearchParams(st.req.query); q.set('page', n); return `${st.req.pathOnly}?${q}`; };
      const pg = new SDrop('paginate', {
        current_page: cur, current_offset: offset, items: total, page_size: size, pages, page_param: 'page',
        previous: cur > 1 ? new SDrop('part', { title: '« Previous', url: pageUrl(cur - 1), is_link: true }) : null,
        next: cur < pages ? new SDrop('part', { title: 'Next »', url: pageUrl(cur + 1), is_link: true }) : null,
        parts: Array.from({ length: pages }, (_, i) => new SDrop('part', { title: String(i + 1), url: pageUrl(i + 1), is_link: i + 1 !== cur })),
      });
      if (cur > pages && total) warn('paginate', `?page=${cur} beyond last page ${pages}`, 'info');
      ctx.push({ paginate: pg });
      try { yield this.liquid.renderer.renderTemplates(this.tpls, ctx, emitter); } finally { ctx.pop(); if (parent) parent.__page = prev; }
    }
  });

  return liquid;
}

/* ── form types → action/id ──────────────────────────────────────────── */
const FORM_TYPES = {
  product: (p) => ({ action: '/cart/add', id: `product_form_${p?.id || ''}` }),
  customer_login: () => ({ action: '/account/login', id: 'customer_login' }),
  create_customer: () => ({ action: '/account', id: 'create_customer' }),
  recover_customer_password: () => ({ action: '/account/recover', id: 'recover_customer_password' }),
  reset_customer_password: (o, st) => ({ action: '/account/reset', id: 'reset_customer_password', extra: `<input type="hidden" name="token" value="${st.req.resetToken || ''}" /><input type="hidden" name="id" value="${st.req.resetId || ''}" />` }),
  activate_customer_password: (o, st) => ({ action: '/account/activate', id: 'activate_customer_password', extra: `<input type="hidden" name="token" value="${st.req.resetToken || ''}" /><input type="hidden" name="id" value="${st.req.resetId || ''}" />` }),
  customer_address: (a) => (a && a.id ? { action: `/account/addresses/${a.id}`, id: `address_form_${a.id}`, extra: '<input type="hidden" name="_method" value="put" />' } : { action: '/account/addresses', id: 'address_form_new' }),
  contact: () => ({ action: '/contact#contact_form', id: 'contact_form' }),
  customer: () => ({ action: '/contact#contact_form', id: 'contact_form', extra: '<input type="hidden" name="contact[tags]" value="newsletter" />' }),
  localization: () => ({ action: '/localization', id: 'localization_form', extra: '<input type="hidden" name="_method" value="put" />' }),
  storefront_password: () => ({ action: '/password', id: 'login_form' }),
  guest_login: () => ({ action: '/account/login', id: 'customer_login_guest', extra: '<input type="hidden" name="guest" value="true" />' }),
  new_comment: () => ({ action: '/comments', id: 'comment_form' }),
  cart: () => ({ action: '/cart', id: 'cart' }),
  currency: () => ({ action: '/cart/update', id: 'currency_form' }),
};

/** Shopify objects → plain JSON (cart/product drops know their AJAX shape). */
export function toJsonable(v, depth = 0) {
  if (v == null) return null;
  if (depth > 6) return null;
  if (typeof v?.toJSON === 'function') return v.toJSON();
  if (Array.isArray(v)) return v.map((x) => toJsonable(x, depth + 1));
  if (v instanceof Drop) {
    const o = {};
    for (const [k, val] of Object.entries(v)) if (!k.startsWith('__') && typeof val !== 'function') o[k] = toJsonable(val, depth + 1);
    return o;
  }
  return v;
}

export { ImageUrl, escapeHtml };
