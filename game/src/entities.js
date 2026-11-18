// entities.js — the actors of Port Azura: civilian traffic, parked cars,
// police interceptors and pedestrians, plus the arcade car physics they all
// share. Actors are plain objects; the step functions advance them against
// the world state that world.js owns. No DOM here: the sim drives this too.

import { CAR_CLASSES, SIGHT_RANGE } from './config.js';
import { AVENUES, STREETS, pointInBuilding, resolveCircle, surfaceAt } from './city.js';

const LANE = 26; // right-hand traffic: lane offset from the road centreline
const CAR_COLORS = ['#e53935', '#1e88e5', '#fdd835', '#8e24aa', '#00acc1', '#fb8c00', '#d81b60', '#3949ab', '#7cb342', '#f5f5f5', '#546e7a', '#ff7043'];
const PED_COLORS = ['#ffccbc', '#ffe082', '#a5d6a7', '#90caf9', '#f48fb1', '#bcaaa4', '#fff59d', '#b39ddb'];

export function makeCar(rng, x, y, angle, cls, kind) {
  const spec = CAR_CLASSES[cls];
  return {
    x, y, angle, vx: 0, vy: 0, cls, kind,
    length: spec.length, width: spec.width,
    color: kind === 'police' ? '#263238' : rng.pick(CAR_COLORS),
    damage: 0, target: null, brakeLight: false, honk: 0,
    ramCooldown: 0, surfaceDrag: 1,
  };
}

export function makePed(rng, x, y) {
  return {
    x, y, angle: rng.range(0, Math.PI * 2), speed: 0,
    state: 'stroll', tx: x, ty: y, wait: rng.range(0, 2),
    downTimer: 0, fleeTimer: 0, threatX: 0, threatY: 0,
    color: rng.pick(PED_COLORS), isPassenger: false, boardCar: null,
  };
}

export function carSpeed(car) { return Math.hypot(car.vx, car.vy); }

// --- Shared arcade physics -------------------------------------------------
// control: {throttle -1..1, steer -1..1, handbrake bool}. Velocity is kept as
// a vector so a handbrake turn leaves the car sliding (drift) until grip
// pulls the slide back in line with the nose.
export function driveCar(world, car, control, dt) {
  const spec = CAR_CLASSES[car.cls];
  const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
  let fSpeed = car.vx * fx + car.vy * fy;
  let lx = car.vx - fx * fSpeed, ly = car.vy - fy * fSpeed;

  const surf = surfaceAt(world.city, car.x, car.y);
  const surfTop = surf === 'sand' || surf === 'grass' ? 0.55 : surf === 'water' ? 0.2 : 1;
  const top = (control.throttle >= 0 ? spec.topSpeed : spec.reverse) * surfTop;

  if (control.throttle > 0) fSpeed = Math.min(top, fSpeed + spec.accel * control.throttle * dt);
  else if (control.throttle < 0) fSpeed = Math.max(-top, fSpeed + spec.accel * 1.4 * control.throttle * dt);
  else fSpeed -= fSpeed * Math.min(1, 1.6 * dt); // engine braking / rolling drag

  if (control.brake) {
    const s = Math.sign(fSpeed);
    fSpeed -= s * Math.min(Math.abs(fSpeed), spec.brake * dt);
  }
  const grip = spec.grip * (control.handbrake ? 0.32 : 1);
  const keep = Math.exp(-grip * dt);
  lx *= keep; ly *= keep;
  if (control.handbrake) fSpeed -= fSpeed * Math.min(1, 0.55 * dt);

  const steerAuthority = Math.max(-1, Math.min(1, fSpeed / 90));
  car.angle += control.steer * spec.turn * steerAuthority * dt * (control.handbrake ? 1.35 : 1);

  const nfx = Math.cos(car.angle), nfy = Math.sin(car.angle);
  car.vx = nfx * fSpeed + lx;
  car.vy = nfy * fSpeed + ly;
  const before = carSpeed(car);
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  car.x = Math.max(14, Math.min(world.city.size - 14, car.x));
  car.y = Math.max(14, Math.min(world.city.size - 14, car.y));

  // Building collision: resolve the circle, and price the impact in damage
  // and sparks when the car arrived fast.
  const res = resolveCircle(world.city, car.x, car.y, car.length * 0.42);
  if (res.x !== car.x || res.y !== car.y) {
    car.x = res.x; car.y = res.y;
    if (before > 120) {
      const impact = before;
      car.damage = Math.min(100, car.damage + impact / 14);
      car.vx *= 0.25; car.vy *= 0.25;
      world.events.push({ type: 'crash', x: car.x, y: car.y, impact, car });
      world.events.push({ type: 'sparks', x: car.x, y: car.y, n: 8 });
    } else { car.vx *= 0.5; car.vy *= 0.5; }
  }
  if (car.damage > 55 && world.rng.float() < dt * 2) {
    world.events.push({ type: 'smoke', x: car.x, y: car.y });
  }
  car.brakeLight = !!control.brake || control.throttle < 0;
  return car;
}

