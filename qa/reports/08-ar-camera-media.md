# 08 — AR / camera / video / media QA (OKA test theme)

**Scope.** The features added on 2026-10-14:
- the product-page (PDP) AR section that opens the camera by itself (`sections/main-product.liquid:113-144`, `assets/oka-screens.js:546-557`)
- the AR screen `/products/<h>?view=ar` (`sections/oka-ar.liquid`, `templates/product.ar.json`, `arView()`/`productAr()` in `oka-screens.js:595-735`)
- model-viewer loading (`assets/oka.js:671-686`)
- the video reel (`main-product.liquid:146-163`, `oka-screens.js:517-544`)
- snap scrolling (`assets/oka.css:1520-1550`)
- the PDP story in AR/EN (`snippets/pdp-story.liquid`)

**Method.**
- **Setup:** the local harness (`qa/harness/server.mjs` on port 9430, logs in `qa/harness/out-ar/`) driven by Playwright 1.56.1 Chromium through `qa/harness/pw.mjs`. Agent `ar` takes the screenshots.
- **Camera recording:** an init script (`qa/tests/ar/lib.mjs → camInit`) wraps `navigator.mediaDevices.getUserMedia`. It records every call and every returned stream, and counts tracks with `readyState === 'live'`.
- **Simulated outcomes:**
  - NotReadableError, OverconstrainedError and AbortError
  - no `getUserMedia` at all
  - a permission prompt that is never answered (`pending`, released on demand)
  - a slow answer (`delay:<ms>`)
  - pw.mjs adds `denied` (NotAllowedError) and `none` (NotFoundError).
- **Tab visibility:** simulated by overriding `document.hidden`/`visibilityState` and dispatching `visibilitychange`. Headless Chromium does not hide a background tab; that was checked: `visibilityState` stayed `visible`.
- **Scripts:** `qa/tests/ar/01-pdp-layout.mjs` … `14-long-prompt.mjs`. Run each with `node qa/tests/ar/NN-*.mjs [part]` while the server runs on 9430.
- **Screenshots:** `qa/reports/screenshots/ar/`.

**Covered:**
- All 5 live products with a 3D model: oka-cloud-white-hookah, oka-carbon-black-hookah, oka-victoria-pink-hookah, oka-cobra, oka-black-tobacco-plate.
- 4–12 products without a model.
- Devices: iPhone 13 and Pixel 7 emulation, Desktop 1440/1024, Small 320.
- Both languages.
- Every camera outcome listed above.
- Model-viewer failure modes, the GLB/USDZ hand-off URLs, the reel, snapping (wheel, keyboard, `:has()` removal), the story, bytes and long tasks, a11y tree.

**Not covered (harness/headless limits; see the device list at the end):**
- **AR and camera hardware:** real AR sessions (Scene Viewer, Quick Look, WebXR), the real browser permission prompt UI and its persistence, and real camera hardware/indicator.
- **Browsers:** iOS Safari/WebKit, Samsung Internet, in-app browsers, and real bfcache restore (Chromium headless did not restore from bfcache: `persisted:false`).
- **Real files:** videos are empty mp4 stand-ins, so there is no playback, decoding or memory data. GLBs are a 0.3 m box (892 B); the real ones are 0.64–4.24 MB.
- **Touch flings:** `Input.synthesizeScrollGesture` with touch did not move the page in this build (BLOCKED).

## Findings

