// missions.js — the Neon Shores campaign: six jobs in sequence, handed out by
// fixer Dario Venn to driver Jax Marlowe. Each mission is a small state
// machine over the world: an objective point, an optional timer, an optional
// heat floor, and an exact cash reward paid on completion. Failing a timer
// restarts the same job with no penalty beyond lost time.

import { HEAT_PER_STAR, PIER_END_X, PIER_Y } from './config.js';
import { landmark } from './city.js';
import { makePed } from './entities.js';

export const MISSION_REWARDS = [400, 350, 500, 600, 750, 1200]; // fare incl. full tip
export const FARE_BASE = 260;
export const FARE_TIP_MAX = 90;

function spot(world, name) {
  const lm = landmark(world.city, name);
  return { x: lm.x, y: lm.y, name: lm.name };
}

export function startCampaign(world) {
  world.missionIndex = 0;
  world.missionsDone = 0;
  startMission(world, 0);
}

export function startMission(world, index) {
  const w = world;
  w.missionIndex = index;
  w.heatFloor = 0;
  w.objective = null;
  w.missionTimer = null;
  const m = { index, stage: 'main', data: {} };
  w.mission = m;
  switch (index) {
    case 0: // Hot Package — Fish Market pickup, Marina Mall delivery, timed leg.
      m.title = 'Hot Package';
      m.line = 'Pick up the package at the Fish Market';
      w.objective = spot(w, 'Fish Market');
      break;
    case 1: { // Fare Play — a passenger waits at Palm Court for the Grand Hotel.
      m.title = 'Fare Play';
      m.line = 'Pick up the passenger at Palm Court — stop beside her';
      const s = spot(w, 'Palm Court');
      const ped = makePed(w.rng, s.x, s.y);
      ped.state = 'wait'; ped.isPassenger = true;
      w.peds.push(ped);
      m.data.passenger = ped;
      w.objective = { x: ped.x, y: ped.y };
      break;
    }
    case 2: // Cool Down — starts hot at three stars; lose every point of heat.
      m.title = 'Cool Down';
      m.line = 'Lose the heat: break sight, stay hidden, let it cool';
      w.heat = 3 * HEAT_PER_STAR;
      break;
    case 3: // Grand Tour — three checkpoints against one clock.
      m.title = 'Grand Tour';
      m.data.points = ['Tower One', 'The Coral Casino', 'Lighthouse Point'].map((n) => spot(w, n));
      m.data.at = 0;
      w.missionTimer = 150;
      setCheckpoint(w, m);
      break;
    case 4: // Harbour Run — three crates to the warehouse, never below 2 stars.
      m.title = 'Harbour Run';
      m.data.crates = [
        { x: PIER_END_X - 70, y: PIER_Y, taken: false },
        { x: 3260, y: 900, taken: false },
        { ...spot(w, 'Fish Market'), taken: false },
      ];
      m.data.got = 0;
      w.heatFloor = 2 * HEAT_PER_STAR;
      m.line = 'Collect the crates (0/3) — the law is watching';
      w.objective = m.data.crates[0];
      break;
    case 5: // Neon Finale — six checkpoints, the heat floor keeps climbing.
      m.title = 'Neon Finale';
      m.data.points = ['Sunset Garage', 'Marina Mall', 'Tower One', 'Fish Market', 'The Coral Casino', 'Lighthouse Point'].map((n) => spot(w, n));
      m.data.at = 0;
      w.missionTimer = 240;
      applyFinaleFloor(w, m);
      setCheckpoint(w, m);
      break;
  }
  w.missionLine = m.line;
}

function setCheckpoint(w, m) {
  const p = m.data.points[m.data.at];
  w.objective = p;
  m.line = `Checkpoint ${m.data.at + 1}/${m.data.points.length} — ${p.name || 'go'}`;
  w.missionLine = m.line;
}

function applyFinaleFloor(w, m) {
  const stars = 1 + Math.floor(m.data.at / 2); // cp 1-2: 1 star, 3-4: 2, 5-6: 3
  w.heatFloor = stars * HEAT_PER_STAR;
}

function completeMission(world, bonus = 0) {
  const idx = world.missionIndex;
  const reward = MISSION_REWARDS[idx] + bonus;
  world.cash += reward;
  world.earned += reward;
  world.missionsDone += 1;
  world.heatFloor = 0;
  world.objective = null;
  world.missionTimer = null;
  world.events.push({ type: 'mission-complete', index: idx, reward });
  world.toast(`Job done — +$${reward}`);
  if (idx + 1 < MISSION_REWARDS.length) {
    startMission(world, idx + 1);
  } else {
    world.mission = null;
    world.missionLine = 'Port Azura is yours';
    world.cityCleared = true;
    world.events.push({ type: 'city-cleared' });
  }
}

