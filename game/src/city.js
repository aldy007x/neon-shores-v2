// city.js — generates Port Azura from a seed: the road grid, city blocks,
// buildings with lit windows, parks, car parks, the beach, the sea and the
// Neon Pier, plus the named landmarks the story missions travel between.
// Pure data: no DOM, no canvas, so the simulation harness uses it headless.

import {
  WORLD_SIZE, ROAD_WIDTH, ROAD_PITCH, ROAD_ORIGIN, ROAD_COLS, ROAD_ROWS,
  BEACH_X, SEA_X, PIER_Y, PIER_START_X, PIER_END_X,
} from './config.js';
import { Rng } from './rng.js';

export function roadCentres(count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(ROAD_ORIGIN + i * ROAD_PITCH);
  return out;
}
export const AVENUES = roadCentres(ROAD_COLS); // vertical road centrelines (x)
export const STREETS = roadCentres(ROAD_ROWS); // horizontal road centrelines (y)

// The landmark plots: block coordinates (avenue index to the west, street
// index to the north) or special coastal spots. Every name is original.
const LANDMARK_PLOTS = [
  { name: 'Tower One',          kind: 'tower',   block: [2, 1] },
  { name: 'Azura Grand Hotel',  kind: 'hotel',   block: [4, 1] },
  { name: 'The Coral Casino',   kind: 'casino',  block: [1, 3] },
  { name: 'Marina Mall',        kind: 'mall',    block: [5, 3] },
  { name: 'Palm Court',         kind: 'plaza',   block: [3, 4] },
  { name: 'Sunset Garage',      kind: 'garage',  block: [0, 5] },
  { name: 'St. Marina Hospital', kind: 'hospital', block: [4, 6] },
  { name: 'Port Azura Police HQ', kind: 'hq',    block: [1, 6] },
  { name: 'Fish Market',        kind: 'market',  block: [5, 5] },
  { name: 'Harbour Warehouse',  kind: 'warehouse', block: [5, 7] },
];

const ROOF_PALETTE = ['#8d6e63', '#a1887f', '#90a4ae', '#b0bec5', '#ffcc80', '#f48fb1', '#80cbc4', '#a5d6a7', '#ce93d8', '#90caf9'];
const PARK_BLOCKS = new Set(['0,1', '3,2', '5,0', '2,7', '0,7', '4,4']);
const CARPARK_BLOCKS = new Set(['1,0', '3,6', '5,2', '0,3', '4,7']);

// buildCity(seed) -> everything the world and renderer need, laid out once.
export function buildCity(seed) {
  const rng = new Rng(seed);
  const buildings = [];   // {x,y,w,h,roof,windows:[{x,y,lit}],name?,kind}
  const parks = [];       // {x,y,w,h,trees:[{x,y,r}]}
  const carParks = [];    // {x,y,w,h,slots:[{x,y,angle}]}
  const landmarks = [];   // {name,kind,x,y} — x,y is the sign / doorstep point

  const landmarkByBlock = new Map();
  for (const lm of LANDMARK_PLOTS) landmarkByBlock.set(lm.block.join(','), lm);

  // Blocks sit between neighbouring roads; the last avenue borders the beach.
  for (let bi = 0; bi < ROAD_COLS; bi++) {
    for (let bj = 0; bj < ROAD_ROWS - 1; bj++) {
      const x0 = AVENUES[bi] + ROAD_WIDTH / 2 + 14;
      const y0 = STREETS[bj] + ROAD_WIDTH / 2 + 14;
      const bw = ROAD_PITCH - ROAD_WIDTH - 28;
      const bh = bw;
      const key = bi + ',' + bj;
      const lm = landmarkByBlock.get(key);
      if (lm) {
        const b = makeBuilding(rng, x0 + 18, y0 + 18, bw - 36, bh - 36, lm.kind);
        b.name = lm.name;
        buildings.push(b);
        landmarks.push({ name: lm.name, kind: lm.kind, x: x0 + bw / 2, y: y0 + bh + 26 });
        continue;
      }
      if (PARK_BLOCKS.has(key)) {
        const trees = [];
        const n = rng.int(7, 11);
        for (let t = 0; t < n; t++) trees.push({ x: x0 + rng.range(24, bw - 24), y: y0 + rng.range(24, bh - 24), r: rng.range(13, 22) });
        parks.push({ x: x0, y: y0, w: bw, h: bh, trees });
        continue;
      }
      if (CARPARK_BLOCKS.has(key)) {
        const slots = [];
        for (let s = 0; s < 6; s++) {
          slots.push({ x: x0 + 44 + (s % 3) * 96, y: y0 + 52 + Math.floor(s / 3) * 130, angle: Math.PI / 2 });
        }
        carParks.push({ x: x0, y: y0, w: bw, h: bh, slots });
        continue;
      }
      // Ordinary blocks: four buildings, or six slimmer ones on denser
      // downtown plots — either way with a small seeded jitter.
      if (rng.chance(0.38)) {
        for (let q = 0; q < 6; q++) {
          const qx = x0 + (q % 3) * (bw / 3);
          const qy = y0 + Math.floor(q / 3) * (bh / 2);
          buildings.push(makeBuilding(rng, qx + 12 + rng.range(-4, 4), qy + 16 + rng.range(-4, 4), bw / 3 - 24, bh / 2 - 32, 'block'));
        }
      } else {
        for (let q = 0; q < 4; q++) {
          const qx = x0 + (q % 2) * (bw / 2);
          const qy = y0 + Math.floor(q / 2) * (bh / 2);
          buildings.push(makeBuilding(rng, qx + 16 + rng.range(-6, 6), qy + 16 + rng.range(-6, 6), bw / 2 - 32, bh / 2 - 32, 'block'));
        }
      }
    }
  }

  // Coastal landmarks: the pier and its lighthouse stand over the water.
  landmarks.push({ name: 'Neon Pier', kind: 'pier', x: (PIER_START_X + PIER_END_X) / 2, y: PIER_Y - 58 });
  // The named point is the apron in front of the tower, not the tower itself:
  // a driver can touch it at speed without ramming the lighthouse.
  landmarks.push({ name: 'Lighthouse Point', kind: 'lighthouse', x: PIER_END_X - 84, y: PIER_Y });

  const pier = { x: PIER_START_X, y: PIER_Y - 38, w: PIER_END_X - PIER_START_X, h: 76 };
  const lighthouse = { x: PIER_END_X - 26, y: PIER_Y - 26, w: 52, h: 52 };

  return {
    size: WORLD_SIZE,
    buildings, parks, carParks, landmarks, pier, lighthouse,
    beach: { x: BEACH_X, y: 0, w: SEA_X - BEACH_X, h: WORLD_SIZE },
    sea: { x: SEA_X, y: 0, w: WORLD_SIZE - SEA_X, h: WORLD_SIZE },
  };
}

