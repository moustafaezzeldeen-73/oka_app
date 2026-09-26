import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

import { CATS as LOCAL_CATS, DEFAULT_CONFIG, PRODUCTS as LOCAL_PRODUCTS, STR } from './data';
import { arDigits } from './rtl';

/**
 * A direct port of the prototype's `Component` class: same state shape, same
 * action names, same navigation stack semantics.
 */

const INITIAL = {
  lang: 'ar',
  screen: 'home',
  stack: [],
  /** True once saved state (cart, language, session) has been read back. */
  hydrated: false,
  /** Shown once: the store sells tobacco products. */
  ageConfirmed: false,
  notifEnabled: false,
  editOrderOpen: false,
  editCart: null,
  collectionCategory: 'all',
  selectedProductId: null,
  pdpQty: 1,
  cart: {},
  wishlist: {},
  discountCode: '',
  /** The server's verdict on `discountCode`: { code, applied, amount, message }. */
  discount: null,
  paymentMethod: 'cod',
  /** Loyalty vouchers redeemed on this device, so their codes aren't lost. */
  vouchers: [],
  order: null,
  activeCollectionIndex: 0,
  activeProductIndex: {},
  arProductId: null,
  selectedAddress: null,
  newAddr: null,
  newAddrType: 'home',
  locationFound: false,
  /** Search and the collection screen's sort/filter. */
  searchQuery: '',
  sortBy: 'featured',
  filters: { inStock: false, onSale: false, maxPrice: null },

  /** The store's policy (shipping, minimum order, rewards…), from the server. */
  config: DEFAULT_CONFIG,

  /** Sign-in session: { token, via, test }. `customer` is the Shopify profile. */
  session: null,
  customer: null,
  remoteOrders: null,
  /** The signed-in customer's real Shopify addresses; null until fetched. */
  addresses: null,
  /** Which of `remoteOrders` the detail view is showing; null = the list. */
  selectedOrderName: null,
  /** Bumped after an edit or cancel so the order screen refetches. */
  ordersVersion: 0,
  /** Where to go after signing in (e.g. back to checkout). */
  afterSignIn: null,

  /** The signed-in customer's subscriptions; null until fetched. */
  subscriptions: null,
  /** Set by the Subscriptions screen before navigating to Subscribe to edit one. */
  editingSubscription: null,
};

const StoreContext = createContext(null);

export function StoreProvider({ children, catalogue, reloadCatalogue }) {
  const [state, setState] = useState(INITIAL);

  /** `this.setState(patch | updater)` */
  const patch = useCallback((p) => {
    setState((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) }));
  }, []);

  /** The live catalogue wins as soon as it arrives; otherwise the bundled one. */
  const products = catalogue?.products?.length ? catalogue.products : LOCAL_PRODUCTS;
  // Categories were being fetched and then thrown away — every screen still
  // read the bundled list, so Shopify's own collection titles and artwork
  // never appeared.
  const cats = catalogue?.cats?.length ? catalogue.cats : LOCAL_CATS;

  const value = useMemo(
    () => ({ state, patch, products, cats, reloadCatalogue }),
    [state, patch, products, cats, reloadCatalogue],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}

/**
 * Navigation + mutation actions. Mirrors the prototype one-for-one so screen
 * code reads the same as the original markup's handlers.
 */
