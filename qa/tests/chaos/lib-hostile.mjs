// Shared helpers for the chaos suite. Payload strings are assembled at runtime from
// character codes so no literal attack markup is stored in the repo. Each payload, when
// it executes in a page, calls window.__xss(id) — the canary the test scripts install.
import fs from 'node:fs';
import path from 'node:path';

const LT = String.fromCharCode(60), GT = String.fromCharCode(62);
// <img src=x onerror=__xss('ID')>
export const imgCanary = (id) => `${LT}img src=x onerror=${'__x'+'ss'}(${JSON.stringify(id)})${GT}`;
// attribute break-out: "><svg onload=__xss('ID')>
export const attrBreak = (id) => `${JSON.stringify('').slice(1,1)}"${GT}${LT}svg onload=${'__x'+'ss'}(${JSON.stringify(id)})${GT}`;
// </script> break-out for JSON-in-script-tag
export const scriptClose = (id) => `${LT}/script${GT}${LT}script${GT}${'__x'+'ss'}(${JSON.stringify(id)})${LT}/script${GT}`;
export const RLO = '‮';          // right-to-left override
export const ZW = '​‌‍﻿'; // zero-width set
export const EMOJI = '🧪💨🔥👋🏽';
export const big = (n = 10000, ch = 'ش') => ch.repeat(n);

// Build an isolated harness tree at <dir> whose fixtures are mutated by mutate(fixtures).
// Theme is taken read-only from the real theme via QA_THEME_DIR at launch.
export function buildMirror(dir, srcQa, mutate) {
  const m = path.join(dir, 'qa');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(m, 'harness/lib'), { recursive: true });
  for (const f of ['server.mjs', 'package.json', 'pw.mjs']) fs.copyFileSync(path.join(srcQa, 'harness', f), path.join(m, 'harness', f));
  for (const f of fs.readdirSync(path.join(srcQa, 'harness/lib'))) fs.copyFileSync(path.join(srcQa, 'harness/lib', f), path.join(m, 'harness/lib', f));
  fs.symlinkSync(path.join(srcQa, 'harness/node_modules'), path.join(m, 'harness/node_modules'));
  fs.cpSync(path.join(srcQa, 'fixtures'), path.join(m, 'fixtures'), { recursive: true });
  fs.copyFileSync(path.join(srcQa, 'settings_data.live.json'), path.join(m, 'settings_data.live.json'));
  // apply mutation to a named fixture file
  if (mutate) mutate((name) => {
    const p = path.join(m, 'fixtures', name);
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    return { data, save: () => fs.writeFileSync(p, JSON.stringify(data)) };
  });
  return { mirrorDir: dir, qaDir: m };
}

// A page init-script source that installs the __xss canary + alert hook and records hits.
export const canaryInit = `
  window.__xssHits = [];
  window.__xss = function(id){ try{ window.__xssHits.push(String(id)); }catch(e){} return true; };
  var _alert = window.alert; window.alert = function(m){ try{ window.__xssHits.push('alert:'+m); }catch(e){} };
`;