| ID | Severity | Area | Title |
|---|---|---|---|
| AR-01 | High | Camera / privacy | Camera stream orphaned (stays on, no UI shows it) after a slow "Allow" plus scroll off and back. Confirms F-03 at runtime |
| AR-02 | High | Camera / privacy | Same orphan via tab switch while the prompt is open, on both PDP and AR screen |
| AR-03 | Medium | Camera / privacy | Camera goes live in a hidden/background tab when "Allow" lands while hidden |
| AR-04 | Medium | AR screen / cart | Add to cart on the AR screen shows no feedback: added-bar and rec-sheet are rendered behind the screen. Confirms F-08 |
| AR-05 | Medium | Camera UX / privacy | Camera requested with no tap and no explanation, also on Back (scroll restore lands on the AR section). No stop-camera control. Confirms and extends F-10 |
| AR-06 | Medium | 3D | GLB 404 / corrupt GLB / no WebGL leaves "Loading 3D…" and "Opening camera…" forever. No WebGL also throws an uncaught error |
| AR-07 | Medium | Desktop / scroll | Mouse wheel is captured by model-viewer zoom in the PDP AR section and the scrollbar is hidden, so desktop users get stuck |
| AR-08 | Medium | Snap / desktop | Slow mouse-wheel scrolling is snapped back to the top section and the page never moves |
| AR-09 | Low | Camera UX | All camera errors show one message. While the prompt is still up the chip already says "3D · drag to turn it" (F-10 part 2) |
| AR-10 | Low | 3D / perf | Slow or hanging model-viewer CDN keeps the AR screen "loading" (window `load` never fires). A failed load is never retried |
| AR-11 | Low | Video / a11y | Reel ignores reduced-motion and Save-Data. Sound button has no state and an English-only label. No captions or video label |
| AR-12 | Low | Snap / compat | `:has()` in the selector list: without it, every product snap rule is dropped. Confirms F-12 (simulated) |
| AR-13 | Low | Story / content | Story is hardcoded per handle and hides the merchant description. Products without `description_ar` show English in the Arabic UI |
| AR-14 | Low | a11y | AR status chip is not a live region; camera state changes are not announced |
| AR-15 | Low | Story / layout | An unbroken long token in story text overflows horizontally at 320 px (no `overflow-wrap`) |
| AR-16 | Info | Perf | 3D is lazy (0 B of model-viewer/GLB on PDP load, PASS). Cost when activated: model-viewer 955 KB local copy, real GLB up to 4.24 MB, about 2 s long task at init (software GL) |
| AR-17 | Info | AR hand-off | Scene Viewer / Quick Look hand-off URLs captured for all 5 products, for device testing |
| AR-18 | Info | AR screen | Repeated taps on "Add to cart" on the AR screen each add one unit (no in-flight guard). Same behaviour as cards |

---

### AR-01 — High — Orphaned camera stream after a slow "Allow" (F-03 confirmed)

**Where:** `oka-screens.js:638-655` `startCamera()`. `if (stream) return` does not cover a call that is still pending. When it resolves, `stream = s` overwrites the earlier stream without stopping it. The IO start/stop is at `oka-screens.js:552-555`.

**Repro:** `node qa/tests/ar/06-race.mjs`. On the PDP (oka-cobra, iPhone 13) the shopper scrolls onto the AR section, off, and back on within about 0.5 s while the permission answer takes about 4 s. Two `getUserMedia` calls follow, and both resolve while the section is active:
```
race delay=4000: on-section {"calls":2,"resolved":2,"live":2} → scrolled away {"calls":2,"resolved":2,"live":1}  LEAK 1 live track(s)
timeline 717ms:call 4763ms:call 4857ms:resolve 8771ms:resolve
```
Screenshot: `screenshots/ar/leak-race-4000-scrolled-away.png`. The section is off-screen and the `<video>` is detached, yet one camera track stays live. The leak is timing dependent: with shorter delays the second call resolved after the section had already been stopped, and nothing leaked.

**Expected:** 0 live tracks once the section leaves the screen. **Actual:** 1 live track until the tab is closed.

**Fix:** keep the pending promise (`starting = getUserMedia(...)`) and return it on re-entry. On resolve, stop the new tracks if `!active || stream || document.hidden`.

### AR-02 — High — Orphan via a tab switch while the prompt is open (new trigger, same root cause)

**Where:** `oka-screens.js:716-719`. On `visibilitychange` → visible, `startCamera()` runs again because `stream` is still null while the first call is pending.

**Repro:** `node qa/tests/ar/07-hidden-pending.mjs`. Page opens, the prompt is pending, the tab is hidden and then visible, then Allow:
```
pdp     2) hide/show during prompt, then Allow: on {"calls":2,"live":2} → after scrolling away {"live":1}
arpage  2) hide/show during prompt, then Allow: on {"calls":2,"live":2} → after tab hidden    {"live":1}
```
On phones, switching apps while a permission sheet is up is common (for example, checking a message). The AR screen does this on page open with no user action.

**Expected:** at most 1 stream, and 0 live after leaving. **Actual:** 2 streams, one never stopped.

**Fix:** same as AR-01.

### AR-03 — Medium — Camera turns on in a background tab

**Where:** `startCamera()` checks only `active`, not `document.hidden` (`oka-screens.js:644`).

**Repro:** `07-hidden-pending.mjs` part 1. The prompt is pending, the tab is hidden, then the getUserMedia answer arrives:
```
pdp    1) Allow lands while tab hidden: {"calls":1,"resolved":1,"live":1}
arpage 1) Allow lands while tab hidden: {"calls":1,"resolved":1,"live":1}
```
The camera stays live with the page in the background until the tab is shown and hidden again.

**Expected:** a stream that arrives while hidden is stopped, and the camera is re-requested on return.

**Fix:** in the resolve path add `if (!active || document.hidden) { s.getTracks().forEach(t => t.stop()); return; }`.

