// 键盘与触摸手势归一成同一份输入：一次性动作用脉冲，横移和软降额外报告按住状态。
export const DRAG_STEP = 26;
export const SOFT_DROP_DRAG = 34;
export const FLICK_DISTANCE = 90;
export const FLICK_MS = 260;
export const TAP_MAX_MS = 240;
export const TAP_MAX_DRIFT = 14;

const KEY_PULSES = {
  ArrowUp: 'rotateCW',
  KeyX: 'rotateCW',
  KeyZ: 'rotateCCW',
  ControlLeft: 'rotateCCW',
  ControlRight: 'rotateCCW',
  Space: 'hardDrop',
  ShiftLeft: 'hold',
  ShiftRight: 'hold',
  KeyC: 'hold',
};

const KEY_HELD = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowDown: 'softDrop',
  KeyS: 'softDrop',
};

const PAUSE_KEYS = new Set(['Escape', 'KeyP']);
const PULSE_KEYS = ['left', 'right', 'rotateCW', 'rotateCCW', 'hardDrop', 'hold'];

export function createInput(target = globalThis, { onPause, keyboard = true, pointer = true } = {}) {
  const pending = { left: false, right: false, rotateCW: false, rotateCCW: false, hardDrop: false, hold: false };
  const held = { left: false, right: false, softDrop: false };
  const press = (action) => {
    if (action in pending) pending[action] = true;
  };

  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let baseX = 0;
  let startedAt = 0;
  let moved = false;
  let dropped = false;

  const onKeyDown = (event) => {
    if (PAUSE_KEYS.has(event.code)) {
      if (!event.repeat) onPause?.();
      return;
    }
    const holdKey = KEY_HELD[event.code];
    if (holdKey) {
      if (holdKey === 'softDrop') held.softDrop = true;
      else {
        held[holdKey] = true;
        if (!event.repeat) press(holdKey);
      }
      return;
    }
    if (event.repeat) return;
    const pulse = KEY_PULSES[event.code];
    if (!pulse) return;
    if (event.code === 'Space' && typeof event.preventDefault === 'function') event.preventDefault();
    press(pulse);
  };

  const onKeyUp = (event) => {
    const holdKey = KEY_HELD[event.code];
    if (holdKey) held[holdKey] = false;
  };

  const onBlur = () => {
    held.left = false;
    held.right = false;
    held.softDrop = false;
  };

  const onPointerDown = (event) => {
    if (pointerId !== null) return;
    pointerId = event.pointerId ?? 0;
    startX = event.clientX;
    startY = event.clientY;
    baseX = event.clientX;
    startedAt = event.timeStamp ?? 0;
    moved = false;
    dropped = false;
  };

  // 拖动时每滑过 DRAG_STEP 就走一格，往下拖住则持续软降。
  const onPointerMove = (event) => {
    if (pointerId === null || (event.pointerId ?? 0) !== pointerId) return;
    const dy = event.clientY - startY;
    let dx = event.clientX - baseX;
    while (Math.abs(dx) >= DRAG_STEP) {
      const dir = dx > 0 ? 1 : -1;
      press(dir > 0 ? 'right' : 'left');
      baseX += dir * DRAG_STEP;
      dx -= dir * DRAG_STEP;
      moved = true;
    }
    const horizontal = Math.abs(event.clientX - startX) > Math.abs(dy);
    held.softDrop = !horizontal && dy >= SOFT_DROP_DRAG;
    if (held.softDrop) moved = true;
    // 快速下甩直接硬降，一次手势只触发一次。
    if (!dropped && !horizontal && dy >= FLICK_DISTANCE && (event.timeStamp ?? 0) - startedAt <= FLICK_MS) {
      press('hardDrop');
      held.softDrop = false;
      dropped = true;
      moved = true;
    }
    if (!moved && !horizontal && dy <= -DRAG_STEP) {
      press('hold');
      moved = true;
    }
  };

  const onPointerUp = (event) => {
    if (pointerId === null || (event.pointerId ?? 0) !== pointerId) return;
    const dx = Math.abs(event.clientX - startX);
    const dy = Math.abs(event.clientY - startY);
    const heldMs = (event.timeStamp ?? 0) - startedAt;
    // 轻点旋转，是手机上最高频的操作。
    if (!moved && heldMs <= TAP_MAX_MS && dx <= TAP_MAX_DRIFT && dy <= TAP_MAX_DRIFT) press('rotateCW');
    pointerId = null;
    held.softDrop = false;
  };

  const listeners = [
    ['keydown', onKeyDown, keyboard],
    ['keyup', onKeyUp, keyboard],
    ['blur', onBlur, keyboard],
    ['pointerdown', onPointerDown, pointer],
    ['pointermove', onPointerMove, pointer],
    ['pointerup', onPointerUp, pointer],
    ['pointercancel', onPointerUp, pointer],
  ].filter(([, , enabled]) => enabled);
  for (const [type, handler] of listeners) target.addEventListener?.(type, handler);

  return {
    press,
    snapshot() {
      const frame = { ...pending, held: { ...held } };
      for (const key of PULSE_KEYS) pending[key] = false;
      return frame;
    },
    dispose() {
      for (const [type, handler] of listeners) target.removeEventListener?.(type, handler);
    },
  };
}

export const mergeInput = (a, b) => ({
  left: a.left || b.left,
  right: a.right || b.right,
  rotateCW: a.rotateCW || b.rotateCW,
  rotateCCW: a.rotateCCW || b.rotateCCW,
  hardDrop: a.hardDrop || b.hardDrop,
  hold: a.hold || b.hold,
  held: {
    left: a.held.left || b.held.left,
    right: a.held.right || b.held.right,
    softDrop: a.held.softDrop || b.held.softDrop,
  },
});
