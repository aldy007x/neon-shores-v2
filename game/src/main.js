// main.js — boots Neon Shores: canvas, input, audio, the frame loop, screen
// flow (title -> game <-> pause), context prompts, event banners and sound.
// In screenshot mode (?shot=<scene>) it stages the scene, runs its fixed
// steps and freezes on the final frame instead of starting the loop.

import { createWorld, stepWorld, saveGame, loadGame, resetSave, starsOf } from './world.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer } from './render.js';
import { parseShot, stageShot, SHOT_STEPS, SHOT_DT } from './shots.js';
import { carSpeed } from './entities.js';

const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);
const input = createInput();
const audio = createAudio();
input.attach(window);

const shot = parseShot(window.location);
const world = createWorld(shot ? shot.seed : 7);
let screen = 'title';
let banner = null;
let started = false;

if (!shot) {
  if (loadGame(world)) started = true; // a returning player resumes their city
}

window.addEventListener('keydown', (e) => {
  audio.unlock();
  if (screen === 'title' && (e.code === 'Enter' || e.code === 'Space')) {
    screen = 'game'; started = true;
  }
  if (screen === 'pause') {
    if (e.code === 'KeyS') { saveGame(world); }
    if (e.code === 'KeyR') { resetSave(); location.reload(); }
  }
});

function promptFor() {
  if (screen !== 'game') return null;
  if (world.playerCar) {
    return carSpeed(world.playerCar) < 26 ? 'E — get out · Space — handbrake' : 'Space — handbrake drift';
  }
  let nearCar = false;
  for (const car of world.cars) {
    if (car.kind !== 'police' && Math.hypot(car.x - world.player.x, car.y - world.player.y) < 46) nearCar = true;
  }
  if (nearCar) return 'E — steal the car';
  return 'F — punch · E — enter car';
}

function reactToEvents() {
  for (const ev of world.events) {
    switch (ev.type) {
      case 'door': audio.play('door'); break;
      case 'punch': audio.play('punch'); break;
      case 'crash': case 'carcrash': audio.play('crash'); break;
      case 'pickup': audio.play('pickup'); break;
      case 'tip': case 'cone': audio.play('cash'); break;
      case 'mission-complete': audio.play('success'); saveGame(world); break;
      case 'mission-failed': audio.play('fail'); break;
      case 'busted': audio.play('busted'); banner = { text: 'BUSTED', color: '#2979ff', ttl: 1.6 }; break;
      case 'wasted': audio.play('wasted'); banner = { text: 'WASTED', color: '#ff1744', ttl: 1.6 }; break;
    }
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.033, frame.last ? (now - frame.last) / 1000 : 0.016);
  frame.last = now;
  if (input.mutePressed) audio.setMuted(!audio.isMuted());
  if (input.pausePressed && started) {
    screen = screen === 'pause' ? 'game' : 'pause';
    world.paused = screen === 'pause';
  }
  if (screen !== 'pause') {
    stepWorld(world, input, dt);
    reactToEvents();
  }
  let nearestCop = Infinity;
  for (const car of world.cars) {
    if (car.kind === 'police') nearestCop = Math.min(nearestCop, Math.hypot(car.x - world.player.x, car.y - world.player.y));
  }
  audio.update(world.playerCar ? carSpeed(world.playerCar) : 0, nearestCop);
  if (banner) { banner.ttl -= dt; if (banner.ttl <= 0) banner = null; }
  renderer.draw(world, { screen, prompt: promptFor(), banner }, dt);
  input.consumeEdges();
}

if (shot) {
  const staged = stageShot(world, shot.name);
  screen = staged.screen;
  for (let i = 0; i < SHOT_STEPS; i++) stepWorld(world, staged.input(i), SHOT_DT);
  renderer.draw(world, { screen, prompt: null, banner: null }, 0);
  document.title = 'neon-shores-shot-ready';
} else {
  requestAnimationFrame(frame);
}