**PASS (for contrast), from `05-visibility-debug.mjs` and `03-camera-leaks.mjs`:**
- With the camera already on, hiding the tab stops it (live 1→0, `srcObject` cleared) and showing it restarts it, on both PDP and AR screen.
- 10× scroll in/out of the AR section settles to 0 live tracks every time.
- Scrolling in and out before the answer arrives → 0 live.
- Fast scroll-through, top→bottom and bottom→top → 0 live.
- Leaving the page (full navigation) stops the camera in `pagehide`.

### AR-04 — Medium — AR screen add to cart gives no feedback (F-08 confirmed)

**Where:**
- `oka.css:1471` sets `.ar-screen{position:fixed;z-index:50}`.
- `.added-bar` has z-index 46 (`oka.css:1293`), and the rec-sheet has 30/31.
- Both are appended to `#app` (`oka.js:291-303`).

**Repro:** `node qa/tests/ar/04-ar-page.mjs add`. On `/products/oka-cobra?view=ar`, tap "Add to cart". The cart gets `oka-cobra x1`, but:
```
addedBar: {"present":true,"z":"46","visibleOnTop":false,"coveredBy":"arx-cam", text "✓Added to cart View cart Check out"}
rec: {"present":true,"z":"31","visibleOnTop":false,"coveredBy":"arx-panel"}
```
It happens in both EN and AR. Screenshots: `screenshots/ar/arpage-add-feedback-en.png` and `-ar.png`. Nothing changes on screen after the tap, and the AR screen has no cart badge. Error alerts *are* visible (`arpage-add-error.png`: "Could not add…" is on top), and so is the "Open it on your phone" alert.

**Fix:** give `.added-bar`/`.toast` a z-index above 50, or show an "Added ✓ · View cart" state on `.arx-add`.

### AR-05 — Medium — Camera opens without a tap, without an explanation, and also on Back (F-10 confirmed and extended)

**Where:**
- `oka-screens.js:546-557`: the IntersectionObserver calls `view.start()` when ≥ 75 % of the section is visible.
- `productAr()` (`:733-735`): the AR screen starts the camera on page open.
- `oka.js:567-568`: scroll position is saved and restored.

**Findings:**
- **Normal page load: refuted** (good). For all 5 model products on iPhone 13, Pixel 7 and Desktop 1440, the AR section starts below the fold (top at 731–756 px). There were 0 `getUserMedia` calls on load (`01-pdp-layout.mjs`). Snapping is `proximity`, not mandatory, so the page is not pulled onto the section.
- **Back navigation: new.** Scroll to the AR section, open another page, then press Back. The PDP reloads with `scrollTop` restored to 655 (the AR section) and the camera opens right away with no gesture (`13-story-perf.mjs back`: `after Back … {"scrollTop":655,"cam":{"calls":1,"live":1}}`). On iOS Safari this shows the permission prompt on every Back.
- **Repeat prompts:** each re-entry asks again. Denied: 5 in/out → 5 `getUserMedia` calls (`F denied: calls 5, rejected NotAllowedError ×5`, same for no camera). On browsers that do not persist a denial (iOS Safari per-visit), that is a new prompt each time.
- **Keyboard:** PageDown from the top lands exactly on the AR section (655) and opens the camera.
- **No explanation before the prompt.** The inline chip says "Your space" and the hint says "Scroll here to see it in your space". Neither says the camera will be used.
- **No way to stop the camera except leaving.** The PDP section has no stop/close button. The AR screen has only "Back".

**Fix:**
- Start the camera only on a tap ("Show it in my room — uses your camera") in the inline section.
- On the AR screen, show a short pre-prompt card.
- Add a "Camera off" toggle.
- Do not auto-start after scroll restoration.

### AR-06 — Medium — 3D load failure leaves the screen stuck

**Where:** `loadModel()` (`oka-screens.js:666-707`) listens only to `load` and `ar-status`. There is no `error` listener and no timeout. The `.catch` covers only the model-viewer script itself.

**Repro:** `node qa/tests/ar/04-ar-page.mjs failures`. Screenshots are `screenshots/ar/fail-*.png`. Results:

| Case | Result |
|---|---|
| GLB 404 | AR screen: `loading:"Loading 3D…"` forever, chip `"Opening camera…"` (state search) forever, camera live, `mv.loaded=false` |
| GLB corrupt | Same as GLB 404 (console: `SyntaxError … not valid JSON`) |
| No WebGL | Same, plus an uncaught page error `Cannot read properties of undefined (reading 'xr')` |
| Camera denied, any of the above | Chip "Camera off — showing 3D", but no 3D shows: the photo stays and "Loading 3D…" stays |
| PDP section | Same symptoms. The hint text "Scroll here to see it in your space" never goes away |
| model-viewer script blocked | Handled: "Couldn't load the 3D model. Check your connection." But with the camera on, the chip still says "Opening camera…" forever |

