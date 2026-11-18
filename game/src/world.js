// world.js — the living state of Port Azura and the step that advances it:
// player movement and driving, car theft, crime pricing, the wanted system,
// police response, busts and hospital trips, the mission campaign, the
// rampage cones and fare-tip stands, and the day-night clock. Everything is
// deterministic from the seed and runs headless — render.js only draws it.

import {
  START_CASH, HEAT_MAX, HEAT_THEFT, HEAT_ASSAULT, HEAT_HIT_AND_RUN,
  HEAT_RAM_POLICE, HEAT_RAM_CIVILIAN, SIGHT_RANGE, WITNESS_RANGE,
  HEAT_DECAY_DELAY, HEAT_DECAY_RATE, POLICE_PER_STAR, BUST_RANGE,
  BUST_FILL_SECONDS, BUST_FINE_BASE, BUST_FINE_PER_STAR, WASTED_FEE,
  DAY_LENGTH, TRAFFIC_COUNT, PED_COUNT, PARKED_COUNT, SAVE_KEY,
} from './config.js';
import { Rng } from './rng.js';
import { buildCity, landmark, resolveCircle, surfaceAt, nearestNode } from './city.js';
import { makeCar, makePed, driveCar, trafficStep, policeStep, pedStep, separateCars, carSpeed } from './entities.js';
import { startCampaign, startMission, missionStep } from './missions.js';

export function createWorld(seed = 1) {
  const rng = new Rng(seed);
  const city = buildCity(seed);
  const start = landmark(city, 'Palm Court');
  const world = {
    seed, rng, city,
    time: 0, dayTime: 0.32, // start mid-morning
    player: { x: start.x, y: start.y + 30, angle: -Math.PI / 2, health: 100, lastHurt: -99 },
    playerCar: null,
    cars: [], peds: [],
    cash: START_CASH, earned: 0,
    heat: 0, heatFloor: 0, lastKnown: { x: start.x, y: start.y },
    unseenTimer: 0, bustMeter: 0,
    mission: null, missionIndex: 0, missionsDone: 0, missionLine: '',
    objective: null, missionTimer: null, cityCleared: false,
    events: [], toasts: [], threat: null,
    rampage: null, tipStands: [],
    paused: false,
  };
  world.toast = (text) => toast(world, text);
  spawnTraffic(world);
  spawnParked(world);
  spawnPeds(world);
  setupRampage(world);
  setupTipStands(world);
  startCampaign(world);
  return world;
}

function spawnTraffic(world) {
  const classes = ['compact', 'sedan', 'sedan', 'sports'];
  for (let i = 0; i < TRAFFIC_COUNT; i++) {
    const node = nearestNode(world.rng.range(200, 3000), world.rng.range(200, 3400));
    const car = makeCar(world.rng, node.x + world.rng.range(-70, 70), node.y + world.rng.range(-70, 70), world.rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]), world.rng.pick(classes), 'traffic');
    world.cars.push(car);
  }
}

function spawnParked(world) {
  const classes = ['compact', 'sedan', 'sports', 'sedan'];
  let placed = 0;
  for (const cp of world.city.carParks) {
    for (const slot of cp.slots) {
      if (placed >= PARKED_COUNT) break;
      if (world.rng.chance(0.3)) continue;
      const car = makeCar(world.rng, slot.x, slot.y, slot.angle, world.rng.pick(classes), 'parked');
      car.parked = true;
      world.cars.push(car);
      placed++;
    }
    if (placed >= PARKED_COUNT) break;
  }
  while (placed < PARKED_COUNT) { // top up along the boulevard
    const car = makeCar(world.rng, 2990, 300 + placed * 210, Math.PI / 2, world.rng.pick(classes), 'parked');
    car.parked = true;
    world.cars.push(car);
    placed++;
  }
}

function spawnPeds(world) {
  for (let i = 0; i < PED_COUNT; i++) {
    const ped = makePed(world.rng, world.rng.range(200, 3000), world.rng.range(200, 3400));
    const res = resolveCircle(world.city, ped.x, ped.y, 9);
    ped.x = res.x; ped.y = res.y;
    world.peds.push(ped);
  }
}

function setupRampage(world) {
  const cp = world.city.carParks[0];
  const cones = [];
  for (let i = 0; i < 8; i++) {
    cones.push({ x: cp.x + 40 + (i % 4) * 62, y: cp.y + 60 + Math.floor(i / 4) * 120, hit: false });
  }
  world.rampage = { x: cp.x + cp.w / 2, y: cp.y + cp.h / 2, cones, active: false, timer: 0, got: 0, respawn: 0 };
}

