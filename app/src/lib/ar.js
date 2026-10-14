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
const CDN = 'https://cdn.shopify.com/3d/models/o';

export const BUNDLED_MODELS = {
  cobra: {
    usdz: `${CDN}/919c44a3d2ae8a47/OKA_COB_Mold.usdz`,
    glb: `${CDN}/b86f5d0bee54f986/OKA_COB_Mold.glb`,
  },
  'carbon-black': {
    usdz: `${CDN}/1582d4c8f26f1c92/vortex_full_hookahs-black.usdz`,
    glb: `${CDN}/5ec7e8fa40a79a87/vortex_full_hookahs-black.glb`,
  },
  'black-tobacco': {
    usdz: `${CDN}/9b37177626afeb92/OKA-Black_Tobacco.usdz`,
    glb: `${CDN}/0bec520c48090d99/OKA-Black_Tobacco.glb`,
  },
  'black-tobacco-plate': {
    usdz: `${CDN}/9b37177626afeb92/OKA-Black_Tobacco.usdz`,
    glb: `${CDN}/0bec520c48090d99/OKA-Black_Tobacco.glb`,
  },
};

/** USDZ (iOS AR Quick Look), preferring whatever Shopify returned. */
export function modelUrlFor(product) {
  if (!product) return null;
  return product.usdzUrl ?? BUNDLED_MODELS[product.id]?.usdz ?? null;
}

/** GLB (the in-app viewer), preferring whatever Shopify returned. */
export function glbUrlFor(product) {
  if (!product) return null;
  return product.glbUrl ?? BUNDLED_MODELS[product.id]?.glb ?? null;
}

/** True when the product can be shown in the in-app AR viewer. */
export function hasModel(product) {
  return Boolean(glbUrlFor(product) || modelUrlFor(product));
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