export function useActions() {
  const { patch } = useStore();

  return useMemo(
    () => ({
      goTo: (screen, extra) =>
        patch((s) => ({
          stack: [
            ...s.stack,
            {
              screen: s.screen,
              collectionCategory: s.collectionCategory,
              selectedProductId: s.selectedProductId,
            },
          ],
          screen,
          ...extra,
        })),

      goBack: () =>
        patch((s) => {
          if (!s.stack.length) return { screen: 'home' };
          const prev = s.stack[s.stack.length - 1];
          return { ...prev, stack: s.stack.slice(0, -1) };
        }),

      goTab: (screen) => patch({ screen, stack: [], afterSignIn: null }),

      toggleLang: () => patch((s) => ({ lang: s.lang === 'ar' ? 'en' : 'ar' })),
      setNotif: (notifEnabled) => patch({ notifEnabled }),
      confirmAge: () => patch({ ageConfirmed: true }),
      setConfig: (config) => patch({ config: { ...DEFAULT_CONFIG, ...config } }),

      addToCart: (id, qty = 1) =>
        patch((s) => ({ cart: { ...s.cart, [id]: (s.cart[id] || 0) + qty } })),

      /** Adds several products at once — "order again". `items` is {productId: qty}. */
      addManyToCart: (items) =>
        patch((s) => {
          const cart = { ...s.cart };
          Object.keys(items).forEach((id) => { cart[id] = (cart[id] || 0) + items[id]; });
          return { cart, discount: null };
        }),

      setQty: (id, qty) =>
        patch((s) => {
          const cart = { ...s.cart };
          if (qty <= 0) delete cart[id];
          else cart[id] = qty;
          return { cart };
        }),

      toggleWishlist: (id) =>
        patch((s) => ({ wishlist: { ...s.wishlist, [id]: !s.wishlist[id] } })),

      setPaymentMethod: (paymentMethod) => patch({ paymentMethod }),
      /** Editing the code clears the server's verdict on the old one. */
      setDiscountCode: (discountCode) => patch({ discountCode, discount: null }),
      setDiscount: (discount) => patch({ discount }),
      setSearchQuery: (searchQuery) => patch({ searchQuery }),
      setSortBy: (sortBy) => patch({ sortBy }),
      setFilters: (f) => patch((s) => ({ filters: { ...s.filters, ...f } })),

      setPdpQty: (pdpQty) => patch({ pdpQty }),

      openAr: (arProductId) => patch({ arProductId }),
      closeAr: () => patch({ arProductId: null }),

      setActiveCollection: (activeCollectionIndex) => patch({ activeCollectionIndex }),
      setActiveProduct: (catId, idx) =>
        patch((s) => ({ activeProductIndex: { ...s.activeProductIndex, [catId]: idx } })),

      placeOrder: (order) =>
        patch((s) => ({
          order: { ...order, items: { ...s.cart } },
          cart: {},
          discountCode: '',
          discount: null,
          screen: 'confirm',
          stack: [],
          ordersVersion: s.ordersVersion + 1,
        })),

      cancelOrder: () =>
        patch((s) => ({ order: s.order ? { ...s.order, status: 'cancelled' } : s.order })),

      /**
       * `seed` is {productId: qty}. A real Shopify order carries line items
       * keyed by variant, so the caller resolves those back to catalogue
       * products first — the sheet itself only ever speaks product ids.
       */
      editOrder: (seed) =>
        patch((s) => {
          const start = seed ? { ...seed } : { ...((s.order && s.order.items) || {}) };
          return { editOrderOpen: true, editCart: start, editOriginal: { ...start } };
        }),
      closeEditOrder: () => patch({ editOrderOpen: false, editCart: null, editOriginal: null }),
      acceptEditOrder: () => patch({ editOrderOpen: false }),
      editSetQty: (id, qty) =>
        patch((s) => {
          const editCart = { ...s.editCart };
          if (qty <= 0) delete editCart[id];
          else editCart[id] = qty;
          return { editCart };
        }),

      /**
       * After sign-in the shopper goes back to where they were headed —
       * checkout, usually — rather than always landing on the orders list.
       */
      signedIn: ({ token, customer, via, test }) =>
        patch((s) => ({
          session: { token, via, test: Boolean(test) },
          customer,
          addresses: null,
          remoteOrders: null,
          subscriptions: null,
          screen: s.afterSignIn ?? 'orders',
          // requireSignIn pushed the screen the shopper came from, so "back"
          // from where they land returns there.
          stack: s.afterSignIn ? s.stack : [],
          afterSignIn: null,
        })),
      /** Sends a signed-out shopper to sign in, then on to `next`. */
      requireSignIn: (next) =>
        patch((s) => ({
          afterSignIn: next,
          stack: [...s.stack, { screen: s.screen }],
          screen: 'signIn',
        })),
      signOut: () =>
        patch({
          session: null,
          customer: null,
          remoteOrders: null,
          addresses: null,
          subscriptions: null,
          selectedAddress: null,
          wishlist: {},
          screen: 'account',
          stack: [],
        }),
      setRemoteOrders: (remoteOrders) => patch({ remoteOrders }),
      setAddresses: (addresses) => patch({ addresses }),
      setSubscriptions: (subscriptions) => patch({ subscriptions }),
      openOrder: (selectedOrderName) => patch({ selectedOrderName }),
      backToOrderList: () => patch({ selectedOrderName: null }),
      /** Forces the order screen to pull fresh state after a mutation. */
      ordersChanged: () => patch((s) => ({ ordersVersion: s.ordersVersion + 1 })),

      selectAddress: (selectedAddress) => patch({ selectedAddress }),
      setNewAddrField: (key, val) =>
        patch((s) => ({ newAddr: { ...(s.newAddr || {}), [key]: val } })),
      setNewAddrType: (newAddrType) => patch({ newAddrType }),
      findMyLocation: (addr) => patch({ locationFound: true, newAddr: addr }),

      patch,
    }),
    [patch],
  );
}

/**
 * Everything the prototype computed in `renderVals()` — translations, cart
 * arithmetic, shipping tiers, loyalty balance.
 */
