// rng.js — a tiny seeded random number generator (mulberry32). The whole city
// is generated from one seed, so Port Azura is identical on every load and in
// every screenshot, and the headless simulation can replay exact scenarios.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A convenience wrapper with the helpers the city builder uses everywhere.
export class Rng {
  constructor(seed) {
    this.next = mulberry32(seed);
  }
  float() { return this.next(); }
  range(min, max) { return min + (max - min) * this.next(); }
  int(min, max) { return Math.floor(this.range(min, max + 1)); }
  pick(list) { return list[Math.floor(this.next() * list.length) % list.length]; }
  chance(p) { return this.next() < p; }
  // Deterministic Fisher-Yates shuffle of a copy of the list.
  shuffled(list) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
  }
}
