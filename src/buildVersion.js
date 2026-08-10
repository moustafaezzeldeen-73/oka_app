/**
 * A visible tripwire for "did the update actually land."
 *
 * Bundle-based delivery has no other way to confirm a JS update reached the
 * device — Metro's hot reload and a fresh git pull look identical from inside
 * the app. Bump this string with every bundle shipped so it can be checked in
 * one glance on the Account screen instead of guessed at.
 */
export const BUILD_VERSION = 'oka-v19 — address editing, swipe back, fulfilled lock';
