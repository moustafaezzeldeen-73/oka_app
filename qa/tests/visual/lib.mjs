// Shared helpers for the visual / RTL / i18n / a11y suite.
import fs from 'node:fs';
import path from 'node:path';

export const HERE = path.dirname(new URL(import.meta.url).pathname);
export const QA = path.resolve(HERE, '../..');
export const BASE = process.env.VBASE || 'http://localhost:9420';
export const OUT = path.join(HERE, 'out');
fs.mkdirSync(OUT, { recursive: true });
export const AXE = path.join(HERE, 'node_modules/axe-core/axe.min.js');
export const { launch } = await import(path.join(QA, 'harness/pw.mjs'));

export const ROUTES = JSON.parse(fs.readFileSync(path.join(QA, 'reports/smoke.json'), 'utf8'))
  .reduce((m, r) => (m.some((x) => x[0] === r.route) ? m : m.concat([[r.route, r.label]])), []);

export const CART_SEED = [{ id: 47026198217002, quantity: 1 }, { id: 49400093081898, quantity: 2 }];
export async function seedCart(s) {
  await s.page.goto('/__qa/health');
  return s.page.evaluate((items) => fetch('/cart/add.js', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) }).then((r) => r.status), CART_SEED);
}

export const save = (name, data) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 1));

/**
 * In-page probe: layout overflow, clipping, scripts per locale, digits,
 * input direction, touch targets, names, headings, landmarks, covered controls.
 */
