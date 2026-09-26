import { Easing } from 'react-native-reanimated';

/**
 * Design tokens lifted verbatim from the OKA web prototype.
 * Every number here maps 1:1 to a value in the original stylesheet so the
 * native screens land on the same pixel grid.
 */

export const ACCENT = '#1d1d1f';
export const MUTED = 'rgba(110,110,115,0.45)';

export const C = {
  accent: ACCENT,
  muted: MUTED,
  ink: '#1d1d1f',
  inkSoft: 'rgba(110,110,115,0.7)',
  inkSofter: 'rgba(110,110,115,0.5)',
  inkFaint: 'rgba(110,110,115,0.45)',
  green: '#1f8f4e',
  greenDeep: '#166b3b',
  white: '#ffffff',
  hairline: 'rgba(0,0,0,0.09)',
  hairlineSoft: 'rgba(0,0,0,0.06)',
  cardBg: 'rgba(255,255,255,0.045)',
  cardBorder: 'rgba(0,0,0,0.08)',
  sheetBg: '#f5f5f7',
};

/** linear-gradient(135deg,#1d1d1f,#3a3a3c) — the primary CTA fill. */
export const DARK_GRAD = ['#1d1d1f', '#3a3a3c'];
/** linear-gradient(180deg,#ffffff 0%,#fafafc 55%,#f5f5f7 100%) — app canvas. */
export const CANVAS_GRAD = ['#ffffff', '#fafafc', '#f5f5f7'];
export const CANVAS_LOCS = [0, 0.55, 1];

/** CSS timing functions used by the prototype, as Reanimated easings. */
export const EASE = {
  ease: Easing.bezier(0.25, 0.1, 0.25, 1),
  easeInOut: Easing.bezier(0.42, 0, 0.58, 1),
  /** cubic-bezier(.22,1,.36,1) — the "lens" and icon-scale spring-out. */
  out: Easing.bezier(0.22, 1, 0.36, 1),
};

/** Animation durations, in ms, exactly as authored in the prototype. */
export const D = {
  fadeIn: 450,
  fadeInSlow: 500,
  fadeInFast: 300,
  fadeInOverlay: 250,
  pop: 500,
  popFast: 300,
  lens: 450,
  iconScale: 350,
  feedItem: 350,
  progress: 300,
  progressSlow: 400,
  toggle: 200,
  press: 120,
  glow: 2600,
};

/** okaFadeIn keyframe: opacity 0→1, translateY 10→0. */
export const FADE_FROM_Y = 10;

/**
 * CSS `box-shadow` blur radius is roughly 2× React Native's `shadowRadius`,
 * so every ported shadow goes through here.
 */
export function shadow(offsetY, blur, color, opacity) {
  return {
    shadowColor: color,
    shadowOffset: { width: 0, height: offsetY },
    shadowRadius: blur / 2,
    shadowOpacity: opacity,
    elevation: Math.round(blur / 3),
  };
}

/** The liquid-glass tab bar / pill highlight stack (inset shadows included). */
export const GLASS_BAR_SHADOW =
  'inset 0 2px 6px rgba(255,255,255,0.9), inset 0 -4px 11px rgba(0,0,0,0.09), 0 14px 34px rgba(0,0,0,0.14)';
export const GLASS_LENS_SHADOW =
  'inset 0 1.5px 3px rgba(255,255,255,0.85), inset 0 -3px 7px rgba(0,0,0,0.09), 0 6px 16px rgba(0,0,0,0.14)';
export const GLASS_PILL_SHADOW =
  'inset 0 1.5px 3px rgba(255,255,255,0.85), 0 5px 14px rgba(0,0,0,0.1)';
export const TAB_ACTIVE_SHADOW =
  'inset 0 1.5px 2px rgba(255,255,255,0.95), 0 4px 10px rgba(0,0,0,0.16)';

/** Font weights map straight onto SF Pro's numeric weights on iOS. */
export const W = {
  medium: '500',
  semibold: '600',
  bold: '700',
  heavy: '800',
};