// Pairwise separation: no two cars may overlap. Each pair is pushed apart
// along the line between them and the follower's speed is matched, which is
// what keeps traffic queues tidy instead of stacked.
export function separateCars(world, dt) {
  const cars = world.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const minD = (a.length + b.length) * 0.44;
      const d2 = dx * dx + dy * dy;
      if (d2 >= minD * minD || d2 < 0.01) continue;
      const d = Math.sqrt(d2), push = (minD - d) / 2;
      const ux = dx / d, uy = dy / d;
      a.x -= ux * push; a.y -= uy * push;
      b.x += ux * push; b.y += uy * push;
      // A rear-end shove counts as a crash event for whoever is the player.
      const rel = Math.abs((b.vx - a.vx) * ux + (b.vy - a.vy) * uy);
      if (rel > 110) {
        world.events.push({ type: 'carcrash', a, b, impact: rel });
        a.damage = Math.min(100, a.damage + rel / 22);
        b.damage = Math.min(100, b.damage + rel / 22);
      }
      const damp = 0.55;
      a.vx *= damp; a.vy *= damp; b.vx *= damp; b.vy *= damp;
    }
  }
}

// --- Traffic AI --------------------------------------------------------------
// A traffic car follows the road graph node to node, offset to its right
// lane, slowing for the car in front and turning at junctions.
export function trafficStep(world, car, dt) {
  if (!car.target) car.target = nextNode(world, car, null);
  const dirx = car.target.x - car.x, diry = car.target.y - car.y;
  const dist = Math.hypot(dirx, diry);
  if (dist < 46) { car.target = nextNode(world, car, car.target); }
  const ux = dirx / (dist || 1), uy = diry / (dist || 1);
  const aimX = car.target.x + (-uy) * LANE, aimY = car.target.y + ux * LANE;
  const steer = steerToward(car, aimX, aimY);
  let throttle = 0.75, brake = false;
  // Slow for a car ahead in the same lane.
  const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
  for (const other of world.cars) {
    if (other === car) continue;
    const ox = other.x - car.x, oy = other.y - car.y;
    const ahead = ox * fx + oy * fy, side = Math.abs(ox * -fy + oy * fx);
    if (ahead > 0 && ahead < 58 && side < 15) {
      if (carSpeed(car) > carSpeed(other) + 4) { throttle = 0; brake = true; }
      else throttle = Math.min(throttle, 0.3);
    }
  }
  if (Math.abs(steer) > 0.75) throttle = Math.min(throttle, 0.35);
  driveCar(world, car, { throttle, steer, brake, handbrake: false }, dt);
}

function nextNode(world, car, fromNode) {
  // Snap to the nearest intersection, then choose an onward one, preferring
  // to keep the current heading and never U-turning unless boxed in.
  let cx = AVENUES[0], cy = STREETS[0], bd = Infinity;
  for (const ax of AVENUES) for (const sy of STREETS) {
    const d = (ax - car.x) ** 2 + (sy - car.y) ** 2;
    if (d < bd) { bd = d; cx = ax; cy = sy; }
  }
  const options = [];
  for (const ax of AVENUES) if (Math.abs(ax - cx) === 400 || (ax === cx)) {
    for (const sy of STREETS) {
      if (ax === cx && sy === cy) continue;
      if (Math.abs(sy - cy) === 400 && ax !== cx) continue;
      if (Math.abs(ax - cx) > 400 || Math.abs(sy - cy) > 400) continue;
      if (Math.abs(ax - cx) === 400 && Math.abs(sy - cy) === 400) continue;
      options.push({ x: ax, y: sy });
    }
  }
  const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
  let best = null, bs = -Infinity;
  for (const o of options) {
    if (fromNode && o.x === fromNode.x && o.y === fromNode.y && options.length > 1) continue;
    const d = Math.hypot(o.x - cx, o.y - cy) || 1;
    const score = ((o.x - cx) / d) * fx + ((o.y - cy) / d) * fy + world.rng.float() * 0.35;
    if (score > bs) { bs = score; best = o; }
  }
  return best || { x: cx, y: cy };
}

export function steerToward(car, tx, ty) {
  const want = Math.atan2(ty - car.y, tx - car.x);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return Math.max(-1, Math.min(1, diff * 2.1));
}