function failMission(world, why) {
  world.toast(`Job failed — ${why}. Dario sends you back out`);
  world.events.push({ type: 'mission-failed', index: world.missionIndex });
  startMission(world, world.missionIndex);
}

function near(world, p, r) {
  return Math.hypot(world.player.x - p.x, world.player.y - p.y) <= r;
}

export function missionStep(world, dt) {
  const m = world.mission;
  if (!m) return;
  if (world.missionTimer !== null) {
    world.missionTimer -= dt;
    if (world.missionTimer <= 0) { failMission(world, 'out of time'); return; }
  }
  switch (m.index) {
    case 0: {
      if (m.stage === 'main' && near(world, world.objective, 46)) {
        m.stage = 'deliver';
        world.missionTimer = 90;
        world.objective = spot(world, 'Marina Mall');
        world.missionLine = 'Deliver to Marina Mall — clock is running';
        world.toast('Package on board — move!');
      } else if (m.stage === 'deliver' && near(world, world.objective, 46)) {
        completeMission(world);
      }
      break;
    }
    case 1: {
      const ped = m.data.passenger;
      if (m.stage === 'main') {
        world.objective = { x: ped.x, y: ped.y };
        if (world.playerCar && Math.hypot(world.player.x - ped.x, world.player.y - ped.y) < 56
            && Math.hypot(world.playerCar.vx, world.playerCar.vy) < 30) {
          ped.state = 'board'; ped.boardCar = world.playerCar;
          m.stage = 'boarding';
        }
      } else if (m.stage === 'boarding') {
        if (ped.state === 'riding') {
          m.stage = 'ride';
          m.data.car = world.playerCar;
          m.data.rideDamage = world.playerCar.damage;
          world.objective = spot(world, 'Azura Grand Hotel');
          world.missionLine = 'Fare Play: drive her to the Azura Grand Hotel — gently';
        }
      } else if (m.stage === 'ride') {
        if (!world.playerCar) {
          // Jax got out: the passenger climbs out too and waits by the car.
          ped.state = 'wait'; ped.x = m.data.car.x + 20; ped.y = m.data.car.y + 8;
          world.peds.includes(ped) || world.peds.push(ped);
          m.stage = 'main';
          world.missionLine = 'Fare Play: back in a car, pick her up again';
        } else if (near(world, world.objective, 48)) {
          const extra = Math.max(0, m.data.car.damage - m.data.rideDamage);
          const tip = Math.max(0, FARE_TIP_MAX - 15 * Math.floor(extra / 12));
          ped.state = 'stroll'; ped.isPassenger = false;
          ped.x = world.objective.x; ped.y = world.objective.y;
          completeMission(world, tip - FARE_TIP_MAX); // base table holds fare+full tip
        }
      }
      break;
    }
    case 2: {
      if (world.heat <= 0) completeMission(world);
      break;
    }
    case 3: {
      if (near(world, world.objective, 52)) {
        m.data.at += 1;
        if (m.data.at >= m.data.points.length) completeMission(world);
        else setCheckpoint(world, m);
      }
      break;
    }
    case 4: {
      const crates = m.data.crates;
      const next = crates.find((c) => !c.taken);
      if (next) {
        world.objective = next;
        if (near(world, next, 42)) {
          next.taken = true; m.data.got += 1;
          world.toast(`Crate on board (${m.data.got}/3)`);
          world.events.push({ type: 'pickup', x: next.x, y: next.y });
          world.missionLine = m.data.got >= 3
            ? 'All crates aboard — get them to the Harbour Warehouse'
            : `Collect the crates (${m.data.got}/3)`;
          world.objective = m.data.got >= 3 ? spot(world, 'Harbour Warehouse') : crates.find((c) => !c.taken);
        }
      } else if (near(world, spot(world, 'Harbour Warehouse'), 50)) {
        completeMission(world);
      }
      break;
    }
    case 5: {
      if (near(world, world.objective, 52)) {
        m.data.at += 1;
        if (m.data.at >= m.data.points.length) completeMission(world);
        else { applyFinaleFloor(world, m); setCheckpoint(world, m); }
      }
      break;
    }
  }
}
