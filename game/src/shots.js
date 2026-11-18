// shots.js — staged scenes for the entry's screenshots. Each scene builds
// the real world from the seed, poses the actors, runs a fixed number of
// fixed-length steps with a scripted input, and then freezes: the capture is
// a genuine render of the game's own code, reproducible frame for frame.
// The 'end' scene poses exactly the state a full playthrough produces
// (start $250 + the six job rewards $400+$350+$500+$600+$750+$1,200 = $4,050),
// which the simulation harness verifies independently.

import { landmark } from './city.js';
import { makeCar } from './entities.js';
import { startMission } from './missions.js';

export const SHOT_STEPS = 54; // 54 steps of 1/30 s, then the frame freezes
export const SHOT_DT = 1 / 30;

export function parseShot(location) {
  const q = new URLSearchParams(location.search || '');
  if (!q.has('shot')) return null;
  return { name: q.get('shot'), seed: parseInt(q.get('seed') || '1', 10) || 1 };
}

const IDLE = { up: false, down: false, left: false, right: false, sprint: false, handbrake: false, enterPressed: false, punchPressed: false };
const DRIVE = { ...IDLE, up: true };

function putPlayerInCar(world, cls, x, y, angle) {
  const car = makeCar(world.rng, x, y, angle, cls, 'player');
  car.stolen = true;
  world.cars.push(car);
  world.playerCar = car;
  world.player.x = x; world.player.y = y; world.player.angle = angle;
  return car;
}

// stageShot(world, name) -> {screen, input} where input(step) gives the
// scripted controls for each warm-up step.
export function stageShot(world, name) {
  switch (name) {
    case 'cover': {
      world.dayTime = 0.79; // sunset over downtown
      const t = landmark(world.city, 'Tower One');
      world.player.x = t.x; world.player.y = t.y + 64;
      world.player.angle = -Math.PI / 2;
      putPlayerInCar(world, 'sports', t.x + 130, t.y + 40, Math.PI);
      return { screen: 'title', input: () => IDLE };
    }
    case 'play': {
      world.dayTime = 0.4;
      startMission(world, 0);
      // Package already collected: Jax is mid-delivery in a sedan.
      world.mission.stage = 'deliver';
      world.missionTimer = 73;
      world.objective = (() => { const lm = landmark(world.city, 'Marina Mall'); return { x: lm.x, y: lm.y, name: lm.name }; })();
      world.missionLine = 'Deliver to Marina Mall — clock is running';
      const fish = landmark(world.city, 'Fish Market');
      // On the avenue west of the market, in the right (east) lane, rolling
      // north toward the mall — a delivery in motion, not a parked pose.
      putPlayerInCar(world, 'sedan', 2286, fish.y + 30, -Math.PI / 2);
      return { screen: 'game', input: () => DRIVE };
    }
    case 'chase': {
      world.dayTime = 0.02; // deep night: light bars and headlights show
      world.heat = 400;     // four stars
      const start = landmark(world.city, 'Palm Court');
      // On the avenue west of Palm Court, already rolling north at speed.
      const car = putPlayerInCar(world, 'sports', 1486, start.y - 160, -Math.PI / 2);
      car.vy = -215;
      world.lastKnown.x = world.player.x; world.lastKnown.y = world.player.y;
      // Pose the response: interceptors closing from behind and the sides.
      const spots = [[-70, 130], [60, 180], [-40, 250], [120, 240], [-150, 210]];
      for (const [dx, dy] of spots) {
        const cop = makeCar(world.rng, world.player.x + dx, world.player.y + dy, -Math.PI / 2, 'police', 'police');
        cop.vy = -185;
        world.cars.push(cop);
      }
      return { screen: 'game', input: () => DRIVE };
    }
    case 'end': {
      world.dayTime = 0.45;
      world.mission = null;
      world.objective = null;
      world.missionTimer = null;
      world.missionsDone = 6;
      world.earned = 3800;
      world.cash = 4050; // $250 start + $3,800 of job rewards — sim-verified
      world.cityCleared = true;
      world.missionLine = 'Port Azura is yours';
      const t = landmark(world.city, 'Palm Court');
      world.player.x = t.x; world.player.y = t.y + 40;
      return { screen: 'game', input: () => IDLE };
    }
    default:
      return { screen: 'game', input: () => IDLE };
  }
}