function makeBuilding(rng, x, y, w, h, kind) {
  const windows = [];
  const cols = Math.max(2, Math.floor(w / 26));
  const rows = Math.max(2, Math.floor(h / 26));
  for (let cx = 0; cx < cols; cx++) {
    for (let cy = 0; cy < rows; cy++) {
      windows.push({ x: x + 14 + cx * ((w - 24) / Math.max(1, cols - 1)), y: y + 14 + cy * ((h - 24) / Math.max(1, rows - 1)), lit: rng.chance(0.42) });
    }
  }
  return { x, y, w, h, kind, roof: rng.pick(ROOF_PALETTE), windows };
}

// Find a landmark by name (missions and staging address places by name).
export function landmark(city, name) {
  return city.landmarks.find((l) => l.name === name) || null;
}

// Is a point inside any solid building (or the lighthouse)? Used by movement
// collision and by the police building-dodge probe.
export function pointInBuilding(city, x, y, pad = 0) {
  for (const b of city.buildings) {
    if (x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad) return b;
  }
  const lh = city.lighthouse;
  if (x >= lh.x - pad && x <= lh.x + lh.w + pad && y >= lh.y - pad && y <= lh.y + lh.h + pad) return lh;
  return null;
}

// Push a circle (x, y, r) out of every building it overlaps. Returns the
// corrected position; movement code calls this after integrating.
export function resolveCircle(city, x, y, r) {
  for (const b of city.buildings) resolveRect(b, r);
  resolveRect(city.lighthouse, r);
  function resolveRect(b, rad) {
    const nx = Math.max(b.x, Math.min(x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(y, b.y + b.h));
    let dx = x - nx, dy = y - ny;
    let d2 = dx * dx + dy * dy;
    if (d2 >= rad * rad) return;
    if (d2 < 0.0001) {
      // Centre inside the rect: push out along the smallest penetration axis.
      const left = x - b.x, right = b.x + b.w - x, top = y - b.y, bot = b.y + b.h - y;
      const m = Math.min(left, right, top, bot);
      if (m === left) x = b.x - rad; else if (m === right) x = b.x + b.w + rad;
      else if (m === top) y = b.y - rad; else y = b.y + b.h + rad;
      return;
    }
    const d = Math.sqrt(d2);
    x = nx + (dx / d) * rad;
    y = ny + (dy / d) * rad;
  }
  return { x, y };
}

// The drivable surface test: roads, car parks, the pier and the beach are
// drivable; deep water and park grass slow a car right down (handled by the
// caller's surface factor). Off-road is allowed — this is an open world.
export function surfaceAt(city, x, y) {
  if (x >= city.sea.x) return 'water';
  const p = city.pier;
  if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return 'pier';
  if (x >= city.beach.x) return 'sand';
  for (const cp of city.carParks) if (x >= cp.x && x <= cp.x + cp.w && y >= cp.y && y <= cp.y + cp.h) return 'asphalt';
  for (const pk of city.parks) if (x >= pk.x && x <= pk.x + pk.w && y >= pk.y && y <= pk.y + pk.h) return 'grass';
  return 'asphalt';
}

// Nearest road intersection to a point — police and traffic spawn on roads.
export function nearestNode(x, y) {
  let best = null, bd = Infinity;
  for (const ax of AVENUES) for (const sy of STREETS) {
    const d = (ax - x) * (ax - x) + (sy - y) * (sy - y);
    if (d < bd) { bd = d; best = { x: ax, y: sy }; }
  }
  return best;
}
