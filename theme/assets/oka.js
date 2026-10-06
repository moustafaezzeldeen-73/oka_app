/*
 * OKA theme — core.
 *
 * The app's state/store.js, data.js (STR), lib/rtl.js, lib/catalogueQuery.js,
 * lib/haptics.js and its overlays (age gate, AR, Alert.alert), rebuilt on the
 * Shopify storefront: the cart is Shopify's own (Cart AJAX API), the
 * catalogue comes from /collections/all?view=oka-data, and every policy
 * number comes from theme settings (window.OKA).
 */
(function () {
  'use strict';

  const CFG = window.OKA || {};
  const html = document.documentElement;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ── storage that never throws (private mode, blocked cookies) ───────── */
  const store = {
    get(k, fallback = null) {
      try {
        const v = localStorage.getItem(k);
        return v == null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
    sget(k, fallback = null) {
      try {
        const v = sessionStorage.getItem(k);
        return v == null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    sset(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };

  /* ── language (lib/rtl.js + the store's toggleLang) ──────────────────── */
  const lang = () => (html.lang === 'en' ? 'en' : 'ar');
  const isRtl = () => lang() === 'ar';
  function setLang(l) {
    html.lang = l;
    html.dir = l === 'ar' ? 'rtl' : 'ltr';
    try { localStorage.setItem('oka.lang', l); } catch (e) {}
    applyAttrs();
    document.dispatchEvent(new CustomEvent('oka:lang'));
  }
  const toggleLang = () => setLang(isRtl() ? 'en' : 'ar');
  const langLabel = () => (isRtl() ? 'EN' : 'ع');

  /** Placeholders and labels that can't hold two spans. */
  function applyAttrs(root = document) {
    const l = lang();
    $$('[data-ph-en]', root).forEach((el) => { el.placeholder = el.dataset[l === 'ar' ? 'phAr' : 'phEn'] || el.dataset.phEn; });
    $$('[data-lang-label]', root).forEach((el) => { el.textContent = langLabel(); });
  }

  const arDigits = (s) => String(s).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]);
  const num = (n) => (isRtl() ? arDigits(n) : String(n));
  const fmtPrice = (n) => (isRtl() ? `${arDigits(Math.round(n))} ج.م` : `EGP ${Math.round(n)}`);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /** Pick the shopper's language from an {en, ar} pair or two arguments. */
  const L = (en, ar) => (isRtl() ? (ar ?? en) : en);

  /* ── STR, verbatim from app/src/data.js ──────────────────────────────── */
  const STR = {
    en: {
      search: 'Search hookahs, bowls & accessories', add: 'Add', productsCount: 'products',
      noMatch: 'No products in this category', inStock: 'In stock', onlyLeft: 'Only {n} left', outOfStock: 'Out of stock',
      freeShipProgress: 'Add {n} EGP more for a lower delivery fee', freeShipReached: 'Lower delivery fee unlocked',
      shipCheaper: 'Add {n} EGP more and shipping drops to {p}', shipBest: 'Shipping {p} — the best rate for your area',
      shipFreeProgress: 'Add {n} EGP more for free shipping', shipFree: 'This order ships free',
      qty: 'Quantity', customize: 'Customize', addToCart: 'Add to Cart',
      estDelivery: 'Estimated delivery', shippingFee: 'Shipping fee', payMethods: 'Cash on delivery', description: 'Description',
      pointsNote: 'Earn ~{n} points when delivered', related: 'You may also like',
      cartTitle: 'Cart', emptyCart: 'Your cart is empty', browse: 'Browse best sellers',
      subtotal: 'Subtotal', discount: 'Discount', shipping: 'Shipping', total: 'Total',
      earnOnDelivery: "You'll earn {n} points on delivery",
      discountPlaceholder: 'Discount code', apply: 'Apply', applied: 'Applied', checkout: 'Checkout',
      change: 'Change', paymentTitle: 'Payment method', cod: 'Cash on Delivery', card: 'Card', wallet: 'Mobile Wallet',
      codNote: 'Have this amount ready for the courier', placeOrder: 'Place Order', orderNumber: 'Order number',
      myAddresses: 'My addresses', myWishlist: 'Wishlist', loyaltyRow: 'Loyalty points', faq: 'Help & support', legal: 'Policies',
      all: 'All',
    },
    ar: {
      search: 'دوّر على شيشة، بولّات وإكسسوارات', add: 'عبيلي فالشنطة', productsCount: 'منتج',
      noMatch: 'مفيش منتجات هنا لسه', inStock: 'متوفر', onlyLeft: 'فاضل {n} بس', outOfStock: 'خلصان',
      freeShipProgress: 'ضيف {n} ج.م والشحن يقل', freeShipReached: 'خدت أقل سعر شحن',
      shipCheaper: 'ضيف {n} ج.م كمان والشحن ينزل لـ {p}', shipBest: 'الشحن {p} — أقل سعر لمنطقتك',
      shipFreeProgress: 'ضيف {n} ج.م كمان والشحن يبقى ببلاش', shipFree: 'الطلب ده شحنه مجاني',
      qty: 'العدد', customize: 'اختار', addToCart: 'عبيلي فالشنطة',
      estDelivery: 'هيوصلك إمتى', shippingFee: 'مصاريف الشحن', payMethods: 'كاش عند الاستلام', description: 'التفاصيل',
      pointsNote: 'هتاخد ~{n} نقطة لما يوصلك', related: 'ممكن يعجبك كمان',
      cartTitle: 'السلة', emptyCart: 'سلتك فاضية', browse: 'شوف الأكتر مبيعاً',
      subtotal: 'المجموع قبل الشحن', discount: 'الخصم', shipping: 'الشحن', total: 'الإجمالي',
      earnOnDelivery: 'هتاخد {n} نقطة لما يوصلك',
      discountPlaceholder: 'كود الخصم', apply: 'فعّل', applied: 'اتفعّل', checkout: 'الدفع',
      change: 'غيّر', paymentTitle: 'هتدفع إزاي', cod: 'كاش عند الاستلام', card: 'كارت', wallet: 'محفظة موبايل',
      codNote: 'جهّز المبلغ ده للمندوب', placeOrder: 'أكّد الطلب', orderNumber: 'رقم الطلب',
      myAddresses: 'عناويني', myWishlist: 'المفضلة', loyaltyRow: 'نقاطي', faq: 'محتاج مساعدة؟', legal: 'الشروط والسياسات',
      all: 'الكل',
    },
  };
  /** `t()` from useDerived: substitutes {vars}, Arabic digits in Arabic. */
  function t(key, vars) {
    let s = STR[lang()][key] || key;
    if (vars) Object.keys(vars).forEach((k) => { s = s.replace(`{${k}}`, vars[k]); });
    return isRtl() ? arDigits(s) : s;
  }

  /* ── haptics (lib/haptics.js) — the Vibration API where it exists ────── */
  const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  const vib = (ms) => { if (canVibrate) { try { navigator.vibrate(ms); } catch (e) {} } };
  const haptic = {
    snapCollection: () => vib(15),
    snapNotch: () => vib(6),
    selectionTick: () => vib(4),
    success: () => vib([10, 40, 14]),
  };

  /* ── governorates (server/config/zones.js) ───────────────────────────── */
  const ZONE_ETA = { metro: [1, 2], delta: [2, 3], far: [3, 5] };
  const PROVINCES = [
    ['C', 'Cairo', 'القاهرة', 'metro'], ['GZ', 'Giza', 'الجيزة', 'metro'], ['SU', '6th of October', '٦ أكتوبر', 'metro'],
    ['HU', 'Helwan', 'حلوان', 'metro'], ['ALX', 'Alexandria', 'الإسكندرية', 'metro'],
    ['KB', 'Qalyubia', 'القليوبية', 'delta'], ['DK', 'Dakahlia', 'الدقهلية', 'delta'], ['DT', 'Damietta', 'دمياط', 'delta'],
    ['FYM', 'Faiyum', 'الفيوم', 'delta'], ['IS', 'Ismailia', 'الإسماعيلية', 'delta'], ['KFS', 'Kafr el-Sheikh', 'كفر الشيخ', 'delta'],
    ['MNF', 'Monufia', 'المنوفية', 'delta'], ['PTS', 'Port Said', 'بورسعيد', 'delta'], ['SUZ', 'Suez', 'السويس', 'delta'],
    ['SHR', 'Al Sharqia', 'الشرقية', 'delta'], ['BH', 'Beheira', 'البحيرة', 'delta'], ['GH', 'Gharbia', 'الغربية', 'delta'],
    ['ASN', 'Aswan', 'أسوان', 'far'], ['AST', 'Asyut', 'أسيوط', 'far'], ['BNS', 'Beni Suef', 'بني سويف', 'far'],
    ['LX', 'Luxor', 'الأقصر', 'far'], ['MN', 'Minya', 'المنيا', 'far'], ['KN', 'Qena', 'قنا', 'far'], ['SHG', 'Sohag', 'سوهاج', 'far'],
    ['MT', 'Matrouh', 'مطروح', 'far'], ['WAD', 'New Valley', 'الوادي الجديد', 'far'], ['SIN', 'North Sinai', 'شمال سيناء', 'far'],
    ['JS', 'South Sinai', 'جنوب سيناء', 'far'], ['BA', 'Red Sea', 'البحر الأحمر', 'far'],
  ].map(([code, en, ar, zone]) => ({ code, en, ar, zone, minDays: ZONE_ETA[zone][0], maxDays: ZONE_ETA[zone][1] }));

  const fold = (s) => String(s ?? '').toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)))
    .replace(/\s+/g, ' ').trim();

  function provinceOf(addr) {
    if (!addr) return null;
    const code = String(addr.provinceCode || '').toUpperCase();
    const byCode = PROVINCES.find((p) => p.code === code);
    if (byCode) return byCode;
    const hay = fold(`${addr.province || ''} ${addr.city || ''}`);
    return PROVINCES.find((p) => hay && (hay.includes(fold(p.en)) || hay.includes(fold(p.ar)))) || null;
  }
  const provinceName = (code) => { const p = PROVINCES.find((x) => x.code === code); return p ? L(p.en, p.ar) : ''; };

  /* ── addresses: the account's, and which one the next order ships to ─── */
  const customer = CFG.customer || null;
  const addresses = () => (customer && customer.addresses) || [];
  const selectedAddress = () => {
    const list = addresses();
    const id = store.get('oka.addr');
    return list.find((a) => String(a.id) === String(id)) || list.find((a) => a.isDefault) || list[0] || null;
  };
  const selectAddress = (id) => store.set('oka.addr', id);

  /* ── shipping (useDerived: shippingFor / shipBar / etaFor) ───────────── */
  function zoneFees(addr = selectedAddress()) {
    const zone = provinceOf(addr)?.zone || 'metro';
    return CFG.zones?.[zone] || CFG.zones?.metro || { under: 60, over: 36 };
  }
  const shippingFor = (merch, addr) => {
    const f = zoneFees(addr);
    return merch >= CFG.tier ? f.over : f.under;
  };
  /** The "spend a little more" bar — names the next cheaper rate, as the live app does. */
  function shipBar(merch, addr) {
    const f = zoneFees(addr);
    const tier = CFG.tier || 300;
    if (merch < tier) {
      const remaining = Math.max(0, Math.ceil(tier - merch));
      return {
        pct: Math.min(100, Math.round((merch / tier) * 100)),
        text: f.over === 0 ? t('shipFreeProgress', { n: remaining }) : t('shipCheaper', { n: remaining, p: fmtPrice(f.over) }),
      };
    }
    return { pct: 100, text: f.over === 0 ? t('shipFree') : t('shipBest', { p: fmtPrice(f.over) }) };
  }
  const days = (min, max) => (isRtl() ? `${arDigits(min)}-${arDigits(max)} ${max > 2 ? 'أيام' : 'يوم'}` : `${min}–${max} days`);
  const etaFor = (addr) => { const p = provinceOf(addr); return p ? days(p.minDays, p.maxDays) : days(1, 5); };

  /* ── cart (Shopify's own, through the Cart AJAX API) ─────────────────── */
  let cartState = null;
  async function cartFetch(url, body) {
    const res = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.description || json.message || `HTTP ${res.status}`);
    return json;
  }
  async function getCart(force = false) {
    if (cartState && !force) return cartState;
    cartState = await cartFetch('/cart.js');
    renderBadges();
    return cartState;
  }
  function setCart(c) {
    cartState = c;
    renderBadges();
    document.dispatchEvent(new CustomEvent('oka:cart', { detail: c }));
    return c;
  }
  async function addToCart(variantId, qty = 1, { silent = false } = {}) {
    try {
      await cartFetch('/cart/add.js', { items: [{ id: Number(variantId), quantity: qty }] });
      const c = setCart(await cartFetch('/cart.js'));
      haptic.success();
      if (!silent) addedFeedback();
      return c;
    } catch (err) {
      okaAlert(L('Could not add', 'معرفناش نضيفه'), String(err.message || err));
      throw err;
    }
  }
  async function addManyToCart(items) {
    await cartFetch('/cart/add.js', { items: items.map((i) => ({ id: Number(i.variantId), quantity: i.quantity })) });
    return setCart(await cartFetch('/cart.js'));
  }
  async function changeLine(key, quantity) {
    return setCart(await cartFetch('/cart/change.js', { id: key, quantity }));
  }
  async function applyDiscount(code) {
    return setCart(await cartFetch('/cart/update.js', { discount: code }));
  }
  const cartCount = () => (cartState ? cartState.item_count : 0);
  const cartQtyOf = (variantId) =>
    (cartState?.items || []).filter((i) => String(i.variant_id) === String(variantId)).reduce((a, i) => a + i.quantity, 0);
  /** What the app calls subtotalRaw / discountRaw / merchRaw, in whole EGP. */
  function cartTotals(c = cartState) {
    const subtotal = c ? c.original_total_price / 100 : 0;
    const merch = c ? c.total_price / 100 : 0;
    return { subtotal, discount: Math.max(0, subtotal - merch), merch };
  }
  function renderBadges() {
    const n = cartCount();
    $$('[data-cart-count]').forEach((b) => {
      const was = b.dataset.count;
      b.dataset.count = String(n);
      b.textContent = n > 0 ? num(n) : '';
      if (String(n) !== was && n > 0) { b.style.animation = 'none'; void b.offsetWidth; b.style.animation = ''; }
    });
  }
  /** Stands in for the success haptic where there is none (desktop, iOS Safari). */
  function addedFeedback() {
    if (canVibrate && matchMedia('(pointer: coarse)').matches) return;
    toast(L('Added to cart', 'اتضاف للسلة'));
  }
  function toast(text) {
    const app = $('#app');
    if (!app) return;
    $$('.toast', app).forEach((x) => x.remove());
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    app.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }

  /* ── catalogue (GET /catalogue → /collections/all?view=oka-data) ─────── */
  let cataloguePromise = null;
  function loadCatalogue() {
    if (cataloguePromise) return cataloguePromise;
    const cached = store.sget('oka.catalogue');
    if (cached && Date.now() - cached.at < 60 * 1000) {
      cataloguePromise = Promise.resolve(cached.data);
      return cataloguePromise;
    }
    cataloguePromise = fetch(CFG.catalogueUrl, { credentials: 'same-origin' })
      .then((r) => r.text())
      .then((txt) => {
        const data = JSON.parse(txt);
        store.sset('oka.catalogue', { at: Date.now(), data });
        return data;
      })
      .catch((err) => {
        console.error('[oka] catalogue failed:', err);
        cataloguePromise = null;
        return { cats: [], products: [] };
      });
    return cataloguePromise;
  }
  const ptitle = (p) => (p ? L(p.titleEn, p.titleAr) : '');
  const pdesc = (p) => (p ? L(p.descEn, p.descAr) : '');

  /** lib/catalogueQuery.js — Arabic folded the way people type it. */
  function searchProducts(products, query) {
    const words = fold(query).split(' ').filter(Boolean);
    if (!words.length) return [];
    const scored = [];
    for (const p of products) {
      const title = fold(`${p.titleEn} ${p.titleAr}`);
      const body = fold(`${p.descEn} ${p.descAr} ${p.cat}`);
      if (!words.every((w) => title.includes(w) || body.includes(w))) continue;
      scored.push([words.reduce((a, w) => a + (title.includes(w) ? 2 : 1), 0), p]);
    }
    return scored.sort((a, b) => b[0] - a[0]).map(([, p]) => p);
  }

  /* ── wishlist (saved per device, and on the account through the service) ─ */
  const wishlist = {
    all: () => store.get('oka.wishlist', {}),
    has: (id) => Boolean(wishlist.all()[id]),
    toggle(id) {
      const w = wishlist.all();
      if (w[id]) delete w[id]; else w[id] = true;
      store.set('oka.wishlist', w);
      if (CFG.proxy && customer) api('/customer/wishlist', { method: 'POST', body: { ids: Object.keys(w) } }).catch(() => {});
      return Boolean(w[id]);
    },
  };

  /** Fill every [data-heart] whose product is saved; empty the rest. */
  function paintHearts(root = document) {
    $$('[data-heart]', root).forEach((b) => {
      const on = wishlist.has(b.dataset.heart);
      b.classList.toggle('on', on);
      const path = b.querySelector('path');
      if (path) path.setAttribute('fill', on ? 'currentColor' : 'none');
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-heart]');
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    const on = wishlist.toggle(b.dataset.heart);
    haptic.selectionTick?.();
    paintHearts();
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
    toast(on ? L('Saved to your wishlist', 'اتحفظ في المفضلة') : L('Removed from your wishlist', 'اتشال من المفضلة'));
  }, true);
  // Cards rendered later (search, wishlist, cart) get painted as they appear.
  if ('MutationObserver' in window) {
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; paintHearts(); });
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  document.addEventListener('DOMContentLoaded', () => paintHearts());

  /* ── Back button: come back to the same spot ───────────────────────────
   * The pages scroll inside their own containers (the home feed, each
   * screen, the sideways rails), so the browser can't restore them itself.
   * Their positions are saved per URL when the page is left and put back
   * when it's reached again with Back/Forward.
   */
  const SCROLL_GROUPS = { feed: '[data-feed]', screen: '.screen', rail: '[data-rail], .hscroll' };
  const scrollKey = () => `oka.scroll:${location.pathname}${location.search}`;
  function saveScroll() {
    const pos = {};
    Object.entries(SCROLL_GROUPS).forEach(([g, sel]) => {
      $$(sel).forEach((el, i) => {
        if (el.scrollTop || el.scrollLeft) pos[`${g}${i}`] = [el.scrollTop, el.scrollLeft];
      });
    });
    store.sset(scrollKey(), pos);
  }
  function restoreScroll() {
    const pos = store.sget(scrollKey(), null);
    if (!pos) return;
    let pending = Object.keys(pos).length;
    Object.entries(SCROLL_GROUPS).forEach(([g, sel]) => {
      $$(sel).forEach((el, i) => {
        const p = pos[`${g}${i}`];
        if (!p || el.dataset.okaRestored) return;
        // Content rendered later (catalogue, cart) may not be tall enough yet.
        if (el.scrollHeight - el.clientHeight < p[0] - 2 || el.scrollWidth - el.clientWidth < Math.abs(p[1]) - 2) return;
        el.scrollTop = p[0];
        el.scrollLeft = p[1];
        el.dataset.okaRestored = '1';
        pending -= 1;
      });
    });
    return pending;
  }
  const navType = (() => {
    try { return performance.getEntriesByType('navigation')[0]?.type || ''; } catch (e) { return ''; }
  })();
  window.addEventListener('pagehide', saveScroll);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveScroll(); });
  if (navType === 'back_forward') {
    // Try a few times: screens and their lists finish rendering at different moments.
    const tries = [0, 120, 400, 900, 1600];
    window.addEventListener('load', () => tries.forEach((ms) => setTimeout(() => requestAnimationFrame(restoreScroll), ms)));
  }

  /* ── the OKA order service, through a Shopify App Proxy ──────────────── */
  async function api(path, { method = 'GET', body } = {}) {
    if (!CFG.proxy) throw new Error('service-not-configured');
    const base = CFG.proxy.replace(/\/$/, '');
    const res = await fetch(base + path, {
      method,
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const txt = await res.text();
    let json;
    try { json = JSON.parse(txt); } catch (e) { throw new Error(L('The service returned an unexpected answer.', 'حصلت مشكلة من عندنا، جرّب تاني.')); }
    if (!res.ok) {
      const err = new Error(json.error || `HTTP ${res.status}`);
      if (json.code) err.code = json.code;
      throw err;
    }
    return json;
  }
  const hasService = () => Boolean(CFG.proxy);

  /* ── sign-in routing (requireSignIn / afterSignIn) ───────────────────── */
  function requireSignIn(next) {
    store.set('oka.afterSignIn', next || location.pathname + location.search);
    location.href = CFG.routes.login;
  }
  function resumeAfterSignIn() {
    if (!customer) return;
    const next = store.get('oka.afterSignIn');
    if (!next) return;
    store.del('oka.afterSignIn');
    if (next !== location.pathname + location.search) location.replace(next);
  }

  /* ── navigation helpers ──────────────────────────────────────────────── */
  function goBack(fallback) {
    const sameOrigin = document.referrer && new URL(document.referrer).origin === location.origin;
    if (sameOrigin && history.length > 1) history.back();
    else location.href = fallback || CFG.routes.root;
  }
  const whatsappUrl = (text) =>
    `https://wa.me/${String(CFG.whatsapp || '').replace(/\D/g, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

  /* ── Alert.alert, iOS style ──────────────────────────────────────────── */
  function okaAlert(title, message, buttons) {
    const btns = buttons && buttons.length ? buttons : [{ text: L('OK', 'تمام') }];
    return new Promise((resolve) => {
      const app = $('#app') || document.body;
      const scrim = document.createElement('div');
      scrim.className = 'alert-scrim';
      scrim.innerHTML = `<div class="alert" role="alertdialog" aria-modal="true">
        <div class="alert-body"><div class="alert-title">${esc(title)}</div>${message ? `<div class="alert-msg">${esc(message)}</div>` : ''}</div>
        <div class="alert-btns${btns.length > 2 ? ' stack' : ''}">${btns
          .map((b, i) => `<button class="alert-btn ${b.style || ''}" data-i="${i}">${esc(b.text)}</button>`)
          .join('')}</div></div>`;
      scrim.addEventListener('click', (e) => {
        const b = e.target.closest('.alert-btn');
        if (!b) return;
        const btn = btns[+b.dataset.i];
        scrim.remove();
        resolve(btn);
        if (btn.onPress) btn.onPress();
      });
      app.appendChild(scrim);
    });
  }

  /* ── age gate (overlays/AgeGate.js) ──────────────────────────────────── */
  function ageGate() {
    if (!CFG.ageGate || store.get('oka.age')) return;
    const app = $('#app');
    const el = document.createElement('div');
    el.className = 'overlay age-gate';
    el.innerHTML = `<div class="age-card fade-in">
      <div class="age-title"><span class="l-en">Are you 18 or older?</span><span class="l-ar">عندك ١٨ سنة أو أكتر؟</span></div>
      <div class="age-body"><span class="l-en">Some OKA products contain tobacco and are sold to adults only.</span><span class="l-ar">شوية من منتجات أوكا فيها دخان، وبنبيعها للكبار بس.</span></div>
      <button class="cta" data-yes><span class="l-en">Yes, I’m 18+</span><span class="l-ar">أيوه، عندي ١٨+</span></button>
      <button class="age-lang" data-lang><span class="l-en">العربية</span><span class="l-ar">English</span></button>
    </div>`;
    el.querySelector('[data-yes]').onclick = () => { store.set('oka.age', true); el.remove(); };
    el.querySelector('[data-lang]').onclick = toggleLang;
    app.appendChild(el);
  }

  /* ── AR: "See it on your table" (ArOverlay.js + ArViewer.js) ─────────── */
  let modelViewerLoading = null;
  function loadModelViewer() {
    if (window.customElements && customElements.get('model-viewer')) return Promise.resolve();
    if (modelViewerLoading) return modelViewerLoading;
    modelViewerLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.type = 'module';
      s.src = 'https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return modelViewerLoading;
  }

  async function openAr(handle) {
    const cat = await loadCatalogue();
    const p = cat.products.find((x) => x.id === handle);
    if (!p) return;
    const app = $('#app');
    const el = document.createElement('div');
    el.className = 'overlay ar';
    const hasModel = Boolean(p.glbUrl);
    const stockText = p.stock === 0 ? t('outOfStock') : p.stock <= 5 ? t('onlyLeft', { n: p.stock }) : t('inStock');
    const def = addresses().find((a) => a.isDefault);
    el.innerHTML = `
      <div class="ar-table"></div><div class="ar-horizon"></div>
      <div class="ar-top">
        <button class="ar-close s94 press" data-close aria-label="Close"><svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="#fff" stroke-width="2.1" stroke-linecap="round"/></svg></button>
        <div class="ar-status"><i></i>${esc(L('Surface detected', 'لقينا السطح'))}</div>
      </div>
      <div class="ar-stage">
        <div class="ar-object">
          ${p.img ? `<img src="${esc(p.img)}" alt="">` : ''}
          <div class="ar-scale"><svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 3v18M3 12h18" stroke="#fff" stroke-width="1.9" stroke-linecap="round"/></svg>${esc(L('Shown at actual size', 'بحجمها الحقيقي'))}</div>
        </div>
        <div class="ar-contact"></div>
      </div>
      ${hasModel
        ? `<div class="ar-live">
            <button class="ar-live-btn s97 press" data-live><svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" stroke="#1d1d1f" stroke-width="1.7" stroke-linejoin="round"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9" stroke="#1d1d1f" stroke-width="1.7" stroke-linejoin="round"/></svg>${esc(L('View in your space', 'شوفها في مكانك بالكاميرا'))}</button>
            <div class="ar-live-hint">${esc(L('Opens your camera and places it at real size', 'هتفتح الكاميرا وتحط المنتج بحجمه الحقيقي'))}</div>
          </div>`
        : `<div class="ar-controls">${[
            ['⤢', L('Drag to move', 'اسحب عشان تحركها')],
            ['⟳', L('Twist to rotate', 'لف بصباعين')],
            ['⤡', L('Pinch to scale', 'قرّب أو بعّد')],
          ].map(([g, label]) => `<div class="ar-control"><div class="ar-control-btn">${g}</div><span>${esc(label)}</span></div>`).join('')}</div>`}
      <div class="ar-panel-wrap"><div class="ar-panel">
        <div class="ar-head">
          <div style="flex:1;min-width:0"><div class="ar-title">${esc(ptitle(p))}</div><div class="ar-price">${esc(fmtPrice(p.price))}</div></div>
          <button class="ar-add s96 press" data-add>${esc(t('add'))}</button>
        </div>
        <div class="ar-rule"></div>
        <div class="ar-facts">
          <div class="ar-fact"><span>${esc(L('Price', 'السعر'))}</span><b>${esc(fmtPrice(p.price))}</b></div>
          <div class="ar-fact"><span>${esc(L('Delivery', 'التوصيل'))}</span><b>${esc(etaFor(def))}</b></div>
          <div class="ar-fact"><span>${esc(L('Availability', 'متاح؟'))}</span><b>${esc(stockText)}</b></div>
        </div>
      </div></div>`;

    const close = () => { el.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    el.querySelector('[data-close]').onclick = close;
    el.querySelector('[data-add]').onclick = () => { if (p.available !== false && p.stock !== 0) addToCart(p.variantId, 1); };
    app.appendChild(el);

    if (hasModel) {
      // The model floats over the scene, orbitable — the in-app viewer. The
      // button hands off to the platform's real AR (WebXR, Scene Viewer or
      // iOS Quick Look), which places it on a detected surface at real size.
      loadModelViewer().then(() => {
        if (!el.isConnected) return;
        const mv = document.createElement('model-viewer');
        mv.setAttribute('src', p.glbUrl);
        if (p.usdzUrl) mv.setAttribute('ios-src', p.usdzUrl);
        mv.setAttribute('alt', ptitle(p));
        ['ar', 'camera-controls', 'auto-rotate', 'touch-action'].forEach((a) => mv.setAttribute(a, a === 'touch-action' ? 'pan-y' : ''));
        mv.setAttribute('ar-modes', 'webxr scene-viewer quick-look');
        mv.setAttribute('ar-scale', 'fixed');
        mv.setAttribute('shadow-intensity', '1');
        mv.setAttribute('environment-image', 'neutral');
        mv.style.setProperty('--progress-bar-color', 'transparent');
        el.insertBefore(mv, el.querySelector('.ar-top'));
        el.classList.add('has-model');
        el.querySelector('[data-live]').onclick = () => {
          if (mv.canActivateAR) mv.activateAR();
          else okaAlert(L('AR isn’t available here', 'الكاميرا مش هتشتغل هنا'), L('Open this page on a phone to place it in your space. You can still turn the model around here.', 'افتح الصفحة دي من الموبايل عشان تحطها في مكانك. تقدر تلف الموديل هنا.'));
        };
      }).catch(() => {});
    }
  }

  /* ── side menu ───────────────────────────────────────────────────────────
   * Replaces the bottom tab bar. Opened from the edge handle or the home
   * header's ☰; closed by the scrim, the ✕, Escape, or a swipe back towards
   * the edge it came from. While closed it is `inert`, so its links are
   * neither tabbable nor read out.
   */
  let menuReturnFocus = null;
  function openMenu() {
    const app = $('#app');
    const menu = $('#side-menu');
    if (!app || !menu || app.classList.contains('menu-open')) return;
    menuReturnFocus = document.activeElement;
    menu.removeAttribute('inert');
    menu.setAttribute('aria-hidden', 'false');
    $$('[data-menu-open]').forEach((b) => b.setAttribute('aria-expanded', 'true'));
    $('.menu-scrim')?.removeAttribute('hidden');
    app.classList.add('menu-open');
    haptic.selectionTick();
    // The panel takes focus, not a link: focusing a link after a tap drew the
    // browser's blue focus ring around it.
    requestAnimationFrame(() => menu.focus({ preventScroll: true }));
  }
  function closeMenu() {
    const app = $('#app');
    const menu = $('#side-menu');
    if (!app || !menu || !app.classList.contains('menu-open')) return;
    app.classList.remove('menu-open');
    menu.setAttribute('inert', '');
    menu.setAttribute('aria-hidden', 'true');
    $$('[data-menu-open]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
    $('.menu-scrim')?.setAttribute('hidden', '');
    menuReturnFocus?.focus?.({ preventScroll: true });
  }
  /**
   * The logo bar shrinks while the page's own scroller is scrolled — the feed
   * on home, the `.screen` everywhere else. Horizontal rails are ignored.
   */
  function wireTopBar() {
    const bar = $('[data-top-bar]');
    if (!bar) return;
    let raf = 0;
    document.addEventListener('scroll', (e) => {
      const el = e.target;
      if (!(el instanceof Element) || !el.matches('.feed, .screen')) return;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        bar.classList.toggle('compact', el.scrollTop > 8);
      });
    }, { capture: true, passive: true });
  }

  function wireMenu() {
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
    // Swipe the drawer back towards its edge to close it.
    const menu = $('#side-menu');
    if (!menu) return;
    let x0 = null;
    let y0 = null;
    menu.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    menu.addEventListener('touchend', (e) => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0;
      const dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      const towardsEdge = isRtl() ? dx > 50 : dx < -50;
      if (towardsEdge && Math.abs(dx) > Math.abs(dy) * 1.5) closeMenu();
    }, { passive: true });
    // Going back to a page from the bfcache must not show the menu still open.
    window.addEventListener('pageshow', () => closeMenu());
  }

  /* ── global wiring ───────────────────────────────────────────────────── */
  function wire() {
    wireMenu();
    wireTopBar();
    document.addEventListener('click', (e) => {
      const back = e.target.closest('[data-back]');
      if (back) { e.preventDefault(); goBack(back.dataset.back); return; }

      const lt = e.target.closest('[data-toggle-lang]');
      if (lt) { e.preventDefault(); toggleLang(); return; }

      const ar = e.target.closest('[data-ar]');
      if (ar) { e.preventDefault(); openAr(ar.dataset.ar); return; }

      // A bundle offer: every variant in one cart call, so it lands whole or not at all.
      const bundle = e.target.closest('[data-add-bundle]');
      if (bundle) {
        e.preventDefault();
        if (bundle.disabled) return;
        const ids = bundle.dataset.addBundle.split(',').map((x) => x.trim()).filter(Boolean);
        if (!ids.length) return;
        bundle.disabled = true;
        addManyToCart(ids.map((variantId) => ({ variantId, quantity: 1 })))
          .then(() => { haptic.success?.(); toast(L('Bundle added to cart', 'العرض اتضاف للسلة')); })
          .catch(() => toast(L("Couldn't add this offer — part of it may be sold out", 'معرفناش نضيف العرض — ممكن حاجة منه تكون خلصت')))
          .finally(() => { bundle.disabled = false; });
        return;
      }

      const add = e.target.closest('[data-add]');
      if (add && add.dataset.add && !add.closest('.ar') && !add.hasAttribute('data-custom')) {
        e.preventDefault();
        if (add.hasAttribute('data-soldout')) return;
        addToCart(add.dataset.add, 1);
        return;
      }

      // A tracking page that can't take the AWB in its link: copy it for the shopper first.
      const copy = e.target.closest('[data-copy]');
      if (copy && copy.dataset.copy) {
        navigator.clipboard?.writeText(copy.dataset.copy).catch(() => {});
        toast(L(`AWB ${copy.dataset.copy} copied — paste it on the tracking page`, `اتنسخ رقم الشحنة ${copy.dataset.copy} — الصقه في صفحة التتبع`));
      }

      const signIn = e.target.closest('[data-sign-in]');
      if (signIn) { e.preventDefault(); requireSignIn(signIn.dataset.signIn || undefined); return; }

      const opener = e.target.closest('[data-menu-open]');
      if (opener) { e.preventDefault(); openMenu(); return; }
      const closer = e.target.closest('[data-menu-close]');
      if (closer) { e.preventDefault(); closeMenu(); return; }

      const link = e.target.closest('.side-link');
      if (link) {
        if (!link.classList.contains('active')) haptic.selectionTick();
        // Same page: just close. Elsewhere: let it navigate (the menu goes with the page).
        if (link.classList.contains('active')) { e.preventDefault(); closeMenu(); }
      }
    });

    document.addEventListener('oka:lang', () => renderBadges());
  }

  window.Oka = {
    CFG, $, $$, store, esc, L, t, lang, isRtl, setLang, toggleLang, langLabel, applyAttrs,
    arDigits, num, fmtPrice, fold, haptic,
    PROVINCES, provinceOf, provinceName, addresses, selectedAddress, selectAddress, customer,
    zoneFees, shippingFor, shipBar, etaFor, days,
    getCart, setCart, addToCart, addManyToCart, changeLine, applyDiscount, cartCount, cartQtyOf, cartTotals, toast,
    loadCatalogue, ptitle, pdesc, searchProducts, wishlist, paintHearts,
    api, hasService, requireSignIn, goBack, whatsappUrl, okaAlert, openAr,
    openMenu, closeMenu,
  };

  function init() {
    applyAttrs();
    wire();
    resumeAfterSignIn();
    ageGate();
    getCart().catch(() => {});
    // Warm the catalogue: search, the cart's rails and the AR overlay all read it.
    if ('requestIdleCallback' in window) requestIdleCallback(() => loadCatalogue());
    else setTimeout(loadCatalogue, 800);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
