// Keyboard-only + dialogs + live regions + reduced motion.
import { launch, BASE, seedCart, save } from './lib.mjs';

const out = {};
const active = (p) => p.evaluate(() => {
  const a = document.activeElement;
  if (!a || a === document.body) return { tag: 'body' };
  const cs = getComputedStyle(a);
  const r = a.getBoundingClientRect();
  const hit = document.elementFromPoint(Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1), Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1));
  return {
    tag: a.tagName.toLowerCase(), cls: [...a.classList].slice(0, 3).join('.'),
    name: (a.getAttribute('aria-label') || a.innerText || a.value || '').trim().replace(/\s+/g, ' ').slice(0, 40),
    outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`, shadow: cs.boxShadow.slice(0, 60),
    focusVisible: a.matches(':focus-visible'),
    ringVisible: (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0),
    inMenu: !!a.closest('#side-menu'), inDialog: !!a.closest('.sheet,.alert,.age-gate,[role=dialog],[role=alertdialog]'),
    inViewport: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth,
    obscured: !!hit && !a.contains(hit) && !hit.contains(a),
    obscuredBy: hit && !a.contains(hit) ? `${hit.tagName.toLowerCase()}.${[...hit.classList].slice(0, 2).join('.')}` : '',
  };
});

async function tabWalk(s, n) {
  const seq = [];
  for (let i = 0; i < n; i++) { await s.page.keyboard.press('Tab'); await s.page.waitForTimeout(60); seq.push(await active(s.page)); }
  return seq;
}

for (const [locale, device] of [['en', 'Desktop 1440'], ['ar', 'iPhone 13']]) {
  const R = out[`${locale}-${device}`] = {};
  const s = await launch({ baseURL: BASE, device, locale, agent: 'visual', externalTimeoutMs: 1500 });
  await seedCart(s);

  // 1. home tab order
  await s.goto('/', { settle: 1200 });
  R.homeTabs = await tabWalk(s, 30);
  await s.shot(`kb-${locale}-home-after-30-tabs`);

  // 2. side menu: open with keyboard, trap?, Escape, focus return
  await s.goto('/', { settle: 800 });
  await s.page.focus('header [data-menu-open]');
  await s.page.keyboard.press('Enter');
  await s.page.waitForTimeout(500);
  R.menuAfterOpen = await active(s.page);
  R.menuOpen = await s.page.evaluate(() => document.querySelector('#app').classList.contains('menu-open'));
  R.menuTabs = await tabWalk(s, 16);
  R.menuTrap = R.menuTabs.every((x) => x.inMenu);
  await s.shot(`kb-${locale}-menu-open-tabbing`);
  await s.page.keyboard.press('Escape');
  await s.page.waitForTimeout(400);
  R.menuAfterEsc = { open: await s.page.evaluate(() => document.querySelector('#app').classList.contains('menu-open')), focus: await active(s.page) };
  R.menuBackgroundInert = await s.page.evaluate(() => { window.Oka.openMenu(); const c = document.querySelector('#content'); const r = { contentInert: c.inert || !!c.closest('[inert]'), contentAriaHidden: c.getAttribute('aria-hidden') }; window.Oka.closeMenu(); return r; });

  // 3. PDP: keyboard add to cart, live region
  await s.goto('/products/oka-cobra', { settle: 1200 });
  R.pdpTabs = await tabWalk(s, 25);
  const addBtn = await s.page.$('[data-add-to-cart], .buy-bar .cta, .buy-bar button');
  R.pdpAddBtn = addBtn ? await addBtn.evaluate((b) => ({ cls: b.className, text: b.innerText.trim().slice(0, 40), tag: b.tagName })) : null;
  if (addBtn) {
    await addBtn.focus();
    await s.page.keyboard.press('Enter');
    await s.page.waitForTimeout(900);
    R.pdpAfterAdd = await s.page.evaluate(() => {
      const bar = document.querySelector('.added-bar'); const toast = document.querySelector('.toast');
      const live = (el) => el && (el.closest('[aria-live],[role=status],[role=alert]') ? true : false);
      return { addedBar: !!bar, addedBarLive: live(bar), toast: toast?.textContent, toastLive: live(toast), liveRegions: [...document.querySelectorAll('[aria-live],[role=status],[role=alert]')].map((e) => `${e.tagName}.${e.className}:${e.getAttribute('aria-live') || e.getAttribute('role')}`), focus: document.activeElement?.className };
    });
    await s.shot(`kb-${locale}-pdp-after-enter-add`);
  }
  R.pdpButtons = await s.page.evaluate(() => [...document.querySelectorAll('.pdp-btns button, .stepper button, .reel-sound, [data-heart]')].map((b) => ({ cls: b.className, label: b.getAttribute('aria-label'), pressed: b.getAttribute('aria-pressed'), text: b.innerText.trim() })).slice(0, 12));
  // reel: is the video pausable by keyboard?
  await s.goto('/products/oka-black-tobacco', { settle: 1200 });
  R.reel = await s.page.evaluate(() => {
    const it = document.querySelector('[data-reel-item]');
    if (!it) return null;
    const v = it.querySelector('video');
    return { itemTabIndex: it.tabIndex, itemRole: it.getAttribute('role'), videoControls: v?.controls, videoAutoplayAttr: v?.hasAttribute('autoplay'), soundBtn: it.querySelector('[data-reel-sound]')?.getAttribute('aria-label'), soundPressed: it.querySelector('[data-reel-sound]')?.getAttribute('aria-pressed') };
  });

  // 4. cart: variant sheet + alert dialog semantics
  await s.goto('/cart', { settle: 1500 });
  const chg = await s.page.$('.line-variant');
  if (chg) {
    await chg.focus(); await s.page.keyboard.press('Enter'); await s.page.waitForTimeout(800);
    R.sheet = await s.page.evaluate(() => { const sh = document.querySelector('.sheet'); return sh ? { role: sh.getAttribute('role'), modal: sh.getAttribute('aria-modal'), labelled: sh.getAttribute('aria-labelledby') || sh.getAttribute('aria-label'), focusInside: sh.contains(document.activeElement), active: document.activeElement?.className } : null; });
    if (R.sheet) {
      await s.shot(`kb-${locale}-cart-variant-sheet`);
      R.sheetTabs = await tabWalk(s, 12);
      await s.page.keyboard.press('Escape'); await s.page.waitForTimeout(300);
      R.sheetAfterEsc = await s.page.evaluate(() => ({ stillOpen: !!document.querySelector('.sheet'), active: document.activeElement?.className }));
    }
  }
  // alert
  await s.page.evaluate(() => { window.Oka.okaAlert('QA title', 'QA message', [{ text: 'A' }, { text: 'B' }]); });
  await s.page.waitForTimeout(300);
  R.alert = await s.page.evaluate(() => { const a = document.querySelector('.alert'); return { role: a.getAttribute('role'), modal: a.getAttribute('aria-modal'), labelled: a.getAttribute('aria-labelledby'), described: a.getAttribute('aria-describedby'), focusInside: a.contains(document.activeElement), active: document.activeElement?.className || document.activeElement?.tagName }; });
  await s.page.keyboard.press('Escape'); await s.page.waitForTimeout(300);
  R.alertAfterEsc = await s.page.evaluate(() => !!document.querySelector('.alert'));
  R.alertTabs = await tabWalk(s, 6);
  await s.page.evaluate(() => document.querySelector('.alert-scrim')?.remove());

  // 5. forms: labels, errors (add-address page, contact, login)
  for (const r of ['/pages/addresses?view=oka-add-address', '/pages/contact', '/account/login', '/account/register', '/pages/track', '/search']) {
    await s.goto(r, { settle: 900 });
    R[`form ${r}`] = await s.page.evaluate(() => [...document.querySelectorAll('input:not([type=hidden]),textarea,select')].filter((e) => e.checkVisibility()).map((e) => ({ name: e.name || e.className, type: e.type, label: e.labels?.[0]?.innerText?.trim().slice(0, 30) || null, aria: e.getAttribute('aria-label'), ph: e.placeholder, required: e.required, describedby: e.getAttribute('aria-describedby'), invalid: e.getAttribute('aria-invalid'), dir: getComputedStyle(e).direction, autocomplete: e.autocomplete, inputmode: e.inputMode })));
  }
  // submit empty add-address form: are errors announced / associated?
  await s.goto('/pages/addresses?view=oka-add-address', { settle: 900 });
  const submit = await s.page.$('form button[type=submit], .place-bar button, [data-save], .cta');
  if (submit) {
    await submit.click().catch(() => {});
    await s.page.waitForTimeout(700);
    R.addAddressEmptySubmit = await s.page.evaluate(() => ({ invalid: [...document.querySelectorAll('[aria-invalid=true]')].length, errors: [...document.querySelectorAll('.field-error,.error,[role=alert],.alert')].map((e) => `${e.className}:${e.innerText.trim().slice(0, 60)}`), active: document.activeElement?.name || document.activeElement?.className, validationMsg: document.activeElement?.validationMessage }));
    await s.shot(`kb-${locale}-add-address-empty-submit`);
  }
  await s.close();
}

// 6. age gate (keyboard + semantics)
for (const locale of ['ar', 'en']) {
  const s = await launch({ baseURL: BASE, device: 'iPhone 13', locale, ageConfirmed: false, agent: 'visual' });
  await s.goto('/', { settle: 1000 });
  out[`ageGate-${locale}`] = await s.page.evaluate(() => { const g = document.querySelector('.age-gate'); return g ? { role: g.getAttribute('role'), modal: g.getAttribute('aria-modal'), z: getComputedStyle(g).zIndex, focusInside: g.contains(document.activeElement), contentInert: !!document.querySelector('#content').closest('[inert]') || document.querySelector('#content').inert, menuHandleZ: getComputedStyle(document.querySelector('.menu-handle')).zIndex } : null; });
  out[`ageGate-${locale}-tabs`] = await tabWalk(s, 8);
  // can a pointer reach the menu handle above the gate?
  out[`ageGate-${locale}-hit`] = await s.page.evaluate(() => { const h = document.querySelector('.menu-handle'); const r = h.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); const tb = document.querySelector('.top-bar [data-menu-open]').getBoundingClientRect(); const hit2 = document.elementFromPoint(tb.left + tb.width / 2, tb.top + tb.height / 2); return { handleHit: hit?.className, topMenuHit: hit2?.className?.toString?.() }; });
  await s.shot(`agegate-${locale}`);
  await s.close();
}

// 7. reduced motion
for (const rm of ['no-preference', 'reduce']) {
  const s = await launch({ baseURL: BASE, device: 'iPhone 13', locale: 'ar', agent: 'visual' });
  await s.page.emulateMedia({ reducedMotion: rm });
  const res = {};
  for (const r of ['/', '/products/oka-cloud-white-hookah', '/products/oka-black-tobacco', '/cart']) {
    await s.goto(r, { settle: 1500 });
    // scroll through the feed/snap pages so in-view animations start
    res[r] = await s.page.evaluate(async () => {
      const anims = document.getAnimations().filter((a) => a.playState === 'running');
      const infinite = anims.filter((a) => a.effect?.getTiming?.().iterations === Infinity).map((a) => `${a.animationName || a.constructor.name}@${a.effect?.target?.className?.toString?.().slice(0, 30)}`);
      // rAF-driven transforms (ribbon/compare): sample a ribbon ring twice
      const ring = document.querySelector('[data-ribbon-ring]');
      const t1 = ring?.style.transform; await new Promise((r) => setTimeout(r, 600)); const t2 = ring?.style.transform;
      const vids = [...document.querySelectorAll('video')].map((v) => ({ paused: v.paused, autoplay: v.autoplay, cls: v.className }));
      return { running: anims.length, infinite: [...new Set(infinite)], ribbonMoving: ring ? t1 !== t2 : null, vids, transitionsMenu: getComputedStyle(document.querySelector('.side-menu')).transitionDuration };
    });
  }
  out[`motion-${rm}`] = res;
  await s.close();
}
save('keyboard.json', out);
console.log(JSON.stringify(out, null, 1).slice(0, 200));
