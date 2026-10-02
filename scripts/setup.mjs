#!/usr/bin/env node
/**
 * One-time setup: `npm run setup`
 *
 *  1. installs the app's and the server's dependencies
 *  2. creates app/.env and server/.env from their examples, if missing, with
 *     development values filled in: a session secret, a test-login key, a
 *     staff debug key, and one-time codes printed in the server log
 *
 * Safe to run again: existing .env files are never overwritten.
 */
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const say = (msg) => console.log(`\x1b[36m›\x1b[0m ${msg}`);
const warn = (msg) => console.log(`\x1b[33m!\x1b[0m ${msg}`);

const [major] = process.versions.node.split('.').map(Number);
if (major < 22) {
  console.error(`Node 22 or newer is required (you have ${process.versions.node}).`);
  process.exit(1);
}

for (const dir of ['app', 'server']) {
  const lock = fs.existsSync(path.join(root, dir, 'package-lock.json'));
  say(`Installing ${dir}/ dependencies…`);
  execSync(`npm ${lock ? 'ci' : 'install'} --no-audit --no-fund`, { cwd: path.join(root, dir), stdio: 'inherit' });
}

/** Copies `example` to `target` with `values` filled in, unless target exists. */
function createEnv(dir, values) {
  const target = path.join(root, dir, '.env');
  if (fs.existsSync(target)) {
    say(`${dir}/.env already exists — left as it is.`);
    return fs.readFileSync(target, 'utf8');
  }
  let text = fs.readFileSync(path.join(root, dir, '.env.example'), 'utf8');
  for (const [key, value] of Object.entries(values)) {
    const line = new RegExp(`^${key}=.*$`, 'm');
    text = line.test(text) ? text.replace(line, `${key}=${value}`) : `${text}\n${key}=${value}\n`;
  }
  fs.writeFileSync(target, text);
  say(`Created ${dir}/.env`);
  return text;
}

const serverEnv = createEnv('server', {
  NODE_ENV: 'development',
  SESSION_SECRET: crypto.randomBytes(32).toString('hex'),
  TEST_LOGIN_KEY: `test-${crypto.randomBytes(9).toString('base64url')}`,
  STAFF_DEBUG_KEY: crypto.randomBytes(16).toString('hex'),
  OTP_PROVIDER: 'console',
});
createEnv('app', { EXPO_PUBLIC_TEST_LOGIN: '1' });

const get = (key) => serverEnv.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim() ?? '';

console.log('');
if (!get('SHOPIFY_ADMIN_ACCESS_TOKEN')) {
  warn('server/.env has no SHOPIFY_ADMIN_ACCESS_TOKEN yet — add it to use the live store.');
}
if (!get('JT_API_ACCOUNT')) warn('server/.env has no J&T credentials — tracking will be empty until added.');
if (get('TEST_LOGIN_KEY')) say(`Test sign-in key (type it in the app's TESTING panel): ${get('TEST_LOGIN_KEY')}`);
say('Done. Start everything with:  npm run dev');
