// render.js — draws Port Azura and the HUD to the canvas: the city from
// above (roads with lane markings, lit windows, parks, beach, pier), every
// car and pedestrian, day-night light, particles, the minimap and all HUD
// furniture. It reads the world; it never changes it (particles are its own).

import { VIEW_W, VIEW_H, ROAD_WIDTH, BEACH_X, SEA_X } from './config.js';
import { AVENUES, STREETS } from './city.js';
import { starsOf } from './world.js';
import { carSpeed } from './entities.js';

const MINIMAP = 188;

export function daylight(world) {
  const sun = Math.sin((world.dayTime - 0.25) * Math.PI * 2);
  return Math.max(0, Math.min(1, (sun + 0.25) / 1.25)); // 0 night .. 1 noon
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const particles = [];

  function spawnFromEvents(world) {
    for (const ev of world.events) {
      if (ev.type === 'sparks') for (let i = 0; i < ev.n; i++) {
        particles.push({ kind: 'spark', x: ev.x, y: ev.y, vx: (Math.random() - 0.5) * 260, vy: (Math.random() - 0.5) * 260, ttl: 0.4 });
      }
      if (ev.type === 'smoke') particles.push({ kind: 'smoke', x: ev.x, y: ev.y, vx: 0, vy: -26, ttl: 1.1 });
      if (ev.type === 'crash' || ev.type === 'carcrash') particles.push({ kind: 'smoke', x: world.player.x, y: world.player.y, vx: 0, vy: -18, ttl: 0.7 });
    }
    if (particles.length > 300) particles.splice(0, particles.length - 300);
  }

  function draw(world, ui, dt) {
    spawnFromEvents(world);
    const cam = cameraFor(world);
    const dark = 1 - daylight(world);
    ctx.fillStyle = '#3f7a3a';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    drawGround(world, dark);
    drawObjective(world);
    drawPickups(world);
    for (const ped of world.peds) drawPed(world, ped);
    for (const car of world.cars) drawCar(world, car, dark);
    if (!world.playerCar) drawPlayer(world);
    drawParticles(dt);
    ctx.restore();
    if (dark > 0.04) drawNight(world, cam, dark);
    drawHUD(world, ui, cam);
    if (ui.screen === 'title') drawTitle(world);
    if (ui.screen === 'pause') drawPause(world);
    if (world.cityCleared && ui.screen === 'game') drawCleared(world);
    if (ui.banner) drawBanner(ui.banner);
  }

  function cameraFor(world) {
    return {
      x: Math.max(0, Math.min(world.city.size - VIEW_W, world.player.x - VIEW_W / 2)),
      y: Math.max(0, Math.min(world.city.size - VIEW_H, world.player.y - VIEW_H / 2)),
    };
  }

  function drawGround(world, dark) {
    const city = world.city;
    // Sand and sea first (they sit under the coast roads' east edge).
    ctx.fillStyle = '#e8cf8f';
    ctx.fillRect(city.beach.x, 0, city.beach.w, city.size);
    ctx.fillStyle = '#1b6f9e';
    ctx.fillRect(city.sea.x, 0, city.sea.w, city.size);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 3;
    for (let y = 60; y < city.size; y += 130) {
      ctx.beginPath();
      ctx.moveTo(SEA_X + 26, y);
      ctx.bezierCurveTo(SEA_X + 70, y - 16, SEA_X + 110, y + 16, SEA_X + 160, y);
      ctx.stroke();
    }
    // Parks under everything else.
    for (const pk of city.parks) {
      ctx.fillStyle = '#57a047';
      ctx.fillRect(pk.x, pk.y, pk.w, pk.h);
      ctx.strokeStyle = '#cbb98a'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(pk.x, pk.y + pk.h / 2); ctx.lineTo(pk.x + pk.w, pk.y + pk.h / 2);
      ctx.moveTo(pk.x + pk.w / 2, pk.y); ctx.lineTo(pk.x + pk.w / 2, pk.y + pk.h); ctx.stroke();
      for (const t of pk.trees) {
        ctx.fillStyle = '#2e6b2e';
        ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3f8f3f';
        ctx.beginPath(); ctx.arc(t.x - 3, t.y - 3, t.r * 0.62, 0, Math.PI * 2); ctx.fill();
      }
    }
    // Car parks.
    for (const cp of city.carParks) {
      ctx.fillStyle = '#6d6d6d'; ctx.fillRect(cp.x, cp.y, cp.w, cp.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
      for (const s of cp.slots) { ctx.strokeRect(s.x - 20, s.y - 30, 40, 60); }
    }
    // Roads: asphalt strips, kerb edges, dashed centre lines (lane markings).
    ctx.fillStyle = '#3c3f44';
    for (const ax of AVENUES) ctx.fillRect(ax - ROAD_WIDTH / 2, 0, ROAD_WIDTH, city.size);
    for (const sy of STREETS) ctx.fillRect(0, sy - ROAD_WIDTH / 2, city.size, ROAD_WIDTH);
    ctx.fillStyle = '#494d52';
    for (const ax of AVENUES) for (const sy of STREETS) ctx.fillRect(ax - ROAD_WIDTH / 2, sy - ROAD_WIDTH / 2, ROAD_WIDTH, ROAD_WIDTH);
    ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 3;
    ctx.beginPath();
    for (const ax of AVENUES) { ctx.moveTo(ax - ROAD_WIDTH / 2 + 4, 0); ctx.lineTo(ax - ROAD_WIDTH / 2 + 4, city.size); ctx.moveTo(ax + ROAD_WIDTH / 2 - 4, 0); ctx.lineTo(ax + ROAD_WIDTH / 2 - 4, city.size); }
    for (const sy of STREETS) { ctx.moveTo(0, sy - ROAD_WIDTH / 2 + 4); ctx.lineTo(city.size, sy - ROAD_WIDTH / 2 + 4); ctx.moveTo(0, sy + ROAD_WIDTH / 2 - 4); ctx.lineTo(city.size, sy + ROAD_WIDTH / 2 - 4); }
    ctx.stroke();
    ctx.strokeStyle = '#ffd94d'; ctx.lineWidth = 4; ctx.setLineDash([26, 22]);
    ctx.beginPath();
    for (const ax of AVENUES) { ctx.moveTo(ax, 0); ctx.lineTo(ax, city.size); }
    for (const sy of STREETS) { ctx.moveTo(0, sy); ctx.lineTo(city.size, sy); }
    ctx.stroke(); ctx.setLineDash([]);
    // The pier: planks over the water, and the lighthouse at its end.
    const pier = city.pier;
    ctx.fillStyle = '#9a6b43'; ctx.fillRect(pier.x, pier.y, pier.w, pier.h);
    ctx.strokeStyle = 'rgba(60,35,15,0.55)'; ctx.lineWidth = 2;
    for (let x = pier.x + 18; x < pier.x + pier.w; x += 24) { ctx.beginPath(); ctx.moveTo(x, pier.y); ctx.lineTo(x, pier.y + pier.h); ctx.stroke(); }
    const lh = city.lighthouse;
    ctx.fillStyle = '#eceff1'; ctx.beginPath(); ctx.arc(lh.x + lh.w / 2, lh.y + lh.h / 2, 24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e53935'; ctx.beginPath(); ctx.arc(lh.x + lh.w / 2, lh.y + lh.h / 2, 13, 0, Math.PI * 2); ctx.fill();
    // Buildings: drop shadow, roof, lit windows, landmark name signs.
    for (const b of city.buildings) {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(b.x + 7, b.y + 9, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      for (const win of b.windows) {
        ctx.fillStyle = win.lit ? (dark > 0.3 ? '#ffd968' : '#ffe9a8') : 'rgba(38,50,56,0.5)';
        ctx.fillRect(win.x - 4, win.y - 4, 8, 8);
      }
      if (b.name) sign(b.x + b.w / 2, b.y - 12, b.name);
    }
    for (const lm of city.landmarks) {
      if (lm.kind === 'pier' || lm.kind === 'lighthouse') sign(lm.x, lm.y, lm.name);
    }
  }

  function sign(x, y, text) {
    ctx.font = 'bold 15px system-ui, sans-serif';
    const w = ctx.measureText(text).width + 16;
    ctx.fillStyle = 'rgba(10,14,24,0.78)';
    ctx.beginPath(); ctx.roundRect(x - w / 2, y - 13, w, 24, 6); ctx.fill();
    ctx.fillStyle = '#7df9ff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 1);
  }

  function drawObjective(world) {
    const o = world.objective;
    if (!o) return;
    const pulse = 12 + Math.sin(world.time * 5) * 4;
    ctx.strokeStyle = '#ffd94d'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(o.x, o.y, 30 + pulse * 0.4, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffd94d';
    ctx.save(); ctx.translate(o.x, o.y - 52); ctx.rotate(Math.PI / 4);
    ctx.fillRect(-11, -11, 22, 22); ctx.restore();
  }

  function drawPickups(world) {
    for (const s of world.tipStands) {
      if (!s.ready) continue;
      ctx.fillStyle = '#ffd94d';
      ctx.beginPath(); ctx.arc(s.x, s.y, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5d4037'; ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('$', s.x, s.y + 1);
    }
    const r = world.rampage;
    if (r) {
      if (r.active) {
        ctx.strokeStyle = 'rgba(255,110,0,0.8)'; ctx.lineWidth = 3; ctx.setLineDash([10, 8]);
        ctx.beginPath(); ctx.arc(r.x, r.y, 170, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }
      for (const cone of r.cones) {
        if (cone.hit) continue;
        ctx.fillStyle = '#ff6d00';
        ctx.beginPath(); ctx.moveTo(cone.x, cone.y - 10); ctx.lineTo(cone.x + 8, cone.y + 7); ctx.lineTo(cone.x - 8, cone.y + 7); ctx.closePath(); ctx.fill();
      }
    }
    if (world.mission && world.mission.index === 4) {
      for (const c of world.mission.data.crates) {
        if (c.taken) continue;
        ctx.fillStyle = '#8d6e63'; ctx.fillRect(c.x - 11, c.y - 11, 22, 22);
        ctx.strokeStyle = '#4e342e'; ctx.lineWidth = 2; ctx.strokeRect(c.x - 11, c.y - 11, 22, 22);
        ctx.beginPath(); ctx.moveTo(c.x - 11, c.y - 11); ctx.lineTo(c.x + 11, c.y + 11); ctx.moveTo(c.x + 11, c.y - 11); ctx.lineTo(c.x - 11, c.y + 11); ctx.stroke();
      }
    }
  }

  function drawPed(world, ped) {
    if (ped.state === 'riding') return;
    ctx.save(); ctx.translate(ped.x, ped.y);
    if (ped.state === 'down') {
      ctx.rotate(ped.angle);
      ctx.fillStyle = ped.color; ctx.beginPath(); ctx.ellipse(0, 0, 13, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffe0b2'; ctx.beginPath(); ctx.arc(13, 0, 5, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(2, 3, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = ped.isPassenger ? '#ffd94d' : ped.color;
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffe0b2'; ctx.beginPath(); ctx.arc(0, 0, 4.6, 0, Math.PI * 2); ctx.fill();
      if (ped.isPassenger) { ctx.fillStyle = '#ffd94d'; ctx.font = 'bold 15px system-ui'; ctx.textAlign = 'center'; ctx.fillText('!', 0, -16); }
    }
    ctx.restore();
  }

  function drawCar(world, car, dark) {
    ctx.save(); ctx.translate(car.x, car.y); ctx.rotate(car.angle);
    const L = car.length, W = car.width;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.roundRect(-L / 2 + 3, -W / 2 + 4, L, W, 5); ctx.fill();
    if (car.kind === 'police') {
      ctx.fillStyle = '#eceff1'; ctx.beginPath(); ctx.roundRect(-L / 2, -W / 2, L, W, 5); ctx.fill();
      ctx.fillStyle = '#263238'; ctx.fillRect(-L * 0.08, -W / 2, L * 0.3, W);
      const flash = Math.floor(world.time * 3) % 2 === 0;
      ctx.fillStyle = flash ? '#ff1744' : '#2979ff';
      ctx.fillRect(-4, -W / 2 + 2, 8, 5);
      ctx.fillStyle = flash ? '#2979ff' : '#ff1744';
      ctx.fillRect(-4, W / 2 - 7, 8, 5);
    } else {
      ctx.fillStyle = car.color; ctx.beginPath(); ctx.roundRect(-L / 2, -W / 2, L, W, 5); ctx.fill();
    }
    ctx.fillStyle = 'rgba(18,24,32,0.85)';
    ctx.fillRect(L * 0.08, -W / 2 + 3, L * 0.2, W - 6);   // windshield
    ctx.fillRect(-L * 0.32, -W / 2 + 3, L * 0.16, W - 6); // rear window
    ctx.fillStyle = car === world.playerCar ? '#00e5ff' : 'rgba(255,255,255,0.25)';
    ctx.fillRect(-L * 0.05, -W / 2 + 3, L * 0.1, W - 6);  // roof stripe / player mark
    if (car.brakeLight) {
      ctx.fillStyle = '#ff1744';
      ctx.fillRect(-L / 2 - 2, -W / 2 + 2, 4, 5); ctx.fillRect(-L / 2 - 2, W / 2 - 7, 4, 5);
    }
    ctx.restore();
    if (dark > 0.25 && carSpeed(car) > 2) {
      // Headlight cones at night.
      const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
      const grad = ctx.createRadialGradient(car.x + fx * 20, car.y + fy * 20, 6, car.x + fx * 20, car.y + fy * 20, 120);
      grad.addColorStop(0, 'rgba(255,244,180,0.30)'); grad.addColorStop(1, 'rgba(255,244,180,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(car.x, car.y);
      ctx.arc(car.x + fx * 20, car.y + fy * 20, 120, car.angle - 0.32, car.angle + 0.32);
      ctx.closePath(); ctx.fill();
    }
  }

  function drawPlayer(world) {
    const p = world.player;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(2, 3, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#00bfa5'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffe0b2'; ctx.beginPath(); ctx.arc(0, 0, 5.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#00bfa5'; ctx.fillRect(4, -3, 8, 6); // facing arm
    ctx.restore();
  }

  function drawParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const pt = particles[i];
      pt.ttl -= dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt;
      if (pt.ttl <= 0) { particles.splice(i, 1); continue; }
      if (pt.kind === 'spark') {
        ctx.strokeStyle = 'rgba(255,170,40,0.9)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(pt.x - pt.vx * 0.03, pt.y - pt.vy * 0.03); ctx.stroke();
      } else {
        ctx.fillStyle = `rgba(120,120,120,${0.35 * pt.ttl})`;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 7 + (1.1 - pt.ttl) * 9, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawNight(world, cam, dark) {
    ctx.fillStyle = `rgba(7,10,38,${dark * 0.55})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(-cam.x, -cam.y);
    // Streetlight pools at every other intersection.
    for (let i = 0; i < AVENUES.length; i += 1) for (let j = 0; j < STREETS.length; j += 1) {
      if ((i + j) % 2) continue;
      const g = ctx.createRadialGradient(AVENUES[i], STREETS[j], 4, AVENUES[i], STREETS[j], 95);
      g.addColorStop(0, `rgba(255,190,90,${0.20 * dark})`); g.addColorStop(1, 'rgba(255,190,90,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(AVENUES[i], STREETS[j], 95, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // --- HUD ---------------------------------------------------------------------
  function drawHUD(world, ui, cam) {
    const p = world.player;
    // Cash and health, top-left.
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(8,12,20,0.72)';
    ctx.beginPath(); ctx.roundRect(14, 12, 218, 74, 10); ctx.fill();
    ctx.fillStyle = '#69f0ae'; ctx.font = 'bold 30px system-ui';
    ctx.fillText('$' + world.cash.toLocaleString('en-US'), 26, 50);
    ctx.fillStyle = '#90a4ae'; ctx.font = '13px system-ui';
    ctx.fillText('EARNED $' + world.earned.toLocaleString('en-US'), 27, 72);
    bar(140, 30, 78, 10, p.health / 100, p.health > 30 ? '#69f0ae' : '#ff5252');
    // Wanted stars and heat, top-right.
    const stars = starsOf(world);
    ctx.fillStyle = 'rgba(8,12,20,0.72)';
    ctx.beginPath(); ctx.roundRect(VIEW_W - 246, 12, 232, 74, 10); ctx.fill();
    ctx.font = '30px system-ui'; ctx.textAlign = 'center';
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i < stars ? '#ffd94d' : 'rgba(255,255,255,0.22)';
      ctx.fillText('★', VIEW_W - 196 + i * 38, 52);
    }
    bar(VIEW_W - 232, 64, 204, 8, world.heat / 500, '#ff9100');
    // Mission line, top-centre; timer under it.
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(8,12,20,0.72)';
    const line = world.mission ? `${world.mission.title} — ${world.missionLine}` : world.missionLine;
    ctx.font = 'bold 17px system-ui';
    const tw = Math.min(620, ctx.measureText(line).width + 34);
    ctx.beginPath(); ctx.roundRect(VIEW_W / 2 - tw / 2, 12, tw, 40, 10); ctx.fill();
    ctx.fillStyle = '#eceff1';
    ctx.fillText(line, VIEW_W / 2, 39, 600);
    if (world.missionTimer !== null && world.mission) {
      const t = Math.max(0, Math.ceil(world.missionTimer));
      ctx.font = 'bold 22px system-ui';
      ctx.fillStyle = t <= 15 ? '#ff5252' : '#ffd94d';
      ctx.fillText('⏱ ' + t + 's', VIEW_W / 2, 80);
    }
    // Toasts under the mission line.
    ctx.font = 'bold 16px system-ui';
    world.toasts.forEach((t, i) => {
      ctx.fillStyle = `rgba(8,12,20,${0.65 * Math.min(1, t.ttl)})`;
      const w2 = ctx.measureText(t.text).width + 26;
      ctx.beginPath(); ctx.roundRect(VIEW_W / 2 - w2 / 2, 92 + i * 32, w2, 26, 8); ctx.fill();
      ctx.fillStyle = '#ffe082';
      ctx.fillText(t.text, VIEW_W / 2, 111 + i * 32);
    });
    drawMinimap(world);
    // Speed and car state, bottom-right while driving.
    if (world.playerCar) {
      const mph = Math.round(carSpeed(world.playerCar) * 0.22);
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(8,12,20,0.72)';
      ctx.beginPath(); ctx.roundRect(VIEW_W - 176, VIEW_H - 92, 162, 78, 10); ctx.fill();
      ctx.fillStyle = '#eceff1'; ctx.font = 'bold 32px system-ui';
      ctx.fillText(mph + '', VIEW_W - 84, VIEW_H - 44);
      ctx.font = '13px system-ui'; ctx.fillStyle = '#90a4ae';
      ctx.fillText('MPH', VIEW_W - 24, VIEW_H - 44);
      bar(VIEW_W - 162, VIEW_H - 30, 134, 7, 1 - world.playerCar.damage / 100, '#4fc3f7');
    }
    // Context prompt, bottom-centre.
    if (ui.prompt) {
      ctx.textAlign = 'center'; ctx.font = 'bold 17px system-ui';
      const w3 = ctx.measureText(ui.prompt).width + 30;
      ctx.fillStyle = 'rgba(8,12,20,0.78)';
      ctx.beginPath(); ctx.roundRect(VIEW_W / 2 - w3 / 2, VIEW_H - 52, w3, 34, 9); ctx.fill();
      ctx.fillStyle = '#7df9ff';
      ctx.fillText(ui.prompt, VIEW_W / 2, VIEW_H - 29);
    }
    // Bust meter over the player.
    if (world.bustMeter > 0.02) {
      const sx = p.x - cam.x, sy = p.y - cam.y - 44;
      ctx.fillStyle = 'rgba(8,12,20,0.8)';
      ctx.fillRect(sx - 42, sy - 10, 84, 14);
      ctx.fillStyle = '#ff1744';
      ctx.fillRect(sx - 40, sy - 8, 80 * world.bustMeter, 10);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('BUSTED?', sx, sy - 14);
    }
    // Off-screen objective arrow.
    if (world.objective) {
      const ox = world.objective.x - cam.x, oy = world.objective.y - cam.y;
      if (ox < 0 || ox > VIEW_W || oy < 0 || oy > VIEW_H) {
        const cx = VIEW_W / 2, cy = VIEW_H / 2;
        const ang = Math.atan2(oy - cy, ox - cx);
        const ax = cx + Math.cos(ang) * (VIEW_W / 2 - 60), ay = cy + Math.sin(ang) * (VIEW_H / 2 - 60);
        ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang);
        ctx.fillStyle = '#ffd94d';
        ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-10, -10); ctx.lineTo(-10, 10); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
  }

  function bar(x, y, w, h, frac, color) {
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
  }

  function drawMinimap(world) {
    const x0 = 14, y0 = VIEW_H - MINIMAP - 14, s = MINIMAP / world.city.size;
    ctx.fillStyle = 'rgba(10,16,26,0.82)';
    ctx.beginPath(); ctx.roundRect(x0 - 4, y0 - 4, MINIMAP + 8, MINIMAP + 8, 10); ctx.fill();
    ctx.fillStyle = '#274b27'; ctx.fillRect(x0, y0, MINIMAP, MINIMAP);
    ctx.fillStyle = '#e8cf8f'; ctx.fillRect(x0 + BEACH_X * s, y0, (SEA_X - BEACH_X) * s, MINIMAP);
    ctx.fillStyle = '#1b6f9e'; ctx.fillRect(x0 + SEA_X * s, y0, (world.city.size - SEA_X) * s, MINIMAP);
    ctx.strokeStyle = '#5a6068'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (const ax of AVENUES) { ctx.moveTo(x0 + ax * s, y0); ctx.lineTo(x0 + ax * s, y0 + MINIMAP); }
    for (const sy of STREETS) { ctx.moveTo(x0, y0 + sy * s); ctx.lineTo(x0 + MINIMAP, y0 + sy * s); }
    ctx.stroke();
    for (const car of world.cars) {
      if (car.kind === 'traffic') { ctx.fillStyle = '#b0bec5'; ctx.fillRect(x0 + car.x * s - 1.5, y0 + car.y * s - 1.5, 3, 3); }
    }
    const blink = Math.floor(world.time * 2.4) % 2 === 0;
    for (const car of world.cars) {
      if (car.kind !== 'police') continue;
      ctx.fillStyle = blink ? '#ff1744' : '#2979ff';
      ctx.beginPath(); ctx.arc(x0 + car.x * s, y0 + car.y * s, 3.4, 0, Math.PI * 2); ctx.fill();
    }
    if (world.objective) {
      const o = world.objective;
      ctx.save(); ctx.translate(x0 + o.x * s, y0 + o.y * s); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#ffd94d'; ctx.fillRect(-4.4, -4.4, 8.8, 8.8); ctx.restore();
    }
    // Player dot with a heading tick.
    const px = x0 + world.player.x * s, py = y0 + world.player.y * s;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(world.player.angle) * 9, py + Math.sin(world.player.angle) * 9); ctx.stroke();
    ctx.fillStyle = '#eceff1'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'left';
    ctx.fillText('N', x0 + MINIMAP - 12, y0 + 14);
  }

  function panel(w, h) {
    ctx.fillStyle = 'rgba(6,10,18,0.82)';
    ctx.beginPath(); ctx.roundRect(VIEW_W / 2 - w / 2, VIEW_H / 2 - h / 2, w, h, 16); ctx.fill();
    ctx.strokeStyle = 'rgba(125,249,255,0.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(VIEW_W / 2 - w / 2, VIEW_H / 2 - h / 2, w, h, 16); ctx.stroke();
  }

  function drawTitle(world) {
    ctx.fillStyle = 'rgba(5,8,16,0.45)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    panel(620, 380);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff5da2'; ctx.font = 'bold 64px system-ui';
    ctx.fillText('NEON SHORES', VIEW_W / 2, VIEW_H / 2 - 118);
    ctx.fillStyle = '#7df9ff'; ctx.font = 'bold 19px system-ui';
    ctx.fillText('An open-world crime story in Port Azura', VIEW_W / 2, VIEW_H / 2 - 82);
    ctx.fillStyle = '#eceff1'; ctx.font = '16px system-ui';
    const lines = [
      'Jax Marlowe just hit town with $250 and a phone full of Dario Venn\'s jobs.',
      'Steal cars, run six jobs, outrun the law — take the city.',
      '',
      'WASD / arrows — move & drive      Shift — sprint      Space — handbrake',
      'E — enter / exit car      F — punch      P — pause      M — mute',
      '',
    ];
    lines.forEach((l, i) => ctx.fillText(l, VIEW_W / 2, VIEW_H / 2 - 40 + i * 24));
    ctx.fillStyle = '#ffd94d'; ctx.font = 'bold 21px system-ui';
    ctx.fillText('Press ENTER to play', VIEW_W / 2, VIEW_H / 2 + 148);
  }

  function drawPause(world) {
    panel(420, 250);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#eceff1'; ctx.font = 'bold 34px system-ui';
    ctx.fillText('PAUSED', VIEW_W / 2, VIEW_H / 2 - 70);
    ctx.font = '17px system-ui';
    ctx.fillText('P — resume', VIEW_W / 2, VIEW_H / 2 - 16);
    ctx.fillText('S — save game', VIEW_W / 2, VIEW_H / 2 + 16);
    ctx.fillText('R — reset save & restart', VIEW_W / 2, VIEW_H / 2 + 48);
    ctx.fillStyle = '#90a4ae'; ctx.font = '14px system-ui';
    ctx.fillText(`Cash $${world.cash} · Jobs done ${world.missionsDone}/6`, VIEW_W / 2, VIEW_H / 2 + 92);
  }

  function drawCleared(world) {
    panel(520, 300);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd94d'; ctx.font = 'bold 44px system-ui';
    ctx.fillText('CITY CLEARED', VIEW_W / 2, VIEW_H / 2 - 96);
    ctx.fillStyle = '#eceff1'; ctx.font = '19px system-ui';
    ctx.fillText('All six of Dario\'s jobs are done. Port Azura is yours.', VIEW_W / 2, VIEW_H / 2 - 56);
    ctx.font = 'bold 22px system-ui'; ctx.fillStyle = '#69f0ae';
    ctx.fillText(`Cash  $${world.cash.toLocaleString('en-US')}`, VIEW_W / 2, VIEW_H / 2 + 2);
    ctx.fillText(`Earned  $${world.earned.toLocaleString('en-US')}`, VIEW_W / 2, VIEW_H / 2 + 38);
    ctx.fillStyle = '#90a4ae'; ctx.font = '15px system-ui';
    ctx.fillText('Free roam: rampage cones and fare tips still pay.', VIEW_W / 2, VIEW_H / 2 + 88);
  }

  function drawBanner(banner) {
    ctx.textAlign = 'center';
    ctx.fillStyle = banner.color;
    ctx.font = 'bold 72px system-ui';
    ctx.fillText(banner.text, VIEW_W / 2, VIEW_H / 2 - 40);
  }

  return { draw };
}
