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
  const heartSvg = (filled) =>
    `<svg width="20" height="20" viewBox="0 0 24 24"><path d="M12 20.5s-7.5-4.6-9.6-9.2C.9 8 2.6 4 6.4 4c2.3 0 3.9 1.4 5.6 3.5C13.7 5.4 15.3 4 17.6 4c3.8 0 5.5 4 4 7.3-2.1 4.6-9.6 9.2-9.6 9.2z" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
  const trashSvg = () =>
    `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V4.8c0-.4.4-.8.8-.8h4.4c.4 0 .8.4.8.8V7m-9 0 .8 12.2c0 .5.5.8 1 .8h6.4c.5 0 1-.3 1-.8L17 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  /** The wishlist heart on a product card (assets/oka.js wires every [data-heart]). */
  const heartBtn = (handle) =>
    `<button class="heart-btn${O.wishlist.has(handle) ? ' on' : ''}" data-heart="${esc(handle)}" aria-label="${esc(L('Save to wishlist', 'احفظ في المفضلة'))}">${heartSvg(false)}</button>`;
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
      ${heartBtn(p.id)}
      <div class="gcard-body">
        <a href="${esc(p.url)}" class="gcard-title">${esc(O.ptitle(p))}</a>
        <div class="gcard-row">
          <span class="gcard-price">${esc(fmtPrice(p.price))}</span>
          <button class="gcard-add" data-add="${p.variantId}"${p.stock === 0 || p.available === false ? ' data-soldout' : ''}>${esc(L('Add', 'عبيلي فالشنطة'))}</button>
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
    const pages = $$('.page', feed);
    let activePage = 0;

    /** One page per snap: titles, haptic, and the shrinking logo bar. */
    function setActive(k) {
      if (k === activePage) return;
      activePage = k;
      pages.forEach((el, j) => el.classList.toggle('active', j === k));
      O.haptic.snapCollection();
      pages.forEach((el, j) => { if (j !== k && el._raf) stopSwing(el); });
      if (pages[k]?.hasAttribute('data-compare')) startSwing(pages[k]);
    }

    let raf = 0;
    feed.addEventListener('scroll', () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (!feed.clientHeight) return;
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

    /*
     * A card off to the side (faded, scaled down) is not a target yet: a tap
     * on it — the card, its add button or its AR pill — only brings it to the
     * centre. Opening a product or adding it takes a tap on the card in focus.
     * Capture phase, so it runs before the card's own link and the global
     * add-to-cart handler, and can stop both.
     */
    feed.addEventListener('click', (e) => {
      const slot = e.target.closest('[data-slot]');
      if (!slot || slot.classList.contains('active')) return;
      e.preventDefault();
      e.stopPropagation();
      const rail = slot.closest('[data-rail]');
      if (!rail) return;
      const rr = rail.getBoundingClientRect();
      const sr = slot.getBoundingClientRect();
      rail.scrollBy({ left: sr.left + sr.width / 2 - (rr.left + rr.width / 2), behavior: 'smooth' });
      O.haptic.selectionTick();
    }, true);

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
      page._pos = v;
      page.style.setProperty('--pos', `${v}%`);
      const r = $('[data-compare-range]', page);
      if (r) r.value = String(Math.round(v));
    }
    /*
     * The divider keeps sweeping left and right while the slider is on
     * screen, so the motion catches the eye; a drag takes over, and the
     * sweep resumes a few seconds after the finger lifts.
     */
    const SWING_MS = 3200;  // one full left-right-left
    const SWING_AMP = 32;   // ± percent around the middle
    const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
    function stopSwing(page) {
      cancelAnimationFrame(page._raf);
      page._raf = 0;
      clearTimeout(page._resume);
    }
    function startSwing(page) {
      stopSwing(page);
      if (reduceMotion()) return;
      // Start from wherever the divider is, so it never jumps.
      const from = Math.asin(Math.max(-1, Math.min(1, ((page._pos ?? 50) - 50) / SWING_AMP)));
      const t0 = performance.now() - (from / (2 * Math.PI)) * SWING_MS;
      const tick = (now) => {
        setPos(page, 50 + SWING_AMP * Math.sin(((now - t0) / SWING_MS) * 2 * Math.PI));
        page._raf = requestAnimationFrame(tick);
      };
      page._raf = requestAnimationFrame(tick);
    }
    const swingIfShown = (page) => { if (pages[activePage] === page) startSwing(page); };
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
          stopSwing(page);
          frame.setPointerCapture?.(e.pointerId);
        }
        setPos(page, pctAt(e.clientX));
      });
      const end = () => {
        if (drag?.on) page._resume = setTimeout(() => swingIfShown(page), 3000);
        drag = null;
      };
      frame.addEventListener('pointerup', end);
      frame.addEventListener('pointercancel', end);
      range?.addEventListener('input', () => {
        stopSwing(page);
        setPos(page, Number(range.value));
        page._resume = setTimeout(() => swingIfShown(page), 3000);
      });
    });
    if (pages[0]?.hasAttribute('data-compare')) startSwing(pages[0]);

    /*
     * Customer photos carousel. It turns slowly on its own; a finger on it
     * holds it still, a sideways drag turns it (and a flick keeps it
     * spinning, easing back to the slow turn), and a tap pauses it until the
     * next tap. Vertical swipes still scroll the feed.
     */
    $$('[data-ribbon]', feed).forEach((page) => {
      const ring = $('[data-ribbon-ring]', page);
      const stage = $('.ribbon-stage', page);
      if (!ring || !stage) return;
      const secs = parseFloat(page.style.getPropertyValue('--spin')) || 40;
      const cruise = reduceMotion() ? 0 : -360 / secs; // degrees per second
      let angle = 0;
      let vel = cruise;
      let paused = false;
      let drag = null;
      let raf = 0;
      let last = 0;
      const paint = () => { ring.style.transform = `translateZ(calc(var(--r) * -0.5)) rotateY(${angle}deg)`; };
      const tick = (now) => {
        const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
        last = now;
        if (!drag && !paused) {
          vel += (cruise - vel) * Math.min(1, dt * 1.2); // a flick settles back to the slow turn
          angle += vel * dt;
          paint();
        }
        raf = requestAnimationFrame(tick);
      };
      const run = (on) => {
        cancelAnimationFrame(raf);
        raf = 0;
        last = 0;
        if (on) raf = requestAnimationFrame(tick);
      };
      // Only turn while the page is on screen.
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(([en]) => run(en.isIntersecting && en.intersectionRatio > 0.4), { threshold: [0, 0.4, 1] }).observe(page);
      } else run(true);

      const degPerPx = () => 360 / Math.max(240, stage.clientWidth * 1.6);
      stage.addEventListener('pointerdown', (e) => {
        drag = { x: e.clientX, y: e.clientY, a0: angle, on: false, lx: e.clientX, lt: performance.now(), v: 0, id: e.pointerId };
      });
      stage.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        if (!drag.on) {
          if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; } // the feed's scroll
          if (Math.abs(dx) < 6) return;
          drag.on = true;
          stage.setPointerCapture?.(e.pointerId);
        }
        angle = drag.a0 + dx * degPerPx();
        const now = performance.now();
        const dtm = Math.max(1, now - drag.lt);
        drag.v = ((e.clientX - drag.lx) * degPerPx() * 1000) / dtm;
        drag.lx = e.clientX;
        drag.lt = now;
        paint();
      });
      const end = (e) => {
        if (!drag || (e && e.pointerId !== drag.id)) return;
        const d = drag;
        drag = null;
        if (!d.on) { paused = !paused; vel = paused ? 0 : cruise; return; } // a tap: pause / carry on
        paused = false;
        // A flick keeps the ring going in that direction; a slow release just carries on.
        vel = Math.abs(d.v) > 40 ? Math.max(-720, Math.min(720, d.v)) : cruise;
      };
      stage.addEventListener('pointerup', end);
      stage.addEventListener('pointercancel', end);
      paint();
    });

    // The feed's own size drives the card sizes (CSS --fh / --fw). Measured
    // here rather than with container queries, which older iPhones lack.
    const sizeFeed = () => {
      if (!feed.clientHeight) return;
      feed.style.setProperty('--fh', `${feed.clientHeight}px`);
      feed.style.setProperty('--fw', `${feed.clientWidth}px`);
    };
    sizeFeed();
    if ('ResizeObserver' in window) new ResizeObserver(sizeFeed).observe(feed);
    else window.addEventListener('resize', sizeFeed);

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
    { id: 'priceAsc', en: 'Price: low to high', ar: 'الأرخص الأول' },
    { id: 'priceDesc', en: 'Price: high to low', ar: 'الأغلى الأول' },
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

    O.viewed.add(d.handle);
    O.loadCatalogue().then((catalogue) => {
      const me = catalogue.products.find((p) => p.id === d.handle);
      const wrap = $('[data-related]', root);
      if (!me || !wrap) return;
      // Frequently bought together, with one "step up" in the same collection first.
      const draw = () => {
        const recs = O.recommend(catalogue, { moment: 'product', anchor: me.id, limit: 6 });
        const up = O.recommend(catalogue, { moment: 'upgrade', anchor: me.id, limit: 1 })[0];
        const list = (up ? [up, ...recs.filter((r) => r.p.id !== up.p.id)] : recs).slice(0, 6);
        if (!list.length) { wrap.hidden = true; return; }
        $('[data-related-list]', root).innerHTML = list.map((r) => `
          <div class="rcard">
            <a href="${esc(r.p.url)}" class="rcard-img">${img(r.p.img)}</a>
            <div class="rcard-body">
              <div class="rcard-why${r.why === 'upgrade' ? ' up' : ''}">${esc(O.recReason(r))}</div>
              <a href="${esc(r.p.url)}" class="rcard-title">${esc(O.ptitle(r.p))}</a>
              <div class="rcard-foot"><span class="rcard-price">${esc(fmtPrice(r.p.price))}</span>
                <button class="rcard-add press" data-add="${r.p.variantId}" aria-label="${esc(t('add'))}">+</button></div>
            </div>
          </div>`).join('');
        wrap.hidden = false;
      };
      draw();
      dragScroll($('[data-related-list]', root));
      onLang(draw);
      onCart(draw);
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
    /** Other products in the same collection at the same price, e.g. the other tobacco-bowl flavours. */
    const siblingsOf = (handle) => {
      const me = catalogue.products.find((p) => p.id === handle);
      if (!me || !me.cat) return [];
      // Same collection and same price, so a swap never changes the total.
      return catalogue.products.filter((p) => p.cat === me.cat && p.id !== handle && Number(p.price) === Number(me.price) && p.available !== false && p.stock !== 0);
    };
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
                <div class="bs-foot"><span class="bs-price">${esc(fmtPrice(p.price))}</span><button class="bs-add press s96" data-add="${p.variantId}"${p.stock === 0 ? ' data-soldout' : ''}>${esc(L('Add', 'عبيلي فالشنطة'))}</button></div>
              </div>
            </div>`).join('')}</div>` : ''}`;
        $$('[data-drag]', host).forEach(dragScroll);
        return;
      }

      const inCart = new Set(items.map((i) => String(i.variant_id)));
      // Easy add-ons under 100 EGP, ranked by what goes with this basket (O.recommend).
      const crossSell = O.recommend(catalogue, { moment: 'cart', cart: cartData, maxPrice: 100, limit: 10 })
        .filter((r) => !inCart.has(String(r.p.variantId)));

      host.innerHTML = `
        ${items.map((it) => {
          const p = byVariant(it.variant_id);
          const hasVariants = !it.product_has_only_default_variant;
          const canSwap = hasVariants || siblingsOf(it.handle).length > 0;
          const saved = O.wishlist.has(it.handle);
          // iOS-style row: swipe toward the end to delete, toward the start to save.
          return `<div class="swipe" data-swipe data-key="${esc(it.key)}" data-handle="${esc(it.handle)}">
            <div class="swipe-act swipe-wish" aria-hidden="true">${heartSvg(true)}<span>${esc(saved ? L('Saved', 'محفوظ') : L('Wishlist', 'المفضلة'))}</span></div>
            <div class="swipe-act swipe-del" aria-hidden="true">${trashSvg()}<span>${esc(L('Delete', 'امسح'))}</span></div>
            <div class="line" data-key="${esc(it.key)}" data-qty="${it.quantity}" data-max="${p ? (p.stock || 50) : 50}" data-variant="${it.variant_id}" data-handle="${esc(it.handle)}" data-has-variants="${hasVariants}">
              <a href="${esc(it.url)}" class="line-img">${img(it.image)}</a>
              <div class="line-body">
                <div class="line-title">${esc(lineTitle(it))}</div>
                ${canSwap ? `<button class="line-variant" data-replace>${hasVariants && it.variant_title ? `<span>${esc(it.variant_title)}</span>` : ''}<b>${esc(L('Change', 'غيّر'))}</b>${chevron(11)}</button>` : ''}
                <div class="line-unit">${esc(fmtPrice(it.original_price / 100))}</div>
                <div class="line-foot">${stepper(it.quantity, { size: 24, fs: 13, gap: 8 })}<span class="line-total">${esc(fmtPrice(it.original_line_price / 100))}</span></div>
              </div>
              <button class="line-remove" data-remove aria-label="Remove">✕</button>
            </div>
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
        <div class="xrail hscroll" data-drag>${crossSell.map(({ p, why }) => `
          <div class="cs-slot">
            <a href="${esc(p.url)}" class="cs-card">${img(p.img)}</a>
            ${why === 'ship' || why === 'again' || why === 'with' ? `<div class="cs-why${why === 'ship' ? ' ship' : ''}">${esc(O.recReason({ why }))}</div>` : ''}
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

    /* ── Swipe actions (iOS Mail style) ─────────────────────────────────
     * Drag a row toward the end edge to reveal Delete, toward the start
     * edge to reveal Wishlist; a long drag (past ~55%) does it at once,
     * a shorter one leaves the button showing for a tap. Mirrors in Arabic.
     * Vertical drags are left to the page.
     */
    const swipe = (() => {
      const OPEN = 116;
      const rtl = () => document.documentElement.dir === 'rtl';
      let drag = null;
      const api = { justMoved: false };
      const lineOf = (row) => $('.line', row);
      function setX(row, x, animate) {
        const line = lineOf(row);
        line.style.transition = animate ? 'transform .28s cubic-bezier(.2,.8,.2,1)' : 'none';
        line.style.transform = x ? `translateX(${x}px)` : '';
        row._x = x;
        // Which edge is showing: the start edge (wishlist) or the end edge (delete).
        const lead = x * (rtl() ? -1 : 1);
        row.classList.toggle('show-wish', lead > 0);
        row.classList.toggle('show-del', lead < 0);
        row.classList.toggle('open', Math.abs(x) > 4);
      }
      api.close = (row) => setX(row, 0, true);
      const closeOthers = (keep) => $$('.swipe.open', host).forEach((r) => { if (r !== keep) api.close(r); });
      api.commit = async (row, kind) => {
        if (!row) return;
        const w = row.clientWidth;
        const sign = (kind === 'del' ? -1 : 1) * (rtl() ? -1 : 1);
        if (kind === 'del') {
          setX(row, sign * w, true);
          O.haptic.selectionTick?.();
          row.style.transition = 'height .25s ease .18s, margin .25s ease .18s, opacity .2s ease .18s';
          row.style.height = `${row.offsetHeight}px`;
          requestAnimationFrame(() => { row.style.height = '0px'; row.style.marginBottom = '0px'; row.style.opacity = '0'; });
          try { await O.changeLine(row.dataset.key, 0); } catch (err) { O.okaAlert(L('Could not update', 'معرفناش نحدّث'), errText(err)); render(); }
          return;
        }
        // Wishlist: save it (never un-save from here) and slide back.
        const h = row.dataset.handle;
        if (h && !O.wishlist.has(h)) O.wishlist.toggle(h);
        O.haptic.success?.();
        O.toast(L('Saved to your wishlist', 'اتحفظ في المفضلة'));
        setX(row, sign * Math.min(w * 0.4, 160), true);
        setTimeout(() => api.close(row), 260);
        O.paintHearts?.();
      };
      host.addEventListener('pointerdown', (e) => {
        const row = e.target.closest('.swipe');
        if (!row || e.button > 0) return;
        drag = { row, x0: e.clientX, y0: e.clientY, base: row._x || 0, on: false, id: e.pointerId };
      });
      host.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const dx = e.clientX - drag.x0;
        const dy = e.clientY - drag.y0;
        if (!drag.on) {
          if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; } // a scroll
          if (Math.abs(dx) < 8) return;
          drag.on = true;
          closeOthers(drag.row);
          drag.row.setPointerCapture?.(e.pointerId);
        }
        const w = drag.row.clientWidth;
        let x = drag.base + dx;
        // Rubber-band past the row's width.
        if (Math.abs(x) > w) x = Math.sign(x) * (w + (Math.abs(x) - w) * 0.2);
        setX(drag.row, x, false);
      });
      const end = () => {
        if (!drag) return;
        const { row, on } = drag;
        drag = null;
        if (!on) return;
        api.justMoved = true;
        setTimeout(() => { api.justMoved = false; }, 60);
        const x = row._x || 0;
        const w = row.clientWidth;
        const lead = x * (rtl() ? -1 : 1);
        if (Math.abs(x) > w * 0.55) return api.commit(row, lead < 0 ? 'del' : 'wish');
        if (Math.abs(x) > 56) return setX(row, Math.sign(x) * OPEN, true);
        api.close(row);
      };
      host.addEventListener('pointerup', end);
      host.addEventListener('pointercancel', end);
      // A mouse would otherwise start a native drag of the photo or link.
      host.addEventListener('dragstart', (e) => { if (e.target.closest('.swipe')) e.preventDefault(); });
      return api;
    })();

    /* ── Change: another variant (flavour, colour…) of a cart line, or
     *    another product from the same collection (another bowl flavour). ── */
    async function openVariants(line) {
      const handle = line.dataset.handle;
      const qty = Number(line.dataset.qty) || 1;
      const current = String(line.dataset.variant);
      let product = null;
      if (line.dataset.hasVariants === 'true') {
        try {
          const res = await fetch(`${(window.Shopify?.routes?.root || '/')}products/${encodeURIComponent(handle)}.js`);
          product = await res.json();
        } catch (e) { product = null; }
      }
      const variants = (product?.variants || []).length > 1 ? product.variants : [];
      const siblings = siblingsOf(handle);
      if (!variants.length && !siblings.length) return;
      const app = $('#app');
      const scrim = document.createElement('div');
      scrim.className = 'scrim';
      const sheet = document.createElement('div');
      sheet.className = 'sheet variant-sheet';
      const optName = (product?.options || []).map((o) => o.name || o).filter((n) => n && n !== 'Title').join(' / ');
      const me = catalogue.products.find((p) => p.id === handle);
      const catTitle = me ? (catalogue.cats || []).find((c) => c.id === me.cat) : null;
      const sizedImg = (src) => (src ? `<img src="${esc(src)}${String(src).includes('?') ? '&' : '?'}width=120" alt="" loading="lazy">` : '');
      const row = ({ id, pic, name, price, on, soldOut }) => `
        <button class="sheet-item variant-pick${on ? ' on' : ''}" data-pick="${id}"${soldOut ? ' disabled' : ''}>
          <span class="cat-item-img">${sizedImg(pic)}</span>
          <span style="flex:1;min-width:0;text-align:start"><b class="variant-name">${esc(name)}</b>
            <span class="variant-price">${esc(fmtPrice(price))}${soldOut ? ` · ${esc(L('Sold out', 'خلص'))}` : ''}</span></span>
          <span class="variant-check">${on ? '✓' : ''}</span>
        </button>`;
      sheet.innerHTML = `
        <div class="grabber"></div>
        <div class="sheet-head"><span class="sheet-title">${esc(L('Change', 'غيّر'))}</span>
          <button class="sheet-close" data-close aria-label="Close"><svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="#1d1d1f" stroke-width="2" stroke-linecap="round"/></svg></button></div>
        <div class="sheet-body" style="padding-bottom:16px">
          ${variants.length ? `<div class="sec-label">${esc(optName || L('Options', 'الأنواع'))}</div>
          ${variants.map((v) => row({ id: v.id, pic: v.featured_image?.src || product.featured_image, name: v.title, price: v.price / 100, on: String(v.id) === current, soldOut: !v.available })).join('')}` : ''}
          ${siblings.length ? `<div class="sec-label">${esc(catTitle ? L(`More from ${catTitle.en}`, `كمان من ${catTitle.ar || catTitle.en}`) : L('From the same collection', 'من نفس القسم'))}</div>
          ${siblings.map((p) => row({ id: p.variantId, pic: p.img, name: O.ptitle(p), price: p.price, on: false, soldOut: false })).join('')}` : ''}
        </div>`;
      app.append(scrim, sheet);
      const close = () => { scrim.remove(); sheet.remove(); };
      scrim.addEventListener('click', close);
      sheet.addEventListener('click', async (e) => {
        if (e.target.closest('[data-close]')) return close();
        const pick = e.target.closest('[data-pick]');
        if (!pick || pick.disabled) return;
        if (pick.dataset.pick === current) return close();
        pick.classList.add('busy');
        try {
          await O.swapLine(current, pick.dataset.pick, qty);
          O.haptic.success?.();
          O.toast(L('Changed', 'اتغيّر'));
          close();
        } catch (err) {
          pick.classList.remove('busy');
          O.okaAlert(L('Could not change it', 'معرفناش نغيّره'), errText(err));
        }
      });
    }

    let lastCart = null;
    const currentCart = () => lastCart;

    host.addEventListener('click', async (e) => {
      if (swipe.justMoved) { e.preventDefault(); e.stopPropagation(); return; }
      // A tap on an opened row closes it instead of acting.
      const openRow = e.target.closest('.swipe.open');
      if (openRow && !e.target.closest('.swipe-act')) { e.preventDefault(); swipe.close(openRow); return; }
      const act = e.target.closest('.swipe-act');
      if (act) { swipe.commit(act.closest('.swipe'), act.classList.contains('swipe-del') ? 'del' : 'wish'); return; }
      const line = e.target.closest('.line');
      if (line && e.target.closest('[data-replace]')) { openVariants(line); return; }
      const step = e.target.closest('[data-step]');
      if (line && step) {
        const q = Number(line.dataset.qty) + Number(step.dataset.step);
        const max = Number(line.dataset.max) || 50;
        if (q > max) return;
        try { await O.changeLine(line.dataset.key, Math.max(0, q)); } catch (err) { O.okaAlert(L('Could not update', 'معرفناش نحدّث'), errText(err)); }
        return;
      }
      if (line && e.target.closest('[data-remove]')) {
        try { await O.changeLine(line.dataset.key, 0); } catch (err) { O.okaAlert(L('Could not update', 'معرفناش نحدّث'), errText(err)); }
        return;
      }
      if (e.target.closest('[data-apply]')) { applyCode(); return; }
      if (e.target.closest('[data-checkout]')) {
        const { merch } = O.cartTotals(lastCart);
        if (Number(CFG.minOrder) > 0 && merch < Number(CFG.minOrder)) return;
        // Straight to Shopify's checkout, as the old theme did: no sign-in
        // sheet or review page in between (the cart already shows the
        // sign-in nudge with its points, for whoever wants it).
        const btn = e.target.closest('[data-checkout]');
        btn.innerHTML = spinner();
        go(CFG.routes.checkout);
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
      [L('Live J&T tracking', 'تابع شحنتك لحظة بلحظة'), L('See where your parcel is and when the courier is on the way.', 'اعرف شحنتك فين وإمتى المندوب جاي.')],
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
      <button class="join-guest" data-join-guest>${esc(L('Continue as guest', 'كمّل من غير حساب'))}</button>
      <div class="join-fine">${esc(L('Takes a few seconds. You can also sign in after ordering — your points still count.', 'بتاخد ثواني. وتقدر تسجّل بعد الطلب كمان ونقاطك محسوبة.'))}</div>
    </div>`;
  }
  // The inline card on the checkout review page answers here.
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
          <div class="field-k">${esc(L('Ships to', 'هيتشحن على'))}</div>
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

        ${lastChance(merch)}
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

    /** At the till, only a confident add-on or one that cuts the shipping fee — one or two, never a wall. */
    function lastChance() {
      if (!catalogue.products.length) return '';
      const picks = O.recommend(catalogue, { moment: 'checkout', cart: cartData, maxPrice: 100, limit: 4 })
        .filter((r) => r.why === 'ship' || r.why === 'again' || (r.why === 'with' && r.score >= 0.2))
        .slice(0, 2);
      if (!picks.length) return '';
      return `<div class="field last-chance">
          <div class="field-k">${esc(L('Add before you go', 'ضيف قبل ما تطلب'))}</div>
          <div class="field-v">${picks.map((r) => `
            <div class="lc-row">
              <span class="lc-img">${img(r.p.img)}</span>
              <span class="lc-body"><b>${esc(O.ptitle(r.p))}</b><span>${esc(O.recReason(r))} · ${esc(fmtPrice(r.p.price))}</span></span>
              <button class="lc-add press" data-add="${r.p.variantId}">${esc(t('add'))}</button>
            </div>`).join('')}</div>
        </div>
        <div class="divider top"></div>`;
    }

    host.addEventListener('click', (e) => {
      if (e.target.closest('[data-add-address]')) O.store.set('oka.afterAddress', CFG.routes.checkoutReview);
    });
    onCart((e) => { cartData = e.detail || cartData; render(); });
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
      return L('This order has already shipped and can no longer be cancelled.',
        'الطلب اتشحن بالفعل ومش ممكن يتلغي دلوقتي.');
    }
    if (/not signed in|session/i.test(msg)) return L('Sign in with the account that placed this order.', 'سجّل دخولك بالحساب اللي عمل الطلب ده.');
    if (/timed out|network|failed to fetch|aborted/i.test(msg)) return L("Couldn't reach the server. Please try again.", 'مفيش اتصال بالسيرفر دلوقتي. جرّب تاني.');
    return msg;
  }

  /* ── Live J&T tracking (Theme settings → Live J&T tracking) ───────────
   * OKA's website tracking service (jt-mcp-website on Cloud Run) speaks MCP
   * and offers only track_delivery, so its key is safe in the page. Scans
   * come back newest-last in J&T's words; they are turned into the same
   * shape the order service returns (step, stateLabel, updates, courier).
   */
  const JT_STATE = {
    10: ['Picked up by J&T', 'المندوب استلم الشحنة'],
    50: ['On the way', 'في الطريق'],
    92: ['On the way', 'في الطريق'],
    94: ['Out for delivery', 'خرجت للتوصيل مع المندوب'],
    100: ['Delivered', 'اتسلمت'],
    110: ['Delivery problem', 'فيه مشكلة في التوصيل'],
    111: ['Returned to OKA', 'رجعت لـ OKA'],
  };
  let jtRpcId = 0;
  async function jtCall(name, args) {
    const cfg = CFG.jt;
    const url = `${String(cfg.url).replace(/\/+$/, '').replace(/\/mcp$/, '')}/mcp`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'x-api-key': cfg.key },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++jtRpcId, method: 'tools/call', params: { name, arguments: args } }),
    });
    const text = await res.text();
    if (res.status === 401) throw new Error('The tracking service rejected the key.');
    if (!res.ok) throw new Error(`Tracking service HTTP ${res.status}`);
    const payload = text.trimStart().startsWith('{') ? text
      : text.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('');
    const msg = JSON.parse(payload);
    if (msg.error) throw new Error(msg.error.message || 'tracking failed');
    const body = (msg.result?.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
    if (msg.result?.isError) throw new Error(body.slice(0, 200) || 'tracking failed');
    const json = JSON.parse(body);
    if (json.code != null && String(json.code) !== '1') throw new Error(`J&T: ${json.msg || 'request failed'}`);
    return json;
  }
  /** AWB → J&T scans (track_delivery, 30 per call). */
  async function jtTrack(billCodes) {
    const out = new Map();
    if (!CFG.jt || !billCodes.length) return out;
    for (let i = 0; i < billCodes.length; i += 30) {
      const json = await jtCall('track_delivery', { billCodes: billCodes.slice(i, i + 30) });
      (json.data || []).forEach((t) => out.set(t.billCode, t.details || []));
    }
    return out;
  }
  /** Phone → that receiver's shipments (track_by_phone), scans in track_delivery's shape. */
  const JT_TYPE_CODE = { 'Pickup scan': 10, 'Sending scan': 50, 'Arrival Scan': 92, 'Delivery scan': 94, 'Signing scan': 100, 'Abnormal parcels scan': 110, 'Return Sign': 111 };
  async function jtByPhone(phone, lookbackDays) {
    const json = await jtCall('track_by_phone', { phone, lookbackDays });
    return (json.shipments || []).map((sh) => ({
      awb: sh.billCode,
      createdAt: sh.createdAt,
      status: sh.status,
      order: sh.order || null,
      scans: (sh.scans || []).map((x) => ({ scanTime: x.time, scanType: x.type, desc: x.description, scanTypeCode: JT_TYPE_CODE[x.type] })),
    }));
  }
  const JT_STATUS = {
    not_picked_up: ['AWB issued — waiting for the courier to pick it up', 'البوليصة اتعملت — مستنية المندوب يستلمها'],
    in_transit: ['On the way', 'في الطريق'],
    out_for_delivery: ['Out for delivery', 'خرجت للتوصيل مع المندوب'],
    failed_attempt: ['Delivery attempt failed', 'محاولة التوصيل منجحتش'],
    returning: ['On its way back to OKA', 'راجعة لـ OKA'],
    returned: ['Returned to OKA', 'رجعت لـ OKA'],
    delivered: ['Delivered', 'اتسلمت'],
    cancelled: ['Cancelled', 'ملغية'],
  };
  const jtText = (desc) => String(desc || '')
    .replace(/\s*If there is any problem or complaint.*$/s, '')
    .replace(/[【】]/g, ' ').replace(/\s+([,.，])/g, '$1').replace(/\s+/g, ' ').trim();
  /** J&T scans → { step, stateLabel, updates, courier, courierPhone, actionNeeded }. */
  function jtShape(scans, baseStep = 2, status = null) {
    const sorted = [...(scans || [])].sort((x, y) => String(y.scanTime).localeCompare(String(x.scanTime)));
    const latest = sorted[0];
    const code = Number(latest?.scanTypeCode);
    let courier = null;
    let courierPhone = null;
    for (const d of sorted) {
      const m = /courier\s+(.+?)\s*\((\d{8,})\)/i.exec(d.desc || '');
      if (m) { courier = m[1].replace(/\s+/g, ' '); courierPhone = m[2]; break; }
    }
    const st = JT_STATE[code];
    return {
      carrier: 'jt',
      step: code === 100 || status === 'delivered' ? 3 : sorted.length ? Math.max(baseStep, 2) : baseStep,
      stateLabel: JT_STATUS[status] ? L(...JT_STATUS[status]) : latest ? (st ? L(st[0], st[1]) : latest.scanType) : null,
      updates: sorted.map((d, i) => ({ text: jtText(d.desc), time: d.scanTime, done: i === 0 })),
      // The courier card matters while the parcel is with them, not once it's back.
      courier: code === 111 ? null : courier,
      courierPhone: code === 111 ? null : courierPhone,
      actionNeeded: code === 110 ? jtText(latest.desc) : null,
      delivered: code === 100,
      photo: sorted.find((d) => d.sigPicUrl)?.sigPicUrl || null,
    };
  }

  const TRACK_STEPS = [['Processing', 'بنراجعه'], ['Preparing to Ship', 'بيتجهز للشحن'], ['Shipped', 'اتشحن'], ['Delivered', 'وصل']];
  /** Status, steps, scan timeline, courier card — one shipment's tracking (jtShape output). */
  function trackingHtml(o) {
    return `
      <div class="arrives-title" style="font-size:16px">${esc(o.stateLabel || L('No scans yet', 'مفيش تحديثات لسه'))}</div>
      <div class="steps" style="padding:14px 0 16px">${TRACK_STEPS.map((s, i) => `
        <div class="step-col${i <= o.step ? ' done' : ''}${i === o.step ? ' current' : ''}"><div class="step-bar"></div><div class="step-txt">${esc(L(s[0], s[1]))}</div></div>`).join('')}</div>
      ${o.updates.length ? `<div class="updates" style="margin:0">${o.updates.map((u) => `
        <div class="update-row"><span class="update-dot${u.done ? ' done' : ''}"></span><div style="flex:1"><div class="update-txt">${esc(u.text)}</div><div class="update-time nums">${esc(u.time)}</div></div></div>`).join('')}</div>`
        : `<div class="awaiting" style="margin:0">${esc(L('No courier scans for this shipment yet. Updates appear here once J&T picks it up.', 'لسه مفيش تحديثات من شركة الشحن. أول ما J&T تستلم الشحنة هتلاقي التحديثات هنا.'))}</div>`}
      ${o.courier ? `<div class="courier" style="margin:14px 0 0">
        <div class="courier-label">${esc(L('J&T courier', 'مندوب J&T'))}</div>
        <div class="courier-name">${esc(o.courier)}</div>
        ${o.courierPhone ? `<div class="courier-phone"><span class="nums">${esc(o.courierPhone)}</span></div>
        <div class="courier-btns">
          <a class="courier-btn call" href="tel:${esc(o.courierPhone)}">${esc(L('Call', 'كلّمه'))}</a>
          <a class="courier-btn wa" target="_blank" rel="noopener" href="https://wa.me/${esc(waNumber(o.courierPhone))}">${esc(L('WhatsApp', 'واتساب'))}</a>
        </div>` : ''}
      </div>` : ''}
      ${o.actionNeeded ? `<div class="action-needed" style="margin:14px 0 0"><b>${esc(L('Action needed', 'محتاجين منك حاجة'))}</b><span>${esc(o.actionNeeded)}</span></div>` : ''}
      ${o.photo ? `<div class="test-meta"><a href="${esc(o.photo)}" target="_blank" rel="noopener">${esc(L('Delivery photo', 'صورة التسليم'))}</a></div>` : ''}`;
  }

  /* ── Track shipment (/pages/track?awb=…&order=…) ─────────────────────── */
  function track(root) {
    const awb = (qs('awb') || '').trim().toUpperCase();
    const order = qs('order') || '';
    $('[data-track-order]', root).textContent = order;
    $('[data-track-awb]', root).textContent = awb ? `AWB ${awb}` : '';
    const ext = $('[data-track-external]', root);
    if (ext && awb) ext.href = ext.dataset.trackingTemplate.replace('{number}', encodeURIComponent(awb));
    const body = $('[data-track-body]', root);
    const fail = (en, ar) => { body.innerHTML = `<div class="awaiting" style="margin:20px 22px">${esc(L(en, ar))}</div>`; };
    async function load() {
      if (!awb) return fail('No shipment number was given.', 'مفيش رقم شحنة.');
      if (!CFG.jt) return fail('Live tracking isn’t available right now.', 'التتبع المباشر مش متاح دلوقتي.');
      try {
        const scans = await jtTrack([awb]);
        body.innerHTML = `<div class="test-detail track-detail">${trackingHtml({ awb, ...jtShape(scans.get(awb), 2) })}</div>`;
      } catch (e) {
        fail('We couldn’t reach J&T just now. Pull down to try again.', 'مقدرناش نوصل لـ J&T دلوقتي. اسحب لتحت وجرّب تاني.');
      }
    }
    load();
    onLang(load);
  }

  /* ── J&T orders API: change the address or cancel before pickup ─────────
   * Theme settings → Order changes. One HTTPS endpoint speaking JSON-RPC
   * tools/call; every call carries the order number and the phone on the
   * order, which the server re-checks. The customer is signed in, so both
   * come from their own order — nothing to type, nothing stored.
   * Never retried automatically: a failure is retried by pressing again.
   */
  const hasOrdersApi = () => Boolean(CFG.orders && CFG.orders.url && CFG.orders.key);
  let ordersRpcId = 0;
  async function ordersApi(action, args) {
    let res;
    try {
      res = await fetch(CFG.orders.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'x-api-key': CFG.orders.key },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++ordersRpcId, method: 'tools/call', params: { name: action, arguments: args } }),
      });
    } catch (e) {
      throw new Error('Something went wrong. Please try again or contact us.');
    }
    if (!res.ok) throw new Error('Something went wrong. Please try again or contact us.');
    const raw = await res.text();
    const line = raw.split('\n').find((l) => l.startsWith('data: '));
    let msg;
    try { msg = JSON.parse(line ? line.slice(6) : raw); } catch (e) { throw new Error('Something went wrong. Please try again or contact us.'); }
    const text = msg.result?.content?.[0]?.text ?? '';
    if (msg.error || msg.result?.isError) {
      // Input-validation errors start with "MCP error"; never shown raw.
      throw new Error(!text || text.startsWith('MCP error') ? 'Please check the details you entered and try again.' : text);
    }
    return JSON.parse(text);
  }
  /** "Too late to change it": shipped, or already being prepared (fulfilled) in Shopify. */
  const SHIPPED_RE = /already been shipped|being prepared for shipping/i;
  /** The API's messages are written for customers in English; this is the Arabic for each. */
  function ordersApiMessage(err) {
    const m = errText(err);
    const known = [
      [/couldn.t find an order/i, "We couldn't find an order with that order number and phone number.", 'مش لاقيين طلب بالرقم ده على رقم الموبايل ده.'],
      [SHIPPED_RE, 'This order is already being prepared for shipping, so it can no longer be changed or cancelled.', 'الطلب ده بيتجهّز للشحن خلاص، فمينفعش يتغيّر أو يتلغي دلوقتي.'],
      [/already been paid/i, 'This order has already been paid, so its items can’t be changed online.', 'الطلب ده اتدفع خلاص، فمينفعش تغيّر منتجاته أونلاين.'],
      [/switched on yet/i, 'Changing orders online isn’t switched on yet.', 'تعديل الطلبات أونلاين لسه مش متفعّل.'],
      [/isn.t in this order/i, 'Your order changed meanwhile. Please reload the page and try again.', 'طلبك اتغيّر في الوقت ده. حدّث الصفحة وجرّب تاني.'],
      [/out of stock/i, 'That option is out of stock. Please pick another one.', 'النوع ده خلص. اختار نوع تاني.'],
      [/remove every item/i, 'To remove every item, cancel the order instead.', 'لو عايز تشيل كل حاجة، الغي الطلب.'],
      [/enter your order number/i, 'Enter your order number, e.g. 2832521', 'اكتب رقم الطلب، مثلاً ٢٨٣٢٥٢١'],
      [/full mobile number/i, 'Enter a full mobile number, e.g. 01012345678', 'اكتب رقم الموبايل كامل، مثلاً 01012345678'],
      [/already cancelled/i, 'This order is already cancelled.', 'الطلب ده ملغي بالفعل.'],
      [/too many attempts/i, 'Too many attempts. Please try again in an hour.', 'محاولات كتير. جرّب تاني بعد ساعة.'],
      [/nothing to change/i, 'Nothing to change.', 'مفيش حاجة اتغيّرت.'],
      [/check the details/i, 'Please check the details you entered and try again.', 'راجع البيانات اللي كتبتها وجرّب تاني.'],
      [/went wrong/i, 'Something went wrong updating your order. Please try again.', 'حصلت مشكلة وإحنا بنعدّل طلبك. جرّب تاني.'],
    ];
    const hit = known.find(([re]) => re.test(m));
    return hit ? L(hit[1], hit[2]) : m;
  }
  /** Orders are changed only through the orders API: an error just says why. */
  function ordersApiFail(title, err) {
    return O.okaAlert(title, ordersApiMessage(err));
  }
  const ADDR_LIMITS = {
    name: [2, 60], prov: [0, 60], city: [0, 60], area: [0, 60], street: [5, 200], building: [0, 30], floor: [0, 30], flats: [0, 30],
  };

  /* ── Rate a delivered order: 5 stars and a comment ─────────────────────
   * Sent to the orders API as customer_rate_order { orderNumber, phone,
   * stars, comment } (Theme settings → "Ask delivered orders for a
   * rating"). A rating sent from this browser is remembered so the order
   * shows it instead of asking again.
   */
  const STAR = (on) => `<svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z" fill="${on ? '#f5a623' : 'none'}" stroke="${on ? '#f5a623' : 'rgba(0,0,0,0.28)'}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  const starRow = (n) => [1, 2, 3, 4, 5].map((i) => STAR(i <= n)).join('');
  function rateBox(det) {
    const box = $('[data-rate]', det);
    if (!box || !(CFG.orders && CFG.orders.ratings) || !hasOrdersApi()) return;
    const name = det.dataset.orderDetail;
    const rated = O.store.get('oka.rated', {});
    const thanks = (r) => {
      box.innerHTML = `<div class="rate-done"><div class="rate-stars static">${starRow(r.stars)}</div>
        <b>${esc(L('Thanks for rating your order', 'شكرًا على تقييمك'))}</b>
        ${r.comment ? `<p>“${esc(r.comment)}”</p>` : ''}</div>`;
    };
    box.hidden = false;
    if (rated[name]) return thanks(rated[name]);
    let stars = 0;
    box.innerHTML = `
      <div class="rate-k">${esc(L('How was your order?', 'طلبك كان عامل إزاي؟'))}</div>
      <div class="rate-stars" role="radiogroup" aria-label="${esc(L('Rating', 'التقييم'))}">
        ${[1, 2, 3, 4, 5].map((i) => `<button type="button" class="rate-star" data-star="${i}" role="radio" aria-checked="false" aria-label="${i}">${STAR(false)}</button>`).join('')}
      </div>
      <textarea class="rate-comment" data-rate-comment rows="3" maxlength="500" placeholder="${esc(L('Tell us more (optional)', 'احكيلنا أكتر (اختياري)'))}"></textarea>
      <div class="code-error" data-rate-error hidden></div>
      <button type="button" class="cta dim" data-rate-send>${esc(L('Send rating', 'ابعت التقييم'))}</button>`;
    const paint = () => {
      $$('[data-star]', box).forEach((b) => {
        const on = Number(b.dataset.star) <= stars;
        b.innerHTML = STAR(on);
        b.setAttribute('aria-checked', String(Number(b.dataset.star) === stars));
      });
      $('[data-rate-send]', box).classList.toggle('dim', !stars);
    };
    box.addEventListener('click', async (e) => {
      const st = e.target.closest('[data-star]');
      if (st) { stars = Number(st.dataset.star); O.haptic.selectionTick?.(); $('[data-rate-error]', box).hidden = true; paint(); return; }
      const send = e.target.closest('[data-rate-send]');
      if (!send || send.disabled) return;
      const err = $('[data-rate-error]', box);
      if (!stars) { err.textContent = L('Tap the stars to rate.', 'دوس على النجوم عشان تقيّم.'); err.hidden = false; return; }
      err.hidden = true;
      const comment = $('[data-rate-comment]', box).value.trim().slice(0, 500);
      send.disabled = true;
      send.innerHTML = spinner();
      try {
        await ordersApi('customer_rate_order', { orderNumber: name, phone: det.dataset.phone || O.customer?.phone || '', stars, comment });
        const all = O.store.get('oka.rated', {});
        all[name] = { stars, comment };
        O.store.set('oka.rated', all);
        O.haptic.success?.();
        thanks({ stars, comment });
      } catch (ex) {
        send.disabled = false;
        send.textContent = L('Send rating', 'ابعت التقييم');
        err.textContent = ordersApiMessage(ex);
        err.hidden = false;
      }
    });
  }

  /** The last order this browser saw: { name, phone } (older versions kept just the name). */
  function lastOrderStored() {
    const v = O.store.get('oka.lastOrder');
    if (!v) return null;
    return typeof v === 'string' ? { name: v, phone: '' } : v;
  }

  /**
   * Not signed in: the last order placed from this browser, found by the
   * tokens kept like the cart (oka.lastCheckout: the cart's token saved on the
   * way to checkout, the checkout's token saved by the checkout pixel). No
   * phone or order number is asked for, and no other order is reachable.
   * While it's unfulfilled it can be edited (items, address, phone) or
   * cancelled.
   */
  function guestLastOrder(root) {
    const box = $('[data-guest-last]', root);
    if (!box || O.customer) return;
    const empty = $('[data-guest-empty]', root);
    const saved = O.store.get('oka.lastCheckout', null);
    if (!saved || !(saved.checkoutToken || saved.cartToken) || !hasOrdersApi()) return;
    const auth = { session: { ...(saved.checkoutToken ? { checkoutToken: saved.checkoutToken } : {}), ...(saved.cartToken ? { cartToken: saved.cartToken } : {}) } };
    let view = null;

    const STATUS = {
      processing: ['Processing', 'بنراجعه'],
      preparing: ['Preparing to ship', 'بيتجهّز للشحن'],
      shipped: ['Shipped', 'اتشحن'],
      cancelled: ['Cancelled', 'ملغي'],
    };
    function render() {
      if (!view) return;
      if (empty) empty.hidden = true;
      box.hidden = false;
      const st = STATUS[view.status] || STATUS.processing;
      const a = view.address || {};
      const province = O.provinceName(a.provinceCode) || a.province || '';
      box.innerHTML = `
        <div class="guest-order">
          <div class="guest-detail-head"><div><div class="guest-last-k">${esc(L('Your last order', 'آخر طلب ليك'))}</div><b class="nums">${esc(view.orderNumber)}</b></div>
            <span class="order-state ${view.status === 'cancelled' ? 'red' : view.status === 'shipped' ? 'green' : ''}">${esc(L(...st))}</span></div>
          <div class="items" style="padding:10px 0">${(view.items || []).map((it) => `
            <div class="item-row"><div class="item-img">${img(it.image)}</div>
              <div style="flex:1;min-width:0"><div class="item-title">${esc(it.title)}</div>
                <div class="item-qty">${esc([it.variant && it.variant !== 'Default Title' ? it.variant : '', `× ${num(it.quantity)}`, fmtPrice(it.unitPrice * it.quantity)].filter(Boolean).join(' · '))}</div></div></div>`).join('')}</div>
          <div class="guest-addr">
            <div class="guest-last-k">${esc(L('Delivering to', 'هيتوصّل على'))}</div>
            <div><b>${esc(a.name || '')}</b> · <span class="nums">${esc(view.phone || a.phone || '')}</span></div>
            <div>${esc([a.address1, a.address2].filter(Boolean).join(L(', ', '، ')))}</div>
            <div>${esc([a.city, province].filter(Boolean).join(L(', ', '، ')))}</div>
          </div>
          <div class="guest-totals">
            ${sumRow(t('subtotal'), fmtPrice(view.itemsTotal ?? view.subtotal))}
            ${view.discount > 0 ? sumRow(L('Discount', 'الخصم'), `−${fmtPrice(view.discount)}`) : ''}
            ${sumRow(t('shipping'), fmtPrice(view.shipping))}
            ${sumRow(L('Total (cash on delivery)', 'الإجمالي (كاش عند الاستلام)'), fmtPrice(view.total), 'grand')}
          </div>
          ${view.canCancel ? `<div class="order-actions" style="padding:14px 0 0">
              <button class="edit-btn" data-g-edit>${esc(L('Edit order', 'عدّل الطلب'))}</button>
              <button class="cancel-btn" data-g-cancel>${esc(L('Cancel Order', 'الغي الطلب'))}</button></div>
            <div class="order-actions-hint" style="margin:10px 0 0">${esc(L('Change items, address or phone until we start preparing it for shipping.', 'غيّر المنتجات أو العنوان أو الموبايل لحد ما نبدأ نجهّزه للشحن.'))}</div>`
          : view.status === 'cancelled' ? '' : `<div class="shipped-note" style="margin:14px 0 0"><b>${esc(L('This order is on its way', 'الطلب ده في الطريق'))}</b><span>${esc(L('It’s being prepared or shipped, so it can no longer be changed online.', 'بيتجهّز أو اتشحن، فمينفعش يتغيّر أونلاين دلوقتي.'))}</span></div>`}
        </div>`;
    }
    async function load() {
      box.hidden = false;
      if (empty) empty.hidden = true;
      box.innerHTML = `<div class="guest-loading">${spinner(true)}</div>`;
      try {
        view = await ordersApi('customer_get_order', auth);
        render();
      } catch (err) {
        // Not placed (checkout left unfinished) or not found: nothing to show.
        box.hidden = true;
        box.innerHTML = '';
        if (empty) empty.hidden = false;
      }
    }

    box.addEventListener('click', async (e) => {
      const edit = e.target.closest('[data-g-edit]');
      const cancel = e.target.closest('[data-g-cancel]');
      if (!edit && !cancel) return;
      if (edit) {
        if (edit.classList.contains('busy')) return;
        edit.classList.add('busy');
        try {
          view = await ordersApi('customer_get_order', auth);
          render();
          if (!view.canCancel) return ordersApiFail(L('Can’t change it', 'مينفعش يتغيّر'), new Error(view.cancelled ? 'already cancelled' : 'being prepared for shipping'));
          openEditOrder(auth, view, (updated) => { view = updated; render(); });
        } catch (err) { ordersApiFail(L('Can’t change it', 'مينفعش يتغيّر'), err); } finally { edit.classList.remove('busy'); }
        return;
      }
      O.okaAlert(L('Cancel order?', 'تلغي الطلب؟'), L(`Are you sure? Order ${view.orderNumber} will be cancelled and this can’t be undone.`, `متأكد؟ الطلب ${view.orderNumber} هيتلغي ومينفعش نرجّعه.`), [
        { text: L('Back', 'ارجع'), style: 'cancel' },
        {
          text: L('Cancel order', 'الغي الطلب'),
          style: 'destructive',
          onPress: async () => {
            cancel.classList.add('busy');
            try {
              await ordersApi('customer_cancel_order', { ...auth, reason: 'Cancelled by the customer on the website' });
              view = { ...view, status: 'cancelled', cancelled: true, canCancel: false, canEdit: false };
              render();
              O.haptic.success();
              O.okaAlert(L('Order cancelled', 'الطلب اتلغى'), L(`Your order ${view.orderNumber} has been cancelled.`, `طلبك ${view.orderNumber} اتلغى.`));
            } catch (err) { ordersApiFail(L('Could not cancel', 'معرفناش نلغيه'), err); } finally { cancel.classList.remove('busy'); }
          },
        },
      ]);
    });

    load();
  }

  function orders(root) {
    guestLastOrder(root);
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
        $$('.edit-btn, .cancel-btn', det).forEach((b) => { b.classList.add('disabled'); b.disabled = true; });
        $('[data-cancel-order]', det).textContent = L('Cancelled', 'ملغي');
        $('[data-actions-hint]', det)?.remove();
      }
      const st = $(`[data-order-state="${CSS.escape(name)}"]`, root);
      if (st) { st.textContent = L('Cancelled', 'ملغي'); st.className = 'order-state red'; }
    }
    // Delivered: nothing left to edit or cancel — the actions and the
    // "on its way" note give way to the rating.
    function markDelivered(det) {
      if (det.dataset.delivered === 'true') return;
      det.dataset.delivered = 'true';
      det.dataset.fulfilled = 'true';
      $('.order-actions', det)?.setAttribute('hidden', '');
      $('.shipped-note', det)?.remove();
      $('[data-actions-hint]', det)?.remove();
      rateBox(det);
    }

    // The courier already has it (the orders API says so), though Shopify
    // isn't marked fulfilled yet: same greyed-out buttons and note.
    function markShipped(name) {
      const det = details.find((x) => x.dataset.orderDetail === name);
      if (!det) return;
      det.dataset.fulfilled = 'true';
      $$('.edit-btn, .cancel-btn', det).forEach((b) => { b.classList.add('disabled'); b.disabled = true; });
      $('[data-actions-hint]', det)?.remove();
      if (!$('.shipped-note', det)) {
        $('.order-actions', det).insertAdjacentHTML('beforebegin', `<div class="shipped-note"><b>${esc(L('This order has been shipped', 'الطلب ده اتشحن'))}</b><span>${esc(L('It’s on its way, so it can no longer be edited or cancelled.', 'هو في الطريق ليك، فمينفعش يتعدّل أو يتلغي دلوقتي.'))}</span></div>`);
      }
    }
    Object.keys(cancelledHere).forEach((name) => {
      const det = details.find((x) => x.dataset.orderDetail === name);
      if (det && det.dataset.cancelled !== 'true') markCancelled(name);
    });

    /* Live courier status — the order service's /customer/orders. */
    const live = {};
    async function loadLive() {
      // J&T's website tracking service answers directly and is the tested
      // path, so it stays in charge of tracking even with the order service.
      if (CFG.jt) return loadJt();
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
    // Without the order service: each shipped order's AWB, tracked live.
    async function loadJt() {
      const withAwb = details.filter((d) => d.dataset.awb && d.dataset.cancelled !== 'true');
      if (!withAwb.length) return;
      let scans;
      try { scans = await jtTrack([...new Set(withAwb.map((d) => d.dataset.awb))]); } catch (e) { return; }
      withAwb.forEach((det) => {
        const name = det.dataset.orderDetail;
        live[name] = { name, ...jtShape(scans.get(det.dataset.awb), Number(det.dataset.step) || 0) };
        paintLive(det);
        const o = live[name];
        const st = $(`[data-order-state="${CSS.escape(name)}"]`, root);
        if (st && o.stateLabel) { st.textContent = o.stateLabel; st.className = `order-state${o.step >= 3 ? ' green' : ''}`; }
      });
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
      if (step >= 3 && det.dataset.cancelled !== 'true') markDelivered(det);
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
        html += `<div class="ship-err">${esc(L('Couldn’t reach the courier — shipment updates may be missing. Pull to refresh.', 'مقدرناش نوصل لشركة الشحن — ممكن تحديثات الشحنة تكون ناقصة. اسحب لتحت عشان تحدّث.'))}</div>`;
      }
      if (o.courier) {
        html += `<div class="courier">
          <div class="courier-label">${esc(o.carrier === 'jt' ? L('J&T courier', 'مندوب J&T') : L('Delivery courier', 'مندوب التوصيل'))}</div>
          <div class="courier-name">${esc(o.courier)}</div>
          ${o.courierPhone ? `<div class="courier-phone"><span class="nums">${esc(o.courierPhone)}</span></div>
          <div class="courier-btns">
            <a class="courier-btn call press s96" href="tel:${esc(String(o.courierPhone).replace(/\s/g, ''))}"><svg width="14" height="14" viewBox="0 0 24 24"><path d="M7.5 3.5h-2A2.5 2.5 0 003 6c0 8.28 6.72 15 15 15a2.5 2.5 0 002.5-2.5v-2a1 1 0 00-.76-.97l-3.6-.9a1 1 0 00-1 .32l-1.1 1.32a12.5 12.5 0 01-5.63-5.63l1.32-1.1a1 1 0 00.32-1l-.9-3.6a1 1 0 00-.97-.76z" fill="#fff"/></svg>${esc(L('Call', 'كلّمه'))}</a>
            <a class="courier-btn wa press s96" target="_blank" rel="noopener" href="https://wa.me/${esc(waNumber(o.courierPhone))}"><svg width="15" height="15" viewBox="0 0 24 24"><path d="M12 2.5a9.5 9.5 0 00-8.2 14.28L2.5 21.5l4.85-1.26A9.5 9.5 0 1012 2.5zm0 1.9a7.6 7.6 0 016.45 11.6l-.23.37.62 2.26-2.33-.6-.36.21A7.6 7.6 0 1112 4.4z" fill="#fff"/><path d="M9.3 7.6c-.18-.42-.37-.43-.55-.44h-.46a.9.9 0 00-.65.3 2.7 2.7 0 00-.84 2 4.7 4.7 0 001 2.5 10.6 10.6 0 004.05 3.56c2 .79 2.42.63 2.85.59a2.44 2.44 0 001.63-1.15 2 2 0 00.14-1.15c-.06-.1-.22-.16-.46-.28s-1.42-.7-1.64-.78-.38-.12-.55.12-.62.78-.76.94-.28.18-.52.06a6.5 6.5 0 01-1.9-1.18 7.2 7.2 0 01-1.33-1.65c-.14-.24 0-.37.1-.49s.24-.28.36-.42a1.6 1.6 0 00.24-.4.44.44 0 000-.42c-.06-.12-.54-1.32-.75-1.8z" fill="#fff"/></svg>${esc(L('WhatsApp', 'واتساب'))}</a>
          </div>` : ''}
        </div>`;
      }
      if (o.actionNeeded) {
        html += `<div class="action-needed"><b>${esc(L('Action needed', 'محتاجين منك حاجة'))}</b><span>${esc(o.actionNeeded)}</span></div>`;
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

      if (hasOrdersApi() && !shipped && !cancelled && (e.target.closest('[data-edit-order]') || e.target.closest('[data-cancel-order]'))) {
        const btn = e.target.closest('[data-edit-order], [data-cancel-order]');
        const who = { orderNumber: name, phone: det.dataset.phone || O.customer?.phone || '' };
        const onApiError = (title, err) => {
          if (SHIPPED_RE.test(errText(err))) markShipped(name);
          if (/already cancelled/i.test(errText(err))) markCancelled(name);
          return ordersApiFail(title, err);
        };
        if (btn.hasAttribute('data-edit-order')) {
          if (btn.classList.contains('busy')) return;
          btn.classList.add('busy');
          try {
            const view = await ordersApi('customer_get_order', who);
            if (view.cancelled) { markCancelled(name); return ordersApiFail(L('Can’t change it', 'مينفعش يتغيّر'), new Error('already cancelled')); }
            if (!view.canCancel) { markShipped(name); return ordersApiFail(L('Can’t change it', 'مينفعش يتغيّر'), new Error('being prepared for shipping')); }
            openEditOrder(who, view, () => setTimeout(() => location.reload(), 1200));
          } catch (err) {
            onApiError(L('Can’t change it', 'مينفعش يتغيّر'), err);
          } finally { btn.classList.remove('busy'); }
          return;
        }
        return O.okaAlert(L('Cancel order?', 'تلغي الطلب؟'), L(`Are you sure? Order ${name} will be cancelled and this can’t be undone.`, `متأكد؟ الطلب ${name} هيتلغي ومينفعش نرجّعه.`), [
          { text: L('Back', 'ارجع'), style: 'cancel' },
          {
            text: L('Cancel order', 'الغي الطلب'),
            style: 'destructive',
            onPress: async () => {
              btn.classList.add('busy');
              try {
                await ordersApi('customer_cancel_order', { ...who, reason: 'Cancelled on website' });
                markCancelled(name);
                O.haptic.success();
                O.okaAlert(L('Order cancelled', 'الطلب اتلغى'), L(`Your order ${name} has been cancelled.`, `طلبك ${name} اتلغى.`));
              } catch (err) {
                onApiError(L('Could not cancel', 'معرفناش نلغيه'), err);
              } finally { btn.classList.remove('busy'); }
            },
          },
        ]);
      }

      if (e.target.closest('[data-edit-order]')) {
        if (cancelled) return O.okaAlert(L('Not available', 'مش متاح'), L('This order has already been cancelled.', 'الطلب ده اتلغى خلاص.'));
        if (shipped) {
          return O.okaAlert(L('Not available', 'مش متاح'), L('This order has already shipped, so its items and address can no longer be changed.', 'الطلب اتشحن خلاص، فمينفعش تغيّر منتجاته أو عنوانه.'));
        }
        return changesUnavailable();
      }

      if (e.target.closest('[data-cancel-order]')) {
        if (cancelled) return O.okaAlert(L('Already cancelled', 'الطلب ملغي'), L('This order has already been cancelled.', 'الطلب ده اتلغى خلاص.'));
        if (shipped) return O.okaAlert(L('Not available', 'مش متاح'), friendlyError('already shipped'));
        return changesUnavailable();
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
        if (!items.length) return O.okaAlert(L('Not available', 'مش متاح'), L('These items aren’t available right now.', 'المنتجات دي مش متوفرة دلوقتي.'));
        try {
          await O.addManyToCart(items);
          O.haptic.success();
          if (missing) await O.okaAlert(L('Added what’s available', 'ضفنا الموجود'), L(`${missing} item(s) aren’t available right now.`, `${num(missing)} منتج مش متوفر حالياً.`));
          go(CFG.routes.cart);
        } catch (err) {
          O.okaAlert(L('Could not add', 'معرفناش نضيفه'), errText(err));
        }
      }
    });
  }

  /**
   * Edit order — one screen for everything on the order (orders API):
   *   items      quantities (0 removes), each product's other options, and any
   *              product from the shop added with "Add products"
   *   delivery   receiver, phone, governorate, area, street, details
   *   total      repriced as you go by customer_quote_order — Shopify applies the
   *              store's own rules (bundles and discount codes, the 300 EGP shipping
   *              tier, the governorate's rate) — and shown against the old total
   * Saving sends it all at once (customer_update_order) with the total shown, so
   * nothing is saved if the price moved meanwhile. `auth` is { session } for a
   * guest's last order or { orderNumber, phone } for a signed-in customer.
   */
  async function openEditOrder(auth, view, onSaved) {
    const { products } = await O.loadCatalogue();
    const EG_MOBILE = /^(?:\+?20|0)?1[0125]\d{8}$/;
    const orig = {
      items: (view.items || []).map((it) => ({ variantId: String(it.variantId), qty: it.quantity })),
      address: { ...view.address },
      phone: view.phone || view.address?.phone || '',
    };
    // Rows: the order's items, then any added from the catalogue.
    const rows = (view.items || []).map((it) => ({
      variantId: String(it.variantId), origVariant: String(it.variantId), title: it.title, variant: it.variant || '',
      image: it.image, price: Number(it.unitPrice || 0), qty: it.quantity, options: (it.options || []).filter((o) => o.title !== 'Default Title'),
    }));
    const addr = { name: view.address?.name || '', phone: orig.phone, provinceCode: view.address?.provinceCode || '', city: view.address?.city || '', address1: view.address?.address1 || '', address2: view.address?.address2 || '' };
    let quote = null;       // latest quote for the current edit
    let quoting = false;
    let quoteErr = '';
    let saving = false;
    let seq = 0;
    let timer = null;
    let picker = false;     // the "Add products" list is open
    let query = '';

    const app = $('#app');
    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    const sheet = document.createElement('div');
    sheet.className = 'sheet edit-order';
    const close = () => { clearTimeout(timer); scrim.remove(); sheet.remove(); };
    scrim.addEventListener('click', close);

    const wantedItems = () => {
      const m = new Map();
      rows.forEach((r) => { if (r.qty > 0) m.set(r.variantId, (m.get(r.variantId) || 0) + r.qty); });
      return [...m].map(([variantId, quantity]) => ({ variantId, quantity }));
    };
    const key = (list) => JSON.stringify([...list].map((i) => [String(i.variantId), i.quantity ?? i.qty]).sort());
    const itemsChanged = () => key(wantedItems()) !== key(orig.items.map((i) => ({ variantId: i.variantId, quantity: i.qty })));
    const addrFields = ['name', 'provinceCode', 'city', 'address1', 'address2'];
    const addressChanged = () => addrFields.some((k) => String(addr[k] || '').trim() !== String(orig.address[k] || '').trim());
    const phoneChanged = () => String(addr.phone).replace(/\D/g, '').slice(-10) !== String(orig.phone).replace(/\D/g, '').slice(-10);
    const changed = () => itemsChanged() || addressChanged() || phoneChanged();
    const repriced = () => itemsChanged() || addr.provinceCode !== orig.address.provinceCode;
    function problems() {
      if (!wantedItems().length) return L('To remove everything, cancel the order instead.', 'لو عايز تشيل كل حاجة، الغي الطلب.');
      if (addr.name.trim().length < 2) return L('Enter the receiver’s name.', 'اكتب اسم المستلم.');
      if (!EG_MOBILE.test(String(addr.phone).replace(/[\s-]/g, ''))) return L('Enter a full mobile number, e.g. 01012345678', 'اكتب رقم الموبايل كامل، مثلاً 01012345678');
      if (!addr.provinceCode) return L('Choose the governorate.', 'اختار المحافظة.');
      if (!addr.city.trim()) return L('Enter the area.', 'اكتب المنطقة.');
      if (addr.address1.trim().length < 5) return L('Enter the street and building.', 'اكتب الشارع ورقم العمارة.');
      return '';
    }

    function summary() {
      const t0 = Number(view.total || 0);
      if (!repriced()) {
        return `${sumRow(t('subtotal'), fmtPrice(view.itemsTotal ?? view.subtotal))}
          ${view.discount > 0 ? sumRow(L('Discount', 'الخصم'), `−${fmtPrice(view.discount)}`) : ''}
          ${sumRow(t('shipping'), fmtPrice(view.shipping))}
          ${sumRow(L('Total (cash on delivery)', 'الإجمالي (كاش عند الاستلام)'), fmtPrice(t0), 'total')}`;
      }
      if (quoting && !quote) return `<div class="eo-quoting">${spinner(true)}<span>${esc(L('Working out your new total…', 'بنحسب الإجمالي الجديد…'))}</span></div>`;
      if (quoteErr) return `<div class="code-error">${esc(quoteErr)}</div>`;
      if (!quote) return '';
      const diff = Math.round((quote.total - t0) * 100) / 100;
      return `${sumRow(t('subtotal'), fmtPrice(quote.itemsTotal))}
        ${quote.discount > 0 ? sumRow(L('Discount', 'الخصم'), `−${fmtPrice(quote.discount)}`) : ''}
        ${sumRow(t('shipping'), quote.shipping === 0 ? t('shipFree') : fmtPrice(quote.shipping))}
        ${sumRow(L('New total (cash on delivery)', 'الإجمالي الجديد (كاش عند الاستلام)'), fmtPrice(quote.total), 'total')}
        ${diff !== 0 ? `<div class="eo-diff ${diff > 0 ? 'up' : 'down'}">${esc(diff > 0 ? L(`${fmtPrice(diff)} more than before`, `${fmtPrice(diff)} زيادة عن قبل`) : L(`${fmtPrice(-diff)} less than before`, `${fmtPrice(-diff)} أقل من قبل`))}</div>` : ''}
        ${(quote.lostCodes || []).length ? `<div class="eo-note">${esc(L(`Code ${quote.lostCodes.join(', ')} no longer applies to this order.`, `الكود ${quote.lostCodes.join('، ')} مبقاش ينطبق على الطلب ده.`))}</div>` : ''}
        ${quoting ? `<div class="eo-quoting small">${spinner(true)}</div>` : ''}`;
    }

    function itemsHtml() {
      return rows.map((r, i) => `
        <div class="eo-item${r.qty === 0 ? ' removed' : ''}" data-i="${i}">
          <div class="cat-item-img">${img(r.image)}</div>
          <div class="eo-item-meta">
            <div class="eo-item-title">${esc(r.title)}</div>
            ${r.options.length > 1 ? `<select class="oi-variant" data-option="${i}">${r.options.filter((o) => o.available !== false || String(o.variantId) === r.variantId).map((o) => `<option value="${esc(o.variantId)}"${String(o.variantId) === r.variantId ? ' selected' : ''}>${esc(o.title)}</option>`).join('')}</select>` : r.variant && r.variant !== 'Default Title' ? `<div class="eo-item-sub">${esc(r.variant)}</div>` : ''}
            <div class="eo-item-price">${r.qty === 0 ? `<span>${esc(L('Removed', 'اتشال'))}</span>` : esc(fmtPrice(r.price * r.qty))}</div>
          </div>
          ${stepper(r.qty, { size: 28, fs: 14, gap: 8 })}
        </div>`).join('');
    }
    function pickerHtml() {
      const f = O.fold ? O.fold(query) : query.toLowerCase();
      const list = products.filter((p) => p.available !== false && p.stock !== 0)
        .filter((p) => !f || (O.fold ? O.fold(`${p.titleEn} ${p.titleAr}`) : `${p.titleEn} ${p.titleAr}`.toLowerCase()).includes(f))
        .slice(0, 60);
      return `<div class="eo-picker">
          <div class="eo-picker-head"><input data-search type="search" placeholder="${esc(L('Search products', 'دوّر على منتج'))}" value="${esc(query)}">
            <button class="eo-link" data-picker-done>${esc(L('Done', 'تمام'))}</button></div>
          ${list.map((p) => {
            const inOrder = rows.filter((r) => r.variantId === String(p.variantId)).reduce((a, r) => a + r.qty, 0);
            return `<div class="eo-pick-row">
              <div class="cat-item-img">${img(p.img)}</div>
              <div class="eo-item-meta"><div class="eo-item-title">${esc(O.ptitle(p))}</div><div class="eo-item-price">${esc(fmtPrice(p.price))}</div></div>
              <button class="eo-add${inOrder ? ' on' : ''}" data-add-variant="${esc(p.variantId)}">${inOrder ? `✓ ${esc(num(inOrder))}` : '+'}</button>
            </div>`;
          }).join('') || `<div class="awaiting" style="margin:10px 0">${esc(L('No products match.', 'مفيش منتجات بالاسم ده.'))}</div>`}
        </div>`;
    }
    function render() {
      const scrollTop = $('.sheet-body', sheet)?.scrollTop || 0;
      const focusName = document.activeElement?.closest?.('.edit-order') ? document.activeElement.getAttribute('data-f') || (document.activeElement.matches('[data-search]') ? 'search' : null) : null;
      const why = problems();
      const busy = saving || (repriced() && (quoting || !quote || quoteErr));
      sheet.innerHTML = `
        <div class="grabber"></div>
        <div class="sheet-head"><span class="sheet-title">${esc(L(`Edit order ${view.orderNumber}`, `عدّل الطلب ${view.orderNumber}`))}</span>
          <button class="sheet-close" data-close aria-label="Close"><svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="#1d1d1f" stroke-width="2" stroke-linecap="round"/></svg></button></div>
        <div class="sheet-body">
          ${picker ? pickerHtml() : `
          <div class="eo-sec">${esc(L('Items', 'المنتجات'))}</div>
          ${view.canEdit ? `${itemsHtml()}<button class="eo-addbtn" data-open-picker>＋ ${esc(L('Add products', 'ضيف منتجات'))}</button>`
            : `<div class="eo-note" style="margin:0 20px 8px">${esc(L('This order has been paid, so its items can’t change — you can still update the delivery details.', 'الطلب ده اتدفع، فمينفعش تغيّر منتجاته — بس تقدر تعدّل بيانات التوصيل.'))}</div>`}
          <div class="eo-sec">${esc(L('Delivery', 'التوصيل'))}</div>
          <div class="eo-form">
            <label class="contact-field"><span>${esc(L('Receiver’s name', 'اسم المستلم'))}</span><input data-f="name" value="${esc(addr.name)}" maxlength="60" autocomplete="name"></label>
            <label class="contact-field"><span>${esc(L('Mobile number', 'رقم الموبايل'))}</span><input data-f="phone" value="${esc(addr.phone)}" maxlength="20" type="tel" inputmode="tel" autocomplete="tel"></label>
            <label class="contact-field"><span>${esc(L('Governorate', 'المحافظة'))}</span><select data-f="provinceCode">
              <option value="">${esc(L('Choose…', 'اختار…'))}</option>
              ${O.PROVINCES.map((p) => `<option value="${esc(p.code)}"${p.code === addr.provinceCode ? ' selected' : ''}>${esc(L(p.en, p.ar))}</option>`).join('')}
            </select></label>
            <label class="contact-field"><span>${esc(L('Area', 'المنطقة'))}</span><input data-f="city" value="${esc(addr.city)}" maxlength="60"></label>
            <label class="contact-field"><span>${esc(L('Street and building', 'الشارع ورقم العمارة'))}</span><input data-f="address1" value="${esc(addr.address1)}" maxlength="200" autocomplete="address-line1"></label>
            <label class="contact-field"><span>${esc(L('Floor, flat, landmark (optional)', 'الدور، الشقة، علامة مميزة (اختياري)'))}</span><input data-f="address2" value="${esc(addr.address2)}" maxlength="200" autocomplete="address-line2"></label>
          </div>
          <div style="height:12px"></div>`}
        </div>
        ${picker ? '' : `<div class="sheet-foot eo-foot">
          ${summary()}
          ${why && changed() ? `<div class="code-error">${esc(why)}</div>` : ''}
          <button class="accept${!changed() || why || busy ? ' dim' : ''}" data-save>${saving ? spinner() : esc(changed() ? L('Save changes', 'احفظ التعديلات') : L('No changes yet', 'مفيش تعديلات لسه'))}</button>
        </div>`}`;
      $('.sheet-body', sheet).scrollTop = scrollTop;
      if (focusName) {
        const el = focusName === 'search' ? $('[data-search]', sheet) : $(`[data-f="${focusName}"]`, sheet);
        if (el) { el.focus(); if (el.setSelectionRange && el.type !== 'tel' && el.tagName === 'INPUT') { const n = el.value.length; try { el.setSelectionRange(n, n); } catch (e) {} } }
      }
    }
    // Reprice shortly after the last change; an older answer never overwrites a newer one.
    function requote() {
      clearTimeout(timer);
      if (!repriced()) { quote = null; quoteErr = ''; quoting = false; return render(); }
      if (problems() && !wantedItems().length) { quote = null; return render(); }
      quoting = true;
      render();
      timer = setTimeout(async () => {
        const mine = ++seq;
        const args = { ...auth };
        if (itemsChanged()) args.items = wantedItems();
        if (addr.provinceCode !== orig.address.provinceCode || addressChanged()) {
          args.address = { name: addr.name.trim(), provinceCode: addr.provinceCode, city: addr.city.trim(), address1: addr.address1.trim(), address2: addr.address2.trim() };
        }
        try {
          const q = await ordersApi('customer_quote_order', args);
          if (mine !== seq) return;
          quote = q; quoteErr = '';
        } catch (err) {
          if (mine !== seq) return;
          quote = null; quoteErr = ordersApiMessage(err);
        }
        quoting = false;
        render();
      }, 450);
    }

    sheet.addEventListener('input', (e) => {
      const f = e.target.getAttribute('data-f');
      if (f) {
        addr[f] = e.target.value;
        // Only the governorate changes the price; other fields just re-check the form.
        if (f === 'provinceCode') requote();
        else { const foot = $('.eo-foot', sheet); if (foot) render(); }
        return;
      }
      if (e.target.matches('[data-search]')) { query = e.target.value; render(); }
    });
    sheet.addEventListener('change', (e) => {
      const sel = e.target.closest('[data-option]');
      if (!sel) return;
      const r = rows[Number(sel.dataset.option)];
      const o = r.options.find((x) => String(x.variantId) === sel.value);
      r.variantId = sel.value;
      if (o) { r.variant = o.title; r.price = Number(o.price); }
      requote();
    });
    sheet.addEventListener('click', async (e) => {
      if (e.target.closest('[data-close]')) return close();
      if (e.target.closest('[data-open-picker]')) { picker = true; query = ''; render(); $('[data-search]', sheet)?.focus(); return; }
      if (e.target.closest('[data-picker-done]')) { picker = false; return requote(); }
      const add = e.target.closest('[data-add-variant]');
      if (add) {
        const p = products.find((x) => String(x.variantId) === add.dataset.addVariant);
        const row = rows.find((r) => r.variantId === String(p.variantId));
        if (row) row.qty = Math.min(20, row.qty + 1);
        else rows.push({ variantId: String(p.variantId), title: O.ptitle(p), variant: '', image: p.img, price: Number(p.price), qty: 1, options: [] });
        O.haptic.selectionTick?.();
        return render();
      }
      const step = e.target.closest('[data-step]');
      if (step) {
        const r = rows[Number(step.closest('[data-i]').dataset.i)];
        r.qty = Math.max(0, Math.min(20, r.qty + Number(step.dataset.step)));
        return requote();
      }
      if (!e.target.closest('[data-save]') || saving || !changed()) return;
      const why = problems();
      if (why) return;
      if (repriced() && (!quote || quoting || quoteErr)) return;
      saving = true;
      render();
      const args = { ...auth };
      if (itemsChanged()) args.items = wantedItems();
      if (addressChanged()) args.address = { name: addr.name.trim(), provinceCode: addr.provinceCode, city: addr.city.trim(), address1: addr.address1.trim(), address2: addr.address2.trim() };
      if (phoneChanged()) args.newPhone = addr.phone.trim();
      if (quote && repriced()) args.expectedTotal = quote.total;
      try {
        const updated = await ordersApi('customer_update_order', args);
        close();
        O.haptic.success?.();
        O.okaAlert(L('Order updated', 'الطلب اتعدّل'), L(`Your order ${updated.orderNumber} now comes to ${fmtPrice(updated.total)}, paid on delivery.`, `طلبك ${updated.orderNumber} بقى ${fmtPrice(updated.total)}، هتدفعهم عند الاستلام.`));
        onSaved && onSaved(updated);
      } catch (err) {
        saving = false;
        // The price moved: show the new one and let them save again.
        if (/total is now/i.test(errText(err))) { quote = null; requote(); }
        else render();
        ordersApiFail(L('Could not save the changes', 'معرفناش نحفظ التعديلات'), err);
      }
    });
    render();
    app.append(scrim, sheet);
  }

  /** Orders change only through the orders API; without its key in Theme settings there's no other route. */
  function changesUnavailable() {
    return O.okaAlert(L('Not available yet', 'مش متاح لسه'), L('Changing or cancelling orders online isn’t switched on yet.', 'تعديل وإلغاء الطلبات أونلاين لسه مش متفعّل.'));
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
        <div class="sheet-head"><span class="sheet-title">${esc(L('Edit Order', 'عدّل الطلب'))}</span>
          <button class="sheet-close" data-close aria-label="Close"><svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="#1d1d1f" stroke-width="2" stroke-linecap="round"/></svg></button></div>
        <div class="sheet-body">
          <div class="sec-label">${esc(L('YOUR ORDER ITEMS', 'منتجات طلبك'))}</div>
          ${entries.length ? entries.map((e) => `
            <div class="sheet-item" data-pid="${esc(e.p.id)}">
              <div class="cat-item-img">${img(e.p.img)}</div>
              <div class="cat-item-meta" style="gap:4px"><div class="cat-item-title" style="font-size:13.5px;line-height:18px">${esc(O.ptitle(e.p))}</div><div class="sheet-item-total">${esc(fmtPrice(e.p.price * e.qty))}</div></div>
              ${stepper(e.qty, { size: 26, fs: 14, gap: 8 })}
            </div>`).join('')
            : `<div class="awaiting" style="margin:0 20px 8px;text-align:center">${esc(L('No items in this order', 'مفيش منتجات في الطلب'))}</div>`}
          ${addrs.length > 1 ? `<div class="sheet-rule"></div>
            <div class="sec-label">${esc(L('DELIVERY ADDRESS', 'عنوان التوصيل'))}</div>
            ${addressPicker(addrs, activeId, 'data-pick')}
            ${picked ? `<div class="addr-note">${esc(L('The order will be redirected here when you save.', 'الطلب هيروح على العنوان ده لما تحفظ.'))}</div>` : ''}` : ''}
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
          <button class="accept" data-accept>${saving ? spinner() : esc(L('Accept Changes', 'احفظ التعديلات'))}</button>
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
          O.okaAlert(L('Could not save the edit', 'معرفناش نحفظ التعديل'), errText(err));
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
      L('Delete account', 'امسح حسابي'),
      L('We’ll remove your personal data within 7 days. Order records are kept for accounting and tax.', 'هنمسح بياناتك في خلال ٧ أيام. سجلات الطلبات بتفضل عشان الحسابات والضرايب.'),
      [
        { text: L('Back', 'ارجع'), style: 'cancel' },
        {
          text: L('Delete my account', 'امسح حسابي'),
          style: 'destructive',
          onPress: async () => {
            try {
              await O.api('/customer/delete-request', { method: 'POST', body: {} });
              go(CFG.routes.logout);
            } catch (err) {
              O.okaAlert(L('Could not send the request', 'معرفناش نبعت الطلب'), errText(err));
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
          O.okaAlert(L('Could not update the default address', 'معرفناش نغيّر العنوان الأساسي'), errText(err));
        }
        return;
      }

      if (e.target.closest('[data-delete-addr]')) {
        e.stopPropagation();
        O.okaAlert(L('Delete address', 'امسح العنوان'), L('Are you sure?', 'متأكد؟'), [
          { text: L('Back', 'ارجع'), style: 'cancel' },
          {
            text: L('Delete', 'امسح'),
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
                O.okaAlert(L('Could not delete', 'معرفناش نمسحه'), errText(err));
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
        O.okaAlert(L('Could not find your location', 'معرفناش نحدد مكانك'), L('This browser can’t share a location.', 'المتصفح ده مش بيدعم تحديد الموقع.'));
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
          O.okaAlert(L('Could not find your location', 'معرفناش نحدد مكانك'), errText(err));
        } finally { done(); }
      }, () => {
        done();
        O.okaAlert(L('Location permission denied', 'إذن الموقع مقفول'), L('Enable location access in Settings to fill the address automatically.', 'فعّل إذن الموقع من إعدادات الجهاز عشان نملأ العنوان تلقائياً.'));
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
          O.okaAlert(L('Could not save the address', 'معرفناش نحفظ العنوان'), errText(err));
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
    { id: 'ship', points: 800, en: 'Free delivery (80 EGP off) over 800', ar: 'شحن ببلاش (خصم ٨٠ ج.م) على طلب فوق ٨٠٠' },
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
        : L('Every reward is unlocked', 'تقدر تبدّل أي هدية');

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
          <button class="reward-btn${ok ? ' on' : ''}" data-redeem="${esc(r.id)}">${busyId === r.id ? spinner().replace('spinner', 'spinner sm') : esc(ok ? L('Redeem', 'بدّل') : L('Locked', 'مقفول'))}</button>
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
        { text: L('Copy', 'انسخ'), onPress: () => navigator.clipboard?.writeText(v.code).catch(() => {}) },
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
          L('Use your points at checkout', 'ادفع بنقاطك'),
          L(`Your ${fmtPts(balance)} points are EGP ${worth} of store credit. Choose to apply it on the payment step at checkout.`,
            `نقاطك (${fmtPts(balance)}) تساوي ${fmtPts(worth)} ج.م رصيد عندنا. فعّله وانت بتدفع.`),
        );
        return;
      }
      O.okaAlert(L('Redeem points', 'بدّل نقاطك'),
        L(`${fmtPts(r.points)} points for a one-time code: ${r.en}. Valid for 90 days.`, `هنخصم ${fmtPts(r.points)} نقطة ونديك كود: ${r.ar}. صالح ${fmtPts(90)} يوم ولمرة واحدة.`),
        [
          { text: L('Back', 'ارجع'), style: 'cancel' },
          {
            text: L('Redeem', 'بدّل'),
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
                O.okaAlert(L('Could not redeem', 'معرفناش نبدّل'), errText(err));
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
    active: { en: 'Active', ar: 'شغّال', color: 'var(--green-deep)', bg: 'rgba(31,143,78,0.09)' },
    paused: { en: 'Paused', ar: 'واقف مؤقتاً', color: 'var(--ink-95)', bg: 'rgba(0,0,0,0.045)' },
    action_needed: { en: 'Needs attention', ar: 'محتاج تبص عليه', color: 'var(--red-deep)', bg: 'rgba(179,38,30,0.08)' },
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
            ${s.status === 'active' || s.status === 'paused' ? `<div class="sub-next">${esc(s.status === 'paused' ? L("Paused — won't ship right now", 'واقف — مش هيتشحن دلوقتي') : L('Next order: ', 'الطلب الجاي: ') + fmtDate(s.nextOrderDate))}</div>` : ''}
            ${s.status === 'action_needed' && s.lastError ? `<div class="sub-err">${esc(s.lastError)}</div>` : ''}
            ${s.ordersCreated > 0 ? `<div class="sub-hist">${esc(L(`${s.ordersCreated} order${s.ordersCreated > 1 ? 's' : ''} shipped — last ${s.lastOrderName ?? ''}`, `${num(s.ordersCreated)} طلب اتشحن — آخر واحد ${s.lastOrderName ?? ''}`))}</div>` : ''}
            ${s.status !== 'cancelled' ? `<div class="sub-actions">
              <button class="sub-btn" data-act="edit">${esc(L('Edit', 'عدّل'))}</button>
              ${s.status === 'paused' || s.status === 'action_needed'
                ? `<button class="sub-btn" data-act="resume">${busy ? '…' : esc(L('Resume', 'كمّل'))}</button>`
                : `<button class="sub-btn" data-act="pause">${busy ? '…' : esc(L('Pause', 'وقّف شوية'))}</button>`}
              <button class="sub-btn red" data-act="cancel">${esc(L('Cancel', 'الغي'))}</button>
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
        O.okaAlert(L('Could not do that', 'معرفناش نعملها'), errText(err));
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
        O.okaAlert(L('Cancel subscription', 'الغي الاشتراك'), L('No more orders will go out until you subscribe again.', 'مش هتتشحن طلبات جديدة بعد كده لحد ما تشترك تاني.'), [
          { text: L('Back', 'ارجع'), style: 'cancel' },
          { text: L('Cancel subscription', 'الغي الاشتراك'), style: 'destructive', onPress: () => act(sub, 'cancel') },
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
    if (editing) $('.hdr-title', root).innerHTML = `<span class="l-en">Edit Subscription</span><span class="l-ar">عدّل الاشتراك</span>`;
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
          ${sumRow(L('Shipping', 'الشحن'), shipping > 0 ? fmtPrice(shipping) : L('Free', 'ببلاش'))}
          ${sumRow(L('Each delivery', 'كل مرة توصيل'), fmtPrice(total), 'main')}
        </div>
        <div style="padding:6px 22px 30px">
          <button class="cta bold" data-submit>${submitting ? spinner() : esc(editing ? L('Save changes', 'احفظ التعديلات') : L('Start subscription', 'ابدأ الاشتراك'))}</button>
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
          O.okaAlert(L('Could not save the subscription', 'معرفناش نحفظ الاشتراك'), errText(err));
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
      // The signed-in customer's latest order, else the last one this browser saw.
      const last = wa.dataset.lastOrder || lastOrderStored()?.name || '';
      const text = last ? L(`Hi, about order ${last}`, `أهلاً، بخصوص طلب ${last}`) : L('Hi', 'أهلاً');
      window.open(O.whatsappUrl(text), '_blank', 'noopener');
    });
  }

  /* ════════════════════════════════════════════════════════════════════
   * TESTING ONLY — staff J&T AWB lookup (snippets/test-lookup.liquid).
   * REMOVE BEFORE PUBLISHING, with the snippet, its render line in
   * sections/oka-orders.liquid and the test_panel setting.
   * Finds a customer's shipments by phone (track_by_phone) or tracks AWBs
   * (track_delivery) through the website tracking service, and shows them
   * the way a customer's order shows them.
   * ════════════════════════════════════════════════════════════════════ */
  function testLookup(panel) {
    const results = $('[data-tl-results]');
    const field = (k) => $(`[data-tl-${k}]`, panel);
    const errEl = field('error');
    let data = null;
    let open = null;
    const showError = (msg) => { errEl.hidden = !msg; errEl.textContent = msg || ''; };

    function detail(o) {
      const items = o.order?.items || [];
      return `<div class="test-detail">
        ${items.length ? `<div class="items" style="padding:0 0 12px">${items.map((it) => `
          <div class="item-row">
            <div class="item-img">${img(it.image)}</div>
            <div style="flex:1;min-width:0"><div class="item-title">${esc(it.title)}</div><div class="item-qty">${esc([it.variant, `× ${num(it.quantity)}`].filter(Boolean).join(' · '))}</div></div>
          </div>`).join('')}</div>` : ''}
        ${trackingHtml(o)}
      </div>`;
    }

    // The list first; a tap opens that shipment's tracking in its place.
    function render() {
      if (!data) { results.innerHTML = ''; return; }
      // The Shopify order (number + product thumbnails) when the tracking
      // service knows it; the AWB alone otherwise.
      const card = (o, tappable) => {
        const items = o.order?.items || [];
        const thumbs = items.slice(0, 4).map((it) => `<span class="tl-thumb">${img(it.image)}${it.quantity > 1 ? `<b>×${esc(num(it.quantity))}</b>` : ''}</span>`).join('');
        const more = items.length > 4 ? `<span class="tl-more nums">+${esc(num(items.length - 4))}</span>` : '';
        return `
        <button class="order-card" ${tappable ? `data-tl-open="${esc(o.awb)}"` : ''} style="width:calc(100% - 44px);text-align:start">
          <div style="flex:1;min-width:0">
            <div class="order-top"><span class="order-name nums">${esc(o.order?.name || o.awb)}</span>${o.createdAt ? `<span class="order-total nums" style="font-weight:500">${esc(String(o.createdAt).slice(0, 10))}</span>` : ''}</div>
            ${items.length ? `<div class="tl-thumbs">${thumbs}${more}</div>
            <div class="order-meta">${esc(items.map((it) => it.title).join(' · '))}</div>` : ''}
            <div class="order-state${o.step >= 3 ? ' green' : ''}">${esc(o.stateLabel || L('No scans yet', 'مفيش تحديثات لسه'))}</div>
            ${o.order ? `<div class="order-meta nums" style="opacity:.7">AWB ${esc(o.awb)}</div>` : ''}
          </div>
          ${tappable ? `<span class="flip" style="display:flex;opacity:.4">›</span>` : ''}
        </button>`;
      };
      const o = open && data.find((x) => x.awb === open);
      if (o) {
        results.innerHTML = `
          <button class="outline-btn test-back" data-tl-back>${esc(L('‹ All shipments', '‹ كل الشحنات'))}</button>
          <div class="test-order">${card(o, false)}${detail(o)}</div>`;
      } else {
        results.innerHTML = `<div class="test-who">${esc(`${data.length} J&T shipments`)}</div>
          ${data.map((x) => `<div class="test-order">${card(x, true)}</div>`).join('')}`;
      }
    }

    async function lookUp() {
      const raw = field('awbs').value.trim();
      const awbs = [...new Set((raw.toUpperCase().match(/[A-Z]{2,4}\d{6,}/g) || []))];
      const phone = !awbs.length && raw.replace(/\D/g, '').length >= 10 ? raw : null;
      if (!CFG.jt) return showError('Fill in Theme settings → Live J&T tracking first.');
      if (!awbs.length && !phone) return showError('Enter a customer mobile (01012345678) or J&T AWB numbers (JEG…).');
      showError('');
      const go = field('go');
      go.innerHTML = spinner();
      try {
        if (phone) {
          const found = await jtByPhone(phone, Number(field('days').value) || 30);
          data = found.map((sh) => ({ awb: sh.awb, createdAt: sh.createdAt, order: sh.order, ...jtShape(sh.scans, 1, sh.status) }));
          if (!data.length) showError(`No J&T shipments for ${phone} in that window.`);
        } else {
          const scans = await jtTrack(awbs);
          data = awbs.map((awb) => ({ awb, ...jtShape(scans.get(awb), 1) }));
        }
        // One result opens straight away; several are listed first.
        open = data.length === 1 ? data[0].awb : null;
        render();
      } catch (err) {
        data = null;
        render();
        showError(/Failed to fetch|NetworkError|Load failed/i.test(errText(err))
          ? `Couldn't reach the tracking service from ${location.origin}.` : errText(err));
      } finally {
        go.textContent = 'Track';
      }
    }

    field('go').addEventListener('click', lookUp);
    field('clear').addEventListener('click', () => { data = null; open = null; field('awbs').value = ''; showError(''); render(); });
    results.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tl-open], [data-tl-back]');
      if (!b) return;
      open = b.dataset.tlOpen || null;
      render();
      results.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    onLang(() => { if (data) lookUp(); });
  }

  /* ── "Goes well with it" — right after something is added ─────────────
   * The moment of highest intent: the shopper just decided. Shown only when
   * the model is confident (bought-together, restock or wishlist), at most
   * once per product per visit and not twice within 45 s, and never on the
   * cart or checkout screens, which have their own add-on rails.
   */
  const REC_GAP_MS = 45000;
  let recLastAt = 0;
  document.addEventListener('oka:added', async (e) => {
    if ($('[data-screen="cart"], [data-screen="checkout"]') || $('.rec-sheet, .sheet')) return;
    if (Date.now() - recLastAt < REC_GAP_MS) return;
    const catalogue = await O.loadCatalogue();
    const me = catalogue.products.find((p) => String(p.variantId) === String(e.detail?.variantId));
    if (!me) return;
    const shown = O.store.sget('oka.recShown') || [];
    if (shown.includes(me.id)) return;
    const picks = O.recommend(catalogue, { moment: 'added', anchor: me.id, limit: 6 })
      .filter((r) => (r.why === 'with' || r.why === 'again' || r.why === 'saved') && r.score >= 0.12)
      .slice(0, 3);
    if (!picks.length) return;
    O.store.sset('oka.recShown', [...shown, me.id].slice(-30));
    recLastAt = Date.now();
    await new Promise((r) => setTimeout(r, 650));
    if ($('.sheet')) return;
    const app = $('#app');
    if (!app) return;
    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    const sheet = document.createElement('div');
    sheet.className = 'sheet rec-sheet';
    const title = O.ptitle(me);
    sheet.innerHTML = `
      <div class="grabber"></div>
      <div class="sheet-head"><span class="sheet-title">${esc(L('Added ✓', 'اتضاف ✓'))}</span>
        <button class="sheet-close" data-close aria-label="Close"><svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="#1d1d1f" stroke-width="2" stroke-linecap="round"/></svg></button></div>
      <div class="sheet-body" style="padding-bottom:12px">
        <div class="rec-lead">${esc(L(`People who buy ${title} usually add:`, `اللي بيشتروا ${title} غالبًا بيضيفوا:`))}</div>
        ${picks.map((r) => `
          <div class="sheet-item rec-row">
            <a href="${esc(r.p.url)}" class="cat-item-img">${img(r.p.img)}</a>
            <span style="flex:1;min-width:0"><b>${esc(O.ptitle(r.p))}</b>
              <span class="rec-why">${esc(O.recReason(r, title))} · ${esc(fmtPrice(r.p.price))}</span></span>
            <button class="rec-add press" data-rec-add="${r.p.variantId}">${esc(t('add'))}</button>
          </div>`).join('')}
        <div style="display:flex;gap:10px;padding:6px 20px 4px">
          <button class="cta" style="flex:1;background:rgba(0,0,0,0.06);color:#1d1d1f" data-close>${esc(L('Keep shopping', 'كمّل تسوق'))}</button>
          <a class="cta" style="flex:1;text-align:center" href="${esc(CFG.routes.cart)}">${esc(L('View cart', 'روح للسلة'))}</a>
        </div>
      </div>`;
    app.append(scrim, sheet);
    const close = () => { scrim.remove(); sheet.remove(); };
    scrim.addEventListener('click', close);
    sheet.addEventListener('click', async (ev) => {
      if (ev.target.closest('[data-close]')) return close();
      const add = ev.target.closest('[data-rec-add]');
      if (!add || add.classList.contains('done')) return;
      add.disabled = true;
      try {
        await O.addToCart(add.dataset.recAdd, 1, { silent: true });
        add.classList.add('done');
        add.textContent = L('Added', 'اتضاف');
      } catch (err) { add.disabled = false; }
    });
  });

  /* ── boot ────────────────────────────────────────────────────────────── */
  const SCREENS = {
    home, collection, search, product, cart, checkout, orders, account,
    addresses: addressesScreen, 'add-address': addAddress, loyalty, subscriptions, subscribe,
    wishlist: wishlistScreen, login, support, track,
  };
  function boot() {
    $$('[data-screen]').forEach((root) => {
      const fn = SCREENS[root.dataset.screen];
      if (!fn) return;
      try { fn(root); } catch (err) { console.error(`[oka] ${root.dataset.screen} failed:`, err); }
    });
    // TESTING ONLY — the staff order lookup, when the theme setting turns it on.
    const tl = $('[data-test-lookup]');
    if (tl) testLookup(tl);
    // Remember the latest order (number and phone) for when the customer
    // isn't signed in: the WhatsApp greeting and the guest's order actions.
    const firstOrder = $('[data-order-detail]');
    if (firstOrder && O.customer) O.store.set('oka.lastOrder', { name: firstOrder.dataset.orderDetail, phone: firstOrder.dataset.phone || O.customer.phone || '' });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
