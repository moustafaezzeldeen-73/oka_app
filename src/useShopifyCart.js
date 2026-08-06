import { useEffect, useRef } from 'react';

import { createCart, setCartLines } from './api/shopify';
import { hasStorefront } from './api/config';
import { useStore } from './store';

/**
 * Mirrors the local cart into a Shopify cart.
 *
 * The app's cart is authoritative for the UI — it has to keep working offline
 * and on the bundled catalogue. This pushes it to Shopify in the background so
 * the cart is a real one on the store: it shows up in analytics, abandoned-cart
 * flows can reach it, and the `checkoutUrl` is available as a fallback if the
 * native checkout ever needs to hand off to Shopify's own.
 *
 * Requires a Storefront token and live products (bundled products have no
 * variant ids); without either it does nothing.
 */
export function useShopifyCart() {
  const { state, products } = useStore();
  const cartIdRef = useRef(null);
  const timerRef = useRef(null);
  const lastSyncedRef = useRef('');

  useEffect(() => {
    if (!hasStorefront()) return undefined;

    const lines = Object.entries(state.cart)
      .map(([id, quantity]) => {
        const merchandiseId = products.find((p) => p.id === id)?.variantId;
        return merchandiseId ? { merchandiseId, quantity } : null;
      })
      .filter(Boolean);

    if (!lines.length) return undefined;

    // Debounced: tapping "+" five times should produce one write, not five.
    const signature = JSON.stringify(lines);
    if (signature === lastSyncedRef.current) return undefined;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const cart = cartIdRef.current
          ? await setCartLines(cartIdRef.current, lines)
          : await createCart(lines);
        cartIdRef.current = cart?.id ?? null;
        lastSyncedRef.current = signature;
      } catch {
        // A cart that fails to mirror must never block checkout.
      }
    }, 800);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state.cart, products]);

  return cartIdRef;
}