`fail-glb-404-arpage-granted.png` shows the bare camera feed, "Opening camera…" and "Loading 3D…". With the camera on, the photo fallback is hidden by `.ar-screen.cam-on .arx-fallback{display:none}` (`oka.css:1504`), so the shopper sees only their room.

**Fix:**
- Handle `mv.addEventListener('error', …)` and add a 15 s timeout: show the photo, set the chip to "3D unavailable", and stop the camera.
- Make `place()` set the chip from the camera state after the camera starts.
- Check for WebGL before creating `<model-viewer>`.

### AR-07 — Medium — Desktop: the mouse wheel is trapped in the AR section

**Where:** `oka-screens.js:672` sets `camera-controls` with no `disable-zoom`. The stage is full width (`.ar-inline .arx-stage{inset:0 0 118px}`). The scrollbar is hidden (`.screen::-webkit-scrollbar{display:none}`, `oka.css:113`).

**Repro:** `node qa/tests/ar/11-mv-wheel.mjs` (Desktop 1440, carbon-black, snapping off to isolate the cause):
```
wheel ×5 over the model: page scrollTop 655 → 655 | wheel events defaultPrevented: 5 | camera-orbit radius changed (zoomed)
wheel ×3 beside the model (x=20): 655
```
Once the model has loaded, a desktop shopper cannot wheel past the section. It also shows in `10-wheel-check.mjs` without snapping: progress stops at 500–800 px. The only ways out are the keyboard or pointing at the top bar or bottom panel. Touch is not affected, because `touch-action: pan-y` lets the page scroll.

**Fix:** add `disable-zoom` on the inline section (keep pinch zoom only on the full AR screen), or set `disable-zoom` when `matchMedia('(pointer:fine)')` matches.

### AR-08 — Medium — Desktop: slow mouse-wheel scrolling snaps back to the top

**Where:** `oka.css:1523-1529` (`scroll-snap-type: y proximity` with `scroll-snap-align:start` on the sections). The first section (`pdp-top`) is 651 px tall and the next snap point is 655 px away.

**Repro:** `node qa/tests/ar/10-wheel-check.mjs` (Desktop 1440):

| Wheel input | Snap on | Snap off |
|---|---|---|
| 10 × 100 px, 400 ms apart | `0 0 0 0 0 0 0 0 0 0 0` | `100 200 300 400 …` |
| 10 × 100 px, 80 ms apart | `64 65 85 98 74 88 90 29 104 13 → 0` | — |
| 6 × 240 px, 400 ms apart | all `0` | — |
| 6 × 400 px, 400 ms apart | `655 1055 …` (works) | — |

Each scroll that ends less than about half-way to the next snap point is pulled back. A mouse user turning the wheel notch by notch cannot leave the product's first screen; only fast spins work. PageDown and Space work. Real trackpads and mice can differ from synthetic wheel events, so this needs a device check.

**Fix:** use `scroll-snap-type: none` for `(pointer:fine)`, or give `.pdp-top` intermediate snap points.

### AR-09 — Low — One message for every camera error; misleading status while the prompt is up (F-10 part 2 confirmed)

**Repro:** `02-pdp-camera-modes.mjs` and `04-ar-page.mjs matrix`. Every outcome produces the same chip: NotAllowedError, NotFoundError, NotReadableError, OverconstrainedError, AbortError, and a missing `getUserMedia`. The chip first says "Camera off — showing 3D" and is then overwritten by `place()` to "3D · drag to turn it" once the model loads. With the prompt left unanswered (`14-long-prompt.mjs`), the AR screen chip already says "3D · drag to turn it" at 500 ms while the browser prompt is still up. After Allow at 20 s it correctly becomes "Placed". On the PDP, "Opening camera…" turns into "3D · drag to turn it" when the model loads.

**Fix:**
- Map `e.name` to messages: denied → "Camera blocked — allow it in settings"; NotFound → "No camera found"; NotReadable → "Camera is busy in another app"; Overconstrained → retry with `{video:true}`.
- Keep "Waiting for camera permission…" while the call is pending.

### AR-10 — Low — Hanging model-viewer CDN; no retry

**Where:** `oka.js:672-686`. The module `<script>` is injected during page start on the AR screen. A rejected promise is cached in `modelViewerLoading`.

**Repro:** `04-ar-page.mjs failures` (`cdn-hang-first`): `?view=ar` gives `loadErr: "page.goto: Timeout 12000ms exceeded", readyState: interactive`. The page's `load` event waits for the hanging script, so the browser spinner keeps going. The PDP is unaffected (`readyState: complete`). After a CDN error, a later attempt in the same page never retries.

