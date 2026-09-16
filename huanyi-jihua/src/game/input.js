// 键盘与触屏归一成同一份输入。
//
// 触屏用相对拖动而不是「手指按哪船去哪」：纵版射击里手指会盖住船，
// 而这游戏最要紧的信息恰好在船周围——弹幕离你还有多远。
// 所以在屏幕任何位置按住拖动，船按同样的位移跟着走，手指可以远离船身。
//
// 弃翼是一次性脉冲：轻点（按下到抬起几乎没移动）就是弃翼，屏幕按钮也走同一个入口。

import { FIELD_H, FIELD_W } from './rules.js';

// 拖动灵敏度。1 是等距跟随，大一点手指少走路。
export const DRAG_GAIN = 1.3;
// 按下到抬起位移小于这个（按屏幕宽度归一后的场地格）算轻点，不算拖动。
export const TAP_SLOP = 4;
export const TAP_TIME = 0.28;

const KEY_HELD = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
};

const KEY_PULSE = new Set(['Space', 'KeyZ', 'KeyX', 'KeyJ']);
const PAUSE_KEYS = new Set(['Escape', 'KeyP']);

export const EMPTY_INPUT = {
  jettison: false,
  drag: { dx: 0, dy: 0 },
  held: { left: false, right: false, up: false, down: false },
};

export function createInput(target = globalThis, { onPause, keyboard = true, pointer = true } = {}) {
  const pending = { jettison: false };
  const held = { left: false, right: false, up: false, down: false };
  const buttons = { jettison: false };
  const drag = { dx: 0, dy: 0 };
  const touches = new Map();

  const press = (action) => {
    if (action in pending) pending[action] = true;
  };

  const hold = (action, on) => {
    if (action in buttons) buttons[action] = on;
    if (action in held) held[action] = on;
    if (action === 'jettison' && on) press('jettison');
  };

  const onKeyDown = (event) => {
    if (PAUSE_KEYS.has(event.code)) {
      if (!event.repeat) onPause?.();
      return;
    }
    if (KEY_PULSE.has(event.code)) {
      if (event.code === 'Space' && typeof event.preventDefault === 'function') event.preventDefault();
      if (!event.repeat) press('jettison');
      return;
    }
    const action = KEY_HELD[event.code];
    if (!action || event.repeat) return;
    held[action] = true;
  };

  const onKeyUp = (event) => {
    const action = KEY_HELD[event.code];
    if (action) held[action] = false;
  };

  const clearHeld = () => {
    held.left = false;
    held.right = false;
    held.up = false;
    held.down = false;
    touches.clear();
  };

  // 像素位移换成场地格：这样同一个手势在什么屏幕上都走同样远。
  const scale = () => {
    const rect = target.getBoundingClientRect?.();
    if (!rect || !rect.width || !rect.height) return { sx: 0, sy: 0 };
    return { sx: (FIELD_W / rect.width) * DRAG_GAIN, sy: (FIELD_H / rect.height) * DRAG_GAIN };
  };

  const onPointerDown = (event) => {
    touches.set(event.pointerId ?? 0, { x: event.clientX, y: event.clientY, moved: 0, time: 0 });
  };

  const onPointerMove = (event) => {
    const touch = touches.get(event.pointerId ?? 0);
    if (!touch) return;
    const { sx, sy } = scale();
    const dx = (event.clientX - touch.x) * sx;
    const dy = (event.clientY - touch.y) * sy;
    touch.x = event.clientX;
    touch.y = event.clientY;
    touch.moved += Math.hypot(dx, dy);
    drag.dx += dx;
    drag.dy += dy;
  };

  const onPointerUp = (event) => {
    const touch = touches.get(event.pointerId ?? 0);
    touches.delete(event.pointerId ?? 0);
    // 轻点即弃翼。拖过一段距离的手势是走位，不该顺手把翅膀扔了。
    if (touch && touch.moved < TAP_SLOP && touch.time < TAP_TIME) press('jettison');
  };

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
    /** 让按住不放的手指也能计时：轻点判定要看时长，不然慢慢按一下也算点。 */
    tick(dt) {
      for (const touch of touches.values()) touch.time += dt;
    },
    snapshot() {
      const frame = {
        jettison: pending.jettison || buttons.jettison,
        drag: { dx: drag.dx, dy: drag.dy },
        held: { ...held },
      };
      pending.jettison = false;
      buttons.jettison = false;
      drag.dx = 0;
      drag.dy = 0;
      return frame;
    },
    dispose() {
      for (const [type, handler] of listeners) target.removeEventListener?.(type, handler);
      clearHeld();
    },
  };
}

export const mergeInput = (a, b) => ({
  jettison: a.jettison || b.jettison,
  drag: { dx: a.drag.dx + b.drag.dx, dy: a.drag.dy + b.drag.dy },
  held: {
    left: a.held.left || b.held.left,
    right: a.held.right || b.held.right,
    up: a.held.up || b.held.up,
    down: a.held.down || b.held.down,
  },
});
