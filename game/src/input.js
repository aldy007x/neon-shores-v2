// input.js — keyboard state for Neon Shores. Held keys are level-triggered
// (up/down/left/right/sprint/handbrake); actions the world must see once
// (enter car, punch, pause, mute) are edge-triggered and consumed by main.js.

export function createInput() {
  const held = new Set();
  const pressed = new Set();
  const state = {
    up: false, down: false, left: false, right: false,
    sprint: false, handbrake: false,
    enterPressed: false, punchPressed: false, pausePressed: false, mutePressed: false,
  };
  const KEYMAP = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ShiftLeft: 'sprint', ShiftRight: 'sprint',
    Space: 'handbrake',
  };
  const EDGES = { KeyE: 'enterPressed', KeyF: 'punchPressed', KeyP: 'pausePressed', Escape: 'pausePressed', KeyM: 'mutePressed' };

  function onKeyDown(e) {
    if (KEYMAP[e.code]) { state[KEYMAP[e.code]] = true; held.add(e.code); e.preventDefault(); }
    if (EDGES[e.code] && !pressed.has(e.code)) { state[EDGES[e.code]] = true; pressed.add(e.code); e.preventDefault(); }
  }
  function onKeyUp(e) {
    if (KEYMAP[e.code]) { held.delete(e.code); if (![...held].some((c) => KEYMAP[c] === KEYMAP[e.code])) state[KEYMAP[e.code]] = false; }
    if (EDGES[e.code]) pressed.delete(e.code);
  }
  // Called by the frame loop after the world has consumed this frame's edges.
  state.consumeEdges = () => {
    state.enterPressed = false; state.punchPressed = false;
    state.pausePressed = false; state.mutePressed = false;
  };
  state.attach = (target) => {
    target.addEventListener('keydown', onKeyDown);
    target.addEventListener('keyup', onKeyUp);
  };
  return state;
}
