import { Linking, Platform } from 'react-native';

/**
 * Real AR, via iOS AR Quick Look.
 *
 * Shopify stores product 3D models as both USDZ and GLB. Handing iOS a USDZ
 * URL opens the system AR viewer — real camera, plane detection, real-world
 * scale — with no native module, so it works inside Expo Go.
 *
 * The simulated overlay stays as the fallback for products with no model and
 * for Android, where Quick Look does not exist.
 */

/**
 * Models already published on the store's CDN, keyed by the bundled
 * catalogue's product ids. These are public, permanent URLs, so AR works
 * before a Storefront token is configured. Once the live catalogue loads,
 * `product.usdzUrl` from Shopify takes precedence.
 */
export const BUNDLED_MODELS = {
  cobra: 'https://cdn.shopify.com/3d/models/o/919c44a3d2ae8a47/OKA_COB_Mold.usdz',
  'carbon-black':
    'https://cdn.shopify.com/3d/models/o/1582d4c8f26f1c92/vortex_full_hookahs-black.usdz',
  'black-tobacco':
    'https://cdn.shopify.com/3d/models/o/9b37177626afeb92/OKA-Black_Tobacco.usdz',
  'black-tobacco-plate':
    'https://cdn.shopify.com/3d/models/o/9b37177626afeb92/OKA-Black_Tobacco.usdz',
};

/** The USDZ for a product, preferring whatever Shopify returned. */
export function modelUrlFor(product) {
  if (!product) return null;
  return product.usdzUrl ?? BUNDLED_MODELS[product.id] ?? null;
}

/** True when tapping AR should hand off to the system viewer. */
export function canOpenInSpace(product) {
  return Platform.OS === 'ios' && Boolean(modelUrlFor(product));
}

/**
 * Opens the model in AR Quick Look. Returns false when it could not be
 * launched, so the caller can fall back to the in-app preview.
 */
export async function openInSpace(product) {
  const url = modelUrlFor(product);
  if (!url || Platform.OS !== 'ios') return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
