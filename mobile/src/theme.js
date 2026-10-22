/**
 * Design tokens lifted verbatim from the OKA Warehouse standalone HTML.
 *
 * The mockup is drawn on a 390 x 848 frame. Android's dp unit and CSS px line
 * up 1:1 at that logical width, so on a 390dp-wide device every value below is
 * literally the number from the design. `s()` scales proportionally on wider or
 * narrower phones so the layout keeps its exact proportions instead of
 * reflowing — that's what makes the port pixel-faithful rather than merely
 * similar.
 */

import { Dimensions, PixelRatio } from "react-native";

export const BASE_WIDTH = 390;
export const BASE_HEIGHT = 848;

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export const SCALE = SCREEN_WIDTH / BASE_WIDTH;

/** Scale a design-frame value to this device, rounded to a whole pixel. */
export const s = (value) => PixelRatio.roundToNearestPixel(value * SCALE);

export const colors = {
  ink: "#1C2321",          // primary text / dark surfaces
  canvas: "#F3F5F4",       // app background inside the frame
  page: "#E9ECEB",         // mockup page background
  surface: "#ffffff",
  surfaceMuted: "#EFF2F1", // image placeholders
  chipTrack: "#EDF0EF",    // qty steppers, small tiles
  green: "#0F9D58",        // primary action
  greenDeep: "#0B7C46",    // call / pickup / success
  greenTint: "#E8F3EC",
  amber: "#8A6520",
  amberTint: "#F6EFE4",
  red: "#A63A3A",
  redTint: "#F7EBEB",
  blue: "#3B82F6",         // scanner laser line
  slate: "#3F6470",
  slateTint: "#ECF1F2",
  pickup: "#0B7C46",
  pickupFlash: "#2FBF77",
  photoBg: "#141917",
};

/** rgba(0,0,0,a) values used throughout the design, named by their opacity. */
export const ink = (alpha) => `rgba(0,0,0,${alpha})`;
export const white = (alpha) => `rgba(255,255,255,${alpha})`;

export const fonts = {
  sans: "IBMPlexSansArabic_400Regular",
  sansMedium: "IBMPlexSansArabic_500Medium",
  sansSemi: "IBMPlexSansArabic_600SemiBold",
  mono: "IBMPlexMono_400Regular",
  monoMedium: "IBMPlexMono_500Medium",
  monoSemi: "IBMPlexMono_600SemiBold",
};

/**
 * The design writes type as the CSS `font` shorthand (`600 13px 'IBM Plex
 * Mono'`). These helpers keep that reading order so a style here can be
 * checked against the HTML line by line.
 */
export const sans = (weight, size, extra = {}) => ({
  fontFamily: weight >= 600 ? fonts.sansSemi : weight >= 500 ? fonts.sansMedium : fonts.sans,
  fontSize: s(size),
  ...extra,
});

export const mono = (weight, size, extra = {}) => ({
  fontFamily: weight >= 600 ? fonts.monoSemi : weight >= 500 ? fonts.monoMedium : fonts.mono,
  fontSize: s(size),
  ...extra,
});

/** The 1px hairline border used on nearly every card. */
export const hairline = (alpha = 0.08) => ({
  borderWidth: 1,
  borderColor: ink(alpha),
});

/** Chip palette, matching the CHIP table in the original. */
export const CHIP = {
  new: { bg: colors.slateTint, fg: colors.slate, ar: "جديد", en: "New" },
  badaddr: { bg: colors.amberTint, fg: colors.amber, ar: "عنوان ناقص", en: "Bad address" },
  ready: { bg: colors.greenTint, fg: colors.greenDeep, ar: "جاهز", en: "Ready" },
  picked: { bg: colors.ink, fg: "#ffffff", ar: "محمّل", en: "Picked" },
  transit: { bg: colors.amberTint, fg: colors.amber, ar: "في الطريق", en: "Transit" },
  cancelled: { bg: colors.redTint, fg: colors.red, ar: "ملغي", en: "Cancelled" },
};

/** Barcode bar widths — the exact sequence the mockup renders. */
export const BARS = [3, 1, 2, 1, 4, 1, 1, 2, 3, 1, 2, 4, 1, 1, 3, 2, 1, 4, 1, 2, 1, 3, 1, 2, 4, 1, 1, 2];

/** Ranking / clarity colour thresholds, straight from the original logic. */
export const rankColor = (rank) =>
  rank === null || rank === undefined
    ? ink(0.4)
    : rank >= 80
      ? colors.greenDeep
      : rank >= 50
        ? colors.amber
        : colors.red;

export const clarityColor = (clarity) =>
  clarity >= 70 ? colors.greenDeep : clarity >= 40 ? colors.amber : colors.red;