// --- Police AI ---------------------------------------------------------------
// Interceptors drive at the player's last known position. A building probe
// ahead steers them around blocks; separation keeps them off each other.
export function policeStep(world, car, dt) {
  const tx = world.lastKnown.x, ty = world.lastKnown.y;
  let aimX = tx, aimY = ty;
  const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
  const probeX = car.x + fx * 52, probeY = car.y + fy * 52;
  let steer = steerToward(car, aimX, aimY);
  if (pointInBuilding(world.city, probeX, probeY, 6)) {
    steer = steer > 0 ? -1 : 1; // dodge sideways around the block
  }
  const distToPlayer = Math.hypot(world.player.x - car.x, world.player.y - car.y);
  let throttle = 1, brake = false;
  if (distToPlayer < 44 && carSpeed(world.playerCar || car) < 30) { throttle = 0; brake = true; }
  driveCar(world, car, { throttle, steer, brake, handbrake: Math.abs(steer) > 0.9 && carSpeed(car) > 200 }, dt);
  car.ramCooldown = Math.max(0, car.ramCooldown - dt);
}

// --- Pedestrians ---------------------------------------------------------------
export function pedStep(world, ped, dt) {
  const p = world.player;
  if (ped.state === 'down') {
    ped.downTimer -= dt;
    if (ped.downTimer <= 0) { ped.state = 'flee'; ped.fleeTimer = 2.5; ped.threatX = p.x; ped.threatY = p.y; }
    return;
  }
  if (ped.state === 'riding') return; // seated in a car; missions move them
  if (ped.state === 'board') {
    const car = ped.boardCar;
    if (!car) { ped.state = 'stroll'; return; }
    const dx = car.x - ped.x, dy = car.y - ped.y;
    const d = Math.hypot(dx, dy);
    if (d < 13) { ped.state = 'riding'; world.events.push({ type: 'boarded', ped }); return; }
    walkToward(world, ped, car.x, car.y, 128, dt);
    return;
  }
  if (ped.state === 'wait') return; // a fare passenger holding position
  // A fast car or a swinging fist nearby panics a pedestrian.
  const threat = world.threat;
  if (threat && Math.hypot(threat.x - ped.x, threat.y - ped.y) < threat.r) {
    ped.state = 'flee'; ped.fleeTimer = 2.6; ped.threatX = threat.x; ped.threatY = threat.y;
  }
  if (ped.state === 'flee') {
    ped.fleeTimer -= dt;
    const dx = ped.x - ped.threatX, dy = ped.y - ped.threatY;
    const d = Math.hypot(dx, dy) || 1;
    walkToward(world, ped, ped.x + (dx / d) * 120, ped.y + (dy / d) * 120, 155, dt);
    if (ped.fleeTimer <= 0) ped.state = 'stroll';
    return;
  }
  // Stroll between sidewalk waypoints.
  ped.wait -= dt;
  const dx = ped.tx - ped.x, dy = ped.ty - ped.y;
  if (Math.hypot(dx, dy) < 8 || ped.wait < -14) {
    const spot = sidewalkSpot(world, ped.x, ped.y);
    ped.tx = spot.x; ped.ty = spot.y; ped.wait = world.rng.range(0, 3);
  } else if (ped.wait <= 0) {
    walkToward(world, ped, ped.tx, ped.ty, 58, dt);
  }
}

function walkToward(world, ped, tx, ty, speed, dt) {
  const dx = tx - ped.x, dy = ty - ped.y;
  const d = Math.hypot(dx, dy);
  if (d < 1) return;
  ped.angle = Math.atan2(dy, dx);
  ped.x += (dx / d) * speed * dt;
  ped.y += (dy / d) * speed * dt;
  const res = resolveCircle(world.city, ped.x, ped.y, 9);
  ped.x = res.x; ped.y = res.y;
  ped.x = Math.max(8, Math.min(world.city.size - 8, ped.x));
  ped.y = Math.max(8, Math.min(world.city.size - 8, ped.y));
}

// Sidewalk points hug the road edges: pick a random road, then a point along
// it offset to the kerb near the pedestrian so walks stay local.
export function sidewalkSpot(world, x, y) {
  const rng = world.rng;
  const vertical = rng.chance(0.5);
  if (vertical) {
    const ax = AVENUES[rng.int(0, AVENUES.length - 1)];
    return { x: ax + (rng.chance(0.5) ? -1 : 1) * 68, y: Math.max(30, Math.min(world.city.size - 30, y + rng.range(-320, 320))) };
  }
  const sy = STREETS[rng.int(0, STREETS.length - 1)];
  return { x: Math.max(30, Math.min(world.city.size - 30, x + rng.range(-320, 320))), y: sy + (rng.chance(0.5) ? -1 : 1) * 68 };
}

export { SIGHT_RANGE };
