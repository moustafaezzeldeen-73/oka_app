import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Minimal .env loader so the app runs with no dependency beyond express.
// Real environment variables always win over the file.
function loadDotEnv() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();

const bool = (value, fallback = false) =>
  value === undefined ? fallback : ["1", "true", "yes", "on"].includes(String(value).toLowerCase());

export const config = {
  port: Number(process.env.PORT || 3000),
  dataDir: path.join(ROOT, "data"),

  shopify: {
    shop: process.env.SHOPIFY_SHOP || "",
    accessToken: process.env.SHOPIFY_ACCESS_TOKEN || "",
    apiVersion: process.env.SHOPIFY_API_VERSION || "2025-07",
  },

  bosta: {
    apiKey: process.env.BOSTA_API_KEY || "",
    baseUrl: (process.env.BOSTA_BASE_URL || "https://app.bosta.co/api/v2").replace(/\/+$/, ""),
    pickupLocationId: process.env.BOSTA_PICKUP_LOCATION_ID || "",
    liveShipments: bool(process.env.BOSTA_LIVE_SHIPMENTS, false),
  },

  calls: {
    // Which call-history/recording backend to use. See src/lib/callProvider.js.
    // Salestrail is being retired — this selector is how it gets replaced
    // without touching routes or the mobile app.
    provider: (process.env.CALL_PROVIDER || "salestrail").toLowerCase(),
  },

  salestrail: {
    apiKey: process.env.SALESTRAIL_API_KEY || "",
    baseUrl: (process.env.SALESTRAIL_BASE_URL || "https://api.salestrail.io").replace(/\/+$/, ""),
    // Header name differs between Salestrail deployments; keep it configurable
    // rather than guessing and failing with an opaque 401.
    authHeader: process.env.SALESTRAIL_AUTH_HEADER || "x-api-key",
  },

  orderWindowTzOffsetHours: Number(process.env.ORDER_WINDOW_TZ_OFFSET_HOURS || 2),
};

/**
 * Which integrations are actually usable with the credentials present.
 * The UI calls this so a missing key shows up as a disabled panel with a
 * clear reason, rather than as a request that fails halfway through.
 */
export function credentialStatus() {
  return {
    shopify: {
      configured: Boolean(config.shopify.shop && config.shopify.accessToken),
      shop: config.shopify.shop || null,
      apiVersion: config.shopify.apiVersion,
      missing: [
        !config.shopify.shop && "SHOPIFY_SHOP",
        !config.shopify.accessToken && "SHOPIFY_ACCESS_TOKEN",
      ].filter(Boolean),
    },
    bosta: {
      configured: Boolean(config.bosta.apiKey),
      baseUrl: config.bosta.baseUrl,
      liveShipments: config.bosta.liveShipments,
      pickupLocationId: config.bosta.pickupLocationId || null,
      missing: [!config.bosta.apiKey && "BOSTA_API_KEY"].filter(Boolean),
    },
    calls: {
    // Which call-history/recording backend to use. See src/lib/callProvider.js.
    // Salestrail is being retired — this selector is how it gets replaced
    // without touching routes or the mobile app.
    provider: (process.env.CALL_PROVIDER || "salestrail").toLowerCase(),
  },

  salestrail: {
      configured: Boolean(config.salestrail.apiKey),
      baseUrl: config.salestrail.baseUrl,
      missing: [!config.salestrail.apiKey && "SALESTRAIL_API_KEY"].filter(Boolean),
    },
  };
}