function setupTipStands(world) {
  const names = ['Tower One', 'Marina Mall', 'The Coral Casino', 'Fish Market', 'Sunset Garage', 'Azura Grand Hotel', 'St. Marina Hospital', 'Harbour Warehouse'];
  world.tipStands = names.map((n) => {
    const lm = landmark(world.city, n);
    return { x: lm.x + 26, y: lm.y, ready: true, timer: 0 };
  });
}

export function starsOf(world) {
  if (world.heat <= 0) return 0;
  return Math.min(5, Math.ceil(world.heat / 100));
}

export function addHeat(world, points) {
  world.heat = Math.min(HEAT_MAX, world.heat + points);
  world.unseenTimer = 0; // a fresh crime is fresh news: the decay clock restarts
}

export function toast(world, text) {
  world.toasts.push({ text, ttl: 3.4 });
  if (world.toasts.length > 3) world.toasts.shift();
}

// --- Crime pricing -----------------------------------------------------------
function witnessed(world, x, y) {
  for (const ped of world.peds) {
    if (ped.state !== 'down' && Math.hypot(ped.x - x, ped.y - y) < WITNESS_RANGE) return true;
  }
  for (const car of world.cars) {
    if (car.kind === 'police' && Math.hypot(car.x - x, car.y - y) < WITNESS_RANGE + 120) return true;
  }
  return false;
}

function priceEvents(world) {
  const p = world.player;
  for (const ev of world.events) {
    if (ev.type === 'carcrash' && world.playerCar) {
      const other = ev.a === world.playerCar ? ev.b : ev.b === world.playerCar ? ev.a : null;
      if (!other) continue;
      // Only the player's own closing speed prices a ram: if the other car
      // drove into Jax (an officer slamming him included), it is never his
      // crime. closing > 0 means the player's car was bearing down on them.
      const dx = other.x - world.playerCar.x, dy = other.y - world.playerCar.y;
      const d = Math.hypot(dx, dy) || 1;
      const closing = ((world.playerCar.vx - other.vx) * dx + (world.playerCar.vy - other.vy) * dy) / d;
      if (closing > 90 && other.ramCooldown <= 0) {
        addHeat(world, other.kind === 'police' ? HEAT_RAM_POLICE : HEAT_RAM_CIVILIAN);
        other.ramCooldown = 1;
      }
      if (ev.impact > 260) hurt(world, (ev.impact - 260) / 9);
    }
    if (ev.type === 'crash' && ev.car === world.playerCar && ev.impact > 300) {
      hurt(world, (ev.impact - 300) / 8);
    }
  }
}

function hurt(world, dmg) {
  world.player.health = Math.max(0, world.player.health - dmg);
  world.player.lastHurt = world.time;
}

// --- Player ------------------------------------------------------------------
function stepPlayerOnFoot(world, input, dt) {
  const p = world.player;
  let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const len = Math.hypot(mx, my);
  if (len > 0) {
    mx /= len; my /= len;
    const speed = input.sprint ? 268 : 172;
    p.angle = Math.atan2(my, mx);
    const nx = p.x + mx * speed * dt, ny = p.y + my * speed * dt;
    if (surfaceAt(world.city, nx, ny) !== 'water') {
      const res = resolveCircle(world.city, nx, ny, 11);
      p.x = res.x; p.y = res.y;
    }
  }
  if (input.punchPressed) {
    world.threat = { x: p.x, y: p.y, r: 105 };
    world.events.push({ type: 'punch', x: p.x, y: p.y });
    const fx = Math.cos(p.angle), fy = Math.sin(p.angle);
    for (const ped of world.peds) {
      const dx = ped.x - p.x, dy = ped.y - p.y;
      if (Math.hypot(dx, dy) < 38 && dx * fx + dy * fy > 0 && ped.state !== 'down' && ped.state !== 'riding') {
        ped.state = 'down'; ped.downTimer = 1.4;
        if (witnessed(world, p.x, p.y)) addHeat(world, HEAT_ASSAULT);
        world.events.push({ type: 'assault', ped });
      }
    }
  }
  if (input.enterPressed) tryEnterCar(world);
}

function tryEnterCar(world) {
  const p = world.player;
  let best = null, bd = 46;
  for (const car of world.cars) {
    if (car.kind === 'police') continue; // interceptors are locked
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d < bd) { bd = d; best = car; }
  }
  if (!best) return;
  world.playerCar = best;
  if (!best.stolen) {
    best.stolen = true;
    if (best.parked || best.kind === 'traffic') {
      addHeat(world, HEAT_THEFT); // alarms and owners talk: theft always prices
      world.events.push({ type: 'theft', car: best });
      world.threat = { x: best.x, y: best.y, r: 130 };
    }
  }
  best.kind = 'player';
  world.events.push({ type: 'door', car: best });
}

