/**
 * Direction helpers.
 *
 * The prototype flips between Arabic (RTL) and English (LTR) instantly via a
 * `dir` attribute. `I18nManager.forceRTL` would demand an app reload, so
 * direction is applied per-style instead — the toggle stays instant, exactly
 * like the web build.
 */

/** `flex-direction: row` honouring direction. */
export const row = (isRtl) => (isRtl ? 'row-reverse' : 'row');

/** `text-align: start` honouring direction. */
export const textStart = (isRtl) => (isRtl ? 'right' : 'left');
/** `text-align: end` honouring direction. */
export const textEnd = (isRtl) => (isRtl ? 'left' : 'right');

/** Text styling for a run of copy that follows the reading direction. */
export const textDir = (isRtl) => ({
  textAlign: isRtl ? 'right' : 'left',
  writingDirection: isRtl ? 'rtl' : 'ltr',
});

/** `inset-inline-start: value` for absolutely positioned children. */
export const insetStart = (isRtl, value) => (isRtl ? { right: value } : { left: value });
/** `inset-inline-end: value` for absolutely positioned children. */
export const insetEnd = (isRtl, value) => (isRtl ? { left: value } : { right: value });

/** `margin-inline-start` / `margin-inline-end`. */
export const marginStart = (isRtl, value) =>
  isRtl ? { marginRight: value } : { marginLeft: value };
export const marginEnd = (isRtl, value) =>
  isRtl ? { marginLeft: value } : { marginRight: value };

/** Mirrors chevrons and other directional glyphs. */
export const chevronFlip = (isRtl) => ({ transform: [{ scaleX: isRtl ? -1 : 1 }] });

/** Arabic-Indic digits, matching the prototype's `arDigits`. */
export const arDigits = (str) =>
  String(str).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]);
