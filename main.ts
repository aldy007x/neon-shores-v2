// main.ts — the Neon Shores entry program for make.fun's gta6-01 bounty.
//
// Audit first, then hand in: this program walks game/ and screenshots/
// itself and refuses the entry (exit 1, nothing written) when anything
// breaks the bounty contract — a symlink anywhere, too many files, an
// oversize tree, an over-long path, a fat index.html, the wrong number of
// screenshots or a screenshot over its cap. Only a clean tree is copied to
// the output directory, where dossier.json is written with the kit's
// buildDossier so the gate can rebuild it byte for byte.

import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { buildDossier } from './vendor/makefun-game.ts';

const ROOT = new URL('.', import.meta.url).pathname;
const OUT = process.env.MAKEFUN_OUTPUT_DIR || '/output';

const GAME_MAX_ENTRIES = 993;          // files + directories under game/
const GAME_MAX_BYTES = 48 * 1024 * 1024;
const GAME_PATH_MAX_BYTES = 1000;
const INDEX_MAX_BYTES = 1024 * 1024;
const SHOT_MIN = 3;
const SHOT_MAX = 4;
const SHOT_MAX_BYTES = 256 * 1024;
const DOSSIER_TEXT_MAX = 163840;       // the dossier's source-text cap

function fail(message: string): never {
  console.error(`main.ts: refusing the entry — ${message}`);
  process.exit(1);
}

// Walk a tree without following links; returns one record per entry.
function walk(dir: string, base: string, out: Array<{ path: string; bytes: number; dir: boolean }> = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = lstatSync(full);
    if (st.isSymbolicLink()) fail(`symlink in the entry tree: ${relative(base, full)}`);
    const rel = relative(base, full);
    if (Buffer.byteLength(rel.split(sep).join('/'), 'utf8') > GAME_PATH_MAX_BYTES) {
      fail(`path over ${GAME_PATH_MAX_BYTES} bytes: ${rel}`);
    }
    if (st.isDirectory()) {
      out.push({ path: rel, bytes: 0, dir: true });
      walk(full, base, out);
    } else if (st.isFile()) {
      out.push({ path: rel, bytes: st.size, dir: false });
    } else {
      fail(`not a plain file or directory: ${rel}`);
    }
  }
  return out;
}

function auditGame() {
  const gameDir = join(ROOT, 'game');
  if (!existsSync(join(gameDir, 'index.html'))) fail('game/index.html is missing');
  const entries = walk(gameDir, gameDir);
  if (entries.length > GAME_MAX_ENTRIES) fail(`game/ holds ${entries.length} entries, over ${GAME_MAX_ENTRIES}`);
  const total = entries.reduce((sum, e) => sum + e.bytes, 0);
  if (total > GAME_MAX_BYTES) fail(`game/ is ${total} bytes, over ${GAME_MAX_BYTES}`);
  const index = entries.find((e) => e.path === 'index.html');
  if (!index || index.dir) fail('game/index.html is not a regular file');
  if (index.bytes > INDEX_MAX_BYTES) fail(`game/index.html is ${index.bytes} bytes, over ${INDEX_MAX_BYTES}`);
  return entries.length;
}

function auditScreenshots() {
  const shotsDir = join(ROOT, 'screenshots');
  const entries = walk(shotsDir, shotsDir).filter((e) => !e.dir);
  const images = entries.filter((e) => /\.(png|jpe?g)$/i.test(e.path));
  if (images.length < SHOT_MIN || images.length > SHOT_MAX) {
    fail(`screenshots/ holds ${images.length} images, need ${SHOT_MIN} to ${SHOT_MAX}`);
  }
  for (const img of images) {
    if (img.bytes > SHOT_MAX_BYTES) fail(`screenshot ${img.path} is ${img.bytes} bytes, over ${SHOT_MAX_BYTES}`);
  }
  return images.length;
}

function main() {
  const gameEntries = auditGame();
  const shotCount = auditScreenshots();
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  cpSync(join(ROOT, 'game'), join(OUT, 'game'), { recursive: true });
  cpSync(join(ROOT, 'screenshots'), join(OUT, 'screenshots'), { recursive: true });
  const dossier = buildDossier(OUT, {
    text_max_bytes: DOSSIER_TEXT_MAX,
    screenshots: { max: SHOT_MAX, max_bytes: SHOT_MAX_BYTES },
  });
  writeFileSync(join(OUT, 'dossier.json'), dossier);
  console.log(`main.ts: audited ${gameEntries} game entries and ${shotCount} screenshots; dossier ${dossier.length} bytes -> ${OUT}`);
}

main();
