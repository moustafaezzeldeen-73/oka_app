// PDP AR section: scroll onto it / away under every getUserMedia outcome; record status chip, streams, live tracks, model-viewer.
import { open, MODEL_PRODUCTS, camState, arInfo, out, sleep } from './lib.mjs';
const modes = [
  ['granted', 'real'], ['denied', 'real'], ['none', 'real'],
  ['granted', 'NotReadableError'], ['granted', 'OverconstrainedError'], ['granted', 'AbortError'], ['granted', 'undefined'], ['granted', 'pending'],
];
const only = process.argv[2];
const scrollToAr = (page) => page.evaluate(() => { const sc = document.querySelector('.screen[data-screen="product"]'); const a = document.querySelector('[data-ar-view]'); sc.scrollTo({ top: a.offsetTop - 12 - (parseFloat(getComputedStyle(sc).scrollPaddingTop) || 0), behavior: 'instant' }); return sc.scrollTop; });
const scrollTop = (page, y) => page.evaluate((y) => { document.querySelector('.screen[data-screen="product"]').scrollTo({ top: y, behavior: 'instant' }); }, y);
for (const h of (only ? [only] : MODEL_PRODUCTS)) {
  for (const [cameraPermission, gum] of (only ? modes : (h === 'oka-cloud-white-hookah' ? modes : [modes[0]]))) {
    const s = await open({ cameraPermission, gum });
    await s.goto(`/products/${h}`);
    const before = await camState(s.page);
    const y = await scrollToAr(s.page);
    await sleep(3500);
    const on = await camState(s.page); const arOn = await arInfo(s.page);
    await s.shot(`pdp-ar-${h}-${cameraPermission}-${gum}`);
    await scrollTop(s.page, 0); await sleep(800);
    const off = await camState(s.page); const arOff = await arInfo(s.page);
    out(`${h} perm=${cameraPermission} gum=${gum} scrollY=${y}`, { before, on, off, statusOn: arOn.status, stateOn: arOn.state, cls: arOn.cls, loading: arOn.loading, camHidden: arOn.camHidden, mvLoaded: arOn.mvLoaded, canAR: arOn.canActivateAR, statusOff: arOff.status, errs: s.logs.pageErrors.map((e) => e.message) });
    if (h === 'oka-cloud-white-hookah' && gum === 'real' && cameraPermission === 'granted') out('mv attrs', arOn.mv);
    await s.close();
  }
}
