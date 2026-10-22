/**
 * Per-render warning collector. Rendering is synchronous (liquidjs renderSync),
 * so one module-level "current page" is safe even with concurrent requests.
 *
 * Every warning has a `kind` and a `class`:
 *   class 'harness-gap'   — real Shopify supports this; our emulation doesn't (fix the harness)
 *   class 'theme-suspect' — real Shopify would also not have this (likely a theme bug)
 *   class 'uncertain'     — we are not sure Shopify supports it; verify on a live preview
 *   class 'info'          — expected/benign, kept for completeness, NOT counted
 */
let current = null;
const fileStack = [];

export function beginPage(meta) {
  current = { meta, warnings: [], seen: new Set() };
  fileStack.length = 0;
  return current;
}
export function endPage() {
  const c = current;
  current = null;
  return c;
}
export function pushFile(f) { fileStack.push(f); }
export function popFile() { fileStack.pop(); }
export function currentFile() { return fileStack[fileStack.length - 1] || null; }

export function warn(kind, detail, cls = 'harness-gap') {
  const file = currentFile();
  const key = `${kind}|${detail}|${file}`;
  if (!current) {
    // Outside a page render (e.g. AJAX JSON): print loudly.
    console.warn(`[harness:${cls}] ${kind}: ${detail}${file ? ` (${file})` : ''}`);
    return;
  }
  if (current.seen.has(key)) {
    const w = current.warnings.find((x) => x.key === key);
    if (w) w.count++;
    return;
  }
  current.seen.add(key);
  current.warnings.push({ key, kind, class: cls, detail, file, count: 1 });
  if (cls !== 'info' && process.env.QA_WARN_STDERR) console.warn(`[harness:${cls}] ${kind}: ${detail}${file ? ` (${file})` : ''}`);
}
