import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Snap feedback for the collection feed.
 *
 * The vertical feed pages between collections, so each page change gets a
 * slightly weightier tap than the per-product horizontal notches.
 */

const safe = (fn) => {
  try {
    const r = fn();
    if (r && typeof r.catch === 'function') r.catch(() => {});
  } catch {
    /* haptics are best-effort */
  }
};

/** One collection scrolled past, vertically. */
export function snapCollection() {
  if (Platform.OS === 'web') return;
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

/** One product notch scrolled past, horizontally. */
export function snapNotch() {
  if (Platform.OS === 'web') return;
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Tab / nav selection. */
export function selectionTick() {
  if (Platform.OS === 'web') return;
  safe(() => Haptics.selectionAsync());
}

/** Item added to the cart, reward redeemed — a confirming success tap. */
export function success() {
  if (Platform.OS === 'web') return;
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}
