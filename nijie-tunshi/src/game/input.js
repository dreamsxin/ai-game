const KEY_DIRECTIONS = {
  KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
};

const ACTION_KEYS = { Space: 'dash', KeyE: 'gravity', ShiftLeft: 'phase', ShiftRight: 'phase' };

export function createInput(onPause = () => {}) {
  const keys = new Set();
  const pointer = { active: false, x: 0, y: 0 };
  const actions = { dash: false, gravity: false, phase: false };
  const pressed = { dash: false, phase: false };

  const clear = () => {
    keys.clear();
    pointer.active = false;
    actions.dash = false;
    actions.gravity = false;
    actions.phase = false;
    pressed.dash = false;
    pressed.phase = false;
  };
  const onKeyDown = (event) => {
    if (KEY_DIRECTIONS[event.code]) {
      keys.add(event.code);
      event.preventDefault();
      return;
    }
    const action = ACTION_KEYS[event.code];
    if (action) {
      if (!actions[action] && action !== 'gravity') pressed[action] = true;
      actions[action] = true;
      event.preventDefault();
      return;
    }
    if (event.code === 'KeyP' || event.code === 'Escape') {
      onPause();
      event.preventDefault();
    }
  };
  const onKeyUp = (event) => {
    keys.delete(event.code);
    const action = ACTION_KEYS[event.code];
    if (action) actions[action] = false;
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', clear);

  return {
    snapshot() {
      let x = 0; let z = 0;
      for (const code of keys) { const [dx, dz] = KEY_DIRECTIONS[code]; x += dx; z += dz; }
      if (pointer.active) { x += pointer.x; z += pointer.y; }
      const snapshot = {
        x, z,
        dashPressed: pressed.dash,
        gravityHeld: actions.gravity,
        phasePressed: pressed.phase,
      };
      pressed.dash = false;
      pressed.phase = false;
      return snapshot;
    },
    setPointer(value) { pointer.active = true; pointer.x = value.x; pointer.y = value.y; },
    clearPointer() { pointer.active = false; pointer.x = 0; pointer.y = 0; },
    pressAction(action) {
      if (action !== 'gravity' && !actions[action]) pressed[action] = true;
      actions[action] = true;
    },
    releaseAction(action) { actions[action] = false; },
    clear,
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clear);
    },
  };
}
