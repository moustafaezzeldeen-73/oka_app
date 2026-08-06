import Constants from 'expo-constants';

/**
 * Runtime configuration.
 *
 * Two very different kinds of credential are involved here, and they are kept
 * strictly apart:
 *
 *  • The **Storefront API** public access token is designed to ship inside a
 *    client. It can only read published products/collections and manage carts,
 *    so it lives in `app.json` → `extra` (or `EXPO_PUBLIC_*`) and is bundled.
 *
 *  • The **Admin API** token (`shpat_…`) and the Bosta API key are NOT here and
 *    must never be. They grant full control of the store, and anything bundled
 *    into a React Native app is readable by anyone who downloads it. They live
 *    in the order service (see `server/`), which this app talks to over HTTPS.
 *
 * Every value is optional: with nothing configured the app runs entirely on its
 * bundled catalogue, which is what the design prototype did.
 */

const extra = Constants.expoConfig?.extra ?? {};

const pick = (envKey, extraKey) =>
  process.env[envKey] ?? extra[extraKey] ?? null;

export const SHOP_DOMAIN =
  pick('EXPO_PUBLIC_SHOPIFY_DOMAIN', 'shopifyDomain') ?? 'www.okaegypt.com';

/** Storefront API version — bump deliberately, not automatically. */
export const STOREFRONT_API_VERSION = '2025-07';

export const STOREFRONT_TOKEN = pick(
  'EXPO_PUBLIC_SHOPIFY_STOREFRONT_TOKEN',
  'shopifyStorefrontToken',
);

/** Base URL of the OKA order service (`server/`), e.g. https://api.okaegypt.com */
export const SERVICE_URL = pick('EXPO_PUBLIC_OKA_SERVICE_URL', 'okaServiceUrl');

export const hasStorefront = () => Boolean(STOREFRONT_TOKEN);
export const hasService = () => Boolean(SERVICE_URL);

/** Requests are given a hard ceiling so a slow network can't wedge a screen. */
export const REQUEST_TIMEOUT_MS = 12000;

export async function withTimeout(promiseFactory, ms = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await promiseFactory(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}
