/**
 * Runtime configuration.
 *
 * Expo inlines every EXPO_PUBLIC_* variable into the JS bundle at build time.
 * That is fine for a backend URL, and NOT fine for a Shopify Admin token: it
 * ships inside the app, and anyone with the APK can read it. Hence two modes:
 *
 *   "backend" (default, recommended)
 *       The app talks only to the Node service in this repo. Secrets stay on
 *       the server, and the Shopify/Bosta clients here are unused.
 *
 *   "direct"
 *       The device calls Shopify and Bosta itself. No server to run, but the
 *       credentials are extractable from the bundle. Only sensible for a
 *       warehouse-owned device on a trusted network, with a token scoped to
 *       the minimum needed.
 *
 * With neither configured the app runs on bundled sample data so the UI is
 * still fully explorable — the header shows an "not connected" badge.
 */

const env = process.env;

export const MODE = (env.EXPO_PUBLIC_MODE || "backend").toLowerCase();

export const backend = {
  baseUrl: (env.EXPO_PUBLIC_API_BASE || "").replace(/\/+$/, ""),
};

export const shopify = {
  shop: env.EXPO_PUBLIC_SHOPIFY_SHOP || "",
  accessToken: env.EXPO_PUBLIC_SHOPIFY_ACCESS_TOKEN || "",
  apiVersion: env.EXPO_PUBLIC_SHOPIFY_API_VERSION || "2025-07",
};

export const bosta = {
  apiKey: env.EXPO_PUBLIC_BOSTA_API_KEY || "",
  baseUrl: (env.EXPO_PUBLIC_BOSTA_BASE_URL || "https://app.bosta.co/api/v2").replace(/\/+$/, ""),
};

export const isBackendReady = () => MODE === "backend" && Boolean(backend.baseUrl);
export const isDirectReady = () => MODE === "direct" && Boolean(shopify.shop && shopify.accessToken);

/** True when nothing is configured and the app is running on sample data. */
export const isSampleMode = () => !isBackendReady() && !isDirectReady();

export function describeConfig() {
  if (isBackendReady()) return { mode: "backend", detail: backend.baseUrl };
  if (isDirectReady()) return { mode: "direct", detail: `${shopify.shop}.myshopify.com` };
  return { mode: "sample", detail: "no credentials configured" };
}
