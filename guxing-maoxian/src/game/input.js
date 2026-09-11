// 键盘与触屏归一成同一份输入：jump 是一次性脉冲，方向和跑步是按住状态。
// 跳跃同时报告脉冲和按住：脉冲决定起跳时机，按住决定跳多高。
export const STEER_DEADZONE = 10;
export const RUN_DRAG = 46;
export const JUMP_SIDE = 0.45;

const KEY_HELD = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ShiftLeft: 'run',
  ShiftRight: 'run',
  KeyX: 'run',
  ArrowUp: 'jump',
  KeyW: 'jump',
  Space: 'jump',
  KeyZ: 'jump',
};

const PAUSE_KEYS = new Set(['Escape', 'KeyP']);
const PULSE_KEYS = ['jump'];

export const EMPTY_INPUT = {
  jump: false,
  held: { left: false, right: false, run: false, jump: false },
};

export function createInput(target = globalThis, { onPause, keyboard = true, pointer = true } = {}) {
  const pending = { jump: false };
  const held = { left: false, right: false, run: false, jump: false };
  // 屏幕按钮走单独一份状态，和手势各自记账再合并，松手时不会互相清掉。
  const buttons = { left: false, right: false, run: false, jump: false };
  const touches = new Map();

  const press = (action) => {
    if (action in pending) pending[action] = true;
  };

  const hold = (action, on) => {
    if (action in buttons) buttons[action] = on;
    if (action === 'jump' && on) press('jump');
  };

  const onKeyDown = (event) => {
    if (PAUSE_KEYS.has(event.code)) {
      if (!event.repeat) onPause?.();
      return;
    }
    const action = KEY_HELD[event.code];
    if (!action) return;
    if (event.code === 'Space' && typeof event.preventDefault === 'function') event.preventDefault();
    if (event.repeat) return;
    held[action] = true;
    if (action === 'jump') press('jump');
  };

  const onKeyUp = (event) => {
    const action = KEY_HELD[event.code];
    if (action) held[action] = false;
  };

  const clearHeld = () => {
    held.left = false;
    held.right = false;
    held.run = false;
    held.jump = false;
    touches.clear();
  };

  const sideOf = (event) => {
    const rect = target.getBoundingClientRect?.();
    if (!rect || !rect.width) return 'move';
    return event.clientX - rect.left > rect.width * JUMP_SIDE ? 'jump' : 'move';
  };

  // 左半屏当虚拟摇杆：按住往哪拖就往哪走，拖得远就变成奔跑；右半屏点一下起跳，按住跳得更高。
  const onPointerDown = (event) => {
    const role = sideOf(event);
    touches.set(event.pointerId ?? 0, { role, startX: event.clientX, dir: 0, run: false });
    if (role === 'jump') press('jump');
    syncTouch();
  };

  const onPointerMove = (event) => {
    const touch = touches.get(event.pointerId ?? 0);
    if (!touch || touch.role !== 'move') return;
    const dx = event.clientX - touch.startX;
    if (Math.abs(dx) >= STEER_DEADZONE) touch.dir = dx > 0 ? 1 : -1;
    touch.run = Math.abs(dx) >= RUN_DRAG;
    syncTouch();
  };

  const onPointerUp = (event) => {
    touches.delete(event.pointerId ?? 0);
    syncTouch();
  };

  function syncTouch() {
    let left = false;
    let right = false;
    let run = false;
    let jump = false;
    for (const touch of touches.values()) {
      if (touch.role === 'jump') {
        jump = true;
        continue;
      }
      if (touch.dir < 0) left = true;
      if (touch.dir > 0) right = true;
      if (touch.run) run = true;
    }
    held.left = left;
    held.right = right;
    held.run = run;
    held.jump = jump;
  }

  const listeners = [
    ['keydown', onKeyDown, keyboard],
    ['keyup', onKeyUp, keyboard],
    ['blur', clearHeld, keyboard],
    ['pointerdown', onPointerDown, pointer],
    ['pointermove', onPointerMove, pointer],
    ['pointerup', onPointerUp, pointer],
    ['pointercancel', onPointerUp, pointer],
  ].filter(([, , enabled]) => enabled);
  for (const [type, handler] of listeners) target.addEventListener?.(type, handler);

  return {
    press,
    hold,
    snapshot() {
      const frame = {
        jump: pending.jump,
        held: {
          left: held.left || buttons.left,
          right: held.right || buttons.right,
          run: held.run || buttons.run,
          jump: held.jump || buttons.jump,
        },
      };
      for (const key of PULSE_KEYS) pending[key] = false;
      return frame;
    },
    dispose() {
      for (const [type, handler] of listeners) target.removeEventListener?.(type, handler);
      clearHeld();
    },
  };
}

export const mergeInput = (a, b) => ({
  jump: a.jump || b.jump,
  held: {
    left: a.held.left || b.held.left,
    right: a.held.right || b.held.right,
    run: a.held.run || b.held.run,
    jump: a.held.jump || b.held.jump,
  },
});