function exitCar(world) {
  const car = world.playerCar;
  if (!car) return;
  car.kind = car.stolen ? 'traffic' : car.kind;
  car.target = null;
  world.player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 26;
  world.player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 26;
  const res = resolveCircle(world.city, world.player.x, world.player.y, 11);
  world.player.x = res.x; world.player.y = res.y;
  world.playerCar = null;
  world.events.push({ type: 'door', car });
}

function stepPlayerDriving(world, input, dt) {
  const car = world.playerCar;
  driveCar(world, car, {
    throttle: (input.up ? 1 : 0) - (input.down ? 1 : 0),
    steer: (input.right ? 1 : 0) - (input.left ? 1 : 0),
    brake: false, // S / down-arrow already brakes then reverses via throttle
    handbrake: !!input.handbrake,
  }, dt);
  world.player.x = car.x; world.player.y = car.y;
  world.player.angle = car.angle;
  if (carSpeed(car) > 235) world.threat = { x: car.x, y: car.y, r: 78 };
  if (input.enterPressed && carSpeed(car) < 26) exitCar(world);
}

// --- Police response -----------------------------------------------------------
function managePolice(world, dt) {
  const want = POLICE_PER_STAR[starsOf(world)];
  const cops = world.cars.filter((c) => c.kind === 'police');
  if (cops.length < want) {
    const node = nearestNode(world.player.x + world.rng.range(-900, 900), world.player.y + world.rng.range(-900, 900));
    if (Math.hypot(node.x - world.player.x, node.y - world.player.y) > 480) {
      const cop = makeCar(world.rng, node.x, node.y, 0, 'police', 'police');
      world.cars.push(cop);
    }
  } else if (cops.length > want) {
    let far = null, fd = -1;
    for (const c of cops) {
      const d = Math.hypot(c.x - world.player.x, c.y - world.player.y);
      if (d > fd) { fd = d; far = c; }
    }
    if (far && fd > 700) world.cars.splice(world.cars.indexOf(far), 1);
  }
  // Sight: any officer close enough refreshes the last known position.
  let seen = false;
  for (const c of world.cars) {
    if (c.kind !== 'police') continue;
    if (Math.hypot(c.x - world.player.x, c.y - world.player.y) < SIGHT_RANGE) seen = true;
  }
  if (seen) { world.lastKnown.x = world.player.x; world.lastKnown.y = world.player.y; world.unseenTimer = 0; }
  else world.unseenTimer += dt;
  for (const c of world.cars) if (c.kind === 'police') policeStep(world, c, dt);
}

function stepHeat(world, dt) {
  if (world.unseenTimer > HEAT_DECAY_DELAY && world.heat > world.heatFloor) {
    world.heat = Math.max(world.heatFloor, world.heat - HEAT_DECAY_RATE * dt);
  }
  if (world.heat < world.heatFloor) world.heat = world.heatFloor;
}

function stepBust(world, dt) {
  const p = world.player;
  const pSpeed = world.playerCar ? carSpeed(world.playerCar) : 0;
  // An officer must be close AND more or less stopped beside Jax to make
  // the arrest — a high-speed scrum of ramming cars pins nobody.
  let closeCop = false;
  for (const c of world.cars) {
    if (c.kind === 'police' && Math.hypot(c.x - p.x, c.y - p.y) < BUST_RANGE && carSpeed(c) < 60) closeCop = true;
  }
  if (closeCop && pSpeed < 40 && starsOf(world) > 0) {
    world.bustMeter = Math.min(1, world.bustMeter + dt / BUST_FILL_SECONDS);
  } else {
    world.bustMeter = Math.max(0, world.bustMeter - dt * 0.6);
  }
  if (world.bustMeter >= 1) {
    const fine = Math.min(world.cash, BUST_FINE_BASE + BUST_FINE_PER_STAR * starsOf(world));
    world.cash -= fine;
    world.bustMeter = 0;
    world.heat = 0; // mission heat floors (Harbour Run, Finale) re-apply in stepHeat
    world.playerCar = null;
    const hq = landmark(world.city, 'Port Azura Police HQ');
    p.x = hq.x; p.y = hq.y; p.health = Math.max(p.health, 55);
    world.events.push({ type: 'busted', fine });
    toast(world, `BUSTED — $${fine} fine. Released at Police HQ`);
    // A bust must not "complete" Cool Down: the job restarts its heat.
    if (world.mission && world.mission.index === 2) world.heat = 3 * 100;
  }
}

function stepWasted(world) {
  const p = world.player;
  if (p.health > 0) return;
  const fee = Math.min(world.cash, WASTED_FEE);
  world.cash -= fee;
  world.playerCar = null;
  world.heat = 0;
  const hosp = landmark(world.city, 'St. Marina Hospital');
  p.x = hosp.x; p.y = hosp.y; p.health = 100;
  world.events.push({ type: 'wasted', fee });
  toast(world, `WASTED — $${fee} hospital bill`);
}

