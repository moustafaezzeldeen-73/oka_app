// Is slow mouse-wheel scrolling pulled back by scroll-snap? Same wheel input with snapping on vs off.
import { open, out, sleep } from './lib.mjs';
const st = (p) => p.evaluate(() => Math.round(document.querySelector('.screen[data-screen="product"]').scrollTop));
for (const snap of [true, false]) {
  for (const [delta, gap, n] of [[100, 400, 10], [100, 80, 10], [240, 400, 6], [400, 400, 6]]) {
    const s = await open({ device: 'Desktop 1440' });
    await s.goto('/products/oka-carbon-black-hookah');
    if (!snap) await s.page.addStyleTag({ content: '.screen[data-screen="product"]{scroll-snap-type:none!important}' });
    await s.page.mouse.move(700, 400);
    const pos = [];
    for (let i = 0; i < n; i++) { await s.page.mouse.wheel(0, delta); await sleep(gap); pos.push(await st(s.page)); }
    await sleep(800); pos.push(await st(s.page));
    out(`snap=${snap} wheel ${n}×${delta}px every ${gap}ms → scrollTop`, pos.join(' '));
    await s.close();
  }
}
