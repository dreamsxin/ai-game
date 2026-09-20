// 键盘与触屏归一成同一份输入：jump 是一次性脉冲，方向和上下瞄准是按住状态。
// 这游戏没有射击键——站着就在自动开火，所以手上只剩「往哪走、往哪瞄、跳不跳」三件事。
export const STEER_DEADZONE = 10;
export const AIM_DEADZONE = 14;
export const JUMP_SIDE = 0.5;

const KEY_HELD = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  Space: 'jump',
  KeyZ: 'jump',
  KeyJ: 'jump',
  KeyK: 'jump',
};

const PAUSE_KEYS = new Set(['Escape', 'KeyP']);
const PULSE_KEYS = ['jump'];

export const EMPTY_INPUT = {
  jump: false,
  held: { left: false, right: false, up: false, down: false, jump: false },
};

export function createInput(target = globalThis, { onPause, keyboard = true, pointer = true } = {}) {
  const pending = { jump: false };
  const held = { left: false, right: false, up: false, down: false, jump: false };
  // 屏幕按钮走单独一份状态，和手势各自记账再合并，松手时不会互相清掉。
  const buttons = { left: false, right: false, up: false, down: false, jump: false };
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
    // 空格和方向键默认会滚页面，横版游戏里那等于画面自己乱跳。
    if (typeof event.preventDefault === 'function') event.preventDefault();
    if (event.repeat) return;
    held[action] = true;
    if (action === 'jump') press('jump');
  };

  const onKeyUp = (event) => {
    const action = KEY_HELD[event.code];
    if (action) held[action] = false;
  };

  const clearHeld = () => {
    for (const key of Object.keys(held)) held[key] = false;
    touches.clear();
  };

  const sideOf = (event) => {
    const rect = target.getBoundingClientRect?.();
    if (!rect || !rect.width) return 'move';
    return event.clientX - rect.left > rect.width * JUMP_SIDE ? 'jump' : 'move';
  };

  // 左半屏当摇杆：横着拖决定走向，竖着拖决定瞄准高低（往上抬枪、往下压枪）。
  // 右半屏按住就是跳——点一下小跳，按住就是高跳，和横版跳跃的老规矩一致。
  const onPointerDown = (event) => {
    const role = sideOf(event);
    touches.set(event.pointerId ?? 0, { role, startX: event.clientX, startY: event.clientY, dir: 0, aim: 0 });
    if (role === 'jump') press('jump');
    syncTouch();
  };

  const onPointerMove = (event) => {
    const touch = touches.get(event.pointerId ?? 0);
    if (!touch || touch.role !== 'move') return;
    const dx = event.clientX - touch.startX;
    const dy = event.clientY - touch.startY;
    if (Math.abs(dx) >= STEER_DEADZONE) touch.dir = dx > 0 ? 1 : -1;
    touch.aim = Math.abs(dy) >= AIM_DEADZONE ? (dy > 0 ? 1 : -1) : 0;
    syncTouch();
  };

  const onPointerUp = (event) => {
    touches.delete(event.pointerId ?? 0);
    syncTouch();
  };

  function syncTouch() {
    const next = { left: false, right: false, up: false, down: false, jump: false };
    for (const touch of touches.values()) {
      if (touch.role === 'jump') {
        next.jump = true;
        continue;
      }
      if (touch.dir < 0) next.left = true;
      if (touch.dir > 0) next.right = true;
      if (touch.aim < 0) next.up = true;
      if (touch.aim > 0) next.down = true;
    }
    Object.assign(held, next);
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
          up: held.up || buttons.up,
          down: held.down || buttons.down,
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
    up: a.held.up || b.held.up,
    down: a.held.down || b.held.down,
    jump: a.held.jump || b.held.jump,
  },
});
