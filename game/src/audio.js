// audio.js — all sound is synthesized with WebAudio; there are no audio
// files. A looping engine hum follows the player's speed, a two-tone siren
// fades in with the nearest police car, and every game event gets a one-shot.
// The context is created lazily on the first user gesture (browser policy).

export function createAudio() {
  let ctx = null, master = null, engineOsc = null, engineGain = null;
  let sirenOsc = null, sirenGain = null, sirenFlip = null;
  let muted = false;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth';
      engineGain = ctx.createGain(); engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter); engineFilter.connect(engineGain); engineGain.connect(master);
      engineOsc.start();
      sirenOsc = ctx.createOscillator(); sirenOsc.type = 'triangle'; sirenOsc.frequency.value = 660;
      sirenGain = ctx.createGain(); sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain); sirenGain.connect(master);
      sirenOsc.start();
      let high = false;
      sirenFlip = setInterval(() => { if (sirenOsc) { high = !high; sirenOsc.frequency.value = high ? 880 : 660; } }, 380);
      return true;
    } catch { return false; }
  }

  function blip(freq, dur, type = 'square', vol = 0.16, slideTo = null) {
    if (!ensure()) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(master);
    o.start(); o.stop(ctx.currentTime + dur);
  }

  function noise(dur, vol = 0.2) {
    if (!ensure()) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(g); g.connect(master); src.start();
  }

  return {
    unlock() { ensure(); },
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; },
    isMuted() { return muted; },
    // Per-frame: engine pitch from speed, siren volume from police distance.
    update(engineSpeed, nearestCopDist) {
      if (!ctx) return;
      const driving = engineSpeed > 4;
      engineGain.gain.setTargetAtTime(driving ? 0.05 + Math.min(0.06, engineSpeed / 6000) : 0, ctx.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(55 + engineSpeed * 0.55, ctx.currentTime, 0.05);
      const sirenVol = nearestCopDist < 640 ? 0.055 * (1 - nearestCopDist / 640) : 0;
      sirenGain.gain.setTargetAtTime(sirenVol, ctx.currentTime, 0.15);
    },
    // One-shots keyed by world event type.
    play(name) {
      if (!ctx && name !== 'unlock') return;
      switch (name) {
        case 'door': blip(220, 0.07, 'square', 0.1); break;
        case 'punch': noise(0.08, 0.14); break;
        case 'crash': noise(0.22, 0.3); blip(90, 0.2, 'sawtooth', 0.12, 40); break;
        case 'pickup': blip(740, 0.09, 'square', 0.12); setTimeout(() => blip(990, 0.1, 'square', 0.12), 60); break;
        case 'cash': blip(880, 0.07, 'square', 0.1); setTimeout(() => blip(1320, 0.12, 'square', 0.1), 70); break;
        case 'cone': blip(300, 0.08, 'triangle', 0.16, 180); break;
        case 'success': [523, 659, 784].forEach((f, i) => setTimeout(() => blip(f, 0.14, 'triangle', 0.14), i * 90)); break;
        case 'fail': blip(220, 0.3, 'sawtooth', 0.12, 110); break;
        case 'busted': [392, 330, 262].forEach((f, i) => setTimeout(() => blip(f, 0.16, 'triangle', 0.14), i * 120)); break;
        case 'wasted': blip(160, 0.5, 'sawtooth', 0.14, 55); break;
      }
    },
  };
}
