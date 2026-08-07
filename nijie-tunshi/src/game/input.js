const KEY_DIRECTIONS = {
  KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
};

const PULSE_MS = 140;

export function createInput(onAction = () => {}) {
  const keys = new Set();
  const pulses = new Map();
  const pointer = { active: false, x: 0, y: 0 };
  const onKeyDown = (event) => {
    if (KEY_DIRECTIONS[event.code]) {
      keys.add(event.code);
      pulses.set(event.code, performance.now() + PULSE_MS);
      event.preventDefault();
      return;
    }
    if (event.code === 'Space' || event.code === 'KeyP') {
      onAction(event.code);
      event.preventDefault();
    }
  };
  const onKeyUp = (event) => keys.delete(event.code);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  return {
    snapshot(now = performance.now()) {
      let x = 0; let z = 0;
      for (const code of keys) { const [dx, dz] = KEY_DIRECTIONS[code]; x += dx; z += dz; }
      for (const [code, expires] of pulses) {
        if (expires <= now) { pulses.delete(code); continue; }
        const [dx, dz] = KEY_DIRECTIONS[code];
        x += dx;
        z += dz;
      }
      if (pointer.active) { x += pointer.x; z += pointer.y; }
      return { x, z };
    },
    setPointer(value) { pointer.active = true; pointer.x = value.x; pointer.y = value.y; },
    clearPointer() { pointer.active = false; pointer.x = 0; pointer.y = 0; },
    dispose() { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); },
  };
}
