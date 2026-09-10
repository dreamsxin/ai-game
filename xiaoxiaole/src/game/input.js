import { COLUMNS, ROWS } from './rules.js';
import { boardBox, cellFromPoint, directionOf } from './layout.js';

// 触屏拖动超过这个位移才算换位手势，否则按点选处理。
export const SWIPE_DISTANCE = 16;
export const TAP_MAX_DRIFT = 14;

const KEY_DIRS = {
  ArrowLeft: { dx: -1, dy: 0 },
  KeyA: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  KeyD: { dx: 1, dy: 0 },
  ArrowUp: { dx: 0, dy: -1 },
  KeyW: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
  KeyS: { dx: 0, dy: 1 },
};

const PAUSE_KEYS = new Set(['Escape', 'KeyP']);
const CONFIRM_KEYS = new Set(['Space', 'Enter']);

// 键盘与触摸手势归一成同一份输入：点选一格，或从一格朝某个方向换位。
export function createInput(target = globalThis, {
  onPause,
  keyboard = true,
  pointer = true,
  columns = COLUMNS,
  rows = ROWS,
} = {}) {
  let tap = null;
  let swipe = null;
  const cursor = { x: Math.floor(columns / 2), y: Math.floor(rows / 2) };

  const pressCell = (x, y) => {
    tap = { x, y };
  };
  const pressSwipe = (from, dir) => {
    swipe = { from: { ...from }, dir: { ...dir } };
  };

  const cellOf = (event) => {
    const rect = target.getBoundingClientRect?.();
    if (!rect) return null;
    const box = boardBox(rect.width, rect.height, columns, rows);
    return cellFromPoint(box, event.clientX - rect.left, event.clientY - rect.top);
  };

  let pointerId = null;
  let start = null;
  let startX = 0;
  let startY = 0;
  let fired = false;

  const onPointerDown = (event) => {
    if (pointerId !== null) return;
    pointerId = event.pointerId ?? 0;
    start = cellOf(event);
    startX = event.clientX;
    startY = event.clientY;
    fired = false;
  };

  // 拖动一旦跨过阈值就立刻换位，一次手势只触发一次，手指抬起前不再重复。
  const onPointerMove = (event) => {
    if (pointerId === null || (event.pointerId ?? 0) !== pointerId || !start || fired) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.hypot(dx, dy) < SWIPE_DISTANCE) return;
    const dir = directionOf(dx, dy);
    if (!dir) return;
    pressSwipe(start, dir);
    cursor.x = start.x;
    cursor.y = start.y;
    fired = true;
  };

  const onPointerUp = (event) => {
    if (pointerId === null || (event.pointerId ?? 0) !== pointerId) return;
    const dx = Math.abs(event.clientX - startX);
    const dy = Math.abs(event.clientY - startY);
    if (!fired && start && dx <= TAP_MAX_DRIFT && dy <= TAP_MAX_DRIFT) {
      pressCell(start.x, start.y);
      cursor.x = start.x;
      cursor.y = start.y;
    }
    pointerId = null;
    start = null;
    fired = false;
  };

  // 键盘：方向键移动光标，选中后再按方向键直接换位，空格确认。
  let anchored = false;

  const onKeyDown = (event) => {
    if (PAUSE_KEYS.has(event.code)) {
      if (!event.repeat) onPause?.();
      return;
    }
    if (CONFIRM_KEYS.has(event.code)) {
      if (event.repeat) return;
      if (typeof event.preventDefault === 'function') event.preventDefault();
      pressCell(cursor.x, cursor.y);
      anchored = !anchored;
      return;
    }
    const dir = KEY_DIRS[event.code];
    if (!dir) return;
    if (typeof event.preventDefault === 'function') event.preventDefault();
    if (anchored) {
      pressSwipe(cursor, dir);
      anchored = false;
      return;
    }
    cursor.x = Math.min(columns - 1, Math.max(0, cursor.x + dir.dx));
    cursor.y = Math.min(rows - 1, Math.max(0, cursor.y + dir.dy));
  };

  const listeners = [
    ['keydown', onKeyDown, keyboard],
    ['pointerdown', onPointerDown, pointer],
    ['pointermove', onPointerMove, pointer],
    ['pointerup', onPointerUp, pointer],
    ['pointercancel', onPointerUp, pointer],
  ].filter(([, , enabled]) => enabled);
  for (const [type, handler] of listeners) target.addEventListener?.(type, handler);

  return {
    pressCell,
    pressSwipe,
    snapshot() {
      const frame = { tap, swipe, cursor: { ...cursor } };
      tap = null;
      swipe = null;
      return frame;
    },
    dispose() {
      for (const [type, handler] of listeners) target.removeEventListener?.(type, handler);
    },
  };
}

export const mergeInput = (a, b) => ({
  tap: a.tap ?? b.tap,
  swipe: a.swipe ?? b.swipe,
  cursor: a.cursor ?? b.cursor,
});
