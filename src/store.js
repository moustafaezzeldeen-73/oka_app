import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

import {
  CATS as LOCAL_CATS,
  CITY_FEES,
  FREE_SHIPPING_THRESHOLD,
  GOLD_TIER,
  LOYALTY_BASE,
  PRODUCTS as LOCAL_PRODUCTS,
  REWARD_COSTS,
  STR,
} from './data';
import { arDigits } from './rtl';

/**
 * A direct port of the prototype's `Component` class: same state shape, same
 * action names, same navigation stack semantics.
 */

const INITIAL = {
  lang: 'ar',
  screen: 'home',
  stack: [],
  notifEnabled: true,
  editOrderOpen: false,
  editCart: null,
  collectionCategory: 'all',
  selectedProductId: null,
  pdpQty: 1,
  cart: {},
  wishlist: {},
  discountCode: '',
  discountApplied: false,
  city: 'cityCairo',
  paymentMethod: 'cod',
  order: null,
  activeCollectionIndex: 0,
  activeProductIndex: {},
  arProductId: null,
  redeemedRewards: {},
  selectedAddress: 'home',
  newAddr: null,
  newAddrType: 'home',
  locationFound: false,

  /** Sign-in session. `customer` is whatever the service could resolve. */
  session: null,
  customer: null,
  remoteOrders: null,
  /** The signed-in customer's real Shopify addresses; null until fetched. */
  addresses: null,
  /** Which of `remoteOrders` the detail view is showing; null = the list. */
  selectedOrderName: null,
  /** Bumped after an edit or cancel so the order screen refetches. */
  ordersVersion: 0,
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

      goTab: (screen) => patch({ screen, stack: [] }),

      toggleLang: () => patch((s) => ({ lang: s.lang === 'ar' ? 'en' : 'ar' })),
      toggleNotif: () => patch((s) => ({ notifEnabled: !s.notifEnabled })),

      addToCart: (id, qty = 1) =>
        patch((s) => ({ cart: { ...s.cart, [id]: (s.cart[id] || 0) + qty } })),

      setQty: (id, qty) =>
        patch((s) => {
          const cart = { ...s.cart };
          if (qty <= 0) delete cart[id];
          else cart[id] = qty;
          return { cart };
        }),

      toggleWishlist: (id) =>
        patch((s) => ({ wishlist: { ...s.wishlist, [id]: !s.wishlist[id] } })),

      setCity: (city) => patch({ city }),
      setPaymentMethod: (paymentMethod) => patch({ paymentMethod }),
      setDiscountCode: (discountCode) => patch({ discountCode }),
      applyDiscount: () =>
        patch((s) => (s.discountCode.trim() ? { discountApplied: true } : {})),

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
          screen: 'confirm',
          stack: [],
        })),

      cancelOrder: () =>
        patch((s) => ({ order: s.order ? { ...s.order, status: 'cancelled' } : s.order })),

      /**
       * `seed` is {productId: qty}. A real Shopify order carries line items
       * keyed by variant, so the caller resolves those back to catalogue
       * products first — the sheet itself only ever speaks product ids.
       */
      editOrder: (seed) =>
        patch((s) => ({
          editOrderOpen: true,
          editCart: seed ? { ...seed } : { ...((s.order && s.order.items) || {}) },
        })),
      closeEditOrder: () => patch({ editOrderOpen: false, editCart: null }),
      acceptEditOrder: () => patch({ editOrderOpen: false }),
      editSetQty: (id, qty) =>
        patch((s) => {
          const editCart = { ...s.editCart };
          if (qty <= 0) delete editCart[id];
          else editCart[id] = qty;
          return { editCart };
        }),

      redeemReward: (id) =>
        patch((s) => ({ redeemedRewards: { ...s.redeemedRewards, [id]: true } })),

      signedIn: ({ token, customer, staff, via }) =>
        patch({ session: { token, staff, via }, customer, screen: 'orders', stack: [] }),
      signOut: () =>
        patch({ session: null, customer: null, remoteOrders: null, addresses: null, screen: 'account', stack: [] }),
      setRemoteOrders: (remoteOrders) => patch({ remoteOrders }),
      setAddresses: (addresses) => patch({ addresses }),
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

    const cartCount = cartEntries.reduce((a, c) => a + c.qty, 0);
    const subtotalRaw = cartEntries.reduce((a, c) => a + c.lineTotalRaw, 0);
    const discountRaw = state.discountApplied ? Math.round(subtotalRaw * 0.1) : 0;

    const cityDays = {
      cityCairo: t('days12'),
      cityGiza: t('days12'),
      cityAlex: t('days23'),
      cityOther: t('days35'),
    };
    const shippingRaw =
      subtotalRaw - discountRaw >= FREE_SHIPPING_THRESHOLD ? 0 : CITY_FEES[state.city] || 50;
    const totalRaw = subtotalRaw - discountRaw + shippingRaw;
    const pointsEarn = Math.round(totalRaw);
    const remainingForFree = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotalRaw);

    const editCart = state.editCart || {};
    const editCartEntries = Object.keys(editCart)
      .map((id) => ({ id, p: byId(id), qty: editCart[id] }))
      .filter((e) => e.p);
    const editSubtotalRaw = editCartEntries.reduce((a, e) => a + e.p.price * e.qty, 0);
    const editDiscountRaw = state.discountApplied ? Math.round(editSubtotalRaw * 0.1) : 0;
    const editShippingRaw =
      editSubtotalRaw - editDiscountRaw >= FREE_SHIPPING_THRESHOLD
        ? 0
        : CITY_FEES[state.city] || 50;
    const editTotalRaw = editSubtotalRaw - editDiscountRaw + editShippingRaw;

    const redeemed = Object.keys(state.redeemedRewards || {}).reduce(
      (sum, k) => sum + (REWARD_COSTS[k] || 0),
      0,
    );
    const loyaltyBalance = LOYALTY_BASE - redeemed;

    const selectedProduct = byId(state.selectedProductId);
    const pdpSubtotal = selectedProduct
      ? subtotalRaw + selectedProduct.price * (state.pdpQty || 1)
      : subtotalRaw;
    const pdpRemaining = Math.max(0, FREE_SHIPPING_THRESHOLD - pdpSubtotal);

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
      cartCount,
      subtotalRaw,
      discountRaw,
      shippingRaw,
      totalRaw,
      pointsEarn,
      remainingForFree,
      cityDays,
      cityFee: CITY_FEES[state.city] || 50,
      editCartEntries,
      editSubtotalRaw,
      editTotalRaw,
      loyaltyBalance,
      loyaltyProgressPct: Math.min(100, Math.round((loyaltyBalance / GOLD_TIER) * 100)),
      selectedProduct,
      pdpSubtotal,
      pdpRemaining,
      pdpProgressPct: Math.min(100, Math.round((pdpSubtotal / FREE_SHIPPING_THRESHOLD) * 100)),
      cartProgressPct: Math.min(100, Math.round((subtotalRaw / FREE_SHIPPING_THRESHOLD) * 100)),
      langLabel: isRtl ? 'EN' : 'ع',
    };
  }, [state, lang, isRtl, products]);
}
