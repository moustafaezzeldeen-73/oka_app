import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { fetchMe, fetchStorefrontConfig } from '../api/auth';
import { hasService } from '../api/config';
import { useActions, useStore } from './store';

/**
 * What survives closing the app.
 *
 *  • cart, language, wishlist, age confirmation, notification choice and
 *    the chosen address → AsyncStorage
 *  • the session token → SecureStore (the device keychain), since it
 *    opens the customer's account
 *
 * Everything used to live only in memory, so every launch started signed out
 * with an empty cart.
 */

const PREFS_KEY = 'oka.prefs.v1';
const SESSION_KEY = 'oka.session.v1';

const PERSISTED = ['lang', 'cart', 'wishlist', 'ageConfirmed', 'notifEnabled', 'selectedAddress', 'vouchers'];

async function readPrefs() {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function readSession() {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveSession(session) {
  try {
    if (session) await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
    else await SecureStore.deleteItemAsync(SESSION_KEY);
  } catch {
    /* a session that can't be saved just won't survive a restart */
  }
}

/**
 * Loads saved state once at launch, then writes changes back (debounced).
 * Also fetches the store's policy and re-validates a saved session with the
 * server, dropping it if the token has expired.
 */
export function usePersistence() {
  const { state } = useStore();
  const actions = useActions();
  const timer = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [prefs, session] = await Promise.all([readPrefs(), readSession()]);
      if (!alive) return;
      const restored = {};
      for (const k of PERSISTED) if (prefs[k] !== undefined) restored[k] = prefs[k];
      // One update: marking the state hydrated before the session is back
      // would look like a sign-out, and the saved session would be erased.
      const saved = session?.token ? { token: session.token, via: session.via, test: Boolean(session.test) } : null;
      actions.patch({
        ...restored,
        ...(saved ? { session: saved, customer: session.customer ?? null } : {}),
        hydrated: true,
      });

      if (!hasService()) return;
      fetchStorefrontConfig().then((c) => alive && actions.setConfig(c)).catch(() => {});

      if (saved) {
        // The saved account shows straight away; confirm it in the background.
        fetchMe(saved.token)
          .then((r) => alive && actions.patch({ customer: r.customer }))
          .catch((err) => {
            if (!alive) return;
            if (err.status === 401) {
              saveSession(null);
              actions.patch({ session: null, customer: null });
            }
          });
      }
    })();
    return () => {
      alive = false;
    };
  }, [actions]);

  // Preferences: written a moment after they change.
  const prefs = PERSISTED.map((k) => state[k]);
  useEffect(() => {
    if (!state.hydrated) return undefined;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const out = {};
      PERSISTED.forEach((k) => { out[k] = state[k]; });
      AsyncStorage.setItem(PREFS_KEY, JSON.stringify(out)).catch(() => {});
    }, 400);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.hydrated, ...prefs]);

  // Session: saved on sign-in, removed on sign-out.
  const token = state.session?.token ?? null;
  useEffect(() => {
    if (!state.hydrated) return;
    saveSession(token ? { ...state.session, customer: state.customer } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.hydrated, token]);
}