export function probe() {
  const W = innerWidth; const H = innerHeight;
  const vis = (el) => el.checkVisibility ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : !!el.offsetParent;
  const sel = (el) => {
    if (!el || el.nodeType !== 1) return '';
    const parts = [];
    let e = el;
    for (let i = 0; e && e.nodeType === 1 && i < 4; i++, e = e.parentElement) {
      let s = e.tagName.toLowerCase();
      if (e.id) { s += `#${e.id}`; parts.unshift(s); break; }
      const cls = [...e.classList].filter((c) => !/^(press|s9\d|l-en|l-ar)$/.test(c)).slice(0, 2);
      if (cls.length) s += `.${cls.join('.')}`;
      parts.unshift(s);
    }
    return parts.join(' > ');
  };
  const inHScroll = (el) => {
    for (let e = el.parentElement; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (/(auto|scroll)/.test(cs.overflowX) && e.scrollWidth > e.clientWidth + 1) return true;
    }
    return false;
  };
  const inInert = (el) => !!el.closest('[inert],[aria-hidden="true"]');
  const lang = document.documentElement.lang;
  const out = {
    url: location.pathname + location.search, lang, dir: document.documentElement.dir,
    docScrollW: document.scrollingElement.scrollWidth, innerW: W, innerH: H,
    docOverflow: document.scrollingElement.scrollWidth > W + 1,
    outOfViewport: [], clipped: [], latinOnAr: [], arabicOnEn: [], latinDigitsOnAr: [], indicDigitsOnEn: [],
    inputs: [], smallTargets: [], tinyTargets: [], englishLabelsOnAr: [], englishAltOnAr: [], headings: [], landmarks: {}, covered: [],
    nodes: document.getElementsByTagName('*').length,
  };
  const all = [...document.body.querySelectorAll('*')];
  for (const el of all) {
    if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
    if (inInert(el) || !vis(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    // horizontal overflow beyond the viewport, not inside a horizontal scroller
    if ((r.right > W + 1 || r.left < -1) && r.bottom > 0 && r.top < H * 3 && !inHScroll(el)) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' || r.left < W) out.outOfViewport.push({ sel: sel(el), left: Math.round(r.left), right: Math.round(r.right), text: (el.innerText || '').trim().slice(0, 40) });
    }
    // clipped text: own text, overflow hidden/ellipsis, content wider than the box
    const cs = getComputedStyle(el);
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (ownText && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2) && cs.overflow !== 'visible' && el.clientWidth > 0) {
      out.clipped.push({ sel: sel(el), text: el.textContent.trim().slice(0, 60), sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight, ellipsis: cs.textOverflow === 'ellipsis', clamp: cs.webkitLineClamp !== 'none' && cs.webkitLineClamp !== '' });
    }
    // touch targets
    const tag = el.tagName.toLowerCase();
    const interactive = tag === 'button' || (tag === 'a' && el.hasAttribute('href')) || (tag === 'input' && el.type !== 'hidden') || tag === 'select' || tag === 'textarea' || el.getAttribute('role') === 'button' || el.hasAttribute('data-heart');
    if (interactive) {
      const inlineText = tag === 'a' && cs.display === 'inline' && el.closest('p,li,.policy-body,.rte');
      const name = (el.getAttribute('aria-label') || el.innerText || el.value || el.placeholder || el.title || '').trim().replace(/\s+/g, ' ').slice(0, 30);
      if (!inlineText && (r.width < 44 || r.height < 44)) out.smallTargets.push({ sel: sel(el), w: Math.round(r.width), h: Math.round(r.height), name });
      if (!inlineText && (r.width < 24 || r.height < 24)) out.tinyTargets.push({ sel: sel(el), w: Math.round(r.width), h: Math.round(r.height), name });
      const al = el.getAttribute('aria-label');
      if (lang === 'ar' && al && /[A-Za-z]{2,}/.test(al) && !/[؀-ۿ]/.test(al)) out.englishLabelsOnAr.push({ sel: sel(el), label: al });
    }
    if (tag === 'img' && lang === 'ar') {
      const alt = el.getAttribute('alt');
      if (alt && /[A-Za-z]{3,}/.test(alt) && !/[؀-ۿ]/.test(alt) && !/^OKA( egypt)?$/i.test(alt.trim())) out.englishAltOnAr.push({ sel: sel(el), alt: alt.slice(0, 50) });
    }
    if (/^(input|textarea)$/.test(tag)) {
      out.inputs.push({ sel: sel(el), type: el.type, name: el.name, dir: cs.direction, textAlign: cs.textAlign, attrDir: el.getAttribute('dir'), inputmode: el.getAttribute('inputmode'), autocomplete: el.getAttribute('autocomplete'), placeholder: el.placeholder, label: !!(el.labels && el.labels.length) || !!el.getAttribute('aria-label') || !!el.getAttribute('aria-labelledby') });
    }
    if (/^h[1-6]$/.test(tag) || el.getAttribute('role') === 'heading') out.headings.push(`${tag}:${el.innerText.trim().slice(0, 40)}`);
  }
  for (const lm of ['header', 'nav', 'main', 'footer', '[role=banner]', '[role=navigation]', '[role=main]', '[role=contentinfo]', '[role=dialog]', '[aria-live]', '[role=status]', '[role=alert]']) out.landmarks[lm] = document.querySelectorAll(lm).length;
  // visible text by script
  const BRAND = /^(OKA|EGP|AR|3D|J&T|COD|ID|Cobra|OKA Cobra|SKU|AWB|WhatsApp|Instagram|Facebook|TikTok|USB|LED|PDF|HD|x|X|EN|PM|AM)$/;
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n; (n = tw.nextNode());) {
    const t = n.textContent.trim().replace(/\s+/g, ' ');
    if (!t || seen.has(t)) continue;
    const p = n.parentElement;
    if (!p || /^(script|style|noscript|template)$/i.test(p.tagName) || inInert(p) || !vis(p)) continue;
    const rr = p.getBoundingClientRect(); if (!rr.width || !rr.height) continue;
    seen.add(t);
    const hasAr = /[؀-ۿ]/.test(t);
    const latinWords = (t.match(/[A-Za-z][A-Za-z'’.-]+/g) || []).filter((w) => !BRAND.test(w));
    if (lang === 'ar' && !hasAr && latinWords.length) out.latinOnAr.push(t.slice(0, 80));
    if (lang === 'ar' && /[0-9]/.test(t)) out.latinDigitsOnAr.push(t.slice(0, 60));
    if (lang === 'en' && hasAr && !(t === 'ع' || t === 'العربية')) out.arabicOnEn.push(t.slice(0, 80));
    if (lang === 'en' && /[٠-٩]/.test(t)) out.indicDigitsOnEn.push(t.slice(0, 60));
  }
  return out;
}

/** Scroll the page's scroller to the end and list visible controls covered by another (fixed) element. */
export function coveredProbe() {
  const scr = document.querySelector('.screen:not(.fixed)') || document.querySelector('.feed') || document.scrollingElement;
  const res = [];
  const check = () => {
    for (const el of document.querySelectorAll('#content button, #content a[href], #content input, #content select, #content textarea')) {
      if (el.closest('[inert],[aria-hidden="true"]')) continue;
      if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue;
      const x = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1); const y = Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1);
      const hit = document.elementFromPoint(x, y);
      if (!hit || el.contains(hit) || hit.contains(el)) continue;
      // covered by something that is not part of its own scroller content
      const cov = hit.closest('.top-bar,.menu-handle,.buy-bar,.place-bar,.added-bar,.toast,.sheet,.overlay,[class*="bar"],[class*="sticky"],[style*="fixed"]') || hit;
      const pos = getComputedStyle(cov).position;
      if (pos === 'fixed' || pos === 'sticky' || pos === 'absolute') res.push({ el: `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join('.')}`, text: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 30), by: `${cov.tagName.toLowerCase()}.${[...cov.classList].slice(0, 2).join('.')}`, scrollTop: scr.scrollTop });
    }
  };
  if (scr) { scr.scrollTop = scr.scrollHeight; }
  check();
  return res;
}

export async function axe(page) {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const r = await axe.run(document, { resultTypes: ['violations', 'incomplete'], runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } });
    const m = (v, kind) => ({ kind, id: v.id, impact: v.impact, help: v.help, n: v.nodes.length, targets: v.nodes.slice(0, 6).map((n) => n.target.join(' ')), summary: v.nodes[0]?.failureSummary?.slice(0, 300) });
    return r.violations.map((v) => m(v, 'violation')).concat(r.incomplete.filter((v) => v.id === 'color-contrast').map((v) => m(v, 'incomplete')));
  });
}