**Fix:**
- Inject model-viewer after `load` (or with `requestIdleCallback`).
- Clear `modelViewerLoading` on error.
- Consider self-hosting the 4.0.0 build as a theme asset; it already depends on ajax.googleapis.com being reachable.

### AR-11 — Low — Video reel accessibility and preferences

**Where:** `main-product.liquid:150-157` and `oka-screens.js:517-544`.

**Repro:** `node qa/tests/ar/08-reel.mjs` (cloud-white, black-tobacco-plate, black-tobacco).

**PASS:**
- `muted`, `playsinline`, `loop`, `preload="metadata"`, poster present, `controls` removed.
- No `autoplay` attribute; play is driven by an IntersectionObserver.
- Not played on load (`atLoad: pause`), plays at ≥ 60 % visible (`inView: pause,play`), pauses when scrolled away (`…,pause`).
- Missing mp4 (404): the poster stays and there is no page error.

**Issues:**
- `prefers-reduced-motion: reduce` still auto-plays (log identical to the default run).
- `navigator.connection.saveData` is not checked.
- The sound button is `aria-label="Sound"` in both languages, with no `aria-pressed`/state.
- The video has no `aria-label`/title and there are 0 `<track>` captions.
- Each video plays on its own visibility, so on wide screens where 2–3 reel items fit, all of them would play at once. Live data has only 1 video per product, so this does not happen today; the injection test was inconclusive.
- There is no `visibilitychange` pause (browsers usually throttle muted background video; check on device).

Screenshot: `screenshots/ar/reel-cloud-white.png`. The harness serves empty mp4 files, so all three `<source>`s were fetched in turn; that is a harness artifact. Real playback, decode memory and HLS are device items.

### AR-12 — Low — `:has()` drops all product snapping (F-12 confirmed by simulation)

**Repro:** `09-snap.mjs` (last part) deletes every CSS rule containing `:has(`, which is what an engine without `:has()` does when it drops the rule. Result: `dropped: [".screen[data-screen="product"] .snap-pg, … .story-steps:has(ol)", ".story-steps:not(:has(ol))"]`. `scroll-snap-align` of `.snap-pg`, `.story-hero` and `.ar-inline` becomes `none` for all of them, so the product page loses all snapping, including the AR section's `scroll-snap-stop`.

**Fix:** move `.story-steps:has(ol)` into its own rule.

### AR-13 — Low — Story content source; missing Arabic descriptions

**Where:** `snippets/pdp-story.liquid:9-18` picks the story by hardcoded handle, not from metafields. `main-product.liquid:99-104` shows the description only when there is no story.

**Repro:** `13-story-perf.mjs story`, Small 320, AR and EN.

**Stories:** 8 products have one, and it renders entirely in the active language (for example oka-cloud-white-hookah: 32 `l-ar` spans in AR, 32 `l-en` in EN; no mixed spans and no horizontal overflow). For these 8 products the merchant's description and `oka.description_ar` are never shown, so Admin edits have no effect. oka-cobra-oka-base gets the Cobra story.

**Missing `description_ar`:** trio-party, the-hexa-party, tongs, tongs-foil-combo and standard-15-g-bowl-glazed show the English description in the Arabic RTL UI (`descIsArabic:false`). Screenshot: `story-trio-party-ar-320.png`. This matches report 04.

**Fix:** add `oka.description_ar` for these 5 products, or move the story copy into metafields or a section.

### AR-14 — Low — The status chip is not announced

**Where:** `oka-ar.liquid:43`, `main-product.liquid:127`.

**Evidence:** the a11y tree of the AR screen (`04-ar-page.mjs a11y`) exposes it as plain text ("Looking for a surface…") with no `role=status`/`aria-live`. Camera on/off and errors are therefore silent for screen-reader users. Focus order: model-viewer → Back → Add to cart → Real size (AR), which is fine.

**Fix:** add `role="status" aria-live="polite"` to `[data-ar-status]`.

### AR-15 — Low — Long unbroken text overflows the story at 320 px

**Repro:** `13-story-perf.mjs long` makes story headlines and stats 6× longer and adds a 60-character unbroken token. The product screen gets a horizontal scroll (`pageHScroll:true`) in both AR and EN. Screenshots: `story-long-*-320.png`. Normal-length text does not overflow (PASS).

**Fix:** set `overflow-wrap:anywhere` on `.story`.

### AR-16 — Info — Performance

From `13-story-perf.mjs perf` (iPhone 13):

| Case | Total bytes | model-viewer | GLB | Long tasks (ms) |
|---|---|---|---|---|
| PDP load, no scroll (cloud-white) | 510 KB | 0 | 0 | 58, 67 |
| PDP + scroll to the AR section | 1 466 KB | 955 544 B | 892 B (harness box) | 60, 98, 172, **1929** |
| AR screen | 1 450 KB | 955 544 B | 892 B (harness box) | 82, 128, **2049** |
| PDP without a model (trio-party) | 499 KB | 0 | 0 | none |