export function useDerived() {
  const { state, products } = useStore();
  const { lang } = state;
  const isRtl = lang === 'ar';

  return useMemo(() => {
    const t = (key, vars) => {
      let s = STR[lang][key] || key;
      if (vars) Object.keys(vars).forEach((k) => { s = s.replace(`{${k}}`, vars[k]); });
      return isRtl ? arDigits(s) : s;
    };
    const num = (n) => (isRtl ? arDigits(n) : String(n));
    const fmtPrice = (n) => (isRtl ? `${arDigits(n)} ج.م` : `EGP ${n}`);
    const title = (p) => (isRtl ? p.titleAr : p.titleEn);
    const desc = (p) => (isRtl ? p.descAr : p.descEn);
    const byId = (id) => products.find((p) => p.id === id) || null;

    const cartEntries = Object.keys(state.cart)
      .map((id) => {
        const product = byId(id);
        if (!product) return null;
        return { id, product, qty: state.cart[id], lineTotalRaw: product.price * state.cart[id] };
      })
      .filter(Boolean);

    /** The cart as the server prices it. Bundled demo products have no variant. */
    const cartLines = cartEntries
      .filter((c) => c.product.variantId)
      .map((c) => ({ variantId: c.product.variantId, quantity: c.qty }));
    const cartHasDemoItems = cartEntries.some((c) => !c.product.variantId);

    const cfg = state.config ?? DEFAULT_CONFIG;
    const cartCount = cartEntries.reduce((a, c) => a + c.qty, 0);
    const subtotalRaw = cartEntries.reduce((a, c) => a + c.lineTotalRaw, 0);
    // Only a code the server has accepted counts; typing one changes nothing.
    const discountRaw = state.discount?.applied ? state.discount.amount : 0;

    /** Policy shipping for a product total — an estimate; the server decides. */
    const shippingFor = (merch) =>
      merch >= cfg.freeShippingMin
        ? 0
        : Math.max(0, cfg.shippingFee - (state.paymentMethod === 'cod' ? 0 : cfg.prepaidShippingDiscount));

    const shippingRaw = shippingFor(subtotalRaw - discountRaw);
    const totalRaw = subtotalRaw - discountRaw + shippingRaw;
    const pointsEarn = Math.floor(Math.max(0, subtotalRaw - discountRaw) * cfg.loyalty.earnPointsPerEgp);
    const remainingForFree = Math.max(0, cfg.freeShippingMin - (subtotalRaw - discountRaw));
    const belowMinimum = subtotalRaw - discountRaw < cfg.minOrder;

    /** "1–2 days" for a delivery window. */
    const days = (min, max) =>
      isRtl ? `${arDigits(min)}-${arDigits(max)} ${max > 2 ? 'أيام' : 'يوم'}` : `${min}–${max} days`;
    /** The delivery window for a saved address's governorate. */
    const etaFor = (addr) => {
      const p = cfg.provinces.find((x) => x.code === (addr?.provinceCode ?? addr?.raw?.provinceCode));
      return p ? days(p.minDays, p.maxDays) : days(1, 5);
    };
    const provinceName = (code) => {
      const p = cfg.provinces.find((x) => x.code === code);
      return p ? (isRtl ? p.ar : p.en) : '';
    };

    const editCart = state.editCart || {};
    const editCartEntries = Object.keys(editCart)
      .map((id) => ({ id, p: byId(id), qty: editCart[id] }))
      .filter((e) => e.p);
    const editSubtotalRaw = editCartEntries.reduce((a, e) => a + e.p.price * e.qty, 0);
    const editTotalRaw = editSubtotalRaw + shippingFor(editSubtotalRaw);

    const selectedProduct = byId(state.selectedProductId);
    const pdpSubtotal = selectedProduct
      ? subtotalRaw + selectedProduct.price * (state.pdpQty || 1)
      : subtotalRaw;
    const pdpRemaining = Math.max(0, cfg.freeShippingMin - pdpSubtotal);

    return {
      lang,
      isRtl,
      t,
      num,
      fmtPrice,
      title,
      desc,
      byId,
      cartEntries,
      cartLines,
      cartHasDemoItems,
      cartCount,
      subtotalRaw,
      discountRaw,
      shippingRaw,
      totalRaw,
      pointsEarn,
      remainingForFree,
      shippingFor,
      belowMinimum,
      minOrder: cfg.minOrder,
      freeShippingMin: cfg.freeShippingMin,
      shippingFee: cfg.shippingFee,
      etaFor,
      provinceName,
      editCartEntries,
      editSubtotalRaw,
      editTotalRaw,
      selectedProduct,
      pdpSubtotal,
      pdpRemaining,
      pdpProgressPct: Math.min(100, Math.round((pdpSubtotal / cfg.freeShippingMin) * 100)),
      cartProgressPct: Math.min(100, Math.round((subtotalRaw / cfg.freeShippingMin) * 100)),
      langLabel: isRtl ? 'EN' : 'ع',
    };
  }, [state, lang, isRtl, products]);
}
