// 键盘、屏幕按钮、场地横向拖动，三种输入归一成同一份 {steer, drift, boost}。
//
// 手机上只有三个操作，这是刻意压到最少的：**方向、手刹、氮气**。
// 没有油门（一直全油），也没有刹车——因为这游戏里减速的唯一正当手段就是漂移，
// 多给一颗刹车键，玩家就会用刹车过弯，然后一路没气可喷。
//
// 方向是模拟量而不是四向：漂移角直接由方向盘深度决定，
// 「打多深」本身就是操作空间，折成开关会把这层手感全抹掉。

const KEY_LEFT = new Set(['ArrowLeft', 'KeyA']);
const KEY_RIGHT = new Set(['ArrowRight', 'KeyD']);
const KEY_DRIFT = new Set(['ShiftLeft', 'ShiftRight', 'KeyJ', 'ArrowDown', 'KeyS']);
const KEY_BOOST = new Set(['Space', 'KeyK', 'Enter', 'ArrowUp', 'KeyW']);
const PAUSE_KEYS = new Set(['Escape', 'KeyP']);

/** 拖动多少像素算打满方向。屏幕窄的手机上这个距离刚好是半个拇指的行程。 */
export const STEER_RANGE = 96;
/** 小于这个位移不算打方向，避免把「点一下屏幕」读成走位。 */
export const DEAD_ZONE = 8;

export const EMPTY_INPUT = { steer: 0, drift: false, boost: false };

export function resolveSteer(dx, range = STEER_RANGE, dead = DEAD_ZONE) {
  if (Math.abs(dx) < dead) return 0;
  const span = Math.sign(dx) * (Math.abs(dx) - dead);
  return Math.max(-1, Math.min(1, span / (range - dead)));
}

export function createInput(target = globalThis, { onPause, keyboard = true, pointer = true } = {}) {
  const buttons = new Set();
  const stick = { active: false, dx: 0 };
  let pendingBoost = false;
  let pointerId = null;
  let originX = 0;

  const hold = (action, on) => {
    if (on) buttons.add(action);
    else buttons.delete(action);
  };

  const press = (action) => {
    if (action === 'boost') pendingBoost = true;
  };

  const clear = () => {
    buttons.clear();
    stick.active = false;
    stick.dx = 0;
    pointerId = null;
  };

  const onKeyDown = (event) => {
    if (PAUSE_KEYS.has(event.code)) {
      if (!event.repeat) onPause?.();
      return;
    }
    if (KEY_BOOST.has(event.code)) {
      if (event.code === 'Space' && typeof event.preventDefault === 'function') event.preventDefault();
      if (!event.repeat) press('boost');
      return;
    }
    if (KEY_DRIFT.has(event.code)) {
      hold('drift', true);
      return;
    }
    if (KEY_LEFT.has(event.code)) hold('left', true);
    else if (KEY_RIGHT.has(event.code)) hold('right', true);
  };

  const onKeyUp = (event) => {
    if (KEY_DRIFT.has(event.code)) hold('drift', false);
    if (KEY_LEFT.has(event.code)) hold('left', false);
    if (KEY_RIGHT.has(event.code)) hold('right', false);
  };

  const onPointerDown = (event) => {
    if (pointerId !== null) return;
    pointerId = event.pointerId ?? 0;
    originX = event.clientX;
    stick.active = true;
    stick.dx = 0;
  };

  const onPointerMove = (event) => {
    if ((event.pointerId ?? 0) !== pointerId) return;
    stick.dx = event.clientX - originX;
    // 手指走出量程后把原点跟过去，这样一次按住可以连续修方向，不用抬手重按。
    if (Math.abs(stick.dx) > STEER_RANGE) {
      originX = event.clientX - Math.sign(stick.dx) * STEER_RANGE;
      stick.dx = Math.sign(stick.dx) * STEER_RANGE;
    }
  };

  const onPointerUp = (event) => {
    if ((event.pointerId ?? 0) !== pointerId) return;
    pointerId = null;
    stick.active = false;
    stick.dx = 0;
  };

  const listeners = [
    ['keydown', onKeyDown, keyboard],
    ['keyup', onKeyUp, keyboard],
    ['blur', clear, keyboard],
    ['pointerdown', onPointerDown, pointer],
    ['pointermove', onPointerMove, pointer],
    ['pointerup', onPointerUp, pointer],
    ['pointercancel', onPointerUp, pointer],
  ].filter(([, , enabled]) => enabled);
  for (const [type, handler] of listeners) target.addEventListener?.(type, handler);

  return {
    press,
    hold,
    stick,
    snapshot() {
      const pad = (buttons.has('right') ? 1 : 0) - (buttons.has('left') ? 1 : 0);
      const steer = pad || resolveSteer(stick.dx);
      const boost = pendingBoost;
      pendingBoost = false;
      return { steer, drift: buttons.has('drift'), boost };
    },
    dispose() {
      for (const [type, handler] of listeners) target.removeEventListener?.(type, handler);
      clear();
    },
  };
}

/** 键盘和触屏可能同时在用（模拟器、带键盘的平板），两边取并集。 */
export const mergeInput = (a, b) => ({
  steer: a.steer || b.steer,
  drift: a.drift || b.drift,
  boost: a.boost || b.boost,
});