- **Lazy loading is good:** 3D costs nothing until the section is activated.
- **Real sizes when activated:** the real GLB is 4.12–4.24 MB for the three hookahs and oka-black-tobacco-plate, and 0.64 MB for oka-cobra (USDZ: 3.3 MB / 0.53 MB). A shopper who just scrolls past downloads about 5 MB on mobile data. The 955 KB is the uncompressed local copy; the Google CDN serves it compressed.
- **The ~2 s long task** is model-viewer/three.js initialising on software GL in headless Chromium. It is likely much shorter on a phone GPU; measure on device.

**Suggestion:** use a dwell delay or a tap before loading 4 MB, and honour `saveData`.

### AR-17 — Info — AR hand-off URLs (for the device test)

`node qa/tests/ar/12-intents.mjs`. In Pixel 7 emulation, `canActivateAR` is true; on tap, model-viewer clicked:
```
intent://arvr.google.com/scene-viewer/1.2?mode=ar_preferred&disable_occlusion=true&resizable=false&file=<glb>#Intent;scheme=https;package=com.google.android.googlequicksearchbox;action=android.intent.action.VIEW;S.browser_fallback_url=<pdp>?view=ar#model-viewer-no-ar-fallback;end;
```
`resizable=false` comes from `ar-scale="fixed"`.

