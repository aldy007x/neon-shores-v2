// capture.mjs — takes the entry's screenshots with headless Chrome.
// Serves the game with serve.ts, opens each staged scene from shots.json,
// waits until the page reports its frozen frame is ready, and saves a
// quality-84 JPEG per scene into screenshots/. Node stdlib only: the
// DevTools protocol is driven over the built-in WebSocket.

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || '/home/hatch/workspace/makefun-best-game/chrome-linux64/chrome';
const PORT = 8080;
const DEBUG_PORT = 9223;
const shots = JSON.parse(readFileSync(join(ROOT, 'shots.json'), 'utf8'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeoutMs, label) {
  const start = Date.now();
  for (;;) {
    try { const v = await fn(); if (v) return v; } catch { /* not yet */ }
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${label}`);
    await sleep(250);
  }
}

// A minimal CDP client: request/response by id over one WebSocket.
function cdpClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  ws.addEventListener('message', (msg) => {
    const data = JSON.parse(msg.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(JSON.stringify(data.error)));
      else resolve(data.result);
    }
  });
  return {
    ready,
    send(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    close() { try { ws.close(); } catch { /* already gone */ } },
  };
}

async function main() {
  const server = spawn('node', ['serve.ts'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
  const profile = mkdtempSync(join(tmpdir(), 'neon-shores-chrome-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`,
    '--window-size=1280,800', 'about:blank',
  ], { stdio: 'pipe' });
  try {
    await waitFor(async () => (await fetch(`http://127.0.0.1:${PORT}/index.html`)).ok, 10000, 'game server');
    await waitFor(async () => (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).ok, 10000, 'chrome debugger');
    for (const shot of shots) {
      const url = `http://127.0.0.1:${PORT}/${shot.query.replace('?shot=', 'index.html?shot=')}`;
      const target = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
      const cdp = cdpClient(target.webSocketDebuggerUrl);
      await cdp.ready;
      await cdp.send('Page.enable');
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
      await waitFor(async () => {
        const r = await cdp.send('Runtime.evaluate', { expression: 'document.title', returnByValue: true });
        return r.result && r.result.value === 'neon-shores-shot-ready';
      }, 20000, `shot ${shot.name} to stage`);
      await sleep(350); // let the frozen frame present
      const shotResult = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 84, fromSurface: true });
      const out = join(ROOT, 'screenshots', shot.name);
      writeFileSync(out, Buffer.from(shotResult.data, 'base64'));
      console.log(`captured ${shot.name}: ${Math.round(Buffer.from(shotResult.data, 'base64').length / 1024)} KiB`);
      await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/close/${target.id}`);
      cdp.close();
    }
  } finally {
    chrome.kill('SIGKILL');
    server.kill('SIGKILL');
  }
}

main().then(() => process.exit(0), (err) => { console.error(err); process.exit(1); });
