/*
 * OKA theme — one controller per app screen.
 *
 * Each `[data-screen]` root gets the behaviour of the matching file in
 * app/src/screens. Liquid draws what it can (so pages work and index without
 * JS); the parts the app computed live — shipping bars, totals, the feed's
 * snapping — are driven here.
 */
(function () {
  'use strict';
  const O = window.Oka;
  if (!O) return;
  const { $, $$, esc, L, t, num, fmtPrice, CFG } = O;

  /* ── shared bits ─────────────────────────────────────────────────────── */
  const chevron = (size = 15) =>
    `<span class="flip" style="display:flex"><svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"><path d="M9 4l8 8-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
  const plusIcon = (size = 16, color = 'currentColor') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="${color}" stroke-width="2" stroke-linecap="round"/></svg>`;
  const spinner = (dark) => `<span class="spinner${dark ? ' dark' : ''}"></span>`;
  /** QtyStepper — `size` matches the three variants in the app. */
  const stepper = (qty, { size = 32, fs = 16, gap = 10, attrs = '' } = {}) =>
    `<div class="stepper${size < 28 ? ' small' : ''}" style="--sz:${size}px;--fs:${fs}px;--gap:${gap}px">
      <button class="step-btn" data-step="-1" ${attrs} aria-label="Less">–</button>
      <span class="step-qty">${esc(num(qty))}</span>
      <button class="step-btn" data-step="1" ${attrs} aria-label="More">+</button>
    </div>`;
  const sumRow = (label, value, cls = '') => `<div class="sum-row ${cls}"><span>${esc(label)}</span><span>${esc(value)}</span></div>`;
  const img = (src, alt = '') => (src ? `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy">` : '');
  const gridCard = (p) => `<div class="gcard">
      <a href="${esc(p.url)}" class="gcard-img">${img(p.img, p.titleEn)}</a>
      <div class="gcard-body">
        <a href="${esc(p.url)}" class="gcard-title">${esc(O.ptitle(p))}</a>
        <div class="gcard-row">
          <span class="gcard-price">${esc(fmtPrice(p.price))}</span>
          <button class="gcard-add" data-add="${p.variantId}"${p.stock === 0 || p.available === false ? ' data-soldout' : ''} aria-label="Add">+</button>
        </div>
      </div>
    </div>`;
  const grid = (products) => `<div class="grid">${products.map(gridCard).join('')}</div>`;
  const qs = (k) => new URLSearchParams(location.search).get(k);
  const go = (url) => { location.href = url; };
  const onLang = (fn) => document.addEventListener('oka:lang', fn);
  const onCart = (fn) => document.addEventListener('oka:cart', fn);
  const inlineCart = (root) => {
    const el = $('[data-cart-json]', root.parentElement || document);
    if (!el) return null;
    try { return O.setCart(JSON.parse(el.textContent)); } catch (e) { return null; }
  };
  const errText = (err) => String(err?.message ?? err);

  /**
   * Mouse drag for horizontal rails. Touch scrolls them natively; this gives
   * a desktop mouse the same grab-and-fling the phone gets, and swallows the
   * click that would otherwise follow a drag.
   */
  function dragScroll(el) {
    let down = null;
    let moved = false;
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      down = { x: e.clientX, left: el.scrollLeft };
      moved = false;
    });
    window.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dx = e.clientX - down.x;
      if (!moved && Math.abs(dx) > 6) {
        moved = true;
        el.style.scrollSnapType = 'none';
        el.style.scrollBehavior = 'auto';
      }
      if (moved) el.scrollLeft = down.left - dx;
    });
    window.addEventListener('pointerup', () => {
      if (!down) return;
      down = null;
      if (moved) {
        el.style.scrollSnapType = '';
        el.style.scrollBehavior = '';
        // Let snapping settle the rail on the nearest item.
        const left = el.scrollLeft;
        el.scrollLeft = left + 1;
        el.scrollLeft = left;
      }
    });
    el.addEventListener('click', (e) => {
      if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; }
    }, true);
    el.addEventListener('dragstart', (e) => e.preventDefault());
  }

  /** The slot nearest the rail's centre — direction-agnostic. */
  function nearest(rail, slots) {
    const r = rail.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    let best = 0;
    let bestD = Infinity;
    slots.forEach((s, i) => {
      const sr = s.getBoundingClientRect();
      const d = Math.abs(sr.left + sr.width / 2 - cx);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  /* ════════════════════════════════════════════════════════════════════
   * Home — the collection feed (HomeScreen.js)
   * ════════════════════════════════════════════════════════════════════ */
  function home(root) {
    const feed = $('[data-feed]', root);
    const hdr = $('[data-home-hdr]', root);
    const pages = $$('.page', feed);
    let activePage = 0;

    /** One page per snap: titles, haptic, and the shrinking logo bar. */
    function setActive(k) {
      if (k === activePage) return;
      activePage = k;
      pages.forEach((el, j) => el.classList.toggle('active', j === k));
      O.haptic.snapCollection();
      const cmp = pages[k]?.hasAttribute('data-compare') ? pages[k] : null;
      if (cmp) nudge(cmp);
    }

    let raf = 0;
    feed.addEventListener('scroll', () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (!feed.clientHeight) return;
        hdr?.classList.toggle('compact', feed.scrollTop > 8);
        setActive(Math.max(0, Math.min(pages.length - 1, Math.round(feed.scrollTop / feed.clientHeight))));
      });
    }, { passive: true });

    // One notch per product, with a light tick on every notch.
    $$('[data-rail]', feed).forEach((rail) => {
      const slots = $$('[data-slot]', rail);
      let current = 0;
      let rraf = 0;
      rail.addEventListener('scroll', () => {
        if (rraf) return;
        rraf = requestAnimationFrame(() => {
          rraf = 0;
          const i = nearest(rail, slots);
          if (i === current) return;
          slots[current]?.classList.remove('active');
          slots[i]?.classList.add('active');
          current = i;
          O.haptic.snapNotch();
        });
      }, { passive: true });
      dragScroll(rail);
    });

    // Feed cards: one tap opens the product, two add it to the cart (DoublePress, 280ms).
    feed.addEventListener('click', (e) => {
      const card = e.target.closest('[data-tap]');
      if (!card) return;
      e.preventDefault();
      if (card._t) {
        clearTimeout(card._t);
        card._t = null;
        if (!card.hasAttribute('data-soldout')) O.addToCart(card.dataset.variant, 1);
        return;
      }
      card._t = setTimeout(() => { card._t = null; go(card.getAttribute('href')); }, 280);
    });

    /*
     * Before / after slider (snippets/compare-page.liquid). Sideways drags
     * move the divider; vertical ones are left to the feed (touch-action:
     * pan-y on the frame). A hidden range input carries keyboard and
     * screen-reader control.
     */
    function setPos(page, pct) {
      const v = Math.max(0, Math.min(100, pct));
      page.style.setProperty('--pos', `${v}%`);
      const r = $('[data-compare-range]', page);
      if (r) r.value = String(Math.round(v));
    }
    function nudge(page) {
      if (page._nudged || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      page._nudged = true;
      page.classList.add('nudging');
      setPos(page, 62);
      setTimeout(() => setPos(page, 38), 650);
      setTimeout(() => setPos(page, 50), 1300);
      setTimeout(() => page.classList.remove('nudging'), 1950);
    }
    $$('[data-compare]', feed).forEach((page) => {
      const frame = $('.compare-frame', page);
      const range = $('[data-compare-range]', page);
      let drag = null;
      const pctAt = (x) => {
        const r = frame.getBoundingClientRect();
        return ((x - r.left) / r.width) * 100;
      };
      frame.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, on: false }; });
      frame.addEventListener('pointermove', (e) => {
        if (!drag) return;
        if (!drag.on) {
          const dx = Math.abs(e.clientX - drag.x);
          const dy = Math.abs(e.clientY - drag.y);
          if (dy > dx && dy > 6) { drag = null; return; } // a feed scroll, not ours
          if (dx < 6) return;
          drag.on = true;
          page.classList.remove('nudging');
          frame.setPointerCapture?.(e.pointerId);
        }
        setPos(page, pctAt(e.clientX));
      });
      const end = () => { drag = null; };
      frame.addEventListener('pointerup', end);
      frame.addEventListener('pointercancel', end);
      range?.addEventListener('input', () => setPos(page, Number(range.value)));
    });
    if (pages[0]?.hasAttribute('data-compare')) nudge(pages[0]);

    onLang(() => requestAnimationFrame(() => {
      $$('[data-rail]', feed).forEach((rail) => {
        const slots = $$('[data-slot]', rail);
        rail.scrollLeft = 0;
        slots.forEach((s, k) => s.classList.toggle('active', k === 0));
      });
    }));
    // Keep the page snapped when the viewport changes height (or the phone turns).
    window.addEventListener('resize', () => { feed.scrollTop = activePage * feed.clientHeight; });
  }

  /* ════════════════════════════════════════════════════════════════════
   * Collection — sort chip + filters (CollectionScreen.js)
   * ════════════════════════════════════════════════════════════════════ */
  const SORTS = [
    { id: 'featured', en: 'Featured', ar: 'المميز' },
    { id: 'priceAsc', en: 'Price: low to high', ar: 'السعر: من الأقل' },
    { id: 'priceDesc', en: 'Price: high to low', ar: 'السعر: من الأعلى' },
  ];
  function collection(root) {
    const gridEl = $('[data-grid]', root);
    const items = $$('[data-item]', gridEl);
    const sortBtn = $('[data-sort]', root);
    let sortBy = O.store.sget('oka.sort', 'featured');
    const filters = O.store.sget('oka.filters', { inStock: false, onSale: false });

    function apply() {
      const visible = items.filter((el) =>
        (!filters.inStock || el.dataset.avail === 'true') && (!filters.onSale || el.dataset.sale === 'true'));
      const sorted = [...visible].sort((a, b) => {
        if (sortBy === 'priceAsc') return a.dataset.price - b.dataset.price;
        if (sortBy === 'priceDesc') return b.dataset.price - a.dataset.price;
        return a.dataset.idx - b.dataset.idx;
      });
      items.forEach((el) => { el.hidden = !visible.includes(el); });
      sorted.forEach((el) => gridEl.appendChild(el));
      const s = SORTS.find((x) => x.id === sortBy) || SORTS[0];
      sortBtn.textContent = `${L(s.en, s.ar)} ⇅`;
      $$('[data-filter]', root).forEach((b) => b.classList.toggle('on', Boolean(filters[b.dataset.filter])));
      $('[data-count-label]', root).textContent = `${num(visible.length)} ${t('productsCount')}`;
      $('[data-empty]', root).hidden = visible.length > 0;
      gridEl.hidden = visible.length === 0;
    }
    sortBtn.addEventListener('click', () => {
      O.haptic.selectionTick();
      const i = SORTS.findIndex((x) => x.id === sortBy);
      sortBy = SORTS[(i + 1) % SORTS.length].id;
      O.store.sset('oka.sort', sortBy);
      apply();
    });
    $$('[data-filter]', root).forEach((b) => b.addEventListener('click', () => {
      O.haptic.selectionTick();
      filters[b.dataset.filter] = !filters[b.dataset.filter];
      O.store.sset('oka.filters', filters);
      apply();
    }));
    apply();
    onLang(apply);
  }

  /* ════════════════════════════════════════════════════════════════════
   * Search (SearchScreen.js)
   * ════════════════════════════════════════════════════════════════════ */
  function search(root) {
    const input = $('[data-search]', root);
    const results = $('[data-results]', root);
    const cats = $('[data-cats]', root);
    async function render() {
      const q = input.value.trim();
      cats.hidden = Boolean(q);
      if (!q) { results.innerHTML = ''; return; }
      const { products } = await O.loadCatalogue();
      if (input.value.trim() !== q) return;
      const found = O.searchProducts(products, q);
      results.innerHTML = found.length
        ? `<div class="count" style="padding-top:0;padding-bottom:12px">${esc(`${num(found.length)} ${t('productsCount')}`)}</div>${grid(found)}`
        : `<div class="empty" style="color:var(--ink-soft);font-size:14px">${esc(L(`No results for “${q}”`, `مفيش نتايج لـ "${q}"`))}</div>`;
    }
    input.addEventListener('input', () => {
      const u = new URL(location.href);
      if (input.value.trim()) u.searchParams.set('q', input.value); else u.searchParams.delete('q');
      history.replaceState(null, '', u);
      render();
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
    render();
    onLang(render);
  }

  /* ════════════════════════════════════════════════════════════════════
   * Product (PdpScreen.js)
   * ════════════════════════════════════════════════════════════════════ */
  function product(root) {
    const d = root.dataset;
    const price = Number(d.price);
    const stock = Number(d.stock);
    const variant = d.variant;
    let qty = 1;

    const gallery = $('[data-gallery]', root);
    const dots = $$('.dot', root);
    if (gallery) {
      dragScroll(gallery);
      gallery.addEventListener('scroll', () => {
        const i = Math.round(Math.abs(gallery.scrollLeft) / gallery.clientWidth);
        dots.forEach((dot, k) => dot.classList.toggle('on', k === i));
      }, { passive: true });
    }

    const wishBtn = $('[data-wish]', root);
    const paintWish = () => {
      const svg = $('svg', wishBtn);
      if (svg) svg.setAttribute('fill', O.wishlist.has(d.handle) ? '#1d1d1f' : 'none');
    };
    wishBtn.addEventListener('click', () => { O.wishlist.toggle(d.handle); O.haptic.selectionTick(); paintWish(); });
    paintWish();

    $('[data-share]', root).addEventListener('click', async () => {
      const title = ($('.pdp-title .l-' + O.lang(), root) || $('.pdp-title', root)).textContent.trim();
      const text = `${title} — ${fmtPrice(price)}`;
      try {
        if (navigator.share) await navigator.share({ title, text, url: d.url });
        else {
          await navigator.clipboard.writeText(`${text}\n${d.url}`);
          O.toast(L('Link copied', 'اتنسخ اللينك'));
        }
      } catch (e) { /* the shopper closed the share sheet */ }
    });

    function paint() {
      $('[data-qty-val]', root).textContent = num(qty);
      const buyPrice = $('[data-buy-price]');
      if (buyPrice) buyPrice.textContent = fmtPrice(price * qty);
      const sub = O.cartTotals().subtotal + price * qty;
      const bar = O.shipBar(sub);
      $('[data-ship-pct]', root).style.width = `${bar.pct}%`;
      $('[data-ship-txt]', root).textContent = bar.text;
      const fee = O.shippingFor(sub);
      $('[data-fee]', root).textContent = fee === 0 ? t('shipFree') : fmtPrice(fee);
      $('[data-eta]', root).textContent = O.etaFor(O.selectedAddress());
    }
    $$('[data-qty]', root).forEach((b) => b.addEventListener('click', () => {
      const dir = Number(b.dataset.qty);
      qty = dir < 0 ? Math.max(1, qty - 1) : Math.min(stock || 99, qty + 1);
      paint();
    }));

    const buy = $('[data-buy]');
    if (buy) buy.addEventListener('click', () => {
      // Never more than is in stock, counting what's already in the cart.
      const room = Math.max(0, (stock || 50) - O.cartQtyOf(variant));
      const q = Math.min(qty, room);
      if (q > 0) O.addToCart(variant, q);
    });

    O.loadCatalogue().then(({ products }) => {
      const me = products.find((p) => p.id === d.handle);
      const related = me ? products.filter((p) => p.cat === me.cat && p.id !== me.id).slice(0, 4) : [];
      if (!related.length) return;
      const wrap = $('[data-related]', root);
      const draw = () => {
        $('[data-related-list]', root).innerHTML = related.map((r) => `
          <a href="${esc(r.url)}" class="rcard">
            <div class="rcard-img">${img(r.img)}</div>
            <div class="rcard-body"><div class="rcard-title">${esc(O.ptitle(r))}</div><div class="rcard-price">${esc(fmtPrice(r.price))}</div></div>
          </a>`).join('');
      };
      draw();
      wrap.hidden = false;
      dragScroll($('[data-related-list]', root));
      onLang(draw);
    });

    paint();
    O.getCart().then(paint).catch(() => {});
    onCart(paint);
    onLang(paint);
  }

  /* ════════════════════════════════════════════════════════════════════
   * Cart (CartScreen.js)
   * ════════════════════════════════════════════════════════════════════ */
  function cart(root) {
    const host = $('[data-cart-root]', root);
    let catalogue = { products: [] };
    let code = '';
    let codeState = null; // { code, applied, message }
    let checking = false;

    const byVariant = (id) => catalogue.products.find((p) => String(p.variantId) === String(id));
    const lineTitle = (item) => {
      const p = byVariant(item.variant_id);
      return p ? O.ptitle(p) : item.product_title;
    };

    function render() {
      const cartData = currentCart();
      if (!cartData) return;
      const items = cartData.items || [];
      const applied = (cartData.discount_codes || []).find((x) => x.applicable);
      if (!code && applied) { code = applied.code; codeState = { code: applied.code, applied: true }; }
      const { subtotal, discount, merch } = O.cartTotals(cartData);
      const shipping = O.shippingFor(merch);
      const total = merch + shipping;
      const bar = O.shipBar(merch);
      const minOrder = Number(CFG.minOrder) || 0;
      const belowMinimum = minOrder > 0 && merch < minOrder;
      const points = Math.floor(Math.max(0, merch) * (CFG.earnPointsPerEgp || 1));

      if (!items.length) {
        const best = [0, 1, 7, 3].map((i) => catalogue.products[i]).filter(Boolean);
        host.innerHTML = `
          <div class="cart-empty">${esc(t('emptyCart'))}</div>
          ${best.length ? `<div class="rail-title">${esc(t('browse'))}</div>
          <div class="xrail hscroll" style="padding-bottom:26px" data-drag>${best.map((p) => `
            <div class="bs-card">
              <a href="${esc(p.url)}" class="bs-img" style="display:block">${img(p.img)}</a>
              <div class="bs-body">
                <a href="${esc(p.url)}" class="bs-title" style="display:block">${esc(O.ptitle(p))}</a>
                <div class="bs-foot"><span class="bs-price">${esc(fmtPrice(p.price))}</span><button class="bs-add press s90" data-add="${p.variantId}"${p.stock === 0 ? ' data-soldout' : ''}>+</button></div>
              </div>
            </div>`).join('')}</div>` : ''}`;
        $$('[data-drag]', host).forEach(dragScroll);
        return;
      }

      const inCart = new Set(items.map((i) => String(i.variant_id)));
      const crossSell = catalogue.products.filter((p) => !inCart.has(String(p.variantId))).slice(0, 8);

      host.innerHTML = `
        ${items.map((it) => {
          const p = byVariant(it.variant_id);
          return `<div class="line" data-key="${esc(it.key)}" data-qty="${it.quantity}" data-max="${p ? (p.stock || 50) : 50}">
            <a href="${esc(it.url)}" class="line-img">${img(it.image)}</a>
            <div class="line-body">
              <div class="line-title">${esc(lineTitle(it))}</div>
              <div class="line-unit">${esc(fmtPrice(it.original_price / 100))}</div>
              <div class="line-foot">${stepper(it.quantity, { size: 24, fs: 13, gap: 8 })}<span class="line-total">${esc(fmtPrice(it.original_line_price / 100))}</span></div>
            </div>
            <button class="line-remove" data-remove aria-label="Remove">✕</button>
          </div>`;
        }).join('')}

        <div class="cart-ship">
          <div class="progress"><i style="width:${bar.pct}%"></i></div>
          <div class="ship-txt">${esc(bar.text)}</div>
        </div>

        <div class="discount-row">
          <input class="discount-input" data-code value="${esc(code)}" placeholder="${esc(t('discountPlaceholder'))}" autocomplete="off" autocapitalize="characters">
          <button class="apply-btn" data-apply>${checking ? spinner(true).replace('spinner', 'spinner sm') : esc(codeState?.applied && codeState.code === code ? t('applied') : t('apply'))}</button>
        </div>
        ${codeState && !codeState.applied && codeState.message ? `<div class="code-error">${esc(codeState.message)}</div>` : ''}

        <div class="totals">
          ${sumRow(t('subtotal'), fmtPrice(subtotal))}
          ${discount > 0 ? sumRow(t('discount'), `-${fmtPrice(discount)}`) : ''}
          ${sumRow(t('shipping'), shipping === 0 ? t('shipFree') : fmtPrice(shipping))}
          ${sumRow(t('total'), fmtPrice(total), 'grand')}
          <div class="earn">${esc(t('earnOnDelivery', { n: points }))}</div>
        </div>

        ${crossSell.length ? `<div class="rail-title">${esc(L('Complete your setup', 'كمّل جلستك'))}</div>
        <div class="xrail hscroll" data-drag>${crossSell.map((p) => `
          <div class="cs-slot">
            <a href="${esc(p.url)}" class="cs-card">${img(p.img)}</a>
            <div class="cs-title">${esc(O.ptitle(p))}</div>
            <div class="cs-price">${esc(fmtPrice(p.price))}</div>
            <button class="cs-add" data-add="${p.variantId}"${p.stock === 0 ? ' data-soldout' : ''}>${esc(t('add'))}</button>
          </div>`).join('')}</div>` : ''}

        ${!O.customer ? `<button class="join-nudge" data-sign-in="${esc(CFG.routes.cart)}">
          <span class="join-tick"><svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M4 12l6 6L20 6" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          <span style="flex:1"><b>${esc(L(`Earn ${points} points on this order`, `اكسب ${num(points)} نقطة على الطلب ده`))}</b>
          <span>${esc(L('Sign in to collect them and track your delivery live — optional.', 'سجّل دخولك عشان تجمعها وتتابع التوصيل لحظة بلحظة — اختياري.'))}</span></span>
          ${chevron(14)}
        </button>` : ''}
        <div style="padding:0 22px 26px">
          ${belowMinimum ? `<div class="min-note">${esc(L(
            `Minimum order is ${fmtPrice(minOrder)} — add ${fmtPrice(minOrder - merch)} more`,
            `أقل طلب ${fmtPrice(minOrder)} — ضيف ${fmtPrice(minOrder - merch)} كمان`))}</div>` : ''}
          <button class="cta${belowMinimum ? ' dim' : ' glow'}" data-checkout>${esc(t('checkout'))}</button>
        </div>`;
      $$('[data-drag]', host).forEach(dragScroll);
    }

    let lastCart = null;
    const currentCart = () => lastCart;

    host.addEventListener('click', async (e) => {
      const line = e.target.closest('.line');
      const step = e.target.closest('[data-step]');
      if (line && step) {
        const q = Number(line.dataset.qty) + Number(step.dataset.step);
        const max = Number(line.dataset.max) || 50;
        if (q > max) return;
        try { await O.changeLine(line.dataset.key, Math.max(0, q)); } catch (err) { O.okaAlert(L('Could not update', 'تعذّر التحديث'), errText(err)); }
        return;
      }
      if (line && e.target.closest('[data-remove]')) {
        try { await O.changeLine(line.dataset.key, 0); } catch (err) { O.okaAlert(L('Could not update', 'تعذّر التحديث'), errText(err)); }
        return;
      }
      if (e.target.closest('[data-apply]')) { applyCode(); return; }
      if (e.target.closest('[data-checkout]')) {
        const { merch } = O.cartTotals(lastCart);
        if (Number(CFG.minOrder) > 0 && merch < Number(CFG.minOrder)) return;
        // An account is optional: a guest is offered the reasons to sign in
        // (live tracking, points on this order) and can carry on without one.
        if (!O.customer) joinPrompt(Math.floor(Math.max(0, merch) * (CFG.earnPointsPerEgp || 1)));
        else go(CFG.routes.checkoutReview);
      }
    });
    host.addEventListener('input', (e) => {
      if (!e.target.matches('[data-code]')) return;
      code = e.target.value;
      // Editing the code clears the verdict on the old one.
      if (codeState && codeState.code !== code.trim()) codeState = null;
      const btn = $('[data-apply]', host);
      if (btn && !checking) btn.textContent = codeState?.applied ? t('applied') : t('apply');
      const errEl = $('.code-error', host);
      if (errEl && !codeState) errEl.remove();
    });
    host.addEventListener('keydown', (e) => { if (e.target.matches('[data-code]') && e.key === 'Enter') applyCode(); });

    /** A code only counts once Shopify's own discount rules accept it for this basket. */
    async function applyCode() {
      const c = code.trim();
      if (checking) return;
      if (!c) {
        if ((lastCart?.discount_codes || []).length) { try { await O.applyDiscount(''); } catch (e) {} }
        codeState = null;
        render();
        return;
      }
      checking = true;
      render();
      try {
        const updated = await O.applyDiscount(c);
        const dc = (updated.discount_codes || []).find((x) => x.code.toLowerCase() === c.toLowerCase());
        if (dc && dc.applicable) {
          codeState = { code: c, applied: true };
          O.haptic.success();
        } else {
          codeState = { code: c, applied: false, message: L('This code can’t be used on this basket.', 'الكود ده مينفعش على السلة دي.') };
          if (dc) await O.applyDiscount('').catch(() => {});
        }
      } catch (err) {
        codeState = { code: c, applied: false, message: errText(err) };
      } finally {
        checking = false;
        render();
      }
    }

    lastCart = inlineCart(root);
    // A redeemed loyalty voucher arrives here ready to apply.
    const pending = O.store.get('oka.pendingCode');
    if (pending) { O.store.del('oka.pendingCode'); code = pending; }
    render();
    if (pending) applyCode();
    O.loadCatalogue().then((cat) => { catalogue = cat; render(); });
    onCart((e) => { lastCart = e.detail; render(); });
    onLang(render);
  }

  /**
   * Why sign in — shown to a guest on the way to checkout. Never a wall:
   * "Continue as guest" goes straight to Shopify's checkout.
   */
  function joinCard(points) {
    const perks = [
      [L('Live J&T tracking', 'تتبع شحنتك لحظة بلحظة'), L('See where your parcel is and when the courier is on the way.', 'اعرف شحنتك فين وإمتى المندوب جاي.')],
      [L('Points on every order', 'نقاط على كل طلب'), L(`10 points = EGP 1, credited when your order is delivered.`, '١٠ نقاط = ١ ج.م، بتنزل لما طلبك يوصل.')],
      [L('Faster next time', 'أسرع المرة الجاية'), L('Saved addresses and one-tap “Order again”.', 'عناوينك محفوظة وتطلب تاني بضغطة.')],
    ];
    return `<div class="join">
      <div class="join-points">
        <span class="join-num">${esc(num(points))}</span>
        <span>${esc(L('points waiting for you on this order', 'نقطة مستنياك على الطلب ده'))}</span>
      </div>
      <div class="join-title">${esc(L('Sign in to track your order and earn points', 'سجّل دخولك عشان تتابع طلبك وتكسب نقاط'))}</div>
      <div class="join-perks">${perks.map(([h, b]) => `
        <div class="join-perk"><span class="join-tick"><svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M4 12l6 6L20 6" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          <span><b>${esc(h)}</b><span>${esc(b)}</span></span></div>`).join('')}</div>
      <button class="cta glow" data-join-signin>${esc(L('Sign in & check out', 'سجّل دخولك وكمّل الطلب'))}</button>
      <button class="join-guest" data-join-guest>${esc(L('Continue as guest', 'كمّل كزائر'))}</button>
      <div class="join-fine">${esc(L('Takes a few seconds. You can also sign in after ordering — your points still count.', 'بتاخد ثواني. وتقدر تسجّل بعد الطلب كمان ونقاطك محسوبة.'))}</div>
    </div>`;
  }
  function joinPrompt(points) {
    const app = $('#app');
    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    const sheet = document.createElement('div');
    sheet.className = 'join-sheet';
    sheet.innerHTML = `<div class="grabber"></div>${joinCard(points)}`;
    const close = () => { scrim.remove(); sheet.remove(); };
    scrim.addEventListener('click', close);
    app.appendChild(scrim);
    app.appendChild(sheet);
  }
  // Both the sheet (cart) and the inline card (checkout review) answer here.
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-join-signin]')) { e.preventDefault(); O.requireSignIn(CFG.routes.checkoutReview); }
    if (e.target.closest('[data-join-guest]')) { e.preventDefault(); e.target.closest('[data-join-guest]').innerHTML = spinner(true); go(CFG.routes.checkout); }
  });

  /* ════════════════════════════════════════════════════════════════════
   * Checkout review (CheckoutScreen.js)
   * ════════════════════════════════════════════════════════════════════ */
  function checkout(root) {
    const host = $('[data-checkout-root]', root);
    const bar = $('[data-place-bar]');
    let cartData = inlineCart(root);
    let catalogue = { products: [] };

    function render() {
      if (!O.customer) {
        bar.hidden = true;
        const merch = O.cartTotals(cartData).merch;
        host.innerHTML = joinCard(Math.floor(Math.max(0, merch) * (CFG.earnPointsPerEgp || 1)));
        return;
      }
      const items = cartData?.items || [];
      if (!items.length) { go(CFG.routes.cart); return; }
      const addr = O.selectedAddress();
      const { subtotal, discount, merch } = O.cartTotals(cartData);
      const shipping = O.shippingFor(merch, addr);
      const total = merch + shipping;
      const minOrder = Number(CFG.minOrder) || 0;
      const belowMinimum = minOrder > 0 && merch < minOrder;
      const count = cartData.item_count;
      const hero = items[0];
      const heroP = catalogue.products.find((p) => String(p.variantId) === String(hero.variant_id));
      const heroTitle = heroP ? O.ptitle(heroP) : hero.product_title;
      const eta = O.etaFor(addr);
      const shipBarNow = O.shipBar(merch, addr);
      const code = (cartData.discount_codes || []).find((x) => x.applicable)?.code;

      host.innerHTML = `
        <div class="hero-row">
          <div class="hero-img">${img(hero.image)}</div>
          <div class="hero-meta">
            <div class="hero-title">${esc(heroTitle)}${count > 1 ? esc(L(` + ${count - 1} more`, ` + ${num(count - 1)}`)) : ''}</div>
            <div class="hero-total">${esc(fmtPrice(total))}</div>
          </div>
          <a href="${esc(CFG.routes.cart)}" aria-label="Cart">${chevron(16)}</a>
        </div>
        <div class="divider"></div>
        <div class="arrives">
          <div class="arrives-title">${esc(L(`Arrives in ${eta}`, `يوصل خلال ${eta}`))}</div>
          <div class="arrives-note">${esc(L('We’ll confirm your order and start preparing it for shipping.', 'هنراجع طلبك ونجهّزه للشحن بعد التأكيد.'))}</div>
        </div>
        <div class="divider"></div>

        <div class="field">
          <div class="field-k">${esc(L('Ships to', 'الشحن إلى'))}</div>
          <div class="field-v">${addr
            ? `<a href="${esc(CFG.routes.addresses)}" style="display:block">
                <div class="field-strong">${esc(addr.name || O.customer.name || '')}</div>
                <div class="field-txt">${esc([addr.street, addr.building].filter(Boolean).join(', '))}</div>
                <div class="field-txt">${esc(addr.city || '')}</div>
                <div class="field-phone"><span class="nums">${esc(addr.phone || O.customer.phone || '')}</span></div>
                <div class="field-txt link">${esc(t('change'))}</div>
              </a>`
            : `<a href="${esc(CFG.routes.addAddress)}" class="field-strong link" data-add-address>${esc(L('+ Add a delivery address', '+ ضيف عنوان التوصيل'))}</a>`}</div>
        </div>
        <div class="divider top"></div>

        <div class="field">
          <div class="field-k">${esc(t('paymentTitle'))}</div>
          <div class="field-v" style="display:flex;flex-direction:column;gap:12px">
            <div class="pay-row"><span class="radio on"></span><span class="pay-label">${esc(t('cod'))}</span></div>
            <div class="cod-note">${esc(`${t('codNote')}: ${fmtPrice(total)}`)}</div>
          </div>
        </div>
        <div class="divider top"></div>

        <div class="field" style="padding-bottom:110px">
          <div class="field-k">${esc(t('total'))}</div>
          <div class="field-v" style="display:flex;flex-direction:column;gap:4px">
            ${addr ? `
              <div class="spread field-txt"><span>${esc(t('subtotal'))}</span><span>${esc(fmtPrice(subtotal))}</span></div>
              ${discount > 0 ? `<div class="spread field-txt"><span>${esc(`${t('discount')}${code ? ` (${code})` : ''}`)}</span><span>${esc(`-${fmtPrice(discount)}`)}</span></div>` : ''}
              <div class="spread field-txt"><span>${esc(t('shipping'))}</span><span>${esc(shipping === 0 ? t('shipFree') : fmtPrice(shipping))}</span></div>
              <div class="ship-box checkout-ship">
                <div class="progress"><i style="width:${shipBarNow.pct}%"></i></div>
                <div class="ship-txt">${esc(shipBarNow.text)}</div>
              </div>
              <div class="quote-warn">${esc(L('Shipping is an estimate until your address is confirmed.', 'مصاريف الشحن تقديرية — هتتأكد لما نثبّت العنوان.'))}</div>
              <div class="arrives-title" style="margin-top:6px">${esc(fmtPrice(total))}</div>
              ${belowMinimum ? `<div class="quote-warn">${esc(L(`The minimum order is ${fmtPrice(minOrder)}.`, `أقل طلب ${fmtPrice(minOrder)}.`))}</div>` : ''}`
            : `<div class="field-txt">${esc(L('Add an address to see your total.', 'ضيف عنوان عشان نحسب الإجمالي.'))}</div>`}
          </div>
        </div>`;

      bar.hidden = false;
      $('[data-place]', bar).classList.toggle('dim', !addr || belowMinimum);
      bar.dataset.ok = addr && !belowMinimum ? '1' : '';
    }

    host.addEventListener('click', (e) => {
      if (e.target.closest('[data-add-address]')) O.store.set('oka.afterAddress', CFG.routes.checkoutReview);
    });
    $('[data-place]', bar).addEventListener('click', () => {
      if (!bar.dataset.ok) return;
      const btn = $('[data-place]', bar);
      btn.innerHTML = spinner();
      // Shopify's checkout takes it from here: it charges the store's own
      // shipping rate for the address and records the payment method.
      go(CFG.routes.checkout);
    });

    render();
    O.getCart(true).then((c) => { cartData = c; render(); }).catch(() => {});
    O.loadCatalogue().then((c) => { catalogue = c; render(); });
    onLang(render);
  }

  /* ════════════════════════════════════════════════════════════════════
   * Orders — list, detail, live tracking, edit/cancel (OrdersScreen.js)
   * ════════════════════════════════════════════════════════════════════ */
  const waNumber = (raw) => {
    let digits = String(raw ?? '').replace(/\D/g, '');
    if (!digits) return null;
    if (digits.startsWith('0')) digits = `20${digits.replace(/^0+/, '')}`;
    return digits;
  };
  function friendlyError(err) {
    const msg = errText(err);
    if (/already (shipped|with the courier)/i.test(msg)) {
      return L('This order has already shipped and can no longer be cancelled. Contact support if you need to return it.',
        'الطلب اتشحن بالفعل ومش ممكن يتلغي دلوقتي. كلّم خدمة العملاء لو محتاج ترجعه.');
    }
    if (/not signed in|session/i.test(msg)) return L('Sign in with the account that placed this order.', 'سجّل دخولك بالحساب اللي عمل الطلب ده.');
    if (/timed out|network|failed to fetch|aborted/i.test(msg)) return L("Couldn't reach the server. Please try again.", 'مفيش اتصال بالسيرفر دلوقتي. جرّب تاني.');
    return msg;
  }

  function orders(root) {
    const list = $('[data-orders-list]', root);
    const details = $$('[data-order-detail]', root);
    const standalone = root.hasAttribute('data-standalone');
    const cancelledHere = O.store.get('oka.cancelled', {});

    const fillEta = (det) => {
      const eta = O.etaFor({ provinceCode: det.dataset.province });
      $$('[data-eta]', det).forEach((el) => { el.textContent = eta; });
    };
    details.forEach(fillEta);
    onLang(() => details.forEach(fillEta));

    function show(name) {
      const det = details.find((x) => x.dataset.orderDetail === name);
      if (!det) { if (list) list.hidden = false; details.forEach((x) => { x.hidden = true; }); return; }
      if (list) list.hidden = true;
      details.forEach((x) => { x.hidden = x !== det; });
      root.scrollTop = 0;
    }
    if (!standalone) {
      show(qs('order'));
      list && list.addEventListener('click', (e) => {
        const card = e.target.closest('[data-open-order]');
        if (!card) return;
        e.preventDefault();
        history.pushState({ okaOrder: card.dataset.openOrder }, '', card.getAttribute('href'));
        show(card.dataset.openOrder);
      });
      window.addEventListener('popstate', () => show(qs('order')));
      // The detail header's back returns to the list rather than leaving the page.
      details.forEach((det) => {
        const back = $('[data-back]', det);
        back && back.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (history.state && history.state.okaOrder) history.back();
          else { history.replaceState(null, '', location.pathname); show(null); }
        }, true);
      });
    }

    // An order cancelled from here shows as cancelled at once, even while
    // Shopify's background cancel job hasn't reached it yet.
    function markCancelled(name) {
      const det = details.find((x) => x.dataset.orderDetail === name);
      if (det) {
        det.dataset.cancelled = 'true';
        $('[data-cancelled-banner]', det).hidden = false;
        $$('.edit-btn, .cancel-btn', det).forEach((b) => b.classList.add('disabled'));
        $('[data-cancel-order]', det).textContent = L('Cancelled', 'ملغي');
      }
      const st = $(`[data-order-state="${CSS.escape(name)}"]`, root);
      if (st) { st.textContent = L('Cancelled', 'ملغي'); st.className = 'order-state red'; }
    }
    Object.keys(cancelledHere).forEach((name) => {
      const det = details.find((x) => x.dataset.orderDetail === name);
      if (det && det.dataset.cancelled !== 'true') markCancelled(name);
    });

    /* Live courier status — the order service's /customer/orders. */
    const live = {};
    async function loadLive() {
      if (!O.hasService() || !O.customer) return;
      try {
        const r = await O.api(`/customer/orders?lang=${O.lang()}`);
        (r.orders || []).forEach((o) => { live[o.name] = { ...o, shippingError: r.shippingError ?? r.bostaError ?? null }; });
        details.forEach((det) => paintLive(det));
        Object.values(live).forEach((o) => {
          const st = $(`[data-order-state="${CSS.escape(o.name)}"]`, root);
          if (st && !o.cancelled && o.stateLabel) {
            st.textContent = o.stateLabel;
            st.className = `order-state${o.step >= 3 ? ' green' : ''}`;
          }
        });
      } catch (e) { /* keep what Liquid drew */ }
    }
    function paintLive(det) {
      const o = live[det.dataset.orderDetail];
      if (!o) return;
      const step = o.step ?? 0;
      $$('.step-col', det).forEach((col, i) => {
        col.classList.toggle('done', i <= step);
        col.classList.toggle('current', i === step);
      });
      if (o.stateLabel) $('[data-state-label]', det).textContent = o.stateLabel;
      if (o.fulfillmentStatus && ['FULFILLED', 'PARTIALLY_FULFILLED'].includes(o.fulfillmentStatus)) det.dataset.fulfilled = 'true';

      const updates = o.updates || [];
      const up = $('[data-updates]', det);
      if (o.shippingError && !updates.length) {
        up.innerHTML = `<div class="awaiting">${esc(L('We could not reach the courier just now, so shipping updates are missing. Pull down to retry.', 'ما قدرناش نوصل لشركة الشحن دلوقتي، فتحديثات الشحن مش ظاهرة. جرّب تحدّث الصفحة.'))}</div>`;
      } else if (updates.length) {
        up.innerHTML = `<div class="updates">${updates.map((u) => `
          <div class="update-row"><span class="update-dot${u.done ? ' done' : ''}"></span>
            <div style="flex:1"><div class="update-txt">${esc(u.text)}</div><div class="update-time">${esc(u.time)}</div></div>
          </div>`).join('')}</div>`;
      }

      const extra = $('[data-live-extra]', det);
      let html = '';
      if (o.shippingError && updates.length) {
        html += `<div class="ship-err">${esc(L('Couldn’t reach the courier — shipment updates may be missing. Pull to refresh.', 'تعذّر الوصول لشركة الشحن — تحديثات الشحنة ممكن تكون ناقصة. اسحب للتحديث.'))}</div>`;
      }
      if (o.courier) {
        html += `<div class="courier">
          <div class="courier-label">${esc(o.carrier === 'jt' ? L('J&T courier', 'مندوب J&T') : L('Delivery courier', 'مندوب التوصيل'))}</div>
          <div class="courier-name">${esc(o.courier)}</div>
          ${o.courierPhone ? `<div class="courier-phone"><span class="nums">${esc(o.courierPhone)}</span></div>
          <div class="courier-btns">
            <a class="courier-btn call press s96" href="tel:${esc(String(o.courierPhone).replace(/\s/g, ''))}"><svg width="14" height="14" viewBox="0 0 24 24"><path d="M7.5 3.5h-2A2.5 2.5 0 003 6c0 8.28 6.72 15 15 15a2.5 2.5 0 002.5-2.5v-2a1 1 0 00-.76-.97l-3.6-.9a1 1 0 00-1 .32l-1.1 1.32a12.5 12.5 0 01-5.63-5.63l1.32-1.1a1 1 0 00.32-1l-.9-3.6a1 1 0 00-.97-.76z" fill="#fff"/></svg>${esc(L('Call', 'اتصال'))}</a>
            <a class="courier-btn wa press s96" target="_blank" rel="noopener" href="https://wa.me/${esc(waNumber(o.courierPhone))}"><svg width="15" height="15" viewBox="0 0 24 24"><path d="M12 2.5a9.5 9.5 0 00-8.2 14.28L2.5 21.5l4.85-1.26A9.5 9.5 0 1012 2.5zm0 1.9a7.6 7.6 0 016.45 11.6l-.23.37.62 2.26-2.33-.6-.36.21A7.6 7.6 0 1112 4.4z" fill="#fff"/><path d="M9.3 7.6c-.18-.42-.37-.43-.55-.44h-.46a.9.9 0 00-.65.3 2.7 2.7 0 00-.84 2 4.7 4.7 0 001 2.5 10.6 10.6 0 004.05 3.56c2 .79 2.42.63 2.85.59a2.44 2.44 0 001.63-1.15 2 2 0 00.14-1.15c-.06-.1-.22-.16-.46-.28s-1.42-.7-1.64-.78-.38-.12-.55.12-.62.78-.76.94-.28.18-.52.06a6.5 6.5 0 01-1.9-1.18 7.2 7.2 0 01-1.33-1.65c-.14-.24 0-.37.1-.49s.24-.28.36-.42a1.6 1.6 0 00.24-.4.44.44 0 000-.42c-.06-.12-.54-1.32-.75-1.8z" fill="#fff"/></svg>${esc(L('WhatsApp', 'واتساب'))}</a>
          </div>` : ''}
        </div>`;
      }
      if (o.actionNeeded) {
        html += `<div class="action-needed"><b>${esc(L('Action needed', 'مطلوب إجراء'))}</b><span>${esc(o.actionNeeded)}</span></div>`;
      }
      extra.innerHTML = html;
      if (o.trackingNumber && !$('[data-tracking]', det)) {
        const v = $('.field-v .field-strong', $$('.field', det).pop());
        v && v.insertAdjacentHTML('afterend', `<div class="field-txt" data-tracking>${esc(L('Tracking: ', 'رقم التتبع: '))}<span class="nums">${esc(o.trackingNumber)}</span></div>`);
      }
    }
    loadLive();
    onLang(loadLive);

    /* Edit, cancel, order again. */
    root.addEventListener('click', async (e) => {
      const det = e.target.closest('[data-order-detail]');
      if (!det) return;
      const name = det.dataset.orderDetail;
      const shipped = det.dataset.fulfilled === 'true';
      const cancelled = det.dataset.cancelled === 'true';
      const lines = JSON.parse(det.dataset.lines || '[]');

      if (e.target.closest('[data-edit-order]')) {
        if (cancelled) return O.okaAlert(L('Not available', 'غير متاح'), L('This order has already been cancelled.', 'الطلب ده اتلغى بالفعل.'));
        if (shipped) {
          return O.okaAlert(L('Not available', 'غير متاح'), L('This order has already shipped, so its items and address can no longer be changed.', 'الطلب اتشحن بالفعل، فمش ممكن تتعدّل عناصره أو عنوانه.'));
        }
        if (O.hasService()) return openEditSheet(name, lines);
        return askOnWhatsApp(L(`Hi, I'd like to change order ${name}.`, `مرحباً، عايز أعدّل الطلب ${name}.`));
      }

      if (e.target.closest('[data-cancel-order]')) {
        if (cancelled) return O.okaAlert(L('Already cancelled', 'الطلب ملغي'), L('This order has already been cancelled.', 'الطلب ده اتلغى بالفعل.'));
        if (shipped) return O.okaAlert(L('Not available', 'غير متاح'), friendlyError('already shipped'));
        if (!O.hasService()) {
          return askOnWhatsApp(L(`Hi, please cancel order ${name}.`, `مرحباً، من فضلك الغوا الطلب ${name}.`));
        }
        return O.okaAlert(L('Cancel order', 'إلغاء الطلب'), L(`Order ${name} will be cancelled.`, `هيتم إلغاء الطلب ${name} نهائياً.`), [
          { text: L('Back', 'رجوع'), style: 'cancel' },
          {
            text: L('Cancel order', 'إلغاء الطلب'),
            style: 'destructive',
            onPress: async () => {
              try {
                const r = await O.api(`/orders/${encodeURIComponent(name)}/cancel`, { method: 'POST', body: {} });
                cancelledHere[name] = r?.cancelledAt || new Date().toISOString();
                O.store.set('oka.cancelled', cancelledHere);
                markCancelled(name);
                O.haptic.success();
                O.okaAlert(L('Order cancelled', 'تم إلغاء الطلب'), L(`Order ${name} has been cancelled. It won't be shipped and you won't be charged.`, `تم إلغاء الطلب ${name}. مش هيتشحن ومش هتدفع حاجة.`));
              } catch (err) {
                O.okaAlert(L('Could not cancel', 'تعذّر الإلغاء'), friendlyError(err));
              }
            },
          },
        ]);
      }

      if (e.target.closest('[data-reorder]')) {
        // Matched to today's catalogue by variant — coal, foil and bowls are bought again and again.
        const { products } = await O.loadCatalogue();
        const items = [];
        let missing = 0;
        lines.forEach((l) => {
          const p = products.find((pp) => String(pp.variantId) === String(l.variantId));
          if (p && p.stock !== 0 && p.available !== false) items.push({ variantId: l.variantId, quantity: l.quantity });
          else missing += 1;
        });
        if (!items.length) return O.okaAlert(L('Not available', 'غير متاح'), L('These items aren’t available right now.', 'المنتجات دي مش متوفرة دلوقتي.'));
        try {
          await O.addManyToCart(items);
          O.haptic.success();
          if (missing) await O.okaAlert(L('Added what’s available', 'أضفنا المتاح'), L(`${missing} item(s) aren’t available right now.`, `${num(missing)} منتج مش متوفر حالياً.`));
          go(CFG.routes.cart);
        } catch (err) {
          O.okaAlert(L('Could not add', 'تعذّر الإضافة'), errText(err));
        }
      }
    });
  }

  function askOnWhatsApp(text) {
    if (!CFG.whatsapp) {
      return O.okaAlert(L('Not available', 'غير متاح'), L('Contact support to change or cancel this order.', 'كلّم خدمة العملاء عشان تعدّل أو تلغي الطلب ده.'));
    }
    return O.okaAlert(
      L('We’ll do it for you', 'هنعملها لك'),
      L('Send us this request on WhatsApp and the team will update your order before it ships.', 'ابعتلنا الطلب ده على واتساب والفريق هيعدّل طلبك قبل ما يتشحن.'),
      [
        { text: L('Back', 'رجوع'), style: 'cancel' },
        { text: L('WhatsApp', 'واتساب'), onPress: () => window.open(O.whatsappUrl(text), '_blank', 'noopener') },
      ],
    );
  }

  /* ── service-side addresses (their ids are Admin API gids) ───────────── */
  let serviceAddrPromise = null;
  function serviceAddresses() {
    if (!serviceAddrPromise) serviceAddrPromise = O.api('/customer/addresses').then((r) => r.addresses || []).catch(() => []);
    return serviceAddrPromise;
  }
  const numericId = (gid) => (String(gid).match(/MailingAddress\/(\d+)/) || [])[1] || String(gid);

  /** AddressPicker.js */
  const addressPicker = (list, activeId, attr) => list.map((a) => {
    const on = String(a.id) === String(activeId);
    return `<button class="addr-pick${on ? ' on' : ''}" ${attr}="${esc(a.id)}">
      <span class="addr-inner"><span style="flex:1;min-width:0">
        <b>${esc(a.name || O.customer?.name || '')}</b><span>${esc(a.street || '')}</span><span>${esc(a.city || '')}</span>
      </span><span class="radio${on ? ' on' : ''}" style="width:19px;height:19px"></span></span>
    </button>`;
  }).join('');

  /* ════════════════════════════════════════════════════════════════════
   * Edit order sheet (overlays/EditOrderSheet.js) — order service only
   * ════════════════════════════════════════════════════════════════════ */
  async function openEditSheet(orderName, lines) {
    const [{ products, cats }, addrs] = await Promise.all([O.loadCatalogue(), serviceAddresses()]);
    const seed = {};
    lines.forEach((l) => {
      const p = products.find((pp) => String(pp.variantId) === String(l.variantId));
      if (p) seed[p.id] = (seed[p.id] || 0) + l.quantity;
    });
    const original = { ...seed };
    const cartEdit = { ...seed };
    let picked = null;
    let saving = false;
    const app = $('#app');
    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    const sheet = document.createElement('div');
    sheet.className = 'sheet';
    const close = () => { scrim.remove(); sheet.remove(); };
    scrim.addEventListener('click', close);

    function render() {
      const entries = Object.keys(cartEdit).map((id) => ({ p: products.find((x) => x.id === id), qty: cartEdit[id] })).filter((e) => e.p);
      const subtotal = entries.reduce((a, e) => a + e.p.price * e.qty, 0);
      const total = subtotal + O.shippingFor(subtotal);
      const def = addrs.find((a) => a.isDefault);
      const sel = O.selectedAddress();
      const activeId = picked ? picked.id : (sel && addrs.find((a) => numericId(a.id) === String(sel.id))?.id) || def?.id;
      const scrollTop = $('.sheet-body', sheet)?.scrollTop || 0;
      sheet.innerHTML = `
        <div class="grabber"></div>
        <div class="sheet-head"><span class="sheet-title">${esc(L('Edit Order', 'تعديل الطلب'))}</span>
          <button class="sheet-close" data-close aria-label="Close"><svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="#1d1d1f" stroke-width="2" stroke-linecap="round"/></svg></button></div>
        <div class="sheet-body">
          <div class="sec-label">${esc(L('YOUR ORDER ITEMS', 'عناصر طلبك'))}</div>
          ${entries.length ? entries.map((e) => `
            <div class="sheet-item" data-pid="${esc(e.p.id)}">
              <div class="cat-item-img">${img(e.p.img)}</div>
              <div class="cat-item-meta" style="gap:4px"><div class="cat-item-title" style="font-size:13.5px;line-height:18px">${esc(O.ptitle(e.p))}</div><div class="sheet-item-total">${esc(fmtPrice(e.p.price * e.qty))}</div></div>
              ${stepper(e.qty, { size: 26, fs: 14, gap: 8 })}
            </div>`).join('')
            : `<div class="awaiting" style="margin:0 20px 8px;text-align:center">${esc(L('No items in this order', 'لا توجد عناصر في الطلب'))}</div>`}
          ${addrs.length > 1 ? `<div class="sheet-rule"></div>
            <div class="sec-label">${esc(L('DELIVERY ADDRESS', 'عنوان التوصيل'))}</div>
            ${addressPicker(addrs, activeId, 'data-pick')}
            ${picked ? `<div class="addr-note">${esc(L('The order will be redirected here when you save.', 'هيتم تحويل الطلب للعنوان ده لما تحفظ التعديلات.'))}</div>` : ''}` : ''}
          <div class="sheet-rule"></div>
          <div class="sec-label">${esc(L('ALL PRODUCTS', 'كل المنتجات'))}</div>
          ${cats.map((c) => {
            const group = products.filter((p) => p.cat === c.id);
            if (!group.length) return '';
            return `<div class="group-label">${esc(L(c.en, c.ar))}</div>${group.map((p) => `
              <div class="cat-item" data-pid="${esc(p.id)}">
                <div class="cat-item-img">${img(p.img)}</div>
                <div class="cat-item-meta"><div class="cat-item-title">${esc(O.ptitle(p))}</div><div class="cat-item-price">${esc(fmtPrice(p.price))}</div></div>
                ${stepper(cartEdit[p.id] || 0, { size: 24, fs: 13, gap: 7 })}
              </div>`).join('')}`;
          }).join('')}
          <div style="height:16px"></div>
        </div>
        <div class="sheet-foot">
          ${sumRow(t('subtotal'), fmtPrice(subtotal))}
          ${sumRow(t('total'), fmtPrice(total), 'total')}
          <button class="accept" data-accept>${saving ? spinner() : esc(L('Accept Changes', 'قبول التعديلات'))}</button>
        </div>`;
      $('.sheet-body', sheet).scrollTop = scrollTop;
    }

    sheet.addEventListener('click', async (e) => {
      if (e.target.closest('[data-close]')) return close();
      const step = e.target.closest('[data-step]');
      if (step) {
        const id = step.closest('[data-pid]').dataset.pid;
        const q = Math.max(0, (cartEdit[id] || 0) + Number(step.dataset.step));
        if (q === 0) delete cartEdit[id]; else cartEdit[id] = q;
        return render();
      }
      const pick = e.target.closest('[data-pick]');
      if (pick) { picked = addrs.find((a) => String(a.id) === pick.dataset.pick) || null; return render(); }
      if (e.target.closest('[data-accept]')) {
        if (saving) return;
        const vid = (id) => products.find((p) => p.id === id)?.variantId;
        const removed = Object.keys(original).filter((id) => !cartEdit[id]).map((id) => ({ variantId: vid(id), quantity: 0 }));
        const editLines = [...Object.keys(cartEdit).map((id) => ({ variantId: vid(id), quantity: cartEdit[id] })), ...removed]
          .filter((l) => l.variantId)
          .map((l) => ({ ...l, variantId: `gid://shopify/ProductVariant/${l.variantId}` }));
        if (!editLines.length && !picked) return close();
        saving = true;
        render();
        try {
          if (picked) await O.api(`/orders/${encodeURIComponent(orderName)}/address`, { method: 'POST', body: { addressId: picked.id } });
          if (editLines.length) await O.api(`/orders/${encodeURIComponent(orderName)}/edit`, { method: 'POST', body: { lines: editLines } });
          close();
          location.reload();
        } catch (err) {
          saving = false;
          render();
          O.okaAlert(L('Could not save the edit', 'تعذّر حفظ التعديل'), errText(err));
        }
      }
    });

    render();
    app.appendChild(scrim);
    app.appendChild(sheet);
  }

  /* ════════════════════════════════════════════════════════════════════
   * Account (AccountScreen.js)
   * ════════════════════════════════════════════════════════════════════ */
  function account(root) {
    O.applyAttrs(root);
    const del = $('[data-delete-account]', root);
    if (del) del.addEventListener('click', () => O.okaAlert(
      L('Delete account', 'حذف الحساب'),
      L('We’ll remove your personal data within 7 days. Order records are kept for accounting and tax.', 'هنحذف بياناتك الشخصية خلال ٧ أيام. سجلات الطلبات بتفضل للحسابات والضرائب.'),
      [
        { text: L('Back', 'رجوع'), style: 'cancel' },
        {
          text: L('Delete my account', 'احذف حسابي'),
          style: 'destructive',
          onPress: async () => {
            try {
              await O.api('/customer/delete-request', { method: 'POST', body: {} });
              go(CFG.routes.logout);
            } catch (err) {
              O.okaAlert(L('Could not send the request', 'تعذّر الطلب'), errText(err));
            }
          },
        },
      ],
    ));
    const out = $('[data-sign-out]', root);
    if (out) out.addEventListener('click', () => { O.store.del('oka.addr'); O.store.del('oka.wishlist'); O.store.del('oka.cancelled'); });
  }

  /* ════════════════════════════════════════════════════════════════════
   * Addresses (AddressesScreen.js)
   * ════════════════════════════════════════════════════════════════════ */
  function addressesScreen(root) {
    // Back from saving a new one to wherever the shopper was going (checkout, usually).
    const after = O.store.get('oka.afterAddress');
    if (after && document.referrer && /\/(account\/addresses|pages\/addresses)/.test(new URL(document.referrer).pathname + new URL(document.referrer).search)) {
      O.store.del('oka.afterAddress');
      location.replace(after);
      return;
    }
    const cards = $$('[data-addr]', root);
    function paint() {
      const sel = O.selectedAddress();
      cards.forEach((c, i) => {
        const on = sel && String(sel.id) === c.dataset.addr;
        c.classList.toggle('active', Boolean(on));
        $('.radio', c).classList.toggle('on', Boolean(on));
        const label = O.provinceName(c.dataset.province);
        $('[data-addr-label]', c).textContent = label || L(`Address ${i + 1}`, `عنوان ${num(i + 1)}`);
        $$('[data-eta]', c).forEach((el) => { el.textContent = O.etaFor({ provinceCode: c.dataset.province }); });
      });
    }
    // Shopify's classic account forms, when the order service isn't connected.
    const postForm = (action, fields) => {
      const f = document.createElement('form');
      f.method = 'post';
      f.action = action;
      Object.entries(fields).forEach(([k, v]) => {
        const i = document.createElement('input');
        i.type = 'hidden';
        i.name = k;
        i.value = v ?? '';
        f.appendChild(i);
      });
      document.body.appendChild(f);
      f.submit();
    };
    async function serviceIdFor(id) {
      const list = await serviceAddresses();
      return list.find((a) => numericId(a.id) === String(id))?.id;
    }

    root.addEventListener('click', async (e) => {
      const card = e.target.closest('[data-addr]');
      if (!card) return;
      const id = card.dataset.addr;
      const a = O.addresses().find((x) => String(x.id) === id);

      if (e.target.closest('[data-make-default]')) {
        e.stopPropagation();
        try {
          if (O.hasService()) {
            await O.api('/customer/addresses/default', { method: 'POST', body: { addressId: await serviceIdFor(id) } });
            location.reload();
          } else {
            postForm(`/account/addresses/${id}`, {
              _method: 'put', form_type: 'customer_address', utf8: '✓',
              'address[first_name]': a.firstName, 'address[last_name]': a.lastName, 'address[address1]': a.street,
              'address[address2]': a.building, 'address[city]': a.city, 'address[province]': a.province,
              'address[country]': a.country || 'Egypt', 'address[phone]': a.phone, 'address[default]': '1',
            });
          }
        } catch (err) {
          O.okaAlert(L('Could not update the default address', 'تعذّر تحديث العنوان الافتراضي'), errText(err));
        }
        return;
      }

      if (e.target.closest('[data-delete-addr]')) {
        e.stopPropagation();
        O.okaAlert(L('Delete address', 'حذف العنوان'), L('Are you sure?', 'متأكد؟'), [
          { text: L('Back', 'رجوع'), style: 'cancel' },
          {
            text: L('Delete', 'حذف'),
            style: 'destructive',
            onPress: async () => {
              if (String(O.store.get('oka.addr')) === id) O.store.del('oka.addr');
              try {
                if (O.hasService()) {
                  await O.api('/customer/addresses/delete', { method: 'POST', body: { addressId: await serviceIdFor(id) } });
                  location.reload();
                } else {
                  postForm(`/account/addresses/${id}`, { _method: 'delete' });
                }
              } catch (err) {
                O.okaAlert(L('Could not delete', 'تعذّر الحذف'), errText(err));
              }
            },
          },
        ]);
        return;
      }

      // Tapping a card chooses where the next order ships — nothing changes on the account.
      O.selectAddress(id);
      O.haptic.selectionTick();
      paint();
    });
    paint();
    onLang(paint);
  }

  /* ════════════════════════════════════════════════════════════════════
   * Add address (AddAddressScreen.js)
   * ════════════════════════════════════════════════════════════════════ */
  function addAddress(root) {
    const form = $('[data-addr-form]', root);
    if (!form) return;
    O.applyAttrs(root);
    if (!O.store.get('oka.afterAddress') && document.referrer) {
      const ref = new URL(document.referrer);
      if (ref.origin === location.origin && !/addresses/.test(ref.pathname + ref.search)) O.store.set('oka.afterAddress', ref.pathname + ref.search);
    }
    const field = (k) => $(`[data-f="${k}"]`, form);
    let provinceCode = null;
    let makeDefault = $('[data-default-toggle] .check', form).classList.contains('on');

    const provHost = $('[data-provinces]', form);
    function paintProvinces() {
      provHost.innerHTML = O.PROVINCES.map((p) =>
        `<button type="button" class="prov-chip${p.code === provinceCode ? ' on' : ''}" data-prov="${p.code}">${esc(L(p.en, p.ar))}</button>`).join('');
    }
    provHost.addEventListener('click', (e) => {
      const b = e.target.closest('[data-prov]');
      if (!b) return;
      O.haptic.selectionTick();
      provinceCode = b.dataset.prov;
      paintProvinces();
    });
    paintProvinces();
    onLang(paintProvinces);

    $('[data-default-toggle]', form).addEventListener('click', () => {
      makeDefault = !makeDefault;
      $('[data-default-toggle] .check', form).classList.toggle('on', makeDefault);
    });
    $$('[data-type]', form).forEach((b) => b.addEventListener('click', () => {
      $$('[data-type]', form).forEach((x) => x.classList.toggle('on', x === b));
    }));

    /**
     * Real GPS, reverse-geocoded with OpenStreetMap — never a made-up address.
     */
    const locBtn = $('[data-locate]', root);
    let locating = false;
    locBtn.addEventListener('click', () => {
      if (locating) return;
      O.haptic.selectionTick();
      if (!navigator.geolocation) {
        O.okaAlert(L('Could not find your location', 'تعذّر تحديد الموقع'), L('This browser can’t share a location.', 'المتصفح ده مش بيدعم تحديد الموقع.'));
        return;
      }
      locating = true;
      const icon = $('[data-loc-icon]', locBtn);
      const txt = $('[data-loc-txt]', locBtn);
      const iconHtml = icon.innerHTML;
      const txtHtml = txt.innerHTML;
      icon.innerHTML = '<span class="spinner dark sm"></span>';
      txt.textContent = L('Locating…', 'بنحدد موقعك…');
      const done = () => { locating = false; icon.innerHTML = iconHtml; txt.innerHTML = txtHtml; };
      navigator.geolocation.getCurrentPosition(async (pos) => {
        try {
          const u = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&accept-language=${O.lang()}`;
          const r = await fetch(u, { headers: { Accept: 'application/json' } });
          const j = await r.json();
          const a = j.address || {};
          if (!j.address) throw new Error(L('no address found for this location', 'مفيش عنوان للمكان ده'));
          const street = [a.house_number, a.road].filter(Boolean).join(' ') || a.neighbourhood || a.suburb || '';
          const city = a.suburb || a.city_district || a.neighbourhood || a.city || a.town || a.village || '';
          if (street) field('street').value = street;
          if (city) field('city').value = city;
          const match = O.provinceOf({ province: a.state || a.governorate || '', city: a.city || a.town || '' });
          if (match) { provinceCode = match.code; paintProvinces(); }
          if (!field('phone').value && O.customer?.phone) field('phone').value = O.customer.phone;
          $('[data-found]', root).hidden = false;
        } catch (err) {
          O.okaAlert(L('Could not find your location', 'تعذّر تحديد الموقع'), errText(err));
        } finally { done(); }
      }, () => {
        done();
        O.okaAlert(L('Location permission denied', 'إذن الموقع مرفوض'), L('Enable location access in Settings to fill the address automatically.', 'فعّل إذن الموقع من إعدادات الجهاز عشان نملأ العنوان تلقائياً.'));
      }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 });
    });

    let saving = false;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (saving) return;
      const v = (k) => field(k).value.trim();
      const missing = [];
      if (!v('street')) missing.push(L('street', 'الشارع'));
      if (!v('city')) missing.push(L('area', 'المنطقة'));
      if (!provinceCode) missing.push(L('governorate', 'المحافظة'));
      if (!/^(\+?20|0)?1[0125]\d{8}$/.test(v('phone').replace(/[\s-]/g, ''))) missing.push(L('a valid mobile number', 'رقم موبايل صحيح'));
      if (missing.length) {
        O.okaAlert(L('Missing details', 'ناقص بيانات'), L('Please add: ', 'محتاجين: ') + missing.join(L(', ', '، ')));
        return;
      }
      const building = [v('building'), v('landmark')].filter(Boolean).join(' — ');
      const province = O.PROVINCES.find((p) => p.code === provinceCode);
      saving = true;
      const btn = $('[data-save]', form);
      const btnHtml = btn.innerHTML;
      btn.innerHTML = spinner();
      const next = O.store.get('oka.afterAddress') || CFG.routes.addresses;

      if (O.hasService()) {
        try {
          const r = await O.api('/customer/addresses', {
            method: 'POST',
            body: {
              address: { name: v('name') || O.customer?.name, phone: v('phone'), street: v('street'), building, city: v('city'), provinceCode },
              setAsDefault: makeDefault,
            },
          });
          if (r.id) O.selectAddress(numericId(r.id));
          O.store.del('oka.afterAddress');
          go(next);
        } catch (err) {
          saving = false;
          btn.innerHTML = btnHtml;
          O.okaAlert(L('Could not save the address', 'تعذّر حفظ العنوان'), errText(err));
        }
        return;
      }

      // Shopify's classic account form; it returns to /account/addresses,
      // which hands the shopper back to where they were going.
      const [first, ...rest] = (v('name') || O.customer?.name || '').split(/\s+/);
      $('[data-first]', form).value = first || '';
      $('[data-last]', form).value = rest.join(' ');
      $('[data-address2]', form).value = building;
      $('[data-province-name]', form).value = province.en;
      $('[data-default-input]', form).value = makeDefault ? '1' : '0';
      form.submit();
    });
  }

  /* ════════════════════════════════════════════════════════════════════
   * Loyalty (LoyaltyScreen.js)
   * ════════════════════════════════════════════════════════════════════ */
  const DEFAULT_REWARDS = [
    { id: 'off20', points: 200, en: '20 EGP off orders over 300', ar: 'خصم ٢٠ ج.م على طلب فوق ٣٠٠' },
    { id: 'off50', points: 500, en: '50 EGP off orders over 600', ar: 'خصم ٥٠ ج.م على طلب فوق ٦٠٠' },
    { id: 'ship', points: 800, en: 'Free delivery (80 EGP off) over 800', ar: 'توصيل مجاني (خصم ٨٠ ج.م) فوق ٨٠٠' },
    { id: 'off150', points: 1500, en: '150 EGP off orders over 1,500', ar: 'خصم ١٥٠ ج.م على طلب فوق ١٥٠٠' },
  ];
  function loyalty(root) {
    if (!O.customer) return;
    let balance = root.dataset.points === '' ? null : Number(root.dataset.points);
    let rewards = DEFAULT_REWARDS;
    let busyId = null;
    let error = null;
    const fmtPts = (n) => (O.isRtl() ? O.arDigits(n) : Number(n).toLocaleString('en-US'));
    const ppe = CFG.pointsPerEgp || 10;

    function render() {
      const next = rewards.find((r) => (balance ?? 0) < r.points) || null;
      const pct = next ? Math.min(100, Math.round(((balance ?? 0) / next.points) * 100)) : 100;
      const worth = Math.floor((balance ?? 0) / ppe);
      $('[data-points-val]', root).innerHTML = balance == null ? spinner() : esc(fmtPts(balance));
      requestAnimationFrame(() => { $('[data-points-pct]', root).style.width = `${pct}%`; });
      const errEl = $('[data-points-err]', root);
      errEl.hidden = !error;
      errEl.textContent = error || '';
      $('[data-next-tier]', root).textContent = next
        ? L(`${fmtPts(next.points - (balance ?? 0))} points to your next reward · worth EGP ${worth}`, `${fmtPts(next.points - (balance ?? 0))} نقطة للمكافأة الجاية · قيمتها ${fmtPts(worth)} ج.م`)
        : L('Every reward is unlocked', 'تقدر تستبدل أي مكافأة');

      const vouchers = (O.store.get('oka.vouchers', []) || []).filter((v) => new Date(v.endsAt) > new Date());
      $('[data-vouchers]', root).innerHTML = vouchers.length ? `
        <div class="section-title">${esc(L('Your codes', 'أكوادك'))}</div>
        <div class="rewards">${vouchers.map((v) => `
          <button class="reward-row" data-voucher="${esc(v.code)}"><span style="flex:1;min-width:0">
            <span class="reward-title" style="display:block">${esc(v.code)}</span>
            <span class="reward-cost" style="display:block">${esc(L(v.reward.en, v.reward.ar))}</span>
          </span></button>`).join('')}</div>` : '';

      $('[data-rewards]', root).innerHTML = rewards.map((r) => {
        const ok = balance != null && balance >= r.points;
        return `<div class="reward-row">
          <span style="flex:1;min-width:0">
            <span class="reward-title" style="display:block">${esc(L(r.en, r.ar))}</span>
            <span class="reward-cost" style="display:block">${esc(L(`${fmtPts(r.points)} points`, `${fmtPts(r.points)} نقطة`))}</span>
          </span>
          <button class="reward-btn${ok ? ' on' : ''}" data-redeem="${esc(r.id)}">${busyId === r.id ? spinner().replace('spinner', 'spinner sm') : esc(ok ? L('Redeem', 'استبدال') : L('Locked', 'مقفول'))}</button>
        </div>`;
      }).join('');

      const rate = CFG.earnPointsPerEgp || 1;
      const rules = O.isRtl()
        ? [[rate >= 1 ? 'كل ١ ج.م منتجات بتوصلك' : `كل ${O.arDigits(Math.round(1 / rate))} ج.م منتجات بتوصلك`, rate >= 1 ? `${O.arDigits(Math.round(rate))} نقطة` : 'نقطة واحدة'],
          ['النقاط بتنزل', 'بعد التسليم'], [`${O.arDigits(ppe)} نقاط`, 'تساوي ١ ج.م']]
        : [[rate >= 1 ? 'Every EGP 1 of products delivered' : `Every EGP ${Math.round(1 / rate)} of products delivered`, rate >= 1 ? `${Math.round(rate)} point${rate > 1 ? 's' : ''}` : '1 point'],
          ['Points arrive', 'after delivery'], [`${ppe} points`, 'worth EGP 1']];
      $('[data-earn]', root).innerHTML = rules.map(([a, b]) => `<div class="earn-row"><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join('');
    }

    function showVoucher(v) {
      O.okaAlert(L('Your voucher code', 'كود الخصم بتاعك'), `${v.code}\n\n${L(v.reward.en, v.reward.ar)}`, [
        { text: L('Copy', 'نسخ'), onPress: () => navigator.clipboard?.writeText(v.code).catch(() => {}) },
        { text: L('Use in cart', 'استخدمه في السلة'), onPress: () => { O.store.set('oka.pendingCode', v.code); go(CFG.routes.cart); } },
      ]);
    }

    root.addEventListener('click', (e) => {
      const vb = e.target.closest('[data-voucher]');
      if (vb) {
        const v = (O.store.get('oka.vouchers', []) || []).find((x) => x.code === vb.dataset.voucher);
        if (v) showVoucher(v);
        return;
      }
      const rb = e.target.closest('[data-redeem]');
      if (!rb || busyId) return;
      const r = rewards.find((x) => x.id === rb.dataset.redeem);
      if (!r || balance == null || balance < r.points) return;
      if (!O.hasService()) {
        // Points are the account's Shopify store credit; Shopify's checkout spends it directly.
        const worth = Math.floor(balance / ppe);
        O.okaAlert(
          L('Use your points at checkout', 'استخدم نقاطك في الدفع'),
          L(`Your ${fmtPts(balance)} points are EGP ${worth} of store credit. Choose to apply it on the payment step at checkout.`,
            `نقاطك (${fmtPts(balance)}) تساوي ${fmtPts(worth)} ج.م رصيد في المتجر. اختار تطبيقه في خطوة الدفع.`),
        );
        return;
      }
      O.okaAlert(L('Redeem points', 'استبدال النقاط'),
        L(`${fmtPts(r.points)} points for a one-time code: ${r.en}. Valid for 90 days.`, `هنخصم ${fmtPts(r.points)} نقطة ونديك كود: ${r.ar}. صالح ${fmtPts(90)} يوم ولمرة واحدة.`),
        [
          { text: L('Back', 'رجوع'), style: 'cancel' },
          {
            text: L('Redeem', 'استبدال'),
            onPress: async () => {
              busyId = r.id;
              render();
              try {
                const res = await O.api('/loyalty/redeem', { method: 'POST', body: { rewardId: r.id } });
                O.haptic.success();
                balance = res.balance;
                O.store.set('oka.vouchers', [res.voucher, ...(O.store.get('oka.vouchers', []) || [])].slice(0, 10));
                showVoucher(res.voucher);
              } catch (err) {
                O.okaAlert(L('Could not redeem', 'تعذّر الاستبدال'), errText(err));
              } finally { busyId = null; render(); }
            },
          },
        ]);
    });

    render();
    if (O.hasService()) {
      O.api('/loyalty').then((r) => {
        balance = r.balance ?? 0;
        if (Array.isArray(r.rewards) && r.rewards.length) rewards = r.rewards;
        error = null;
        render();
      }).catch((err) => { error = errText(err); render(); });
    } else if (balance == null) {
      balance = 0;
      render();
    }
    onLang(render);
  }

  /* ════════════════════════════════════════════════════════════════════
   * Subscriptions (SubscriptionsScreen.js) — order service only
   * ════════════════════════════════════════════════════════════════════ */
  const STATUS_META = {
    active: { en: 'Active', ar: 'نشط', color: 'var(--green-deep)', bg: 'rgba(31,143,78,0.09)' },
    paused: { en: 'Paused', ar: 'متوقف مؤقتاً', color: 'var(--ink-95)', bg: 'rgba(0,0,0,0.045)' },
    action_needed: { en: 'Needs attention', ar: 'يحتاج انتباه', color: 'var(--red-deep)', bg: 'rgba(179,38,30,0.08)' },
    cancelled: { en: 'Cancelled', ar: 'ملغي', color: 'rgba(110,110,115,0.7)', bg: 'rgba(0,0,0,0.03)' },
  };
  const FREQ_LABELS = { weekly: ['week', 'أسبوع'], biweekly: ['2 weeks', 'أسبوعين'], monthly: ['month', 'شهر'] };
  const fmtDate = (iso) => {
    const dt = new Date(iso);
    return Number.isNaN(dt.getTime()) ? '' : dt.toLocaleDateString(O.isRtl() ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const serviceMissing = () => `<div class="awaiting">${esc(L(
    'Subscribe & Save isn’t switched on for the website yet. It’s available in the OKA app.',
    'الاشتراك والتوفير مش متفعّل على الموقع لسه. متاح في تطبيق أوكا.'))}</div>`;

  function subscriptions(root) {
    const host = $('[data-subs-root]', root);
    if (!host) return;
    if (!O.hasService()) { host.innerHTML = serviceMissing(); return; }
    let subs = null;
    let busyId = null;

    function render() {
      const cta = `<div style="padding:0 22px;margin-bottom:18px"><a class="cta bold" href="${esc(CFG.routes.subscribe)}" data-new-sub style="gap:8px;font-size:14.5px">${plusIcon(14, '#fff')}${esc(L('New subscription', 'اشتراك جديد'))}</a></div>`;
      if (subs == null) { host.innerHTML = `${cta}<div style="display:flex;justify-content:center;padding:30px">${spinner(true)}</div>`; return; }
      host.innerHTML = cta + (subs.length === 0
        ? `<div class="empty" style="padding:30px 22px;line-height:20px;color:var(--ink-soft)">${esc(L('No subscriptions yet. Start one to get your regulars delivered automatically, at a discount.', 'لسه معندكش اشتراكات. ابدأ واحد عشان توصلك طلباتك أوتوماتيك بخصم.'))}</div>`
        : subs.map((s) => {
          const meta = STATUS_META[s.status] || STATUS_META.paused;
          const items = s.items || [];
          const busy = busyId === s.id;
          const freq = FREQ_LABELS[s.frequencyId] ? FREQ_LABELS[s.frequencyId][O.isRtl() ? 1 : 0] : s.frequencyId;
          return `<div class="sub-card" data-sub="${esc(s.id)}">
            <div class="sub-top">
              <div style="flex:1;min-width:0">
                <div class="sub-items">${esc(items.length > 1 ? L(`${items[0].title} +${items.length - 1} more`, `${items[0].title} و${num(items.length - 1)} أخرى`) : items[0]?.title ?? '')}</div>
                <div class="sub-freq">${esc(`${L('Every ', 'كل ')}${freq} — ${L(`${s.discountPct}% off`, `خصم ${num(s.discountPct)}٪`)}`)}</div>
              </div>
              <span class="status-badge" style="background:${meta.bg};color:${meta.color}">${esc(L(meta.en, meta.ar))}</span>
            </div>
            ${s.status === 'active' || s.status === 'paused' ? `<div class="sub-next">${esc(s.status === 'paused' ? L("Paused — won't ship right now", 'متوقف — مش هيتشحن حاليًا') : L('Next order: ', 'الطلب الجاي: ') + fmtDate(s.nextOrderDate))}</div>` : ''}
            ${s.status === 'action_needed' && s.lastError ? `<div class="sub-err">${esc(s.lastError)}</div>` : ''}
            ${s.ordersCreated > 0 ? `<div class="sub-hist">${esc(L(`${s.ordersCreated} order${s.ordersCreated > 1 ? 's' : ''} shipped — last ${s.lastOrderName ?? ''}`, `${num(s.ordersCreated)} طلب اتشحن — آخر واحد ${s.lastOrderName ?? ''}`))}</div>` : ''}
            ${s.status !== 'cancelled' ? `<div class="sub-actions">
              <button class="sub-btn" data-act="edit">${esc(L('Edit', 'تعديل'))}</button>
              ${s.status === 'paused' || s.status === 'action_needed'
                ? `<button class="sub-btn" data-act="resume">${busy ? '…' : esc(L('Resume', 'استئناف'))}</button>`
                : `<button class="sub-btn" data-act="pause">${busy ? '…' : esc(L('Pause', 'إيقاف مؤقت'))}</button>`}
              <button class="sub-btn red" data-act="cancel">${esc(L('Cancel', 'إلغاء'))}</button>
            </div>` : ''}
          </div>`;
        }).join(''));
    }

    async function act(sub, action) {
      if (busyId) return;
      busyId = sub.id;
      render();
      try {
        const r = await O.api(`/subscriptions/${encodeURIComponent(sub.id)}/${action}`, { method: 'POST', body: {} });
        subs = subs.map((s) => (s.id === sub.id ? r.subscription : s));
      } catch (err) {
        O.okaAlert(L('Could not do that', 'تعذّر تنفيذ الإجراء'), errText(err));
      } finally { busyId = null; render(); }
    }

    host.addEventListener('click', (e) => {
      if (e.target.closest('[data-new-sub]')) { O.store.sset('oka.editingSub', null); return; }
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const sub = subs.find((s) => String(s.id) === b.closest('[data-sub]').dataset.sub);
      if (!sub) return;
      if (b.dataset.act === 'edit') { O.store.sset('oka.editingSub', sub); go(CFG.routes.subscribe); return; }
      if (b.dataset.act === 'cancel') {
        O.okaAlert(L('Cancel subscription', 'إلغاء الاشتراك'), L('No more orders will go out until you subscribe again.', 'مش هتتشحن طلبات جديدة بعد كده لحد ما تشترك تاني.'), [
          { text: L('Back', 'رجوع'), style: 'cancel' },
          { text: L('Cancel subscription', 'إلغاء الاشتراك'), style: 'destructive', onPress: () => act(sub, 'cancel') },
        ]);
        return;
      }
      act(sub, b.dataset.act);
    });

    render();
    O.api('/subscriptions').then((r) => { subs = r.subscriptions || []; render(); }).catch(() => { subs = []; render(); });
    onLang(render);
  }

  /* ════════════════════════════════════════════════════════════════════
   * Subscribe & Save builder (SubscribeScreen.js) — order service only
   * ════════════════════════════════════════════════════════════════════ */
  function subscribe(root) {
    const host = $('[data-subscribe-root]', root);
    if (!host) return;
    if (!O.hasService()) { host.innerHTML = serviceMissing(); return; }
    const editing = O.store.sget('oka.editingSub');
    if (editing) $('.hdr-title', root).innerHTML = `<span class="l-en">Edit Subscription</span><span class="l-ar">تعديل الاشتراك</span>`;
    const pct = CFG.subscriptionDiscount || 5;
    let frequencies = [
      { id: 'monthly', en: 'Every month', ar: 'كل شهر', discountPct: pct },
      { id: 'biweekly', en: 'Every 2 weeks', ar: 'كل أسبوعين', discountPct: pct },
      { id: 'weekly', en: 'Every week', ar: 'كل أسبوع', discountPct: pct },
    ];
    let frequencyId = editing?.frequencyId ?? null;
    let catalogue = null;
    let addrs = [];
    let picked = null;
    let subCart = {};
    let submitting = false;

    function render() {
      if (!catalogue) { host.innerHTML = `<div style="display:flex;justify-content:center;padding:30px">${spinner(true)}</div>`; return; }
      const { products, cats } = catalogue;
      const freq = frequencies.find((f) => f.id === frequencyId) || null;
      const entries = Object.keys(subCart).map((id) => ({ p: products.find((x) => x.id === id), qty: subCart[id] })).filter((e) => e.p);
      const subtotal = entries.reduce((a, e) => a + e.p.price * e.qty, 0);
      const discount = freq ? Math.round(subtotal * (freq.discountPct / 100)) : 0;
      const shipping = O.shippingFor(subtotal - discount);
      const total = subtotal - discount + shipping;
      const minOrder = Number(CFG.minOrder) || 0;
      const below = entries.length > 0 && minOrder > 0 && subtotal - discount < minOrder;
      const sel = O.selectedAddress();
      const active = picked || addrs.find((a) => sel && numericId(a.id) === String(sel.id)) || addrs.find((a) => a.isDefault) || null;
      const can = Boolean(freq) && entries.length > 0 && Boolean(active) && !below;
      const scroll = root.scrollTop;

      host.innerHTML = `
        <div class="sec-label">${esc(L('THE MORE OFTEN IT ARRIVES, THE MORE YOU SAVE', 'كل ما توصلك بشكل متكرر، وفّر أكتر'))}</div>
        ${frequencies.map((f) => `<button class="freq-row${f.id === frequencyId ? ' on' : ''}" data-freq="${esc(f.id)}">
          <span class="freq-label">${esc(L(f.en, f.ar))}</span>
          <span class="freq-badge">${esc(L(`Save ${f.discountPct}%`, `وفّر ${num(f.discountPct)}٪`))}</span></button>`).join('')}
        <div class="rule16"></div>
        <div class="sec-label">${esc(L('DELIVERY ADDRESS', 'عنوان التوصيل'))}</div>
        ${addrs.length ? addressPicker(addrs, active?.id, 'data-pick')
          : `<a class="notice" href="${esc(CFG.routes.addAddress)}">${esc(L('No saved address yet — add one first.', 'مفيش عنوان محفوظ — ضيف عنوان الأول.'))}</a>`}
        <div class="rule16"></div>
        <div class="sec-label">${esc(L('CHOOSE YOUR PRODUCTS', 'اختار المنتجات'))}</div>
        ${cats.map((c) => {
          const group = products.filter((p) => p.cat === c.id);
          if (!group.length) return '';
          return `<div class="group-label">${esc(L(c.en, c.ar))}</div>${group.map((p) => `
            <div class="cat-item" data-pid="${esc(p.id)}">
              <div class="cat-item-img">${img(p.img)}</div>
              <div class="cat-item-meta"><div class="cat-item-title">${esc(O.ptitle(p))}</div><div class="cat-item-price">${esc(fmtPrice(p.price))}</div></div>
              ${stepper(subCart[p.id] || 0, { size: 26, fs: 14, gap: 8 })}
            </div>`).join('')}`;
        }).join('')}
        <div class="rule16"></div>
        <div class="sub-totals">
          ${sumRow(t('subtotal'), fmtPrice(subtotal))}
          ${freq ? sumRow(L(`${freq.discountPct}% discount`, `خصم ${num(freq.discountPct)}٪`), `-${fmtPrice(discount)}`, 'green') : ''}
          ${sumRow(L('Shipping', 'الشحن'), shipping > 0 ? fmtPrice(shipping) : L('Free', 'مجاني'))}
          ${sumRow(L('Each delivery', 'كل عملية توصيل'), fmtPrice(total), 'main')}
        </div>
        <div style="padding:6px 22px 30px">
          <button class="cta bold" data-submit>${submitting ? spinner() : esc(editing ? L('Save changes', 'حفظ التعديلات') : L('Start subscription', 'ابدأ الاشتراك'))}</button>
          ${!can ? `<div class="hint">${esc(!freq ? L('Pick a delivery frequency first.', 'اختار مواعيد التوصيل الأول.')
            : !entries.length ? L('Add at least one product.', 'ضيف منتج واحد على الأقل.')
              : below ? L(`Each delivery needs at least ${fmtPrice(minOrder)} after the discount.`, `أقل طلب ${fmtPrice(minOrder)} بعد الخصم.`)
                : L('A delivery address is needed.', 'محتاج عنوان توصيل.'))}</div>` : ''}
        </div>`;
      root.scrollTop = scroll;
      host.dataset.can = can ? '1' : '';
      host._active = active;
      host._freq = freq;
      host._entries = entries;
    }

    host.addEventListener('click', async (e) => {
      const f = e.target.closest('[data-freq]');
      if (f) { frequencyId = f.dataset.freq; return render(); }
      const pk = e.target.closest('[data-pick]');
      if (pk) { picked = addrs.find((a) => String(a.id) === pk.dataset.pick) || null; return render(); }
      const st = e.target.closest('[data-step]');
      if (st) {
        const id = st.closest('[data-pid]').dataset.pid;
        const q = Math.max(0, (subCart[id] || 0) + Number(st.dataset.step));
        if (q === 0) delete subCart[id]; else subCart[id] = q;
        return render();
      }
      if (e.target.closest('[data-submit]')) {
        if (submitting || !host.dataset.can) return;
        submitting = true;
        render();
        const items = host._entries.map((x) => ({ variantId: `gid://shopify/ProductVariant/${x.p.variantId}`, title: x.p.titleEn, quantity: x.qty }));
        try {
          if (editing) {
            await O.api(`/subscriptions/${encodeURIComponent(editing.id)}/update`, { method: 'POST', body: { items, frequencyId: host._freq.id, addressId: host._active.id } });
          } else {
            await O.api('/subscriptions', { method: 'POST', body: { frequencyId: host._freq.id, items, addressId: host._active.id } });
          }
          O.haptic.success();
          O.store.sset('oka.editingSub', null);
          go(CFG.routes.subscriptions);
        } catch (err) {
          submitting = false;
          render();
          O.okaAlert(L('Could not save the subscription', 'تعذّر حفظ الاشتراك'), errText(err));
        }
      }
    });

    render();
    O.api('/subscription-frequencies').then((r) => { if (r.frequencies?.length) { frequencies = r.frequencies; render(); } }).catch(() => {});
    Promise.all([O.loadCatalogue(), serviceAddresses()]).then(([cat, list]) => {
      catalogue = cat;
      addrs = list;
      if (editing) {
        (editing.items || []).forEach((it) => {
          const vid = String(it.variantId).replace(/\D/g, '');
          const p = cat.products.find((pp) => String(pp.variantId) === vid);
          if (p) subCart[p.id] = it.quantity;
        });
        picked = addrs.find((a) => a.raw?.address1 === editing.address?.address1 && a.raw?.city === editing.address?.city) || null;
      }
      render();
    });
    onLang(render);
  }

  /* ════════════════════════════════════════════════════════════════════
   * Wishlist (WishlistScreen.js)
   * ════════════════════════════════════════════════════════════════════ */
  function wishlistScreen(root) {
    const host = $('[data-wish-root]', root);
    async function render() {
      const { products } = await O.loadCatalogue();
      const saved = products.filter((p) => O.wishlist.has(p.id));
      host.innerHTML = saved.length
        ? `${grid(saved)}${!O.customer ? `<div class="empty" style="padding:20px 30px;font-size:12.5px;color:var(--ink-soft)">${esc(L('Sign in to keep your wishlist on your account.', 'سجّل دخولك عشان المفضلة تتحفظ على حسابك.'))}</div>` : ''}`
        : `<div class="empty" style="padding:36px 30px;font-size:14px;line-height:21px;color:var(--ink-soft)">${esc(L('Tap the heart on any product to save it here.', 'اضغط على القلب في أي منتج عشان تحفظه هنا.'))}</div>
           <div style="padding:0 22px"><a class="cta" href="${esc(CFG.routes.root)}">${esc(t('browse'))}</a></div>`;
    }
    // Signed in with the service: the account's list wins over this device's.
    if (O.hasService() && O.customer) {
      O.api('/customer/wishlist').then((r) => {
        if (Array.isArray(r.ids)) O.store.set('oka.wishlist', Object.fromEntries(r.ids.map((id) => [id, true])));
        render();
      }).catch(() => {});
    }
    render();
    onLang(render);
  }

  /* ════════════════════════════════════════════════════════════════════
   * Sign in (SignInScreen.js) and Support
   * ════════════════════════════════════════════════════════════════════ */
  function login(root) {
    const lp = $('[data-login-panel]', root);
    const rp = $('[data-recover-panel]', root);
    const showRecover = (on) => { lp.hidden = on; rp.hidden = !on; };
    $('[data-show-recover]', root)?.addEventListener('click', () => showRecover(true));
    $('[data-show-login]', root)?.addEventListener('click', () => showRecover(false));
    if (location.hash === '#recover') showRecover(true);
  }

  function support(root) {
    const wa = $('[data-wa-chat]', root);
    if (!wa) return;
    wa.addEventListener('click', (e) => {
      e.preventDefault();
      const last = O.store.get('oka.lastOrder');
      const text = last ? L(`Hi, about order ${last}`, `مرحباً، بخصوص طلب ${last}`) : L('Hi', 'مرحباً');
      window.open(O.whatsappUrl(text), '_blank', 'noopener');
    });
  }

  /* ── boot ────────────────────────────────────────────────────────────── */
  const SCREENS = {
    home, collection, search, product, cart, checkout, orders, account,
    addresses: addressesScreen, 'add-address': addAddress, loyalty, subscriptions, subscribe,
    wishlist: wishlistScreen, login, support,
  };
  function boot() {
    $$('[data-screen]').forEach((root) => {
      const fn = SCREENS[root.dataset.screen];
      if (!fn) return;
      try { fn(root); } catch (err) { console.error(`[oka] ${root.dataset.screen} failed:`, err); }
    });
    // Remember the latest order for the WhatsApp greeting.
    const firstOrder = $('[data-open-order]');
    if (firstOrder) O.store.set('oka.lastOrder', firstOrder.dataset.openOrder);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
