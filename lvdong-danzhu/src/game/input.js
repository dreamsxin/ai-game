import { fieldBox, fieldX } from './layout.js';
import { clampPaddle } from './physics.js';

// 手指位移超过这个像素就当拖挡板，否则算点一下（发球 / 换弹珠颜色）。
export const TAP_MAX_DRIFT = 12;

const LEFT_KEYS = new Set(['ArrowLeft', 'KeyA']);
const RIGHT_KEYS = new Set(['ArrowRight', 'KeyD']);
const PAUSE_KEYS = new Set(['Escape', 'KeyP']);
const TAP_KEYS = new Set(['Space', 'Enter', 'ArrowUp', 'KeyW']);

// 键盘与触屏归一成同一份输入：挡板目标位置、左右按键方向、点一下。
export function createInput(target = globalThis, { onPause, keyboard = true, pointer = true } = {}) {
  let paddleX = null;
  let tap = false;
  const held = { left: false, right: false };

  const fieldXOf = (event) => {
    const rect = target.getBoundingClientRect?.();
    if (!rect) return null;
    const box = fieldBox(rect.width, rect.height);
    return clampPaddle(fieldX(box, event.clientX - rect.left));
  };

  let pointerId = null;
  let startX = 0;
  let dragged = false;

  const onPointerDown = (event) => {
    if (pointerId !== null) return;
    pointerId = event.pointerId ?? 0;
    startX = event.clientX;
    dragged = false;
    const x = fieldXOf(event);
    if (x !== null) paddleX = x;
  };

  const onPointerMove = (event) => {
    if (pointerId === null || (event.pointerId ?? 0) !== pointerId) return;
    if (Math.abs(event.clientX - startX) > TAP_MAX_DRIFT) dragged = true;
    const x = fieldXOf(event);
    if (x !== null) paddleX = x;
  };

  const onPointerUp = (event) => {
    if (pointerId === null || (event.pointerId ?? 0) !== pointerId) return;
    if (!dragged) tap = true;
    pointerId = null;
    dragged = false;
  };

  const onKeyDown = (event) => {
    if (PAUSE_KEYS.has(event.code)) {
      if (!event.repeat) onPause?.();
      return;
    }
    if (TAP_KEYS.has(event.code)) {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      if (!event.repeat) tap = true;
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
    ['pointercancel', onPointerUp, pointer],
  ].filter(([, , enabled]) => enabled);
  for (const [type, handler] of listeners) target.addEventListener?.(type, handler);

  return {
    pressTap() {
      tap = true;
    },
    dragTo(x) {
      paddleX = clampPaddle(x);
    },
    snapshot() {
      const frame = { paddleX, move: (held.right ? 1 : 0) - (held.left ? 1 : 0), tap };
      tap = false;
      return frame;
    },
    dispose() {
      for (const [type, handler] of listeners) target.removeEventListener?.(type, handler);
    },
  };
}

export const mergeInput = (a, b) => ({
  paddleX: a.paddleX ?? b.paddleX,
  move: a.move || b.move,
  tap: Boolean(a.tap || b.tap),
});
