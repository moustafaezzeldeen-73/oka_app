#!/usr/bin/env node
/**
 * Everything in one terminal: `npm run dev`
 *
 * Starts the order service (server/, restarting on file changes) and Expo
 * (app/) together, and points the app at the server with an address your
 * phone can actually reach. Server logs are prefixed [server]; Expo keeps
 * its own interactive screen and QR code. Ctrl+C stops both.
 *
 * Options
 *   --lan               Expo on the local network instead of a tunnel
 *                       (faster; phone and computer on the same Wi-Fi)
 *   --server-tunnel     also give the server a public URL with cloudflared,
 *                       for a phone that is not on the same network
 *   --server-url=URL    use this server URL as is (e.g. a deployed server)
 *   --server-only       only the server
 *   --app-only          only Expo (uses --server-url or app/.env)
 *
 * The server URL is chosen in this order: --server-url, app/.env's
 * EXPO_PUBLIC_OKA_SERVICE_URL, a cloudflared tunnel (--server-tunnel), the
 * Codespaces forwarded URL, then this computer's local network address.
 */
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? null;

const c = { cyan: '\x1b[36m', yellow: '\x1b[33m', magenta: '\x1b[35m', dim: '\x1b[2m', reset: '\x1b[0m' };
const say = (msg) => console.log(`${c.cyan}›${c.reset} ${msg}`);
const warn = (msg) => console.log(`${c.yellow}!${c.reset} ${msg}`);

/* ── Preflight ─────────────────────────────────────────────────────────── */

const runServer = !flag('app-only');
const runApp = !flag('server-only');

for (const dir of [runServer && 'server', runApp && 'app'].filter(Boolean)) {
  if (!fs.existsSync(path.join(root, dir, 'node_modules'))) {
    warn(`${dir}/ has no dependencies installed. Run:  npm run setup`);
    process.exit(1);
  }
}
if (runServer && !fs.existsSync(path.join(root, 'server', '.env'))) {
  warn('server/.env is missing. Run:  npm run setup');
  process.exit(1);
}

const readEnv = (file) => {
  try {
    return Object.fromEntries(
      fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
        .filter(Boolean)
        .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
    );
  } catch {
    return {};
  }
};
const serverEnv = readEnv(path.join(root, 'server', '.env'));
const appEnv = readEnv(path.join(root, 'app', '.env'));
const port = Number(serverEnv.PORT || 8787);

/* ── Processes ─────────────────────────────────────────────────────────── */

const children = [];
let stopping = false;
function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (!child.killed) child.kill('SIGINT');
  setTimeout(() => process.exit(code), 500);
}
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

/** Prefixes every line a child prints, so interleaved logs stay readable. */
function pipeWithPrefix(stream, prefix) {
  let buf = '';
  stream.on('data', (chunk) => {
    buf += chunk.toString();
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) console.log(`${prefix} ${line}`);
  });
}

function startServer() {
  const child = spawn(process.execPath, ['--watch', '--env-file-if-exists=.env', 'index.js'], {
    cwd: path.join(root, 'server'),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  const prefix = `${c.magenta}[server]${c.reset}`;
  pipeWithPrefix(child.stdout, prefix);
  pipeWithPrefix(child.stderr, prefix);
  child.on('exit', (code) => {
    if (!stopping) {
      warn(`server exited (${code}).`);
      stopAll(code ?? 1);
    }
  });
  children.push(child);
}

async function waitForServer() {
  const url = `http://127.0.0.1:${port}/storefront-config`;
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/* ── Which server URL the phone should use ─────────────────────────────── */

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal) return a.address;
    }
  }
  return 'localhost';
}

function cloudflaredUrl() {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      reject(err);
      return;
    }
    children.push(child);
    const timer = setTimeout(() => reject(new Error('cloudflared gave no URL within 30s')), 30000);
    const look = (chunk) => {
      const m = chunk.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m) {
        clearTimeout(timer);
        resolve(m[0]);
      }
    };
    child.stdout.on('data', look);
    child.stderr.on('data', look);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function serverUrl() {
  if (option('server-url')) return { url: option('server-url'), how: '--server-url' };
  if (appEnv.EXPO_PUBLIC_OKA_SERVICE_URL) return { url: appEnv.EXPO_PUBLIC_OKA_SERVICE_URL, how: 'app/.env' };
  if (flag('server-tunnel')) {
    try {
      return { url: await cloudflaredUrl(), how: 'cloudflared tunnel' };
    } catch (err) {
      warn(`--server-tunnel needs cloudflared (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/): ${err.message}`);
      stopAll(1);
      return null;
    }
  }
  if (process.env.CODESPACES === 'true' && process.env.CODESPACE_NAME) {
    const domain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || 'app.github.dev';
    try {
      execSync(`gh codespace ports visibility ${port}:public -c ${process.env.CODESPACE_NAME}`, { stdio: 'ignore' });
    } catch {
      warn(`Couldn't make port ${port} public automatically — in the Ports tab, set it to Public.`);
    }
    return { url: `https://${process.env.CODESPACE_NAME}-${port}.${domain}`, how: 'Codespaces forwarded port' };
  }
  return { url: `http://${lanAddress()}:${port}`, how: 'local network — phone must be on the same Wi-Fi' };
}

/* ── Go ────────────────────────────────────────────────────────────────── */

if (runServer) startServer();

if (runServer) {
  const up = await waitForServer();
  if (up) say(`Server is up on port ${port}.`);
  else warn('Server did not answer yet — check the [server] lines above.');
}

if (runApp) {
  const target = await serverUrl();
  if (!target) process.exit(1);

  console.log('');
  say(`App will talk to the server at ${target.url}  ${c.dim}(${target.how})${c.reset}`);
  if (serverEnv.TEST_LOGIN_KEY) say(`Test sign-in key: ${serverEnv.TEST_LOGIN_KEY}  ${c.dim}(Account → Sign in → TESTING panel)${c.reset}`);
  if (serverEnv.OTP_PROVIDER === 'console') say(`Phone sign-in codes appear in the ${c.magenta}[server]${c.reset} lines.`);
  say(`Scan the QR code below with Expo Go (iOS camera, or the Expo Go app on Android).`);
  console.log('');

  const expo = spawn('npx', ['expo', 'start', flag('lan') ? '--lan' : '--tunnel'], {
    cwd: path.join(root, 'app'),
    stdio: 'inherit',
    env: { ...process.env, EXPO_PUBLIC_OKA_SERVICE_URL: target.url },
  });
  expo.on('exit', (code) => stopAll(code ?? 0));
  children.push(expo);
}
