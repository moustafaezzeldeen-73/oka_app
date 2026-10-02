# Design port

How the Expo app reproduces the OKA prototype: animations, the collection
feed, right-to-left layout and screen geometry. Design tokens live in
`app/src/theme.js`; animation primitives in `app/src/components/anim.js` and
`app/src/components/ui.js`.

## Animations and transitions

Every animated value is ported from the prototype's stylesheet rather than
re-invented, so timings match one for one.

| Prototype | Native |
| --- | --- |
| `okaFadeIn .45s ease` (opacity 0→1, translateY 10→0) | `<FadeIn>`, fired on mount — screens remount on navigation, exactly as `sc-if` did |
| `okaPop .5s` (scale .7 → 1.15 → 1) | `<Pop>` via `withSequence` |
| `okaGlow 2.6s ease-in-out infinite` | `<Glow>` — `shadowOpacity` .18↔.30, `shadowRadius` 14↔20 |
| lens `transform .45s cubic-bezier(.22,1,.36,1)` | `withTiming` + `Easing.bezier(.22,1,.36,1)` |
| nav icon `scale(1.22\|0.82) .35s` | per-item `withTiming` |
| collection title / product card `.35s ease` | scale + opacity `withTiming` |
| progress bar `width .3s ease` | animated width in `<Progress>` |
| toggle `background .2s`, knob `left .2s` | `<Toggle>` in the account screen |
| `style-active: scale(x)` | `<Press activeScale={x}>` |
| `style-hover: background` | `<Press activeBg>` (press state on touch) |

CSS blur radii are halved when they become React Native `shadowRadius`; inset
shadows use React Native's `boxShadow` string syntax.

### The collection feed

- **Vertical** — one page per collection (`scroll-snap-type: y mandatory` →
  `pagingEnabled`), with a **medium haptic on every snap**.
- **Horizontal** — one notch per product (`snapToOffsets`), with a **light
  haptic on every notch**, fired as the detent engages rather than at momentum
  end so it feels mechanical.
- The **top selector is bound to the feed**: scrolling vertically slides the
  glass lens onto the active collection and auto-centres the strip; tapping a
  selector item scrolls the feed to that collection.

### Right-to-left

The app opens in Arabic. Direction is applied per-style (`row-reverse`,
`textAlign`, mirrored insets) rather than through `I18nManager.forceRTL`, so the
language toggle is instant — no app reload. Rails render in reverse and open on
their first item, matching `dir="rtl"` overflow behaviour in the browser.

### Geometry

The prototype was drawn in a 402×874 iPhone frame with content 54px below the
top of the screen and the tab bar floating 14px above the bottom. `app/App.js`
derives both from live safe-area insets (`insets.top - 5`, `insets.bottom - 20`),
which reproduces those exact numbers on a 16 Pro and stays correct elsewhere.

---

## Notes

- No custom native modules: everything used (Reanimated, Gesture Handler, SVG,
  Blur, Linear Gradient, Haptics, Image, Camera) ships inside Expo Go for SDK 57.
- The bundled catalogue (`app/src/data.js`) is the prototype's 22 products; the
  live store has more, and the app shows the live catalogue whenever the
  server answers.
- The Categories screen has no tab of its own, matching the prototype.
