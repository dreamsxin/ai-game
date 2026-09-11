import { fieldBox, toField } from './layout.js';

const LEFT_KEYS = new Set(['ArrowLeft', 'KeyA']);
const RIGHT_KEYS = new Set(['ArrowRight', 'KeyD']);
const PAUSE_KEYS = new Set(['Escape', 'KeyP']);
const FIRE_KEYS = new Set(['Space', 'Enter', 'ArrowUp', 'KeyW']);

// 键盘与触屏归一成同一份输入：瞄准点、微调方向、开火。
export function createInput(target = globalThis, { onPause, keyboard = true, pointer = true } = {}) {
  let aimAt = null;
  let fire = false;
  const held = { left: false, right: false };

  const pointOf = (event) => {
    const rect = target.getBoundingClientRect?.();
    if (!rect) return null;
    const box = fieldBox(rect.width, rect.height);
    return toField(box, event.clientX - rect.left, event.clientY - rect.top);
  };

  let pointerId = null;

  const onPointerDown = (event) => {
    if (pointerId !== null) return;
    pointerId = event.pointerId ?? 0;
    aimAt = pointOf(event) ?? aimAt;
  };

  const onPointerMove = (event) => {
    if (pointerId === null || (event.pointerId ?? 0) !== pointerId) return;
    aimAt = pointOf(event) ?? aimAt;
  };

  // 松手就是开火：按下到松手之间一直在调方向，抬手那一刻的方向就是这一串弹珠的方向。
  const onPointerUp = (event) => {
    if (pointerId === null || (event.pointerId ?? 0) !== pointerId) return;
    aimAt = pointOf(event) ?? aimAt;
    fire = true;
    pointerId = null;
  };

  const onPointerCancel = (event) => {
    if (pointerId === null || (event.pointerId ?? 0) !== pointerId) return;
    pointerId = null;
  };

  const onKeyDown = (event) => {
    if (PAUSE_KEYS.has(event.code)) {
      if (!event.repeat) onPause?.();
      return;
    }
    if (FIRE_KEYS.has(event.code)) {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      if (!event.repeat) fire = true;
      return;
    }
    if (LEFT_KEYS.has(event.code)) held.left = true;
    else if (RIGHT_KEYS.has(event.code)) held.right = true;
    else return;
    if (typeof event.preventDefault === 'function') event.preventDefault();
  };

  const onKeyUp = (event) => {
    if (LEFT_KEYS.has(event.code)) held.left = false;
    else if (RIGHT_KEYS.has(event.code)) held.right = false;
  };

  const listeners = [
    ['keydown', onKeyDown, keyboard],
    ['keyup', onKeyUp, keyboard],
    ['pointerdown', onPointerDown, pointer],
    ['pointermove', onPointerMove, pointer],
    ['pointerup', onPointerUp, pointer],
    ['pointercancel', onPointerCancel, pointer],
  ].filter(([, , enabled]) => enabled);
  for (const [type, handler] of listeners) target.addEventListener?.(type, handler);

  return {
    pressFire() {
      fire = true;
    },
    aimTo(point) {
      aimAt = { ...point };
    },
    snapshot() {
      // nudge 为正表示往右转，模拟层直接乘上角速度。
      const frame = { aimAt: aimAt ? { ...aimAt } : null, nudge: (held.right ? 1 : 0) - (held.left ? 1 : 0), fire };
      fire = false;
      return frame;
    },
    dispose() {
      for (const [type, handler] of listeners) target.removeEventListener?.(type, handler);
    },
  };
}

export const mergeInput = (a, b) => ({
  aimAt: a.aimAt ?? b.aimAt,
  nudge: a.nudge || b.nudge,
  fire: Boolean(a.fire || b.fire),
});