// --- Side activities -----------------------------------------------------------
function stepRampage(world, dt) {
  const r = world.rampage;
  if (r.respawn > 0) {
    r.respawn -= dt;
    if (r.respawn <= 0) for (const c of r.cones) c.hit = false;
    return;
  }
  const inZone = world.playerCar && Math.hypot(world.player.x - r.x, world.player.y - r.y) < 170;
  if (!r.active && inZone) {
    r.active = true; r.timer = 40; r.got = 0;
    toast(world, 'RAMPAGE — flatten all 8 cones in 40s!');
  }
  if (!r.active) return;
  r.timer -= dt;
  if (world.playerCar) {
    for (const cone of r.cones) {
      if (!cone.hit && Math.hypot(world.player.x - cone.x, world.player.y - cone.y) < 24) {
        cone.hit = true; r.got += 1;
        world.cash += 15;
        world.events.push({ type: 'cone', x: cone.x, y: cone.y });
        toast(world, `Cone down ${r.got}/8 — +$15`);
      }
    }
  }
  if (r.got >= 8) {
    world.cash += 80;
    toast(world, 'RAMPAGE CLEAR — +$80 bonus');
    r.active = false; r.respawn = 20;
  } else if (r.timer <= 0) {
    toast(world, 'Rampage over — cones reset soon');
    r.active = false; r.respawn = 20;
  }
}

function stepTipStands(world, dt) {
  for (const s of world.tipStands) {
    if (!s.ready) {
      s.timer -= dt;
      if (s.timer <= 0) s.ready = true;
      continue;
    }
    if (Math.hypot(world.player.x - s.x, world.player.y - s.y) < 26) {
      s.ready = false; s.timer = 60;
      world.cash += 25;
      world.events.push({ type: 'tip', x: s.x, y: s.y });
      toast(world, 'A grateful fare left a tip — +$25');
    }
  }
}

// Pedestrians versus cars: anyone clipped by a moving car goes down, and if
// the player was driving it is priced as a hit-and-run.
function stepPedHits(world) {
  for (const ped of world.peds) {
    if (ped.state === 'down' || ped.state === 'riding' || ped.state === 'board') continue;
    for (const car of world.cars) {
      if (Math.hypot(car.x - ped.x, car.y - ped.y) < car.length * 0.5 && carSpeed(car) > 55) {
        ped.state = 'down'; ped.downTimer = 4;
        world.events.push({ type: 'pedhit', ped, car });
        if (car === world.playerCar) {
          addHeat(world, HEAT_HIT_AND_RUN);
          world.threat = { x: ped.x, y: ped.y, r: 150 };
        }
        break;
      }
    }
  }
}

// --- The master step -------------------------------------------------------------
export function stepWorld(world, input, dt) {
  if (world.paused) return;
  world.time += dt;
  world.dayTime = (world.dayTime + dt / DAY_LENGTH) % 1;
  world.events.length = 0;
  world.threat = null;

  if (world.playerCar) stepPlayerDriving(world, input, dt);
  else stepPlayerOnFoot(world, input, dt);

  for (const car of world.cars) {
    if (car.kind === 'traffic') trafficStep(world, car, dt);
  }
  separateCars(world, dt);
  managePolice(world, dt);
  for (const ped of world.peds) pedStep(world, ped, dt);
  stepPedHits(world);
  priceEvents(world);
  stepHeat(world, dt);
  stepBust(world, dt);
  if (world.player.health > 0 && world.time - world.player.lastHurt > 6) {
    world.player.health = Math.min(100, world.player.health + 2.5 * dt);
  }
  stepWasted(world);
  missionStep(world, dt);
  stepRampage(world, dt);
  stepTipStands(world, dt);
  for (const t of world.toasts) t.ttl -= dt;
  world.toasts = world.toasts.filter((t) => t.ttl > 0);
}

// --- Save / load -------------------------------------------------------------------
export function saveGame(world) {
  try {
    const data = { cash: world.cash, earned: world.earned, missionIndex: world.missionIndex, missionsDone: world.missionsDone, cityCleared: world.cityCleared };
    globalThis.localStorage && localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch { return false; }
}

export function loadGame(world) {
  try {
    const raw = globalThis.localStorage && localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    world.cash = data.cash; world.earned = data.earned;
    world.missionsDone = data.missionsDone || 0;
    world.cityCleared = !!data.cityCleared;
    if (world.cityCleared) { world.mission = null; world.missionLine = 'Port Azura is yours'; world.objective = null; }
    else startMission(world, data.missionIndex || 0); // the saved job restarts fresh
    return true;
  } catch { return false; }
}

export function resetSave() {
  try { globalThis.localStorage && localStorage.removeItem(SAVE_KEY); } catch { /* no storage */ }
}
