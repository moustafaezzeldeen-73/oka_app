import { useCallback, useEffect, useRef } from 'react';

import { fetchWishlist, saveWishlist } from './api/auth';
import { useActions, useStore } from './store';

/**
 * Wishlist persistence.
 *
 * The heart on a product used to set a flag that lived and died with the app
 * process. It is now stored against the customer in Shopify, so it survives a
 * reinstall and is visible to the store.
 *
 * Writes are debounced and skipped while signed out — a guest still gets a
 * working wishlist for the session, it just has nowhere to persist to.
 */
export function useWishlistSync() {
  const { state } = useStore();
  const actions = useActions();
  const token = state.session?.token ?? null;
  const loaded = useRef(false);
  const timer = useRef(null);
  const lastSaved = useRef('');

  // Pull the stored list once per sign-in.
  useEffect(() => {
    if (!token || loaded.current) return;
    loaded.current = true;
    fetchWishlist(token)
      .then((r) => {
        const wishlist = {};
        for (const id of r.ids ?? []) wishlist[id] = true;
        lastSaved.current = JSON.stringify((r.ids ?? []).slice().sort());
        actions.patch({ wishlist });
      })
      .catch(() => {
        /* a wishlist that fails to load must not block the app */
      });
  }, [token, actions]);

  useEffect(() => {
    if (!token) {
      loaded.current = false;
      return undefined;
    }
    const ids = Object.keys(state.wishlist).filter((id) => state.wishlist[id]);
    const signature = JSON.stringify(ids.slice().sort());
    if (signature === lastSaved.current) return undefined;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      lastSaved.current = signature;
      saveWishlist(ids, token).catch(() => {
        /* retried on the next toggle */
      });
    }, 700);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [state.wishlist, token]);
}