With iPhone 13 emulation and `relList.supports('ar')` forced (Chromium can't do Quick Look), the click was `<a rel="ar" href="<usdz>#allowsContentScaling=0">`. The camera stream is stopped before the hand-off (live 1→0, PASS).

| Product | GLB (bytes) | USDZ (bytes) |
|---|---|---|
| oka-cloud-white-hookah | 4 117 580 | 3 281 568 |
| oka-carbon-black-hookah | 4 153 548 | 3 315 467 |
| oka-victoria-pink-hookah | 4 150 268 | 3 311 016 |
| oka-cobra | 639 652 | 534 425 |
| oka-black-tobacco-plate | 4 238 304 | 3 338 512 |

All five have both formats in the fixtures. The harness 404s USDZ, so the files' validity was not checked.

**Other notes:**
- iPhone UA in Chromium reports `canActivateAR:false` and shows "Real-size AR needs a phone (Android or iPhone)" while on a phone-sized screen (`arpage-live-btn-iPhone_13.png`). The same will happen in FB/IG/TikTok in-app browsers (F-10 part 3, needs a device).
- Neither Scene Viewer nor Quick Look reports back to the page when closed. The camera restarts only through `visibilitychange`, so check on device whether the live camera comes back after returning.

### AR-18 — Info — Repeated taps on Add (AR screen)

`.arx-add` has no in-flight guard. One tap followed by two quick taps gives `oka-cobra x3`. Each tap adds one unit, which matches card behaviour. On sold-out products the button is not rendered (PASS, `1-pcs-of-foil?view=ar`).

---

## Confirm / refute of earlier reports

| Earlier claim | Result |
|---|---|
| 04 SI-11: 5 live products have 3D (glb+usdz); others show "coming soon" | **Confirmed.** 5/5 load the model; 4/4 tested non-model products show photo + "coming soon", make 0 camera calls and do not load model-viewer |
| 04: 3 live products have a video reel | **Confirmed** (cloud-white, black-tobacco-plate, black-tobacco) |
| 05 F-03: AR section can orphan a camera stream | **Confirmed at runtime** (AR-01). A second trigger was found (AR-02), plus AR-03 |
| 05 F-03 note: `visibilitychange` stops only the tracked stream | **Confirmed** (AR-02 leaves 1 live after hide) |
| 05 F-08: toasts/added-bar behind the AR screen | **Confirmed** (AR-04). Error alerts are visible |
| 05 F-10 part 1: camera requested without a tap when the scroll lands on the AR section | **Confirmed.** Extended: Back-navigation scroll restore and PageDown also trigger it |
| 05 F-10 part 1 (implied): permission prompt immediately on page load for products where the section is near the top | **Refuted** on all tested viewports (section below the fold, 0 calls on load). Only Back restore triggers it |
| 05 F-10 part 2: one generic message for all camera errors | **Confirmed** (AR-09) |
| 05 F-10 part 3: in-app browsers say "needs a phone" | Not testable here; the analogous behaviour is seen with iPhone UA in Chromium → device list |
| 05 F-12: `:has()` disables all product snap rules | **Confirmed** by simulation (AR-12) |
| 05 F-13: reduced motion not honoured for some animations | **Confirmed** for the reel (AR-11) |

**Tally:** 9 confirmed (SI-11, reel, F-03, F-03 note, F-08, F-10 part 1, F-10 part 2, F-12, F-13 reel), 1 refuted (prompt on page load), 1 not testable (F-10 part 3).

## Scenarios executed

**PDP layout and rendering**
- [x] PASS — PDP layout, 3 devices × 9 products: AR section only when a GLB exists; 3D chip only with a model; reel only with video (01)
- [x] PASS — PDP load does not call the camera or load model-viewer/GLB, all 5 model products × 3 devices (01, 13 perf)

**PDP AR section, camera outcomes (02)**
- [x] PASS — Camera granted, all 5 model products: camera on, model placed; scroll away → 0 live
- [x] PASS (fallback) / FAIL (message, AR-09) — Camera denied
- [x] PASS (fallback) / FAIL (message, AR-09) — No device (NotFoundError)
- [x] PASS (fallback) / FAIL (message, AR-09) — NotReadableError
- [x] PASS (fallback) / FAIL (message, AR-09) — OverconstrainedError
- [x] PASS (fallback) / FAIL (message, AR-09) — AbortError
- [x] PASS — `getUserMedia` undefined: 3D only, no errors
- [x] FAIL (misleading status, AR-09) — Prompt pending; after Allow at 20 s it works (14)

**AR screen `?view=ar` (04 matrix)**
- [x] PASS — Camera on at open, model placed, all 5 model products
- [x] PASS (fallback) / FAIL (AR-09) — oka-cobra under denied, none, NotReadable, Overconstrained, undefined and pending
- [x] PASS — 4 non-model products: "Photo" / "coming soon", no camera call
- [x] PASS — Sold-out product: no Add button

**Camera lifecycle and leaks**
- [x] PASS — Scroll in/out ×10 (live tracks always back to 0) (03 A)
- [x] FAIL (AR-01) — Slow-Allow race: delays 0/300/1500 ms → no leak; 4000 ms → 1 leaked track (06)
- [x] PASS — In→out before the answer arrives (03 B2)
- [x] PASS — Fast scroll-through, down and up (03 C)
- [x] PASS — Fast wheel ×12: lands on the AR section, camera on as designed (03 C)
- [x] PASS — Tab hidden/visible with the camera on, PDP and AR screen (05)
- [x] FAIL (AR-03) — Tab hidden while the prompt is pending → camera live in a hidden tab (07)
- [x] FAIL (AR-02) — Hidden then visible while the prompt is pending → 2 streams, 1 leaked (07)
- [x] PASS — Full navigation away: `pagehide` stops the camera (03 E)
- [x] BLOCKED — bfcache restore: headless Chromium did not restore from bfcache (`persisted:false`) → device list
- [x] N/A — SPA navigation: the theme has no client-side page navigation (only `history.*` on the orders page)
- [x] FAIL (AR-05) — Back to the PDP restores the scroll onto the AR section → camera opens with no gesture (13 back)
- [x] FAIL (AR-05) — Denied/none: 5 in/out → 5 getUserMedia calls (re-prompt risk) (03 F)
- [x] PASS — AR screen "Back" chevron → PDP, camera not running there (03 E)

**Model-viewer**
- [x] PASS — Attributes: `ar`, `ar-modes="webxr scene-viewer quick-look"`, `ios-src`=usdz, `camera-controls`, `ar-scale=fixed`, `ar-placement=floor`, `touch-action=pan-y`, `interaction-prompt=none`, alt=title. There is no `poster` attribute; the theme's own `<img>` fallback is used instead (02)
- [x] PASS (message) / FAIL (chip stuck with camera on, AR-06) — model-viewer CDN aborted
- [x] FAIL (AR-10) — model-viewer CDN hanging: the AR screen never finishes loading
- [x] FAIL (AR-06) — GLB 404
- [x] FAIL (AR-06) — Corrupt GLB
- [x] FAIL (AR-06) — No WebGL (getContext → null): stuck, plus an uncaught error
- [x] FAIL (AR-07) — Desktop wheel over the model (11)

**Cart from the AR screen (04 add)**
- [x] FAIL (AR-04) — Add to cart EN/AR: cart updated, feedback hidden
- [x] PASS — Add error alert visible
- [x] INFO (AR-18) — Double tap adds one per tap

**AR hand-off and a11y**
- [x] PASS on Pixel 7 emulation (intent URL, camera stopped) — "Real size (AR)" button (04 live, 12)
- [x] Expected in Chromium — "Real size (AR)" button on iPhone/Desktop emulation shows the "needs a phone" alert
- [x] PASS (captured) — Scene Viewer intent and Quick Look `rel="ar"` URLs for all 5 products (12)
- [x] PASS — AR screen a11y tree and focus order
- [x] FAIL (AR-14) — Status chip is not a live region

**Video reel (08)**
- [x] PASS — Attributes, play in view, pause out of view, poster
- [x] FAIL (AR-11) — Reduced motion ignored
- [x] FAIL (AR-11) — Save-Data not checked (code review)
- [x] PASS — Missing mp4: poster kept, no error
- [x] FAIL (AR-11) — Captions, video label, sound-button state
- [x] BLOCKED — Real playback and memory (empty mp4 stand-ins)
- [x] INCONCLUSIVE — Several videos playing at once (only 1 video per product in data; injection test inconclusive)

**Snap scrolling (09, 10)**
- [x] FAIL (AR-08) — Desktop slow wheel
- [x] PASS — Desktop large wheel deltas, PageDown, Space, ArrowDown, End
- [x] BLOCKED — Touch flings on iPhone/Pixel/320 (synthesized gesture did not scroll) → device list
- [x] FAIL (AR-12) — `:has()` unsupported (simulated)

**Story and description (13)**
- [x] PASS — Story AR/EN for 6 story products at 320 px (carbon-black and victoria-pink rendered `story-oka` in the 01 layout survey): language-pure, no overflow
- [x] FAIL (AR-13) — 5 products without `description_ar` show English in the Arabic UI
- [x] FAIL (AR-15) — Long unbroken text overflows

**Performance (13)**
- [x] PASS (lazy) / INFO (AR-16) — Bytes and long tasks

**Privacy UX**
- [x] FAIL (AR-05) — No explanation before the prompt and no camera-off control; the live indicator is only the browser's

## Needs manual test on a real device / live preview

| # | Test | iOS Safari (15.4+ and an older 15.x/14) | Android Chrome | Samsung Internet | FB / IG / TikTok in-app |
|---|---|---|---|---|---|
| 1 | Scroll onto the PDP AR section. Does the permission prompt appear without a tap? Is it asked again on every visit and on Back? (AR-05) | ✔ (re-asks per page load) | ✔ | ✔ | ✔ (may block getUserMedia) |
| 2 | AR-01/02: start the prompt, scroll away/back or switch apps, then Allow, then leave the section. Does the camera indicator stay on? | ✔ (orange dot) | ✔ (status-bar dot) | ✔ | ✔ |
| 3 | AR-03: Allow, then quickly switch apps. Is the camera indicator on while in the background? | ✔ | ✔ | ✔ | – |
| 4 | Live camera quality: rear camera chosen (`facingMode: environment`), 1080p, the model "placed" over the feed, orientation change | ✔ | ✔ | ✔ | ✔ |
| 5 | "Real size (AR)": Quick Look opens the USDZ at real size (`allowsContentScaling=0`). Validate all 5 USDZ files | ✔ | – | – | ✔ (expect "needs a phone"; should say "open in Safari") |
| 6 | "Real size (AR)": Scene Viewer intent (Google app / ARCore present and absent → fallback `#model-viewer-no-ar-fallback` → "AR didn't start" alert) | – | ✔ | ✔ (intent handling) | ✔ (intent may be blocked) |
| 7 | After returning from Quick Look / Scene Viewer, does the live camera resume? (AR-17) | ✔ | ✔ | ✔ | – |
| 8 | bfcache: AR screen → another page → Back. Camera restarts? Restored from bfcache? | ✔ | ✔ | ✔ | – |
| 9 | Snap scrolling by touch, section by section; momentum flings across the AR section (`scroll-snap-stop: always`) | ✔ | ✔ | ✔ (< 20: no `:has()` → no snapping, AR-12) | ✔ |
| 10 | Desktop real mouse wheel and trackpad (AR-07, AR-08) | Mac Safari / Chrome desktop | Windows Chrome / Edge | – | – |
| 11 | Reel: muted inline autoplay, loop, sound toggle, HLS vs mp4 choice, battery/memory, background-tab behaviour, Low Power Mode / Data Saver | ✔ (Low Power Mode blocks autoplay) | ✔ (Data Saver) | ✔ | ✔ |
| 12 | 4 MB GLB download time on 3G/4G; model-viewer init time on a mid-range phone (AR-16) | ✔ | ✔ (low-end Android) | ✔ | ✔ |
| 13 | F-09 (`100vh`/`svh` fallback) on the AR section and AR screen panel bottom | iOS < 15.4 | Chrome < 108 | < 21 | older WebViews |
| 14 | VoiceOver / TalkBack on the AR screen (AR-14) and reel (AR-11) | ✔ | ✔ | – | – |
| 15 | Live preview (`preview_theme_id=191458214186`): real `video_tag` markup and real CDN model URLs (check CORS on cdn.shopify.com GLBs for model-viewer) | ✔ | ✔ | ✔ | ✔ |
